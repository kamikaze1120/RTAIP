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

class Anomaly(Base):
    __tablename__ = 'anomalies'
    
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey('data_events.id'))
    type = Column(String)
    severity = Column(Integer)
    description = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow)

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