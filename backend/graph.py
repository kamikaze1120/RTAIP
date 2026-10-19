"""
RTAIP Entity-Graph & OSINT Correlation Engine
=============================================

Turns RTAIP from an event-centric feed viewer into an *entity-centric* OSINT
platform. Entities (domains, IPs, certs, orgs, ...) are nodes; relationships
(resolves_to, subdomain_of, ...) are edges. "Transforms" enrich a seed value by
querying PUBLIC, keyless data sources and persisting the resulting sub-graph.

Responsible use: public / authorized data only. See docs/ETHICS.md. These
transforms intentionally use open sources (Certificate Transparency, public DNS
over HTTPS) and never target or deanonymize private individuals.
"""
from __future__ import annotations

import asyncio
import re
from datetime import datetime
from hashlib import sha256

import aiohttp
from sqlalchemy.orm import sessionmaker

from database import engine, Entity, Relationship

Session = sessionmaker(bind=engine)

# Best-effort table creation so the graph works even if ensure_schema() has not
# run yet (idempotent, safe on both SQLite and Postgres).
try:
    Entity.__table__.create(bind=engine, checkfirst=True)
    Relationship.__table__.create(bind=engine, checkfirst=True)
except Exception:
    pass

ETYPES = {"domain", "subdomain", "ip", "cert", "org", "email", "asn", "netblock", "url", "hash"}
_DOMAIN_RE = re.compile(r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$", re.I)
_IP_RE = re.compile(r"^(?:\d{1,3}\.){3}\d{1,3}$")


def _now():
    return datetime.utcnow()


def _norm(value):
    return (value or "").strip().lower().rstrip(".")


def _ent_fp(etype, value):
    return sha256(f"{etype}|{_norm(value)}".encode("utf-8")).hexdigest()


def _rel_fp(src_id, rtype, dst_id, source):
    return sha256(f"{src_id}|{rtype}|{dst_id}|{source}".encode("utf-8")).hexdigest()


def ent_dict(e):
    return {
        "id": e.id,
        "etype": e.etype,
        "value": e.value,
        "label": e.label or e.value,
        "confidence": e.confidence,
        "attrs": e.attrs or {},
        "first_seen": e.first_seen.isoformat() if e.first_seen else None,
        "last_seen": e.last_seen.isoformat() if e.last_seen else None,
    }


def rel_dict(r):
    return {
        "id": r.id,
        "source": r.src_id,
        "target": r.dst_id,
        "type": r.rtype,
        "connector": r.source,
        "confidence": r.confidence,
    }


def save_entity(etype, value, label=None, attrs=None, confidence=0.6, org_id=None, case_id=None):
    value = (value or "").strip()
    if not value:
        return None
    fp = _ent_fp(etype, value)
    with Session() as s:
        e = s.query(Entity).filter(Entity.fingerprint == fp).first()
        if e:
            e.last_seen = _now()
            if attrs:
                merged = dict(e.attrs or {})
                merged.update(attrs)
                e.attrs = merged
            try:
                e.confidence = max(float(e.confidence or 0.0), float(confidence or 0.0))
            except Exception:
                pass
            s.commit()
            s.refresh(e)
            return ent_dict(e)
        e = Entity(
            etype=etype, value=value, label=label or value, attrs=attrs or {},
            confidence=float(confidence or 0.5), first_seen=_now(), last_seen=_now(),
            org_id=org_id, case_id=case_id, fingerprint=fp,
        )
        s.add(e)
        s.commit()
        s.refresh(e)
        return ent_dict(e)


def save_relationship(src_id, dst_id, rtype, source="manual", confidence=0.6, attrs=None):
    if not src_id or not dst_id or src_id == dst_id:
        return None
    fp = _rel_fp(src_id, rtype, dst_id, source)
    with Session() as s:
        r = s.query(Relationship).filter(Relationship.fingerprint == fp).first()
        if r:
            r.observed_at = _now()
            s.commit()
            s.refresh(r)
            return rel_dict(r)
        r = Relationship(
            src_id=src_id, dst_id=dst_id, rtype=rtype, source=source,
            confidence=float(confidence or 0.5), observed_at=_now(), attrs=attrs or {},
            fingerprint=fp,
        )
        s.add(r)
        s.commit()
        s.refresh(r)
        return rel_dict(r)


def guess_type(value):
    v = _norm(value)
    if _IP_RE.match(v):
        return "ip"
    if _DOMAIN_RE.match(v):
        return "domain"
    if "@" in v:
        return "email"
    return "domain"


# --------------------------------------------------------------------------- #
# OSINT transforms (public, keyless sources)                                   #
# --------------------------------------------------------------------------- #

async def _get_json(session, url, timeout=25):
    try:
        async with session.get(url, timeout=timeout, headers={"User-Agent": "RTAIP-OSINT/1.0"}) as r:
            if r.status == 200:
                return await r.json(content_type=None)
    except Exception:
        return None
    return None


async def transform_crtsh(domain, max_subs=60):
    """Certificate Transparency (crt.sh) -> subdomains of a domain. Public, keyless."""
    domain = _norm(domain)
    nodes, links = [], []
    root = save_entity("domain", domain, confidence=0.85, attrs={"seed": True})
    if not root:
        return nodes, links
    nodes.append(root)
    subs = set()
    async with aiohttp.ClientSession() as s:
        data = await _get_json(s, f"https://crt.sh/?q=%25.{domain}&output=json")
    for row in (data or []):
        name_value = row.get("name_value") or ""
        for host in name_value.split("\n"):
            host = _norm(host).lstrip("*.")
            if host and host != domain and host.endswith("." + domain):
                subs.add(host)
    for host in sorted(subs)[:max_subs]:
        sub = save_entity("subdomain", host, confidence=0.7, attrs={"via": "crt.sh"})
        if sub:
            nodes.append(sub)
            rel = save_relationship(sub["id"], root["id"], "subdomain_of", "crt.sh", 0.8)
            if rel:
                links.append(rel)
    return nodes, links


async def transform_resolve(hosts, max_hosts=25):
    """Resolve A records via Google DNS-over-HTTPS. Public, keyless."""
    nodes, links = [], []

    async def _resolve(session, host):
        host = _norm(host)
        data = await _get_json(session, f"https://dns.google/resolve?name={host}&type=A", timeout=12)
        ips = []
        for ans in ((data or {}).get("Answer") or []):
            if ans.get("type") == 1 and _IP_RE.match(str(ans.get("data", ""))):
                ips.append(ans["data"])
        return host, ips

    hosts = [h for h in dict.fromkeys(_norm(h) for h in hosts) if h][:max_hosts]
    if not hosts:
        return nodes, links
    async with aiohttp.ClientSession() as s:
        results = await asyncio.gather(*[_resolve(s, h) for h in hosts])
    for host, ips in results:
        if not ips:
            continue
        he = save_entity(guess_type(host), host, confidence=0.7)
        if not he:
            continue
        nodes.append(he)
        for ip in ips:
            ipe = save_entity("ip", ip, confidence=0.75, attrs={"via": "dns.google"})
            if ipe:
                nodes.append(ipe)
                rel = save_relationship(he["id"], ipe["id"], "resolves_to", "dns.google", 0.8)
                if rel:
                    links.append(rel)
    return nodes, links


async def run_transform(etype, value):
    """Dispatch an enrichment for a seed value and return the merged sub-graph."""
    value = _norm(value)
    etype = (etype or guess_type(value)).lower()
    all_nodes, all_links = {}, {}

    def _merge(nodes, links):
        for n in nodes:
            if n and n.get("id") is not None:
                all_nodes[n["id"]] = n
        for l in links:
            if l and l.get("id") is not None:
                all_links[l["id"]] = l

    if etype in ("domain", "subdomain"):
        n, l = await transform_crtsh(value)
        _merge(n, l)
        hosts = [value] + [x["value"] for x in n if x.get("etype") in ("domain", "subdomain")]
        rn, rl = await transform_resolve(hosts)
        _merge(rn, rl)
    elif etype == "ip":
        e = save_entity("ip", value, confidence=0.8, attrs={"seed": True})
        if e:
            _merge([e], [])
    else:
        e = save_entity(etype, value, confidence=0.7, attrs={"seed": True})
        if e:
            _merge([e], [])

    return {
        "seed": {"etype": etype, "value": value},
        "nodes": list(all_nodes.values()),
        "links": list(all_links.values()),
        "stats": {"nodes": len(all_nodes), "links": len(all_links)},
    }


def neighbors(entity_id):
    """Return an entity plus its 1-hop neighborhood (for click-to-expand pivots)."""
    with Session() as s:
        center = s.get(Entity, entity_id)
        if not center:
            return {"nodes": [], "links": []}
        rels = s.query(Relationship).filter(
            (Relationship.src_id == entity_id) | (Relationship.dst_id == entity_id)
        ).all()
        ids = {entity_id}
        for r in rels:
            ids.add(r.src_id)
            ids.add(r.dst_id)
        ents = s.query(Entity).filter(Entity.id.in_(ids)).all()
        return {"nodes": [ent_dict(e) for e in ents], "links": [rel_dict(r) for r in rels]}


def full_graph(limit=400):
    """Load the most recent slice of the graph for initial render."""
    with Session() as s:
        ents = s.query(Entity).order_by(Entity.last_seen.desc()).limit(limit).all()
        ids = {e.id for e in ents}
        if not ids:
            return {"nodes": [], "links": []}
        rels = s.query(Relationship).filter(
            Relationship.src_id.in_(ids), Relationship.dst_id.in_(ids)
        ).all()
        return {"nodes": [ent_dict(e) for e in ents], "links": [rel_dict(r) for r in rels]}


def stats():
    with Session() as s:
        by_type = {}
        for e in s.query(Entity.etype).all():
            by_type[e[0]] = by_type.get(e[0], 0) + 1
        return {
            "entities": s.query(Entity).count(),
            "relationships": s.query(Relationship).count(),
            "by_type": by_type,
        }
