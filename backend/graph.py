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
import os
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
        rn, rl = await transform_rdap(value)
        _merge(rn, rl)
        hosts = [value] + [x["value"] for x in n if x.get("etype") in ("domain", "subdomain")]
        rn2, rl2 = await transform_resolve(hosts)
        _merge(rn2, rl2)
        ips = [x["value"] for x in all_nodes.values() if x.get("etype") == "ip"]
        gn, gl = await transform_ipgeo(ips)
        _merge(gn, gl)
        hn, hl = await transform_hibp(value)
        _merge(hn, hl)
    elif etype == "ip":
        seed = save_entity("ip", value, confidence=0.85, attrs={"seed": True})
        if seed:
            _merge([seed], [])
        gn, gl = await transform_ipgeo([value])
        _merge(gn, gl)
        sn, sl = await transform_shodan(value)
        _merge(sn, sl)
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


# --------------------------------------------------------------------------- #
# Additional OSINT transforms                                                  #
# --------------------------------------------------------------------------- #

async def transform_rdap(domain):
    # Registrar org + nameservers via RDAP (public, keyless)
    domain = _norm(domain)
    nodes, links = [], []
    root = save_entity("domain", domain, confidence=0.85, attrs={"seed": True})
    if not root:
        return nodes, links
    nodes.append(root)
    async with aiohttp.ClientSession() as s:
        data = await _get_json(s, "https://rdap.org/domain/" + domain)
    if not data:
        return nodes, links
    for ent in (data.get("entities") or []):
        if "registrar" in (ent.get("roles") or []):
            name = ent.get("handle")
            for v in ((ent.get("vcardArray") or [None, []])[1] or []):
                if isinstance(v, list) and len(v) >= 4 and v[0] == "fn":
                    name = v[3]
            if name:
                o = save_entity("org", str(name), confidence=0.7, attrs={"role": "registrar", "via": "rdap"})
                if o:
                    nodes.append(o)
                    r = save_relationship(root["id"], o["id"], "registered_by", "rdap.org", 0.75)
                    if r:
                        links.append(r)
    for ns in (data.get("nameservers") or []):
        host = _norm(ns.get("ldhName") or "")
        if host:
            ne = save_entity("domain", host, confidence=0.6, attrs={"role": "nameserver", "via": "rdap"})
            if ne:
                nodes.append(ne)
                r = save_relationship(root["id"], ne["id"], "uses_nameserver", "rdap.org", 0.7)
                if r:
                    links.append(r)
    return nodes, links


async def transform_ipgeo(ips, max_ips=25):
    # IP geolocation + ASN via ip-api.com (public, keyless). Adds lat/lon to IP nodes.
    nodes, links = [], []
    ips = [i for i in dict.fromkeys(ips) if _IP_RE.match(i or "")][:max_ips]
    if not ips:
        return nodes, links

    async def _geo(session, ip):
        d = await _get_json(session, "http://ip-api.com/json/" + ip + "?fields=status,country,city,lat,lon,isp,org,as", timeout=10)
        return ip, d

    async with aiohttp.ClientSession() as s:
        results = await asyncio.gather(*[_geo(s, ip) for ip in ips])
    for ip, d in results:
        if not d or d.get("status") != "success":
            continue
        lat = d.get("lat")
        lon = d.get("lon")
        ipe = save_entity("ip", ip, confidence=0.8, attrs={"lat": lat, "lon": lon, "city": d.get("city"), "country": d.get("country"), "isp": d.get("isp"), "via": "ip-api"})
        if ipe:
            nodes.append(ipe)
        loc_label = ", ".join([x for x in [d.get("city"), d.get("country")] if x])
        if loc_label and ipe:
            loc = save_entity("location", loc_label, confidence=0.6, attrs={"lat": lat, "lon": lon})
            if loc:
                nodes.append(loc)
                r = save_relationship(ipe["id"], loc["id"], "located_at", "ip-api", 0.7)
                if r:
                    links.append(r)
        asn = d.get("as")
        if asn and ipe:
            ae = save_entity("asn", str(asn).split(" ")[0], label=str(asn), confidence=0.6, attrs={"org": d.get("org"), "via": "ip-api"})
            if ae:
                nodes.append(ae)
                r = save_relationship(ipe["id"], ae["id"], "announced_by", "ip-api", 0.65)
                if r:
                    links.append(r)
    return nodes, links


async def transform_shodan(ip):
    # Host services via Shodan (requires SHODAN_API_KEY; no-op without it)
    nodes, links = [], []
    key = os.getenv("SHODAN_API_KEY")
    if not key or not _IP_RE.match(ip or ""):
        return nodes, links
    ipe = save_entity("ip", ip, confidence=0.8)
    if ipe:
        nodes.append(ipe)
    async with aiohttp.ClientSession() as s:
        d = await _get_json(s, "https://api.shodan.io/shodan/host/" + ip + "?key=" + key)
    if not d:
        return nodes, links
    for h in (d.get("hostnames") or [])[:25]:
        he = save_entity("domain", _norm(h), confidence=0.6, attrs={"via": "shodan"})
        if he and ipe:
            nodes.append(he)
            r = save_relationship(he["id"], ipe["id"], "resolves_to", "shodan", 0.7)
            if r:
                links.append(r)
    for port in (d.get("ports") or [])[:50]:
        pe = save_entity("service", ip + ":" + str(port), label="port " + str(port), confidence=0.6, attrs={"port": port, "via": "shodan"})
        if pe and ipe:
            nodes.append(pe)
            r = save_relationship(ipe["id"], pe["id"], "exposes", "shodan", 0.7)
            if r:
                links.append(r)
    return nodes, links


async def transform_hibp(value):
    # Breaches associated with a DOMAIN (public endpoint). Domains only, never individual accounts.
    nodes, links = [], []
    v = _norm(value)
    if "@" in v or "." not in v:
        return nodes, links
    root = save_entity("domain", v, confidence=0.8)
    if root:
        nodes.append(root)
    async with aiohttp.ClientSession() as s:
        data = await _get_json(s, "https://haveibeenpwned.com/api/v3/breaches?Domain=" + v)
    for b in (data or [])[:50]:
        name = b.get("Name") or b.get("Title")
        if not name:
            continue
        be = save_entity("breach", str(name), label=b.get("Title") or str(name), confidence=0.7, attrs={"date": b.get("BreachDate"), "pwnCount": b.get("PwnCount"), "via": "hibp"})
        if be and root:
            nodes.append(be)
            r = save_relationship(root["id"], be["id"], "breached_in", "hibp", 0.7)
            if r:
                links.append(r)
    return nodes, links
