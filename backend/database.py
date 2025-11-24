from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, JSON, ForeignKey, Text
from sqlalchemy.orm import sessionmaker, declarative_base
from datetime import datetime
import os

# Use Supabase/Postgres if DATABASE_URL is provided, otherwise fall back to local SQLite
DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:///rtaip.db')
DIRECT_URL = os.environ.get('DIRECT_URL')  # For migrations/DDL on Supabase

# Configure SQLAlchemy engine with SSL for Postgres and pool_pre_ping for connection health
if DATABASE_URL.startswith('postgresql'):
    engine = create_engine(
        DATABASE_URL,
        echo=True,
        pool_pre_ping=True,
        connect_args={"sslmode": "require"}
    )
else:
    engine = create_engine(DATABASE_URL, echo=True)

Session = sessionmaker(bind=engine)
Base = declarative_base()

class DataEvent(Base):
    __tablename__ = 'data_events'
    
    id = Column(Integer, primary_key=True)
    source = Column(String)
    timestamp = Column(DateTime, default=datetime.utcnow)
    latitude = Column(Float)
    longitude = Column(Float)
    data = Column(JSON)
    confidence = Column(Float, default=0.5)

class Anomaly(Base):
    __tablename__ = 'anomalies'
    
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey('data_events.id'))
    type = Column(String)
    severity = Column(Integer)
    description = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow)

class AlertRule(Base):
    __tablename__ = 'alert_rules'

    id = Column(Integer, primary_key=True)
    name = Column(String)
    source = Column(String)  # optional filter
    severity_threshold = Column(Integer, default=5)
    min_confidence = Column(Float, default=0.5)
    min_lat = Column(Float)
    min_lon = Column(Float)
    max_lat = Column(Float)
    max_lon = Column(Float)
    email_to = Column(String)  # optional notification target

class PerfMetric(Base):
    __tablename__ = 'perf_metrics'
    id = Column(Integer, primary_key=True)
    ts = Column(DateTime, default=datetime.utcnow)
    fps = Column(Float)
    events = Column(Integer)
    anomalies = Column(Integer)
    zoom = Column(Integer)
    device = Column(String)

# Create tables: prefer DIRECT_URL (Supabase 5432) for DDL, otherwise use runtime engine
try:
    if DIRECT_URL and DIRECT_URL.startswith('postgresql'):
        direct_engine = create_engine(
            DIRECT_URL,
            echo=True,
            pool_pre_ping=True,
            connect_args={"sslmode": "require"}
        )
        Base.metadata.create_all(direct_engine)
    else:
        Base.metadata.create_all(engine)
except Exception as e:
    # Fail-safe: don't crash app if DDL fails; tables may already exist
    print(f"[DB INIT] Warning: failed to ensure tables exist: {e}")

# NEW: exportable helper to ensure schema on demand (e.g., via /migrate endpoint)

def ensure_schema():
    """
    Ensure database schema exists.
    Uses DIRECT_URL for Supabase DDL (5432) when available; otherwise uses runtime engine.
    Returns (ok: bool, message: str).
    """
    try:
        # If running on Supabase (Postgres), we strongly prefer DIRECT_URL for DDL.
        if DIRECT_URL and DIRECT_URL.startswith('postgresql'):
            direct_engine = create_engine(
                DIRECT_URL,
                echo=True,
                pool_pre_ping=True,
                connect_args={"sslmode": "require"}
            )
            Base.metadata.create_all(direct_engine)
            return True, "schema ensured via DIRECT_URL"
        # If DIRECT_URL is missing and DATABASE_URL looks like a pgbouncer URL, return a clear message.
        if DATABASE_URL.startswith('postgresql') and (':6543' in DATABASE_URL or 'pgbouncer=true' in DATABASE_URL):
            return False, "DIRECT_URL not set. Please set DIRECT_URL to the Supabase 5432 connection string (not pgbouncer) and retry."
        # Fallback: try runtime engine (e.g., SQLite or direct Postgres without pgbouncer)
        Base.metadata.create_all(engine)
        try:
            if DATABASE_URL.startswith('sqlite'):
                with engine.connect() as conn:
                    rows = conn.execute("PRAGMA table_info('data_events')").fetchall()
                    cols = [r[1] for r in rows]
                    if 'confidence' not in cols:
                        conn.execute("ALTER TABLE data_events ADD COLUMN confidence REAL DEFAULT 0.5")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_data_events_lat_lon ON data_events(latitude, longitude)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_anomalies_event_id ON anomalies(event_id)")
            elif 'postgres' in DATABASE_URL:
                with engine.connect() as conn:
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_data_events_lat_lon ON data_events(latitude, longitude)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_anomalies_event_id ON anomalies(event_id)")
        except Exception as _:
            pass
        return True, "schema ensured via runtime engine"
    except Exception as e:
        return False, str(e)