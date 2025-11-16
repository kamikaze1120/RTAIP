from fastapi import FastAPI
import threading
from ingestion import schedule_ingestion
from anomaly import schedule_detection
from database import ensure_schema

app = FastAPI()

@app.get("/")
def read_root():
    return {"Hello": "World"}

from fastapi import FastAPI, Depends, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import Session, DataEvent, Anomaly
import threading
from ingestion import schedule_ingestion
from anomaly import schedule_detection
from datetime import datetime
# New imports for email notifications
from pydantic import BaseModel
from typing import Optional
import os
import smtplib
from email.mime.text import MIMEText

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


def get_db():
    db = Session()
    try:
        yield db
    finally:
        db.close()

@app.get("/events")
def get_events(db: Session = Depends(get_db)):
    return db.query(DataEvent).all()

@app.get("/anomalies")
def get_anomalies(db: Session = Depends(get_db)):
    return db.query(Anomaly).all()

@app.get("/health")
def health():
    return {"status": "ok"}

# Email notification request model
class EmailRequest(BaseModel):
    subject: str
    message: str
    to: Optional[str] = None

@app.post("/notify/email")
def notify_email(req: EmailRequest):
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USERNAME")
    pwd = os.getenv("SMTP_PASSWORD")
    from_addr = os.getenv("EMAIL_FROM")
    to_addr = req.to or os.getenv("EMAIL_TO_DEFAULT")

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

@app.get("/seed")
def seed(db: Session = Depends(get_db)):
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
    for i, s in enumerate(samples):
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
    # Refresh to get IDs
    for ev in created_events:
        db.refresh(ev)
    # Add a couple anomalies referencing existing events
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

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        await websocket.send_text(f"Message text was: {data}")

@app.get("/")
def read_root():
    return {"Hello": "World"}

@app.api_route("/migrate", methods=["GET", "POST"])
def migrate():
    ok, msg = ensure_schema()
    return {"ok": ok, "message": msg}

# Run schedulers in background
threading.Thread(target=schedule_ingestion, daemon=True).start()
threading.Thread(target=schedule_detection, daemon=True).start()