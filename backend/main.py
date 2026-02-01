from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import Session as DBSession, User, DataEvent, ensure_schema
from pydantic import BaseModel
from auth import create_access_token, get_password_hash, verify_password
from datetime import timedelta
import os
import asyncio
import threading
from ingestion import ingest_nasa_eonet, ingest_nasa_fires, ingest_adsb_aircraft, ingest_ais_maritime, ingest_usace_hifld, ingest_gdacs_disasters, ingest_dtic, ingest_global_terrorism

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
        return {"error": "Failed to fetch events"}

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