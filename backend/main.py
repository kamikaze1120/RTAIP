from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import Session, User, DataEvent
from pydantic import BaseModel
from auth import create_access_token, get_password_hash, verify_password
from datetime import timedelta
import os
import asyncio
import threading
from ingestion import ingest_nasa_eonet, ingest_nasa_fires, ingest_adsb_aircraft, ingest_ais_maritime, ingest_usace_hifld, ingest_gdacs_disasters

app = FastAPI()

# Ingestion scheduling
def run_ingestion():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    async def schedule_tasks():
        while True:
            await asyncio.gather(
                ingest_nasa_fires(),          # NGA Tearline
                ingest_nasa_eonet(),          # Janes
                ingest_gdacs_disasters(),     # ODIN
                ingest_adsb_aircraft(),       # Military Periscope
                ingest_ais_maritime(),        # PUB LOG
                ingest_usace_hifld()          # USACE
            )
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
    db = Session()
    try:
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

@app.get("/events")
def get_events(db: Session = Depends(get_db)):
    return db.query(DataEvent).all()

@app.get("/")
def root():
    return {"name": "RTAIP", "status": "ok"}

@app.get("/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)