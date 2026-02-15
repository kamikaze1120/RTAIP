from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import Session as DBSession, User, DataEvent, ensure_schema, Organization, OrgMembership, Invitation, AuditLog, ConsentLog, IpAllowlist, OrgSettings, PromptLog, AlertRule, AlertHistory, Workspace, Case, CaseMembership, EventTag, EventAnnotation, CaseComment, Report, PerfMetric
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from auth import create_access_token, get_password_hash, verify_password
from datetime import timedelta
import datetime
import os
import asyncio
import threading
from ingestion import ingest_nasa_eonet, ingest_nasa_fires, ingest_adsb_aircraft, ingest_ais_maritime, ingest_usace_hifld, ingest_gdacs_disasters, ingest_dtic, ingest_global_terrorism
from ingestion import save_event, list_connectors, set_enabled, run_selected

app = FastAPI()

# Ingestion scheduling
def run_ingestion():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    async def schedule_tasks():
        while True:
            print("[INGEST] Starting hourly data ingestion cycle...")
            await asyncio.gather(
                ingest_nasa_fires(),          # NGA Tearline
                ingest_nasa_eonet(),          # Janes
                ingest_gdacs_disasters(),     # ODIN
                ingest_adsb_aircraft(),       # Military Periscope
                ingest_ais_maritime(),        # PUB LOG
                ingest_usace_hifld(),         # USACE
                ingest_dtic(),                # DTIC
                ingest_global_terrorism()     # Global Terrorism DB
            )
            print("[INGEST] Hourly ingestion cycle completed successfully")
            await asyncio.sleep(3600) # Run every hour

    loop.run_until_complete(schedule_tasks())

@app.on_event("startup")
async def startup_event():
    thread = threading.Thread(target=run_ingestion)
    thread.daemon = True
    thread.start()

# Enable CORS for frontend; configurable via ALLOWED_ORIGINS env (comma-separated)
DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3010",
    "http://127.0.0.1:3010",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://rtaip.vercel.app",
]
ALLOWED_ORIGINS_ENV = os.getenv("ALLOWED_ORIGINS")
if ALLOWED_ORIGINS_ENV:
    origins = [o.strip() for o in ALLOWED_ORIGINS_ENV.split(",") if o.strip()]
else:
    origins = DEFAULT_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?|https://.*vercel\.app|https://.*onrender\.com",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

class UserCreate(BaseModel):
    username: str
    email: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class OrgCreate(BaseModel):
    name: str

class InviteCreate(BaseModel):
    email: str
    role: str

class ConsentInput(BaseModel):
    user_id: int
    accepted_privacy: bool
    accepted_terms: bool
    version: str
    ip: str | None = None

def get_db():
    db = DBSession()
    try:
        logger.info("Database session created.")
        yield db
    finally:
        db.close()

@app.post("/users/register")
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        return {"error": "Username already registered"}
    hashed_password = get_password_hash(str(user.password))
    db_user = User(username=user.username, email=user.email, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    try:
        al = AuditLog(user_id=db_user.id, event="user_registered", details={"email": user.email})
        db.add(al)
        db.commit()
    except Exception:
        pass
    return {"message": "User registered successfully", "id": db_user.id}

@app.post("/auth/login")
def login_for_access_token(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user or not verify_password(user.password, db_user.hashed_password):
        return {"error": "Incorrect username or password"}
    access_token_expires = timedelta(minutes=30)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    try:
        al = AuditLog(user_id=db_user.id, event="login", ip=None, session_id=None, details={"username": user.username})
        db.add(al)
        db.commit()
    except Exception:
        pass
    return {"access_token": access_token, "token_type": "bearer"}

import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
SUPABASE_TABLE = os.getenv("SUPABASE_TABLE", "data_events")

def supabase_configured() -> bool:
    return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY and SUPABASE_TABLE)

async def supabase_fetch_events():
    import aiohttp
    if not supabase_configured():
        return None
    primary = SUPABASE_TABLE or "data_events"
    candidates = [primary] + (["data_events"] if primary != "data_events" else []) + (["events"] if primary != "events" else [])
    headers = {"apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"}
    async with aiohttp.ClientSession() as session:
        for tbl in candidates:
            try:
                url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{tbl}?select=*"
                async with session.get(url, headers=headers) as r:
                    if r.status == 200:
                        return await r.json()
            except:
                pass
    return []

def supabase_insert_events(rows: list[dict]) -> tuple[bool, str]:
    import requests
    if not supabase_configured():
        return False, "supabase not configured"
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{SUPABASE_TABLE}"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    try:
        r = requests.post(url, headers=headers, json=rows, timeout=15)
        ok = r.status_code in (200, 201)
        return ok, r.text if not ok else "ok"
    except Exception as e:
        return False, str(e)

@app.get("/events")
async def get_events():
    try:
        if supabase_configured():
            se = await supabase_fetch_events()
            if isinstance(se, list):
                logger.info(f"Fetched {len(se)} events from Supabase")
                return se
        db = DBSession()
        try:
            rows = db.query(DataEvent).all()
        finally:
            db.close()
        payload = [
            {
                "id": e.id,
                "source": e.source,
                "timestamp": e.timestamp.isoformat() if getattr(e, "timestamp", None) else None,
                "latitude": e.latitude,
                "longitude": e.longitude,
                "confidence": e.confidence,
                "data": e.data,
            }
            for e in rows
        ]
        logger.info(f"Fetched {len(payload)} events from DB")
        return payload
    except Exception as e:
        logger.error(f"Error fetching events: {e}", exc_info=True)
        return []

@app.post("/orgs")
def create_org(payload: OrgCreate, db: Session = Depends(get_db)):
    o = Organization(name=payload.name)
    db.add(o)
    db.commit()
    db.refresh(o)
    return {"id": o.id, "name": o.name}

@app.get("/orgs")
def list_orgs(db: Session = Depends(get_db)):
    rows = db.query(Organization).all()
    return [{"id": r.id, "name": r.name} for r in rows]

@app.post("/orgs/{org_id}/invite")
def invite_user(org_id: int, payload: InviteCreate, db: Session = Depends(get_db)):
    import secrets
    import datetime
    token = secrets.token_urlsafe(24)
    inv = Invitation(org_id=org_id, email=payload.email, role=payload.role, token=token, created_at=datetime.datetime.utcnow())
    db.add(inv)
    db.commit()
    db.refresh(inv)
    try:
        al = AuditLog(event="invite_created", org_id=org_id, details={"email": payload.email, "role": payload.role, "token": token})
        db.add(al)
        db.commit()
    except Exception:
        pass
    return {"token": token}

class InviteAccept(BaseModel):
    token: str
    user_id: int

@app.post("/invites/accept")
def accept_invite(payload: InviteAccept, db: Session = Depends(get_db)):
    inv = db.query(Invitation).filter(Invitation.token == payload.token).first()
    if not inv:
        return {"error": "invalid"}
    mem = OrgMembership(org_id=inv.org_id, user_id=payload.user_id, role=inv.role)
    db.add(mem)
    inv.accepted_at = datetime.datetime.utcnow()
    db.commit()
    try:
        al = AuditLog(event="invite_accepted", org_id=inv.org_id, user_id=payload.user_id, details={"email": inv.email, "role": inv.role})
        db.add(al)
        db.commit()
    except Exception:
        pass
    return {"ok": True}

@app.get("/orgs/{org_id}/members")
def org_members(org_id: int, db: Session = Depends(get_db)):
    rows = db.query(OrgMembership).filter(OrgMembership.org_id == org_id).all()
    out = []
    for r in rows:
        u = db.query(User).filter(User.id == r.user_id).first()
        out.append({"id": r.id, "role": r.role, "user_id": r.user_id, "username": u.username if u else None, "email": u.email if u else None})
    return out

@app.get("/audit")
def list_audit(db: Session = Depends(get_db)):
    rows = db.query(AuditLog).order_by(AuditLog.ts.desc()).limit(500).all()
    return [{"timestamp": r.ts.isoformat(), "event": r.event, "user": r.user_id, "details": r.details} for r in rows]

@app.post("/consent")
def record_consent(payload: ConsentInput, db: Session = Depends(get_db)):
    cl = ConsentLog(user_id=payload.user_id, accepted_privacy=1 if payload.accepted_privacy else 0, accepted_terms=1 if payload.accepted_terms else 0, version=payload.version, ip=payload.ip or None)
    db.add(cl)
    try:
        al = AuditLog(user_id=payload.user_id, event="consent_accepted", details={"version": payload.version})
        db.add(al)
    except Exception:
        pass
    db.commit()
    return {"ok": True}

class IpItem(BaseModel):
    org_id: int
    cidr: str
    label: str | None = None
    active: bool = True

@app.post("/ip-allowlists")
def add_ip(item: IpItem, db: Session = Depends(get_db)):
    row = IpAllowlist(org_id=item.org_id, cidr=item.cidr, label=item.label or None, active=1 if item.active else 0)
    db.add(row)
    db.commit()
    return {"ok": True}

@app.get("/ip-allowlists")
def list_ip(org_id: int, db: Session = Depends(get_db)):
    rows = db.query(IpAllowlist).filter(IpAllowlist.org_id == org_id, IpAllowlist.active == 1).all()
    return [{"cidr": r.cidr, "label": r.label} for r in rows]

@app.get("/session/policy")
def session_policy():
    return {"minutes": 30}

@app.get("/connectors")
def connectors():
    return {"available": list_connectors()}

class ConnectorsEnable(BaseModel):
    names: List[str]

@app.post("/connectors/enable")
def connectors_enable(payload: ConnectorsEnable):
    set_enabled(payload.names)
    return {"enabled": payload.names}

class ConnectorsRun(BaseModel):
    names: Optional[List[str]] = None

@app.post("/connectors/run")
async def connectors_run(payload: ConnectorsRun):
    await run_selected(payload.names or None)
    return {"ok": True}

@app.get("/events/status")
async def events_status():
    try:
        if supabase_configured():
            import aiohttp
            headers = {"apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}"}
            url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{(SUPABASE_TABLE or 'data_events')}?select=id&limit=1"
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=headers) as r:
                    ok = r.status == 200
                    msg = None
                    try:
                        if not ok:
                            msg = await r.text()
                    except:
                        pass
                    return {"supabase": True, "table": SUPABASE_TABLE, "ok": ok, "status": r.status, "error": msg}
        # DB fallback
        db = DBSession()
        try:
            n = db.query(DataEvent).limit(1).count()
            return {"supabase": False, "db": True, "ok": True, "count_sample": n}
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Status check failed: {e}")
        return {"ok": False, "error": str(e)}

@app.post("/ingest/webhook/{source}")
def ingest_webhook(source: str, body: dict):
    try:
        ts = None
        for k in ("timestamp","time","date"):
            v = body.get(k)
            if v:
                try:
                    ts = datetime.datetime.fromisoformat(str(v).replace('Z',''))
                    break
                except Exception:
                    try:
                        ts = datetime.datetime.utcfromtimestamp(float(v))
                        break
                    except Exception:
                        pass
        if ts is None:
            ts = datetime.datetime.utcnow()
        lat = body.get('latitude') if body.get('latitude') is not None else body.get('lat')
        lon = body.get('longitude') if body.get('longitude') is not None else body.get('lon')
        conf = float(body.get('confidence', 0.6))
        saved = save_event(source, ts, lat, lon, body, conf)
        return {"saved": saved}
    except Exception as e:
        return {"error": str(e)}

@app.get("/")
def root():
    return {"name": "RTAIP", "status": "ok"}

@app.get("/health")
def health():
    return {"status": "ok"}

# --- AI Analyst (RAG) ---
class AIQuery(BaseModel):
    query: str
    user_id: Optional[int] = None
    top_k: Optional[int] = 5
    since_hours: Optional[int] = 24 * 365
    min_confidence: Optional[float] = None

class CitationOut(BaseModel):
    id: int
    source: Optional[str]
    timestamp: Optional[str]
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    snippet: Optional[str] = None
    confidence: Optional[float] = None

class AIResponse(BaseModel):
    answer: str
    citations: List[CitationOut]
    confidence: float
    insufficient: bool
    log_id: Optional[int] = None

@app.post("/migrate")
def migrate():
    ok, msg = ensure_schema()
    return {"ok": ok, "message": msg}

# --- Alerts & Notifications ---
class AlertRuleIn(BaseModel):
    name: str
    org_id: Optional[int] = None
    source: Optional[str] = None
    severity_threshold: Optional[int] = 5
    min_confidence: Optional[float] = 0.5
    min_lat: Optional[float] = None
    min_lon: Optional[float] = None
    max_lat: Optional[float] = None
    max_lon: Optional[float] = None
    geofence_center_lat: Optional[float] = None
    geofence_center_lon: Optional[float] = None
    geofence_radius_m: Optional[int] = None
    keywords: Optional[str] = None
    email_to: Optional[str] = None
    sms_to: Optional[str] = None
    webhook_url: Optional[str] = None
    priority: Optional[int] = 3
    enabled: Optional[bool] = True
    dedup_window_s: Optional[int] = 600

class AlertRuleOut(BaseModel):
    id: int
    name: str
    org_id: Optional[int]
    source: Optional[str]
    severity_threshold: Optional[int]
    min_confidence: Optional[float]
    min_lat: Optional[float]
    min_lon: Optional[float]
    max_lat: Optional[float]
    max_lon: Optional[float]
    geofence_center_lat: Optional[float]
    geofence_center_lon: Optional[float]
    geofence_radius_m: Optional[int]
    keywords: Optional[str]
    email_to: Optional[str]
    sms_to: Optional[str]
    webhook_url: Optional[str]
    priority: int
    enabled: bool
    dedup_window_s: int

class AlertHistoryOut(BaseModel):
    id: int
    ts: str
    rule_id: int
    org_id: Optional[int]
    event_id: Optional[int]
    priority: int
    message: str
    delivered_email: int
    delivered_sms: int
    delivered_webhook: int
    status: str

def _haversine_km(lat1, lon1, lat2, lon2):
    try:
        from math import radians, sin, cos, atan2, sqrt
        R = 6371.0
        dlat = radians(lat2 - lat1)
        dlon = radians(lon2 - lon1)
        a = sin(dlat/2)**2 + cos(radians(lat1))*cos(radians(lat2))*sin(dlon/2)**2
        c = 2 * atan2(sqrt(a), sqrt(1-a))
        return R * c
    except Exception:
        return 1e9

def _event_text(e: DataEvent) -> str:
    import json
    try:
        d = e.data or {}
        head = d.get('headline') or d.get('title') or d.get('summary') or ''
        body = json.dumps(d, separators=(',',':'))
        return f"{e.source or ''} {head} {body}".lower()
    except Exception:
        try:
            return json.dumps(e.data or {}).lower()
        except Exception:
            return ''

def _send_email(to_addr: str, subject: str, text: str) -> bool:
    try:
        import os, smtplib
        from email.mime.text import MIMEText
        host = os.getenv('SMTP_HOST')
        port = int(os.getenv('SMTP_PORT', '587'))
        user = os.getenv('SMTP_USERNAME')
        pwd = os.getenv('SMTP_PASSWORD')
        from_addr = os.getenv('EMAIL_FROM')
        if not (host and user and pwd and from_addr and to_addr):
            return False
        msg = MIMEText(text)
        msg['Subject'] = subject
        msg['From'] = from_addr
        msg['To'] = to_addr
        s = smtplib.SMTP(host, port)
        s.starttls()
        s.login(user, pwd)
        s.sendmail(from_addr, [to_addr], msg.as_string())
        s.quit()
        return True
    except Exception:
        return False

def _send_sms(to_number: str, text: str) -> bool:
    try:
        import os
        sid = os.getenv('TWILIO_ACCOUNT_SID')
        token = os.getenv('TWILIO_AUTH_TOKEN')
        from_num = os.getenv('TWILIO_FROM_NUMBER')
        if sid and token and from_num:
            from twilio.rest import Client  # type: ignore
            client = Client(sid, token)
            m = client.messages.create(body=text, from_=from_num, to=to_number)
            return bool(m.sid)
        hook = os.getenv('SMS_WEBHOOK_URL')
        if hook:
            import requests
            r = requests.post(hook, json={'to': to_number, 'text': text}, timeout=10)
            return r.status_code in (200, 201)
        return False
    except Exception:
        return False

def _send_webhook(url: str, payload: dict) -> bool:
    try:
        import requests
        r = requests.post(url, json=payload, timeout=10)
        return r.status_code in (200, 201)
    except Exception:
        return False

def _evaluate_rule_on_event(rule: AlertRule, e: DataEvent) -> bool:
    try:
        if not (rule.enabled or 0):
            return False
        if rule.source and e.source and rule.source != e.source:
            return False
        sev = int(round(float(e.confidence or 0.5) * 10))
        if rule.severity_threshold and sev < int(rule.severity_threshold or 0):
            return False
        if rule.min_confidence and float(e.confidence or 0.0) < float(rule.min_confidence or 0.0):
            return False
        lat, lon = e.latitude, e.longitude
        if (rule.min_lat is not None and rule.min_lon is not None and rule.max_lat is not None and rule.max_lon is not None):
            if lat is None or lon is None:
                return False
            if not (rule.min_lat <= lat <= rule.max_lat and rule.min_lon <= lon <= rule.max_lon):
                return False
        if (rule.geofence_center_lat is not None and rule.geofence_center_lon is not None and rule.geofence_radius_m is not None):
            if lat is None or lon is None:
                return False
            d = _haversine_km(rule.geofence_center_lat, rule.geofence_center_lon, lat, lon) * 1000.0
            if d > float(rule.geofence_radius_m or 0):
                return False
        if rule.keywords:
            text = _event_text(e)
            terms = [t.strip().lower() for t in str(rule.keywords).split(',') if t.strip()]
            if terms and not any(t in text for t in terms):
                return False
        return True
    except Exception:
        return False

def _dedup_key(rule: AlertRule, e: DataEvent) -> str:
    t = e.timestamp or datetime.datetime.utcnow()
    try:
        if isinstance(t, str):
            t = datetime.datetime.fromisoformat(t)
    except Exception:
        t = datetime.datetime.utcnow()
    base = f"{rule.id}|{e.fingerprint or (e.source or '')}|{int(t.timestamp())//60}|{round((e.latitude or 0.0)*100)}|{round((e.longitude or 0.0)*100)}"
    return base

def evaluate_alerts_for_event(e: DataEvent):
    db = DBSession()
    try:
        rules = db.query(AlertRule).filter((AlertRule.enabled == 1) | (AlertRule.enabled == None)).all()
        for r in rules:
            if not _evaluate_rule_on_event(r, e):
                continue
            dk = _dedup_key(r, e)
            win_s = int(r.dedup_window_s or 600)
            since = (e.timestamp if isinstance(e.timestamp, datetime.datetime) else datetime.datetime.utcnow()) - datetime.timedelta(seconds=win_s)
            dup = db.query(AlertHistory).filter(AlertHistory.rule_id == r.id, AlertHistory.dedup_key == dk, AlertHistory.ts >= since).first()
            if dup:
                continue
            msg = f"Alert: {r.name} src={e.source} ts={(e.timestamp.isoformat() if isinstance(e.timestamp, datetime.datetime) else e.timestamp)} lat={e.latitude} lon={e.longitude}"
            hist = AlertHistory(rule_id=r.id, event_id=e.id, org_id=r.org_id, priority=int(r.priority or 3), message=msg, dedup_key=dk, status='pending')
            db.add(hist)
            db.commit()
            db.refresh(hist)
            delivered_email = 0
            delivered_sms = 0
            delivered_webhook = 0
            if r.email_to:
                delivered_email = 1 if _send_email(r.email_to, f"RTAIP Alert: {r.name}", msg) else 0
            if r.sms_to:
                delivered_sms = 1 if _send_sms(r.sms_to, msg) else 0
            if r.webhook_url:
                delivered_webhook = 1 if _send_webhook(r.webhook_url, {'message': msg, 'event_id': e.id, 'rule_id': r.id}) else 0
            hist.delivered_email = delivered_email
            hist.delivered_sms = delivered_sms
            hist.delivered_webhook = delivered_webhook
            hist.status = 'delivered' if (delivered_email or delivered_sms or delivered_webhook) else 'queued'
            db.commit()
    finally:
        db.close()

class EventSim(BaseModel):
    source: str
    timestamp: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    confidence: Optional[float] = 0.5
    data: Optional[Dict[str, Any]] = None

@app.post('/alerts/test')
def alerts_test(body: EventSim) -> Dict[str, Any]:
    db = DBSession()
    try:
        ts = None
        try:
            ts = datetime.datetime.fromisoformat((body.timestamp or '').replace('Z',''))
        except Exception:
            ts = datetime.datetime.utcnow()
        ev = DataEvent(source=body.source, timestamp=ts, latitude=body.latitude, longitude=body.longitude, confidence=float(body.confidence or 0.5), data=body.data or {})
        db.add(ev)
        db.commit()
        db.refresh(ev)
        try:
            evaluate_alerts_for_event(ev)
        except Exception:
            pass
        return {'event_id': ev.id}
    finally:
        db.close()

@app.get('/alert-rules')
def list_alert_rules(org_id: Optional[int] = None) -> List[AlertRuleOut]:
    db = DBSession()
    try:
        q = db.query(AlertRule)
        if org_id:
            q = q.filter(AlertRule.org_id == org_id)
        rows = q.order_by(AlertRule.id.desc()).all()
        out: List[AlertRuleOut] = []
        for r in rows:
            out.append(AlertRuleOut(
                id=r.id, name=r.name, org_id=r.org_id, source=r.source, severity_threshold=r.severity_threshold, min_confidence=r.min_confidence,
                min_lat=r.min_lat, min_lon=r.min_lon, max_lat=r.max_lat, max_lon=r.max_lon, geofence_center_lat=r.geofence_center_lat,
                geofence_center_lon=r.geofence_center_lon, geofence_radius_m=r.geofence_radius_m, keywords=r.keywords, email_to=r.email_to,
                sms_to=r.sms_to, webhook_url=r.webhook_url, priority=int(r.priority or 3), enabled=bool(r.enabled or 0), dedup_window_s=int(r.dedup_window_s or 600)
            ))
        return out
    finally:
        db.close()

@app.post('/alert-rules')
def create_alert_rule(body: AlertRuleIn) -> Dict[str, Any]:
    db = DBSession()
    try:
        r = AlertRule(
            name=body.name, org_id=body.org_id, source=body.source, severity_threshold=body.severity_threshold or 5, min_confidence=body.min_confidence or 0.5,
            min_lat=body.min_lat, min_lon=body.min_lon, max_lat=body.max_lat, max_lon=body.max_lon, geofence_center_lat=body.geofence_center_lat,
            geofence_center_lon=body.geofence_center_lon, geofence_radius_m=body.geofence_radius_m, keywords=body.keywords, email_to=body.email_to,
            sms_to=body.sms_to, webhook_url=body.webhook_url, priority=body.priority or 3, enabled=1 if (body.enabled is None or body.enabled) else 0,
            dedup_window_s=body.dedup_window_s or 600
        )
        db.add(r)
        db.commit()
        db.refresh(r)
        return {'id': r.id}
    finally:
        db.close()

@app.put('/alert-rules/{rid}')
def update_alert_rule(rid: int, body: AlertRuleIn) -> Dict[str, Any]:
    db = DBSession()
    try:
        r = db.query(AlertRule).filter(AlertRule.id == rid).first()
        if not r:
            return {'error': 'not found'}
        for k, v in body.dict().items():
            if v is not None:
                setattr(r, k if k != 'enabled' else 'enabled', (1 if v is True else (0 if v is False else v)))
        db.commit()
        return {'ok': True}
    finally:
        db.close()

@app.delete('/alert-rules/{rid}')
def delete_alert_rule(rid: int) -> Dict[str, Any]:
    db = DBSession()
    try:
        r = db.query(AlertRule).filter(AlertRule.id == rid).first()
        if not r:
            return {'error': 'not found'}
        db.delete(r)
        db.commit()
        return {'ok': True}
    finally:
        db.close()

@app.get('/alerts')
def list_alerts(org_id: Optional[int] = None, limit: int = 200) -> List[AlertHistoryOut]:
    db = DBSession()
    try:
        q = db.query(AlertHistory).order_by(AlertHistory.ts.desc())
        if org_id:
            q = q.filter(AlertHistory.org_id == org_id)
        rows = q.limit(limit).all()
        out: List[AlertHistoryOut] = []
        for h in rows:
            out.append(AlertHistoryOut(
                id=h.id, ts=(h.ts.isoformat() if isinstance(h.ts, datetime.datetime) else str(h.ts)), rule_id=int(h.rule_id), org_id=h.org_id,
                event_id=h.event_id, priority=int(h.priority or 3), message=h.message or '', delivered_email=int(h.delivered_email or 0),
                delivered_sms=int(h.delivered_sms or 0), delivered_webhook=int(h.delivered_webhook or 0), status=h.status or ''
            ))
        return out
    finally:
        db.close()

# --- AI Analyst ---
import re
import json

STOPWORDS = set("the a an and or of for to from with without on in at by about into over after before under again further then once here there when where why how all any both each few more most other some such no nor not only own same so than too very can will just don should now".split())

def _serialize_event(e: DataEvent) -> str:
    try:
        d = e.data or {}
        head = d.get('headline') or d.get('title') or d.get('summary') or ''
        src = e.source or ''
        body = json.dumps(d, separators=(',', ':'))
        return f"{src} {head} {body}".lower()
    except Exception:
        try:
            return json.dumps(e.data or {}).lower()
        except Exception:
            return ''

def _score_event(e: DataEvent, terms: List[str], now: datetime.datetime, min_conf: Optional[float]) -> float:
    text = _serialize_event(e)
    match = sum(1 for t in terms if t and t in text)
    if match == 0:
        return 0.0
    t = e.timestamp or now
    if isinstance(t, str):
        try:
            t = datetime.datetime.fromisoformat(t)
        except Exception:
            t = now
    delta = now - t if isinstance(t, datetime.datetime) else datetime.timedelta(days=365)
    days = max(0.0, delta.total_seconds() / 86400.0)
    recency = max(0.1, 1.0 - min(1.0, days / 30.0))
    geo = 1.0 if (e.latitude is not None and e.longitude is not None) else 0.8
    conf = float(e.confidence) if e.confidence is not None else 0.5
    if isinstance(min_conf, (float, int)) and conf < float(min_conf):
        return 0.0
    score = match * 0.6 + recency * 0.2 + geo * 0.1 + conf * 0.1
    return score

@app.post('/ai-analyst')
def ai_analyst(q: AIQuery):
    db = DBSession()
    try:
        now = datetime.datetime.utcnow()
        terms = [t for t in re.findall(r"\w+", q.query.lower()) if t not in STOPWORDS]
        since = now - datetime.timedelta(hours=q.since_hours or 24)
        events = db.query(DataEvent).filter(DataEvent.timestamp >= since).order_by(DataEvent.timestamp.desc()).limit(2000).all()
        scored = []
        for e in events:
            s = _score_event(e, terms, now, q.min_confidence)
            if s > 0:
                scored.append((e, s))
        scored.sort(key=lambda x: x[1], reverse=True)
        top_k = max(1, min(int(q.top_k or 5), 10))
        top = scored[: top_k]
        citations = []
        if not top:
            answer = "Insufficient data to provide a grounded answer. No matching events found in the selected timeframe."
            confidence = 0.2
            insufficient = True
        else:
            avg_conf = sum(float(e.confidence or 0.5) for e, _ in top) / len(top)
            avg_score = sum(s for _, s in top) / len(top)
            confidence = max(0.2, min(0.95, 0.5 * avg_conf + 0.5 * (avg_score / (avg_score + 1e-6))))
            sources = list({(e.source or '').lower() for e, _ in top if e.source})
            tmin = min(datetime.datetime.fromisoformat(e.timestamp) if isinstance(e.timestamp, str) else e.timestamp for e, _ in top)
            tmax = max(datetime.datetime.fromisoformat(e.timestamp) if isinstance(e.timestamp, str) else e.timestamp for e, _ in top)
            answer = (
                f"Observed {len(top)} relevant events from {', '.join(sources[:4])} between {tmin.isoformat()} and {tmax.isoformat()}. "
                f"Key signals align with query terms: {', '.join(terms[:6])}. "
                f"Confidence {round(confidence * 100)}%."
            )
            insufficient = False
            for e, s in top:
                d = e.data or {}
                snippet = d.get('headline') or d.get('title') or d.get('summary') or None
                citations.append({
                    'id': int(e.id),
                    'source': e.source,
                    'timestamp': e.timestamp if isinstance(e.timestamp, str) else (e.timestamp.isoformat() if e.timestamp else None),
                    'latitude': e.latitude,
                    'longitude': e.longitude,
                    'snippet': snippet,
                    'confidence': float(e.confidence or 0.5)
                })
        log = PromptLog(
            user_id=q.user_id, org_id=None, query=q.query, answer=answer, confidence=float(confidence), insufficient=1 if insufficient else 0,
            citations=citations, provider='local', model='deterministic-v1'
        )
        db.add(log)
        db.commit()
        db.refresh(log)
        return {
            'answer': answer,
            'citations': citations,
            'confidence': float(confidence),
            'insufficient': bool(insufficient),
            'log_id': log.id,
        }
    finally:
        db.close()

@app.get('/prompts')
def list_prompts(user_id: Optional[int] = None, limit: int = 200):
    db = DBSession()
    try:
        q = db.query(PromptLog).order_by(PromptLog.ts.desc())
        if user_id:
            q = q.filter(PromptLog.user_id == user_id)
        rows = q.limit(limit).all()
        return [
            {
                'id': r.id,
                'ts': r.ts.isoformat() if isinstance(r.ts, datetime.datetime) else r.ts,
                'user_id': r.user_id,
                'query': r.query,
                'confidence': r.confidence,
                'insufficient': bool(r.insufficient),
                'citations_count': len(r.citations or []),
            } for r in rows
        ]
    finally:
        db.close()

@app.get('/prompts/{pid}')
def get_prompt(pid: int):
    db = DBSession()
    try:
        r = db.query(PromptLog).filter(PromptLog.id == pid).first()
        if not r:
            return {'error': 'not found'}
        return {
            'id': r.id,
            'ts': r.ts.isoformat() if isinstance(r.ts, datetime.datetime) else r.ts,
            'user_id': r.user_id,
            'query': r.query,
            'answer': r.answer,
            'confidence': r.confidence,
            'insufficient': bool(r.insufficient),
            'citations': r.citations or [],
            'provider': r.provider,
            'model': r.model,
        }
    finally:
        db.close()

@app.post("/insert-sample-data")
def insert_sample_data():
    try:
        if supabase_configured():
            from insert_sample_data import SAMPLE_DATA
            rows = []
            for d in SAMPLE_DATA:
                rows.append({
                    "source": d["source"],
                    "timestamp": d["timestamp"].isoformat(),
                    "latitude": d["latitude"],
                    "longitude": d["longitude"],
                    "confidence": d.get("confidence", 0.5),
                    "data": d.get("data", {})
                })
            ok, msg = supabase_insert_events(rows)
            if ok:
                return {"success": True, "count": len(rows), "message": f"Inserted {len(rows)} sample events to Supabase"}
            return {"success": False, "error": msg}
        from insert_sample_data import insert_sample_data as insert_data
        count = insert_data()
        return {"success": True, "count": count, "message": f"Successfully inserted {count} sample events"}
    except Exception as e:
        logger.error(f"Error inserting sample data: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


from pydantic import BaseModel
from typing import Optional, List

class WorkspaceIn(BaseModel):
    org_id: int
    name: str
    description: Optional[str] = None
    created_by: Optional[int] = None

class WorkspaceOut(BaseModel):
    id: int
    org_id: int
    name: str
    description: Optional[str]
    created_by: Optional[int]
    created_at: str

class CaseIn(BaseModel):
    org_id: int
    name: str
    description: Optional[str] = None
    status: Optional[str] = 'open'
    workspace_id: Optional[int] = None
    created_by: Optional[int] = None

class CaseOut(BaseModel):
    id: int
    org_id: int
    name: str
    description: Optional[str]
    status: str
    workspace_id: Optional[int]
    created_by: Optional[int]
    created_at: str

class CaseMemberIn(BaseModel):
    user_id: int
    role: Optional[str] = 'viewer'

class CaseMemberOut(BaseModel):
    id: int
    user_id: int
    role: str
    username: Optional[str]
    email: Optional[str]

class TagIn(BaseModel):
    tag: str
    case_id: Optional[int] = None
    created_by: Optional[int] = None

class TagOut(BaseModel):
    id: int
    event_id: int
    case_id: Optional[int]
    tag: str
    created_by: Optional[int]
    created_at: str

class AnnotationIn(BaseModel):
    text: str
    case_id: Optional[int] = None
    author_user_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    data: Optional[dict] = None

class AnnotationOut(BaseModel):
    id: int
    event_id: int
    case_id: Optional[int]
    author_user_id: Optional[int]
    text: str
    latitude: Optional[float]
    longitude: Optional[float]
    data: Optional[dict]
    ts: str

class CommentIn(BaseModel):
    text: str
    parent_id: Optional[int] = None
    author_user_id: int

class CommentOut(BaseModel):
    id: int
    case_id: int
    parent_id: Optional[int]
    author_user_id: int
    text: str
    ts: str

class ReportIn(BaseModel):
    case_id: int
    title: str
    content: str
    created_by: Optional[int] = None

class ReportOut(BaseModel):
    id: int
    case_id: int
    title: str
    content: str
    created_by: Optional[int]
    created_at: str
    last_export_ts: Optional[str]

def _get_org_role(db: Session, user_id: int, org_id: int) -> Optional[str]:
    m = db.query(OrgMembership).filter(OrgMembership.org_id == org_id, OrgMembership.user_id == user_id).first()
    if m:
        return m.role
    o = db.query(Organization).filter(Organization.id == org_id).first()
    if o and o.owner_user_id == user_id:
        return 'owner'
    return None

def _has_case_access(db: Session, user_id: int, case_id: int) -> bool:
    cm = db.query(CaseMembership).filter(CaseMembership.case_id == case_id, CaseMembership.user_id == user_id).first()
    if cm:
        return True
    c = db.query(Case).filter(Case.id == case_id).first()
    if not c:
        return False
    return _get_org_role(db, user_id, c.org_id) is not None

@app.post('/workspaces')
def create_workspace(body: WorkspaceIn):
    db = DBSession()
    try:
        if body.created_by is not None:
            role = _get_org_role(db, int(body.created_by), int(body.org_id))
            if role not in ('admin', 'owner'):
                return {'error': 'forbidden'}
        w = Workspace(org_id=body.org_id, name=body.name, description=body.description, created_by=body.created_by)
        db.add(w)
        db.commit()
        db.refresh(w)
        try:
            db.add(AuditLog(user_id=body.created_by, org_id=body.org_id, event='workspace_created', details={'workspace_id': w.id, 'name': body.name}))
            db.commit()
        except Exception:
            pass
        return {'id': w.id}
    finally:
        db.close()

@app.get('/workspaces')
def list_workspaces(org_id: Optional[int] = None) -> List[WorkspaceOut]:
    db = DBSession()
    try:
        q = db.query(Workspace)
        if org_id:
            q = q.filter(Workspace.org_id == org_id)
        rows = q.order_by(Workspace.id.desc()).all()
        out: List[WorkspaceOut] = []
        for w in rows:
            out.append(WorkspaceOut(id=w.id, org_id=w.org_id, name=w.name or '', description=w.description or None, created_by=w.created_by, created_at=(w.created_at.isoformat() if isinstance(w.created_at, datetime.datetime) else str(w.created_at))))
        return out
    finally:
        db.close()

@app.post('/cases')
def create_case(body: CaseIn):
    db = DBSession()
    try:
        if body.created_by is not None:
            role = _get_org_role(db, int(body.created_by), int(body.org_id))
            if role not in ('admin', 'owner', 'analyst'):
                return {'error': 'forbidden'}
        c = Case(org_id=body.org_id, name=body.name, description=body.description, status=body.status or 'open', workspace_id=body.workspace_id, created_by=body.created_by)
        db.add(c)
        db.commit()
        db.refresh(c)
        try:
            db.add(AuditLog(user_id=body.created_by, org_id=body.org_id, event='case_created', details={'case_id': c.id, 'name': body.name, 'workspace_id': body.workspace_id}))
            db.commit()
        except Exception:
            pass
        return {'id': c.id}
    finally:
        db.close()

@app.get('/cases')
def list_cases(org_id: Optional[int] = None, workspace_id: Optional[int] = None) -> List[CaseOut]:
    db = DBSession()
    try:
        q = db.query(Case)
        if org_id:
            q = q.filter(Case.org_id == org_id)
        if workspace_id:
            q = q.filter(Case.workspace_id == workspace_id)
        rows = q.order_by(Case.id.desc()).all()
        out: List[CaseOut] = []
        for c in rows:
            out.append(CaseOut(id=c.id, org_id=c.org_id, name=c.name or '', description=c.description or None, status=c.status or 'open', workspace_id=c.workspace_id, created_by=c.created_by, created_at=(c.created_at.isoformat() if isinstance(c.created_at, datetime.datetime) else str(c.created_at))))
        return out
    finally:
        db.close()

@app.post('/cases/{cid}/members')
def add_case_member(cid: int, body: CaseMemberIn):
    db = DBSession()
    try:
        c = db.query(Case).filter(Case.id == cid).first()
        if not c:
            return {'error': 'not found'}
        cm = CaseMembership(case_id=cid, user_id=body.user_id, role=body.role or 'viewer')
        db.add(cm)
        db.commit()
        try:
            db.add(AuditLog(user_id=None, org_id=c.org_id, event='case_member_added', details={'case_id': cid, 'user_id': body.user_id, 'role': body.role or 'viewer'}))
            db.commit()
        except Exception:
            pass
        return {'ok': True}
    finally:
        db.close()

@app.get('/cases/{cid}/members')
def list_case_members(cid: int) -> List[CaseMemberOut]:
    db = DBSession()
    try:
        rows = db.query(CaseMembership).filter(CaseMembership.case_id == cid).all()
        out: List[CaseMemberOut] = []
        for r in rows:
            u = db.query(User).filter(User.id == r.user_id).first()
            out.append(CaseMemberOut(id=r.id, user_id=r.user_id, role=r.role or 'viewer', username=(u.username if u else None), email=(u.email if u else None)))
        return out
    finally:
        db.close()

@app.post('/events/{eid}/tags')
def add_event_tag(eid: int, body: TagIn):
    db = DBSession()
    try:
        if body.case_id and body.created_by:
            if not _has_case_access(db, int(body.created_by), int(body.case_id)):
                return {'error': 'forbidden'}
        t = EventTag(event_id=eid, case_id=body.case_id, tag=body.tag, created_by=body.created_by)
        db.add(t)
        db.commit()
        db.refresh(t)
        try:
            db.add(AuditLog(user_id=body.created_by, org_id=None, event='event_tag_added', details={'event_id': eid, 'case_id': body.case_id, 'tag': body.tag}))
            db.commit()
        except Exception:
            pass
        return {'id': t.id}
    finally:
        db.close()

@app.get('/events/{eid}/tags')
def list_event_tags(eid: int) -> List[TagOut]:
    db = DBSession()
    try:
        rows = db.query(EventTag).filter(EventTag.event_id == eid).order_by(EventTag.created_at.desc()).all()
        out: List[TagOut] = []
        for t in rows:
            out.append(TagOut(id=t.id, event_id=t.event_id, case_id=t.case_id, tag=t.tag or '', created_by=t.created_by, created_at=(t.created_at.isoformat() if isinstance(t.created_at, datetime.datetime) else str(t.created_at))))
        return out
    finally:
        db.close()

@app.get('/cases/{cid}/tags')
def list_case_tags(cid: int) -> List[TagOut]:
    db = DBSession()
    try:
        rows = db.query(EventTag).filter(EventTag.case_id == cid).order_by(EventTag.created_at.desc()).all()
        out: List[TagOut] = []
        for t in rows:
            out.append(TagOut(id=t.id, event_id=t.event_id, case_id=t.case_id, tag=t.tag or '', created_by=t.created_by, created_at=(t.created_at.isoformat() if isinstance(t.created_at, datetime.datetime) else str(t.created_at))))
        return out
    finally:
        db.close()

@app.post('/events/{eid}/annotations')
def add_event_annotation(eid: int, body: AnnotationIn):
    db = DBSession()
    try:
        if body.case_id and body.author_user_id:
            if not _has_case_access(db, int(body.author_user_id), int(body.case_id)):
                return {'error': 'forbidden'}
        a = EventAnnotation(event_id=eid, case_id=body.case_id, author_user_id=body.author_user_id, text=body.text, latitude=body.latitude, longitude=body.longitude, data=body.data)
        db.add(a)
        db.commit()
        db.refresh(a)
        try:
            db.add(AuditLog(user_id=body.author_user_id, org_id=None, event='event_annotation_added', details={'event_id': eid, 'case_id': body.case_id}))
            db.commit()
        except Exception:
            pass
        return {'id': a.id}
    finally:
        db.close()

@app.get('/events/{eid}/annotations')
def list_event_annotations(eid: int) -> List[AnnotationOut]:
    db = DBSession()
    try:
        rows = db.query(EventAnnotation).filter(EventAnnotation.event_id == eid).order_by(EventAnnotation.ts.desc()).all()
        out: List[AnnotationOut] = []
        for a in rows:
            out.append(AnnotationOut(id=a.id, event_id=a.event_id, case_id=a.case_id, author_user_id=a.author_user_id, text=a.text or '', latitude=a.latitude, longitude=a.longitude, data=a.data or None, ts=(a.ts.isoformat() if isinstance(a.ts, datetime.datetime) else str(a.ts))))
        return out
    finally:
        db.close()

@app.get('/cases/{cid}/annotations')
def list_case_annotations(cid: int) -> List[AnnotationOut]:
    db = DBSession()
    try:
        rows = db.query(EventAnnotation).filter(EventAnnotation.case_id == cid).order_by(EventAnnotation.ts.desc()).all()
        out: List[AnnotationOut] = []
        for a in rows:
            out.append(AnnotationOut(id=a.id, event_id=a.event_id, case_id=a.case_id, author_user_id=a.author_user_id, text=a.text or '', latitude=a.latitude, longitude=a.longitude, data=a.data or None, ts=(a.ts.isoformat() if isinstance(a.ts, datetime.datetime) else str(a.ts))))
        return out
    finally:
        db.close()

@app.post('/cases/{cid}/comments')
def add_case_comment(cid: int, body: CommentIn):
    db = DBSession()
    try:
        c = CaseComment(case_id=cid, parent_id=body.parent_id, author_user_id=body.author_user_id, text=body.text)
        db.add(c)
        db.commit()
        db.refresh(c)
        try:
            db.add(AuditLog(user_id=body.author_user_id, event='case_comment_added', details={'case_id': cid, 'comment_id': c.id}))
            db.commit()
        except Exception:
            pass
        return {'id': c.id}
    finally:
        db.close()

@app.get('/cases/{cid}/comments')
def list_case_comments(cid: int) -> List[CommentOut]:
    db = DBSession()
    try:
        rows = db.query(CaseComment).filter(CaseComment.case_id == cid).order_by(CaseComment.ts.asc()).all()
        out: List[CommentOut] = []
        for c in rows:
            out.append(CommentOut(id=c.id, case_id=c.case_id, parent_id=c.parent_id, author_user_id=c.author_user_id, text=c.text or '', ts=(c.ts.isoformat() if isinstance(c.ts, datetime.datetime) else str(c.ts))))
        return out
    finally:
        db.close()

@app.post('/reports')
def create_report(body: ReportIn):
    db = DBSession()
    try:
        r = Report(case_id=body.case_id, title=body.title, content=body.content, created_by=body.created_by)
        db.add(r)
        db.commit()
        db.refresh(r)
        try:
            db.add(AuditLog(user_id=body.created_by, event='report_created', details={'report_id': r.id, 'case_id': body.case_id}))
            db.commit()
        except Exception:
            pass
        return {'id': r.id}
    finally:
        db.close()

@app.get('/cases/{cid}/reports')
def list_case_reports(cid: int) -> List[ReportOut]:
    db = DBSession()
    try:
        rows = db.query(Report).filter(Report.case_id == cid).order_by(Report.created_at.desc()).all()
        out: List[ReportOut] = []
        for r in rows:
            out.append(ReportOut(id=r.id, case_id=r.case_id, title=r.title or '', content=r.content or '', created_by=r.created_by, created_at=(r.created_at.isoformat() if isinstance(r.created_at, datetime.datetime) else str(r.created_at)), last_export_ts=(r.last_export_ts.isoformat() if isinstance(r.last_export_ts, datetime.datetime) else (str(r.last_export_ts) if r.last_export_ts else None))))
        return out
    finally:
        db.close()

@app.post('/reports/{rid}/export')
def export_report(rid: int, format: str = 'pdf'):
    db = DBSession()
    try:
        r = db.query(Report).filter(Report.id == rid).first()
        if not r:
            return {'error': 'not found'}
        title = r.title or f'Report {rid}'
        content = r.content or ''
        if (format or 'pdf').lower() == 'pdf':
            try:
                from reportlab.lib.pagesizes import letter
                from reportlab.pdfgen import canvas
                import io, base64
                buf = io.BytesIO()
                c = canvas.Canvas(buf, pagesize=letter)
                y = 750
                c.setFont("Helvetica-Bold", 14)
                c.drawString(72, y, title[:90])
                y -= 24
                c.setFont("Helvetica", 12)
                for line in content.splitlines():
                    c.drawString(72, y, line[:90])
                    y -= 16
                    if y < 72:
                        c.showPage()
                        y = 750
                        c.setFont("Helvetica", 12)
                c.showPage()
                c.save()
                b64 = base64.b64encode(buf.getvalue()).decode('ascii')
                r.last_export_ts = datetime.datetime.utcnow()
                db.commit()
                try:
                    db.add(AuditLog(event='report_exported', details={'report_id': rid, 'format': 'pdf'}))
                    db.commit()
                except Exception:
                    pass
                return {'format': 'pdf', 'pdf_base64': b64}
            except Exception:
                html = f"<h1>{title}</h1><pre>{content}</pre>"
                try:
                    db.add(AuditLog(event='report_exported', details={'report_id': rid, 'format': 'html'}))
                    db.commit()
                except Exception:
                    pass
                return {'format': 'html', 'html': html}
        html = f"<h1>{title}</h1><pre>{content}</pre>"
        return {'format': 'html', 'html': html}
    finally:
        db.close()

class RetentionUpdate(BaseModel):
    retention_days_events: Optional[int] = None
    retention_days_alerts: Optional[int] = None
    retention_days_prompts: Optional[int] = None
    retention_days_annotations: Optional[int] = None

@app.post('/orgs/{org_id}/retention')
def update_retention(org_id: int, body: RetentionUpdate):
    db = DBSession()
    try:
        s = db.query(OrgSettings).filter(OrgSettings.org_id == org_id).first()
        if not s:
            s = OrgSettings(org_id=org_id)
            db.add(s)
            db.commit()
            db.refresh(s)
        if body.retention_days_events is not None:
            s.retention_days_events = int(body.retention_days_events)
        if body.retention_days_alerts is not None:
            s.retention_days_alerts = int(body.retention_days_alerts)
        if body.retention_days_prompts is not None:
            s.retention_days_prompts = int(body.retention_days_prompts)
        if body.retention_days_annotations is not None:
            s.retention_days_annotations = int(body.retention_days_annotations)
        db.commit()
        try:
            db.add(AuditLog(event='retention_updated', org_id=org_id, details={'events': s.retention_days_events, 'alerts': s.retention_days_alerts, 'prompts': s.retention_days_prompts, 'annotations': s.retention_days_annotations}))
            db.commit()
        except Exception:
            pass
        return {'ok': True}
    finally:
        db.close()

@app.post('/retention/run')
def run_retention(org_id: Optional[int] = None):
    db = DBSession()
    try:
        s = None
        if org_id:
            s = db.query(OrgSettings).filter(OrgSettings.org_id == org_id).first()
        if not s:
            s = db.query(OrgSettings).first()
        if not s:
            return {'ok': True}
        now = datetime.datetime.utcnow()
        if s.retention_days_events and s.retention_days_events > 0:
            cutoff = now - datetime.timedelta(days=int(s.retention_days_events))
            db.query(DataEvent).filter(DataEvent.timestamp < cutoff).delete(synchronize_session=False)
        if s.retention_days_alerts and s.retention_days_alerts > 0:
            cutoff = now - datetime.timedelta(days=int(s.retention_days_alerts))
            db.query(AlertHistory).filter(AlertHistory.ts < cutoff).delete(synchronize_session=False)
        if s.retention_days_prompts and s.retention_days_prompts > 0:
            cutoff = now - datetime.timedelta(days=int(s.retention_days_prompts))
            db.query(PromptLog).filter(PromptLog.ts < cutoff).delete(synchronize_session=False)
        if s.retention_days_annotations and s.retention_days_annotations > 0:
            cutoff = now - datetime.timedelta(days=int(s.retention_days_annotations))
            db.query(EventAnnotation).filter(EventAnnotation.ts < cutoff).delete(synchronize_session=False)
        db.commit()
        try:
            db.add(AuditLog(event='retention_run', org_id=org_id, details={'org_id': org_id}))
            db.commit()
        except Exception:
            pass
        return {'ok': True}
    finally:
        db.close()

@app.get('/security/encryption')
def encryption_status():
    try:
        import os
        db_url = os.environ.get('DATABASE_URL', 'sqlite:///rtaip.db')
        transport_tls = True
        db_encrypted = db_url.startswith('postgresql')
        db_ssl_required = 'sslmode=require' in db_url if db_encrypted else False
        return {'transport_tls': transport_tls, 'db_encrypted': db_encrypted, 'db_ssl_required': db_ssl_required}
    except Exception:
        return {'transport_tls': True}

HEALTH_FAIL_UNTIL: Optional[datetime.datetime] = None

@app.get('/health')
def health():
    now = datetime.datetime.utcnow()
    if HEALTH_FAIL_UNTIL and now < HEALTH_FAIL_UNTIL:
        return {'ok': False, 'until': HEALTH_FAIL_UNTIL.isoformat()}
    return {'ok': True}

@app.post('/health/fail')
def health_fail(seconds: int = 60):
    global HEALTH_FAIL_UNTIL
    HEALTH_FAIL_UNTIL = datetime.datetime.utcnow() + datetime.timedelta(seconds=int(max(1, min(seconds, 600))))
    return {'ok': True, 'until': HEALTH_FAIL_UNTIL.isoformat()}

# --- Monitoring & Reliability ---
@app.get('/metrics/system')
def system_metrics():
    db = DBSession()
    try:
        total_events = db.query(DataEvent).count()
        total_anomalies = db.query(Anomaly).count() if 'Anomaly' in globals() else 0
        total_alerts = db.query(AlertHistory).count()
        last_event = db.query(DataEvent).order_by(DataEvent.timestamp.desc()).first()
        last_event_ts = (last_event.timestamp.isoformat() if last_event and isinstance(last_event.timestamp, datetime.datetime) else (str(last_event.timestamp) if last_event else None))
        mm = db.query(PerfMetric).order_by(PerfMetric.ts.desc()).limit(10).all()
        perf = [
            {
                'ts': (m.ts.isoformat() if isinstance(m.ts, datetime.datetime) else str(m.ts)),
                'fps': float(m.fps or 0),
                'events': int(m.events or 0),
                'anomalies': int(m.anomalies or 0),
                'zoom': int(m.zoom or 0),
                'device': m.device or None
            }
            for m in mm
        ]
        sources = ['ODIN','DTIC','USACE','PUB LOG','NGA Tearline','Military Periscope','Janes','Global Terrorism DB']
        src_stats = []
        six_hours_ago = datetime.datetime.utcnow() - datetime.timedelta(hours=6)
        for s in sources:
            row = db.query(DataEvent).filter(DataEvent.source == s).order_by(DataEvent.timestamp.desc()).first()
            ts = row.timestamp if row else None
            src_stats.append({
                'source': s,
                'count_total': db.query(DataEvent).filter(DataEvent.source == s).count(),
                'last_ts': (ts.isoformat() if ts and isinstance(ts, datetime.datetime) else (str(ts) if ts else None)),
                'recent_ok': bool(ts and isinstance(ts, datetime.datetime) and ts >= six_hours_ago)
            })
        return {
            'events_total': total_events,
            'anomalies_total': total_anomalies,
            'alerts_total': total_alerts,
            'last_event_ts': last_event_ts,
            'perf_recent': perf,
            'sources': src_stats,
        }
    finally:
        db.close()

@app.get('/pipeline/status')
def pipeline_status(hours: int = 24):
    db = DBSession()
    try:
        horizon = datetime.datetime.utcnow() - datetime.timedelta(hours=int(max(1, min(hours, 168))))
        sources = ['ODIN','DTIC','USACE','PUB LOG','NGA Tearline','Military Periscope','Janes','Global Terrorism DB']
        items = []
        for s in sources:
            q = db.query(DataEvent).filter(DataEvent.source == s)
            total = q.count()
            recent = db.query(DataEvent).filter(DataEvent.source == s, DataEvent.timestamp >= horizon).count()
            last = db.query(DataEvent).filter(DataEvent.source == s).order_by(DataEvent.timestamp.desc()).first()
            items.append({
                'source': s,
                'count_total': total,
                'count_recent': recent,
                'last_ts': ((last.timestamp.isoformat() if last and isinstance(last.timestamp, datetime.datetime) else (str(last.timestamp) if last else None)))
            })
        return {'sources': items}
    finally:
        db.close()

@app.get('/billing/usage')
def billing_usage(days: int = 30):
    db = DBSession()
    try:
        start = datetime.datetime.utcnow() - datetime.timedelta(days=int(max(1, min(days, 365))))
        logs = db.query(PromptLog).filter(PromptLog.ts >= start).all()
        alerts = db.query(AlertHistory).filter(AlertHistory.ts >= start).all()
        reports = db.query(Report).filter(Report.created_at >= start).all()
        usage = {
            'prompts': len(logs),
            'alerts': len(alerts),
            'reports': len(reports),
            'events_ingested': db.query(DataEvent).filter(DataEvent.timestamp >= start).count(),
        }
        return usage
    finally:
        db.close()

@app.post('/billing/webhook')
def billing_webhook(payload: dict):
    db = DBSession()
    try:
        db.add(AuditLog(event='billing_webhook', details=payload))
        db.commit()
        return {'ok': True}
    finally:
        db.close()

@app.get('/infra/region')
def infra_region():
    region = os.environ.get('REGION') or os.environ.get('FLY_REGION') or os.environ.get('AWS_REGION') or 'local'
    is_primary = os.environ.get('IS_PRIMARY', 'true').lower() in ('1','true','yes')
    return {'region': region, 'primary': is_primary}

@app.get('/sla')
def sla_status():
    targets = {'uptime': '99.5%', 'mttr': '4h', 'rpo': '24h', 'rto': '4h'}
    now = datetime.datetime.utcnow().isoformat()
    return {'targets': targets, 'as_of': now, 'contact': 'support@nexumcloud.com'}

@app.get('/backup/export')
def backup_export():
    db = DBSession()
    try:
        tables = {
            'users': db.query(User).all(),
            'organizations': db.query(Organization).all(),
            'org_memberships': db.query(OrgMembership).all(),
            'org_settings': db.query(OrgSettings).all(),
            'ip_allowlists': db.query(IpAllowlist).all(),
            'data_events': db.query(DataEvent).all(),
            'anomalies': db.query(Anomaly).all() if 'Anomaly' in globals() else [],
            'alert_rules': db.query(AlertRule).all(),
            'alert_history': db.query(AlertHistory).all(),
            'workspaces': db.query(Workspace).all(),
            'cases': db.query(Case).all(),
            'case_memberships': db.query(CaseMembership).all(),
            'event_tags': db.query(EventTag).all(),
            'event_annotations': db.query(EventAnnotation).all(),
            'case_comments': db.query(CaseComment).all(),
            'reports': db.query(Report).all(),
            'consent_logs': db.query(ConsentLog).all(),
            'prompt_logs': db.query(PromptLog).all(),
            'audit_logs': db.query(AuditLog).all(),
            'perf_metrics': db.query(PerfMetric).all(),
        }
        import json, io, zipfile, base64
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode='w', compression=zipfile.ZIP_DEFLATED) as z:
            for name, rows in tables.items():
                arr = []
                for r in rows:
                    d = {c.name: getattr(r, c.name) for c in r.__table__.columns}
                    # serialize datetimes
                    for k, v in list(d.items()):
                        import datetime as _dt
                        if isinstance(v, _dt.datetime):
                            d[k] = v.isoformat()
                    arr.append(d)
                z.writestr(f'{name}.json', json.dumps(arr))
        b64 = base64.b64encode(buf.getvalue()).decode('ascii')
        return {'zip_base64': b64, 'tables': list(tables.keys())}
    finally:
        db.close()

class BackupImport(BaseModel):
    zip_base64: str

@app.post('/backup/import')
def backup_import(body: BackupImport):
    db = DBSession()
    try:
        import json, io, zipfile, base64
        data = base64.b64decode(body.zip_base64)
        zf = zipfile.ZipFile(io.BytesIO(data), mode='r')
        inserted = {}
        def _load(name):
            try:
                raw = zf.read(f'{name}.json').decode('utf-8')
                return json.loads(raw)
            except Exception:
                return []
        # helper to check existence by id
        def exists(model, idval):
            try:
                return db.query(model).filter(model.id == idval).first() is not None
            except Exception:
                return False
        # insert in order to satisfy FKs
        for name, model in [
            ('users', User), ('organizations', Organization), ('org_settings', OrgSettings), ('ip_allowlists', IpAllowlist), ('org_memberships', OrgMembership),
            ('workspaces', Workspace), ('cases', Case), ('case_memberships', CaseMembership),
            ('data_events', DataEvent), ('anomalies', globals().get('Anomaly')), ('alert_rules', AlertRule), ('alert_history', AlertHistory),
            ('event_tags', EventTag), ('event_annotations', EventAnnotation), ('case_comments', CaseComment), ('reports', Report), ('consent_logs', ConsentLog), ('prompt_logs', PromptLog), ('audit_logs', AuditLog), ('perf_metrics', PerfMetric)
        ]:
            if model is None:
                continue
            rows = _load(name)
            cnt = 0
            for d in rows:
                idval = d.get('id')
                if idval and exists(model, idval):
                    continue
                obj = model()
                for k, v in d.items():
                    try:
                        setattr(obj, k, v)
                    except Exception:
                        pass
                db.add(obj)
                cnt += 1
            if cnt:
                db.commit()
            inserted[name] = cnt
        try:
            db.add(AuditLog(event='backup_import', details={'inserted': inserted}))
            db.commit()
        except Exception:
            pass
        return {'inserted': inserted}
    finally:
        db.close()

class PerfIn(BaseModel):
    fps: Optional[float] = None
    events: Optional[int] = None
    anomalies: Optional[int] = None
    zoom: Optional[int] = None
    device: Optional[str] = None

@app.post('/metrics/perf')
def record_perf(body: PerfIn):
    db = DBSession()
    try:
        m = PerfMetric(fps=body.fps, events=body.events, anomalies=body.anomalies, zoom=body.zoom, device=body.device)
        db.add(m)
        db.commit()
        db.refresh(m)
        return {'id': m.id}
    finally:
        db.close()

@app.get('/metrics/perf')
def list_perf(limit: int = 100):
    db = DBSession()
    try:
        mm = db.query(PerfMetric).order_by(PerfMetric.ts.desc()).limit(int(max(1, min(limit, 1000)))).all()
        return [{
            'ts': (m.ts.isoformat() if isinstance(m.ts, datetime.datetime) else str(m.ts)),
            'fps': float(m.fps or 0),
            'events': int(m.events or 0),
            'anomalies': int(m.anomalies or 0),
            'zoom': int(m.zoom or 0),
            'device': m.device or None
        } for m in mm]
    finally:
        db.close()

class ErrorReport(BaseModel):
    user_id: Optional[int] = None
    context: Optional[str] = None
    message: str
    stack: Optional[str] = None

@app.post('/errors/report')
def report_error(body: ErrorReport):
    db = DBSession()
    try:
        db.add(AuditLog(user_id=body.user_id, event='client_error', details={'context': body.context, 'message': body.message, 'stack': body.stack}))
        db.commit()
        return {'ok': True}
    finally:
        db.close()

@app.get('/errors/recent')
def recent_errors(limit: int = 50):
    db = DBSession()
    try:
        rows = db.query(AuditLog).filter(AuditLog.event.in_(['client_error','ingest_failed'])).order_by(AuditLog.ts.desc()).limit(int(max(1, min(limit, 500)))).all()
        return [{'ts': (r.ts.isoformat() if isinstance(r.ts, datetime.datetime) else str(r.ts)), 'event': r.event, 'details': r.details} for r in rows]
    finally:
        db.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
class UserSync(BaseModel):
    email: str
    username: str | None = None

@app.post("/users/sync")
def sync_user(payload: UserSync, db: Session = Depends(get_db)):
    u = db.query(User).filter(User.email == payload.email).first()
    if u:
        return {"id": u.id, "username": u.username, "email": u.email}
    name = payload.username or payload.email.split("@")[0]
    u = User(username=name, email=payload.email, hashed_password=get_password_hash("external"))
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"id": u.id, "username": u.username, "email": u.email}