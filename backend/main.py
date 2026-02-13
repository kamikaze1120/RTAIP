from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import Session as DBSession, User, DataEvent, ensure_schema, Organization, OrgMembership, Invitation, AuditLog, ConsentLog, IpAllowlist, OrgSettings
from pydantic import BaseModel
from typing import Optional, List
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
    return {"message": "User registered successfully"}

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

@app.post("/migrate")
def migrate():
    ok, msg = ensure_schema()
    return {"ok": ok, "message": msg}

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