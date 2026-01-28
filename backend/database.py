from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, JSON, ForeignKey, Text
from sqlalchemy.orm import sessionmaker, declarative_base
from datetime import datetime
import os
import socket
from urllib.parse import urlparse, urlunparse
import logging

logger = logging.getLogger(__name__)

def resolve_ipv4(url: str) -> str:
    if not url or not url.startswith('postgresql'):
        return url
    try:
        parsed = urlparse(url)
        host = parsed.hostname
        port = parsed.port or 5432
        if not host:
            return url
        ipv4 = None
        try:
            ipv4 = socket.gethostbyname(host)
        except Exception:
            pass
        if not ipv4:
            try:
                infos = socket.getaddrinfo(host, port, family=socket.AF_INET)
                if infos:
                    ipv4 = infos[0][4][0]
            except Exception:
                pass
        if not ipv4:
            return url
        parts = parsed.netloc.split('@')
        if len(parts) == 2:
            auth, _ = parts
            new_netloc = f"{auth}@{ipv4}:{port}"
        else:
            new_netloc = f"{ipv4}:{port}"
        new_url = parsed._replace(netloc=new_netloc)
        resolved = urlunparse(new_url)
        try:
            logger.info(f"[DB INIT] IPv4 resolved for {host}: {ipv4}")
        except Exception:
            pass
        return resolved
    except Exception:
        return url



# Use Supabase/Postgres if DATABASE_URL is provided, otherwise fall back to local SQLite
DATABASE_URL_RAW = os.environ.get('DATABASE_URL', 'sqlite:///rtaip.db')
DIRECT_URL_RAW = os.environ.get('DIRECT_URL')
def _add_pgbouncer(url: str) -> str:
    try:
        if not url or not url.startswith('postgresql'):
            return url
        p = urlparse(url)
        host = p.hostname or ''
        port = p.port or 5432
        if host.endswith('supabase.co') and port == 5432:
            netloc = p.netloc
            if '@' in netloc:
                auth, _ = netloc.split('@', 1)
                new_netloc = f"{auth}@{host}:6543"
            else:
                new_netloc = f"{host}:6543"
            new_url = p._replace(netloc=new_netloc)
            return urlunparse(new_url)
        return url
    except Exception:
        return url

resolved = resolve_ipv4(DATABASE_URL_RAW)
if resolved == DATABASE_URL_RAW:
    DATABASE_URL = _add_pgbouncer(DATABASE_URL_RAW)
else:
    DATABASE_URL = resolved
DIRECT_URL = resolve_ipv4(DIRECT_URL_RAW)

# Configure SQLAlchemy engine with SSL for Postgres and pool_pre_ping for connection health
if DATABASE_URL.startswith('postgresql'):
    engine = create_engine(
        DATABASE_URL,
        echo=True,
        pool_pre_ping=True,
        connect_args={"sslmode": "require", "connect_timeout": 10, "application_name": "RTAIP-backend", "options": "-c statement_timeout=60s"}
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

class User(Base):
    __tablename__ = 'users'

    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    email = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default='user')
    created_at = Column(DateTime, default=datetime.utcnow)

# Create tables: prefer DIRECT_URL (Supabase 5432) for DDL, otherwise use runtime engine
try:
    if DIRECT_URL and DIRECT_URL.startswith('postgresql'):
        direct_engine = create_engine(
            DIRECT_URL,
            echo=True,
            pool_pre_ping=True,
            connect_args={"sslmode": "require", "connect_timeout": 10, "application_name": "RTAIP-backend-direct", "options": "-c statement_timeout=120s"}
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
                connect_args={"sslmode": "require", "connect_timeout": 10, "application_name": "RTAIP-backend-direct", "options": "-c statement_timeout=120s"}
            )
            Base.metadata.create_all(direct_engine)
            try:
                with direct_engine.connect() as conn:
                    res = conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name='data_events'").fetchall()
                    cols = [r[0] for r in res]
                    if 'confidence' not in cols:
                        conn.execute("ALTER TABLE data_events ADD COLUMN confidence DOUBLE PRECISION DEFAULT 0.5")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_data_events_lat_lon ON data_events(latitude, longitude)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_anomalies_event_id ON anomalies(event_id)")
            except Exception:
                pass
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
            elif DATABASE_URL.startswith('postgresql'):
                with engine.connect() as conn:
                    res = conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name='data_events'").fetchall()
                    cols = [r[0] for r in res]
                    if 'confidence' not in cols:
                        conn.execute("ALTER TABLE data_events ADD COLUMN confidence DOUBLE PRECISION DEFAULT 0.5")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_data_events_lat_lon ON data_events(latitude, longitude)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_anomalies_event_id ON anomalies(event_id)")
        except Exception as _:
            pass
        return True, "schema ensured via runtime engine"
    except Exception as e:
        return False, str(e)

ensure_schema()