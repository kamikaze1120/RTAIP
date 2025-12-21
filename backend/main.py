from fastapi import FastAPI
import threading
from ingestion import schedule_ingestion, run_ingestion
from anomaly import schedule_detection
from database import ensure_schema

app = FastAPI()

@app.get("/")
def read_root():
    return {"Hello": "World"}

from fastapi import FastAPI, Depends, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import Session, DataEvent, Anomaly, AlertRule, PerfMetric
import threading
from ingestion import schedule_ingestion
from anomaly import schedule_detection
from datetime import datetime
# New imports for email notifications
from pydantic import BaseModel
from typing import Optional, List
from datetime import timedelta
import os
import smtplib
from email.mime.text import MIMEText
from fastapi.encoders import jsonable_encoder

app = FastAPI()

# Enable CORS for frontend; configurable via ALLOWED_ORIGINS env (comma-separated)
DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3010",
    "http://127.0.0.1:3010",
]
ALLOWED_ORIGINS_ENV = os.getenv("ALLOWED_ORIGINS")
if ALLOWED_ORIGINS_ENV:
    origins = [o.strip() for o in ALLOWED_ORIGINS_ENV.split(",") if o.strip()]
else:
    origins = DEFAULT_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

cache_store = {}
def cache_get(key):
    v = cache_store.get(key)
    if not v:
        return None
    data, exp = v
    if exp < datetime.utcnow().timestamp():
        try:
            del cache_store[key]
        except Exception:
            pass
        return None
    return data

def cache_set(key, data, ttl_sec=5):
    cache_store[key] = (data, datetime.utcnow().timestamp() + ttl_sec)

def reverse_geocode(lat: float, lon: float):
    try:
        if lat is None or lon is None:
            return None
        key = f"geo:{round(lat,4)},{round(lon,4)}"
        cached = cache_get(key)
        if cached is not None:
            return cached
        import requests
        url = "https://nominatim.openstreetmap.org/reverse"
        params = {"format": "jsonv2", "lat": str(lat), "lon": str(lon)}
        headers = {"User-Agent": "RTAIP/1.0"}
        r = requests.get(url, params=params, headers=headers, timeout=6)
        name = None
        if r.ok:
            j = r.json()
            disp = j.get("display_name")
            addr = j.get("address") or {}
            city = addr.get("city") or addr.get("town") or addr.get("village") or addr.get("hamlet")
            state = addr.get("state")
            country = addr.get("country")
            if city and country:
                name = f"{city}, {country}"
            elif disp:
                name = disp.split(",")[0]
        cache_set(key, name or "Unknown", ttl_sec=86400)
        return name or "Unknown"
    except Exception:
        return "Unknown"


def get_db():
    db = Session()
    try:
        yield db
    finally:
        db.close()

# Serialization helpers to ensure valid JSON responses
def serialize_event(ev: DataEvent):
    return {
        "id": ev.id,
        "source": ev.source,
        "timestamp": ev.timestamp.isoformat() if ev.timestamp else None,
        "latitude": ev.latitude,
        "longitude": ev.longitude,
        "data": jsonable_encoder(ev.data),
        "confidence": ev.confidence,
    }

def serialize_anomaly(a: Anomaly):
    return {
        "id": a.id,
        "event_id": a.event_id,
        "type": a.type,
        "severity": a.severity,
        "description": a.description,
        "timestamp": a.timestamp.isoformat() if a.timestamp else None,
    }

@app.get("/events")
def get_events(db: Session = Depends(get_db), bbox: Optional[str] = None):
    key = f"events:{bbox or 'all'}"
    cached = cache_get(key)
    if cached is not None:
        return cached
    q = db.query(DataEvent)
    try:
        if bbox:
            parts = [p.strip() for p in bbox.split(',')]
            if len(parts) == 4:
                min_lat, min_lon, max_lat, max_lon = map(float, parts)
                q = q.filter(DataEvent.latitude >= min_lat, DataEvent.latitude <= max_lat, DataEvent.longitude >= min_lon, DataEvent.longitude <= max_lon)
    except Exception:
        pass
    events = q.all()
    data = [serialize_event(ev) for ev in events]
    cache_set(key, data)
    return data

@app.get("/anomalies")
def get_anomalies(db: Session = Depends(get_db), bbox: Optional[str] = None):
    key = f"anomalies:{bbox or 'all'}"
    cached = cache_get(key)
    if cached is not None:
        return cached
    q = db.query(Anomaly)
    try:
        if bbox:
            parts = [p.strip() for p in bbox.split(',')]
            if len(parts) == 4:
                min_lat, min_lon, max_lat, max_lon = map(float, parts)
                from sqlalchemy.orm import aliased
                Ev = aliased(DataEvent)
                q = q.join(Ev, Ev.id == Anomaly.event_id).filter(Ev.latitude >= min_lat, Ev.latitude <= max_lat, Ev.longitude >= min_lon, Ev.longitude <= max_lon)
    except Exception:
        pass
    anomalies = q.all()
    data = [serialize_anomaly(a) for a in anomalies]
    cache_set(key, data)
    return data

@app.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        db.execute("SELECT 1")
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "error": str(e)}

# Email notification request model
class EmailRequest(BaseModel):
    subject: str
    message: str
    to: Optional[str] = None
    to_email: Optional[str] = None

@app.post("/notify/email")
def notify_email(req: EmailRequest):
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USERNAME")
    pwd = os.getenv("SMTP_PASSWORD")
    from_addr = os.getenv("EMAIL_FROM")
    to_addr = req.to or req.to_email or os.getenv("EMAIL_TO_DEFAULT")

    missing = [k for k, v in {
        "SMTP_HOST": host,
        "SMTP_USERNAME": user,
        "SMTP_PASSWORD": pwd,
        "EMAIL_FROM": from_addr,
        "EMAIL_TO_DEFAULT": to_addr,
    }.items() if not v]
    if missing:
        return {"status": "error", "error": "Missing SMTP configuration", "missing": missing}

    msg = MIMEText(req.message or "")
    msg["Subject"] = req.subject
    msg["From"] = from_addr
    msg["To"] = to_addr

    try:
        server = smtplib.SMTP(host, port)
        server.starttls()
        server.login(user, pwd)
        server.sendmail(from_addr, [to_addr], msg.as_string())
        server.quit()
        return {"status": "sent", "to": to_addr}
    except Exception as e:
        return {"status": "error", "error": str(e)}

# Alert Rules CRUD
class AlertRuleIn(BaseModel):
    name: str
    source: Optional[str] = None
    severity_threshold: int = 5
    min_confidence: float = 0.5
    min_lat: Optional[float] = None
    min_lon: Optional[float] = None
    max_lat: Optional[float] = None
    max_lon: Optional[float] = None
    email_to: Optional[str] = None

def _in_bbox(lat: float, lon: float, r: AlertRule) -> bool:
    try:
        if None in (lat, lon):
            return False
        if r.min_lat is None or r.min_lon is None or r.max_lat is None or r.max_lon is None:
            return True
        return (r.min_lat <= lat <= r.max_lat) and (r.min_lon <= lon <= r.max_lon)
    except Exception:
        return False

@app.get("/alert-rules")
def list_alert_rules(db: Session = Depends(get_db)):
    return [
        {
            "id": r.id,
            "name": r.name,
            "source": r.source,
            "severity_threshold": r.severity_threshold,
            "min_confidence": r.min_confidence,
            "min_lat": r.min_lat,
            "min_lon": r.min_lon,
            "max_lat": r.max_lat,
            "max_lon": r.max_lon,
            "email_to": r.email_to,
        }
        for r in db.query(AlertRule).all()
    ]

@app.post("/alert-rules")
def create_alert_rule(rule: AlertRuleIn, db: Session = Depends(get_db)):
    r = AlertRule(
        name=rule.name,
        source=rule.source,
        severity_threshold=rule.severity_threshold,
        min_confidence=rule.min_confidence,
        min_lat=rule.min_lat,
        min_lon=rule.min_lon,
        max_lat=rule.max_lat,
        max_lon=rule.max_lon,
        email_to=rule.email_to,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return {"id": r.id}

@app.delete("/alert-rules/{rule_id}")
def delete_alert_rule(rule_id: int, db: Session = Depends(get_db)):
    r = db.query(AlertRule).get(rule_id)
    if not r:
        return {"status": "not_found"}
    db.delete(r)
    db.commit()
    return {"status": "deleted"}

# Analyst API
class AnalystQuery(BaseModel):
    query: str
    sessionId: Optional[str] = None

@app.post("/api/ai-analyst")
def ai_analyst(req: AnalystQuery, db: Session = Depends(get_db)):
    q = (req.query or "").lower()
    import re
    bbox = None
    m_bbox = re.search(r"bbox[:=]\s*([\-0-9\.]+),([\-0-9\.]+),([\-0-9\.]+),([\-0-9\.]+)", q)
    if m_bbox:
        try:
            bbox = tuple(map(float, [m_bbox.group(1), m_bbox.group(2), m_bbox.group(3), m_bbox.group(4)]))
        except Exception:
            bbox = None
    m_hours = re.search(r"last\s*(\d+)\s*hour", q)
    m_days = re.search(r"last\s*(\d+)\s*day", q)
    m_week = re.search(r"last\s*(\d+)\s*week", q)
    m_sev = re.search(r"severity\s*[>=]+\s*(\d+)", q)
    m_conf = re.search(r"(min\s*conf|confidence\s*[>=]+)\s*(\d+(?:\.\d+)?)", q)
    m_near = re.search(r"near[:=]\s*([\-0-9\.]+)\s*,\s*([\-0-9\.]+)", q)
    m_radius = re.search(r"radius[:=]\s*(\d+)\s*km", q)
    srcs = []
    for s in ["adsb","ais","usgs_seismic","noaa_weather","nasa_eonet","gdacs_disasters"]:
        if s in q:
            srcs.append(s)
    for k,v in {"adsb":["ads-b","aircraft"],"ais":["vessel","maritime"],"usgs_seismic":["usgs","seismic","earthquake"],"noaa_weather":["noaa","weather","storm","wind"],"nasa_eonet":["eonet","nasa events"],"gdacs_disasters":["gdacs","disaster"]}.items():
        if any(t in q for t in v):
            srcs.append(k)
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    delta = timedelta(hours=24)
    if m_hours:
        try:
            delta = timedelta(hours=int(m_hours.group(1)))
        except Exception:
            delta = timedelta(hours=24)
    elif m_days:
        try:
            delta = timedelta(days=int(m_days.group(1)))
        except Exception:
            delta = timedelta(days=1)
    elif m_week:
        try:
            delta = timedelta(days=7*int(m_week.group(1)))
        except Exception:
            delta = timedelta(days=7)
    start = now - delta
    ev_all = db.query(DataEvent).all()
    an_all = db.query(Anomaly).all()
    def in_bbox(e):
        if not bbox:
            return True
        if e.latitude is None or e.longitude is None:
            return False
        return bbox[0] <= e.latitude <= bbox[2] and bbox[1] <= e.longitude <= bbox[3]
    def in_radius(e):
        if not m_near:
            return True
        try:
            lat0 = float(m_near.group(1)); lon0 = float(m_near.group(2))
            rkm = float(m_radius.group(1)) if m_radius else 50.0
            if e.latitude is None or e.longitude is None:
                return False
            from math import radians, sin, cos, sqrt, atan2
            R = 6371.0
            dlat = radians(e.latitude - lat0)
            dlon = radians(e.longitude - lon0)
            a = sin(dlat/2)**2 + cos(radians(lat0))*cos(radians(e.latitude))*sin(dlon/2)**2
            c = 2*atan2(sqrt(a), sqrt(1-a))
            d = R*c
            return d <= rkm
        except Exception:
            return True
    min_sev = int(m_sev.group(1)) if m_sev else None
    min_conf = float(m_conf.group(2)) if m_conf else None
    evs = [e for e in ev_all if (e.timestamp and e.timestamp >= start) and in_bbox(e) and in_radius(e)]
    if srcs:
        evs = [e for e in evs if e.source in srcs]
    anoms = [a for a in an_all if (a.timestamp and a.timestamp >= start)]
    if srcs:
        ev_ids = set(e.id for e in evs)
        anoms = [a for a in anoms if a.event_id in ev_ids]
    if min_sev is not None:
        anoms = [a for a in anoms if (a.severity or 0) >= min_sev]
    if min_conf is not None:
        ev_by_id = {e.id: e for e in evs}
        anoms = [a for a in anoms if (ev_by_id.get(a.event_id) and ((ev_by_id.get(a.event_id).confidence or 0.0) >= min_conf))]
    def ser_e(e: DataEvent):
        return {"id": e.id, "source": e.source, "timestamp": e.timestamp.isoformat() if e.timestamp else None, "latitude": e.latitude, "longitude": e.longitude}
    def ser_a(a: Anomaly):
        return {"id": a.id, "event_id": a.event_id, "type": a.type, "severity": a.severity, "timestamp": a.timestamp.isoformat() if a.timestamp else None}
    out_lines: List[str] = []
    if "predict" in q:
        by_src_counts = {}
        for a in anoms:
            ev = next((e for e in evs if e.id == a.event_id), None)
            if not ev:
                continue
            src = ev.source or "unknown"
            ts = a.timestamp or now
            bucket = ts.replace(minute=0, second=0, microsecond=0)
            d = by_src_counts.setdefault(src, {})
            d[bucket] = d.get(bucket, 0) + 1
        preds = []
        pred_points = []
        for src, hist in by_src_counts.items():
            buckets = sorted(hist.keys())
            series = [hist[b] for b in buckets]
            if not series:
                continue
            alpha = 0.3
            ewma = series[0]
            for x in series[1:]:
                ewma = alpha * x + (1 - alpha) * ewma
            horizon_h = 6
            expected = max(0.0, float(ewma) * horizon_h / max(1, len(series)))
            peak = max(1, max(series))
            prob = min(1.0, ewma / float(peak))
            confv = min(1.0, 0.5 + min(0.5, len(series) / 24.0))
            preds.append({"source": src, "next_hours": horizon_h, "probability": prob, "expected_count": expected, "confidence": confv})
            grid = {}
            for a in anoms:
                ev = next((e for e in evs if e.id == a.event_id and (e.source or "unknown") == src), None)
                if not ev or ev.latitude is None or ev.longitude is None:
                    continue
                latb = round(ev.latitude)
                lonb = round(ev.longitude)
                k = (latb, lonb)
                grid[k] = grid.get(k, 0) + 1
            top_cells = sorted(grid.items(), key=lambda x: -x[1])[:3]
            for (latb, lonb), c in top_cells:
                name = reverse_geocode(float(latb), float(lonb))
                pred_points.append({"source": src, "latitude": float(latb), "longitude": float(lonb), "name": name, "probability": prob, "next_hours": horizon_h})
        out_lines.append(f"Predicted locations for next {horizon_h} hours:")
        for p in sorted(pred_points, key=lambda x: -x["probability"])[:10]:
            out_lines.append(f"- {p['name']} ({p['source'].upper()}) prob={(p['probability']*100):.0f}%")
        return {"type": "analysis", "output": "\n".join(out_lines), "events": [ser_e(e) for e in evs[:50]], "anomalies": [ser_a(a) for a in anoms[:50]], "predictions": preds, "predictions_points": pred_points}
    if any(t in q for t in ["how many","count","number"]):
        total_e = len(evs)
        total_a = len(anoms)
        if "by source" in q:
            by_src = {}
            ev_src = {}
            for e in evs: ev_src[e.source] = ev_src.get(e.source, 0) + 1
            for a in anoms:
                ev = next((e for e in evs if e.id == a.event_id), None)
                if ev: by_src[ev.source] = by_src.get(ev.source, 0) + 1
            out_lines.append("Counts by source:")
            for s in sorted(ev_src.keys() | by_src.keys()):
                out_lines.append(f"- {s.upper()} events={ev_src.get(s,0)} anomalies={by_src.get(s,0)}")
        else:
            out_lines.append(f"Events={total_e} anomalies={total_a}")
    elif any(t in q for t in ["hotspot","where","locations"]):
        bins = {}
        for a in anoms:
            ev = next((e for e in evs if e.id == a.event_id), None)
            if not ev or ev.latitude is None or ev.longitude is None:
                continue
            latb = round(ev.latitude/5)*5
            lonb = round(ev.longitude/5)*5
            k = (latb, lonb)
            bins[k] = bins.get(k, 0) + 1
        out_lines.append("Top hotspots:")
        for (latb,lonb), c in sorted(bins.items(), key=lambda x: -x[1])[:5]:
            out_lines.append(f"- ({latb},{lonb}) anomalies={c}")
    elif any(t in q for t in ["list","show","give"]):
        out_lines.append("Top anomalies:")
        for a in sorted(anoms, key=lambda x: -(x.severity or 0))[:10]:
            ev = next((e for e in evs if e.id == a.event_id), None)
            if ev:
                out_lines.append(f"- {ev.source.upper()} sev={a.severity} at ({ev.latitude},{ev.longitude}) {ev.timestamp.isoformat()}")
    elif any(t in q for t in ["trend","timeline","over time"]):
        buckets = {}
        for a in anoms:
            ts = a.timestamp or now
            b = ts.replace(minute=0, second=0, microsecond=0)
            buckets[b] = buckets.get(b, 0) + 1
        out_lines.append("Hourly anomaly trend:")
        for b, c in sorted(buckets.items()):
            out_lines.append(f"- {b.isoformat()} count={c}")
    elif any(t in q for t in ["summary","brief"]):
        by_src = {}
        for e in evs: by_src[e.source] = by_src.get(e.source, 0) + 1
        sev_hist = {}
        for a in anoms: sev_hist[a.severity] = sev_hist.get(a.severity, 0) + 1
        out_lines.append(f"Summary: events={len(evs)} anomalies={len(anoms)} window={int(delta.total_seconds()/3600)}h")
        for src, c in sorted(by_src.items()): out_lines.append(f"- {src.upper()} events={c}")
        if sev_hist: out_lines.append("- Severity: " + ", ".join(f"{k}:{v}" for k,v in sorted(sev_hist.items())))
    else:
        out_lines.append(f"Scope: sources={[s.upper() for s in srcs] or 'ALL'} window={int(delta.total_seconds()/3600)}h events={len(evs)} anomalies={len(anoms)}")
        for e in evs[:10]: out_lines.append(f"- {e.source.upper()} id={e.id} at ({e.latitude},{e.longitude}) {e.timestamp.isoformat()}")
    return {"type": "analysis", "output": "\n".join(out_lines), "events": [ser_e(e) for e in evs[:50]], "anomalies": [ser_a(a) for a in anoms[:50]]}

@app.get("/seed")
def seed(db: Session = Depends(get_db)):
    try:
        # Insert sample events across different sources/locations
        samples = [
            {"source": "adsb", "latitude": 34.05, "longitude": -118.25, "data": {"note": "aircraft over LA"}},
            {"source": "ais", "latitude": 37.77, "longitude": -122.42, "data": {"note": "vessel near SF"}},
            {"source": "usgs_seismic", "latitude": 35.68, "longitude": 139.69, "data": {"properties": {"mag": 3.2}}},
            {"source": "noaa_weather", "latitude": 51.51, "longitude": -0.13, "data": {"temp": 12, "wind": 5}},
            {"source": "adsb", "latitude": 25.76, "longitude": -80.19, "data": {"note": "aircraft over Miami"}},
            {"source": "ais", "latitude": 1.29, "longitude": 103.85, "data": {"note": "vessel near Singapore"}},
            {"source": "usgs_seismic", "latitude": -33.87, "longitude": 151.21, "data": {"properties": {"mag": 4.5}}},
            {"source": "noaa_weather", "latitude": 48.85, "longitude": 2.35, "data": {"temp": 9, "wind": 12}},
        ]
        created_events = []
        now = datetime.utcnow()
        for s in samples:
            ev = DataEvent(
                source=s["source"],
                timestamp=now,
                latitude=s["latitude"],
                longitude=s["longitude"],
                data=s["data"],
            )
            db.add(ev)
            created_events.append(ev)
        db.commit()
        for ev in created_events:
            db.refresh(ev)
        anomalies_created = 0
        if created_events:
            a1 = Anomaly(event_id=created_events[2].id, type="seismic_high", severity=7, description="Seed: high magnitude", timestamp=created_events[2].timestamp)
            db.add(a1)
            anomalies_created += 1
            a2 = Anomaly(event_id=created_events[7].id, type="geo_spatial", severity=5, description="Seed: spatial outlier", timestamp=created_events[7].timestamp)
            db.add(a2)
            anomalies_created += 1
            db.commit()
        return {"inserted_events": len(created_events), "inserted_anomalies": anomalies_created}
    except Exception as e:
        # Rollback on error and return a clear message
        try:
            db.rollback()
        except Exception:
            pass
        return {"status": "error", "message": str(e)}

@app.post("/perf/seed_many")
def seed_many(count: int = 1000, sources: Optional[str] = None, db: Session = Depends(get_db)):
    import random
    try:
        src_list = [s.strip() for s in (sources or "adsb,ais,usgs_seismic,noaa_weather").split(",") if s.strip()]
        created = 0
        now = datetime.utcnow()
        for i in range(count):
            src = random.choice(src_list)
            lat = random.uniform(-85, 85)
            lon = random.uniform(-180, 180)
            data = {"note": "perf seed", "i": i}
            conf = 0.7
            ev = DataEvent(source=src, timestamp=now, latitude=lat, longitude=lon, data=data, confidence=conf)
            db.add(ev)
            created += 1
        db.commit()
        return {"inserted_events": created}
    except Exception as e:
        try:
            db.rollback()
        except Exception:
            pass
        return {"status": "error", "message": str(e)}

subscribers: List[WebSocket] = []

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    subscribers.append(websocket)
    try:
        while True:
            _ = await websocket.receive_text()
            # No-op: server-driven pushes only
    except Exception:
        pass
    finally:
        try:
            subscribers.remove(websocket)
        except Exception:
            pass

def broadcast_alert(text: str):
    for ws in list(subscribers):
        try:
            # FastAPI WebSocket requires await; here we schedule via thread-safe path
            import asyncio
            asyncio.run(ws.send_text(text))
        except Exception:
            try:
                subscribers.remove(ws)
            except Exception:
                pass

@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.api_route("/migrate", methods=["GET", "POST"])
def migrate():
    ok, msg = ensure_schema()
    return {"ok": ok, "message": msg}

@app.on_event("startup")
def _startup():
    try:
        ensure_schema()
    except Exception:
        pass
    try:
        threading.Thread(target=schedule_ingestion, daemon=True).start()
    except Exception:
        pass
    try:
        threading.Thread(target=schedule_detection, daemon=True).start()
    except Exception:
        pass

@app.get("/ingest")
def ingest_now():
    threading.Thread(target=run_ingestion, daemon=True).start()
    return {"status": "started"}
class PerfReport(BaseModel):
    fps: float
    events: int
    anomalies: int
    zoom: Optional[int] = None
    device: Optional[str] = None

@app.post("/perf/report")
def perf_report(rep: PerfReport, db: Session = Depends(get_db)):
    m = PerfMetric(fps=rep.fps, events=rep.events, anomalies=rep.anomalies, zoom=rep.zoom or 0, device=rep.device or "")
    db.add(m)
    db.commit()
    return {"id": m.id}

@app.get("/perf/metrics")
def perf_metrics(limit: int = 200, db: Session = Depends(get_db)):
    rows = db.query(PerfMetric).order_by(PerfMetric.id.desc()).limit(limit).all()
    return [{"ts": r.ts.isoformat(), "fps": r.fps, "events": r.events, "anomalies": r.anomalies, "zoom": r.zoom, "device": r.device} for r in rows]

@app.get("/summary")
def summary(window: str = "24h", bbox: Optional[str] = None, db: Session = Depends(get_db)):
    now = datetime.utcnow()
    delta_h = 24
    wl = window.lower()
    if wl.startswith("last ") and "hour" in wl:
        delta_h = 1
    start = now - timedelta(hours=delta_h)
    Ev = DataEvent
    qev = db.query(Ev).filter(Ev.timestamp >= start)
    if bbox:
        try:
            parts = [p.strip() for p in bbox.split(',')]
            if len(parts) == 4:
                min_lat, min_lon, max_lat, max_lon = map(float, parts)
                qev = qev.filter(Ev.latitude >= min_lat, Ev.latitude <= max_lat, Ev.longitude >= min_lon, Ev.longitude <= max_lon)
        except Exception:
            pass
    events = qev.all()
    src_counts = {}
    conf_acc = {}
    for e in events:
        src_counts[e.source] = src_counts.get(e.source, 0) + 1
        if e.confidence is not None:
            conf_acc.setdefault(e.source, []).append(float(e.confidence))
    avg_conf = {s: (sum(v)/len(v) if v else 0) for s, v in conf_acc.items()}
    A = Anomaly
    qA = db.query(A).filter(A.timestamp >= start)
    anomalies = qA.all()
    sev_hist = {}
    for a in anomalies:
        sev_hist[a.severity] = sev_hist.get(a.severity, 0) + 1
    top_sources = sorted(src_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    return {"top_sources": top_sources, "avg_confidence": avg_conf, "severity_hist": sev_hist, "event_count": len(events), "anomaly_count": len(anomalies)}
@app.get("/migrate")
def migrate():
    ok, msg = ensure_schema()
    return {"ok": ok, "message": msg}