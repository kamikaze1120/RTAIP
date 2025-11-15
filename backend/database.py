from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, JSON, ForeignKey, Text
from sqlalchemy.orm import sessionmaker, declarative_base
from datetime import datetime
import os

# Use Supabase/Postgres if DATABASE_URL is provided, otherwise fall back to local SQLite
DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:///rtaip.db')
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

# Create tables
Base.metadata.create_all(engine)