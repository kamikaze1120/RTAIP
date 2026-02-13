from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, JSON, ForeignKey, Text
from sqlalchemy.orm import sessionmaker, declarative_base
from datetime import datetime
import os
import socket
from urllib.parse import urlparse, urlunparse
import logging

logger = logging.getLogger(__name__)



# Use Supabase/Postgres if DATABASE_URL is provided, otherwise fall back to local SQLite
DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:///rtaip.db')
DIRECT_URL = os.environ.get('DIRECT_URL', DATABASE_URL)

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
    fingerprint = Column(String, unique=True)

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
    org_id = Column(Integer, ForeignKey('organizations.id'), nullable=True)
    priority = Column(Integer, default=3)  # 1 urgent, 2 high, 3 normal, 4 low
    enabled = Column(Integer, default=1)
    keywords = Column(Text)  # comma-separated terms
    geofence_center_lat = Column(Float)
    geofence_center_lon = Column(Float)
    geofence_radius_m = Column(Integer)
    sms_to = Column(String)
    webhook_url = Column(String)
    dedup_window_s = Column(Integer, default=600)

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

class Organization(Base):
    __tablename__ = 'organizations'
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True, nullable=False)
    owner_user_id = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.utcnow)

class OrgMembership(Base):
    __tablename__ = 'org_memberships'
    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey('organizations.id'))
    user_id = Column(Integer, ForeignKey('users.id'))
    role = Column(String, default='viewer')
    created_at = Column(DateTime, default=datetime.utcnow)

class Invitation(Base):
    __tablename__ = 'invitations'
    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey('organizations.id'))
    email = Column(String)
    role = Column(String, default='viewer')
    token = Column(String, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)
    accepted_at = Column(DateTime)

class AuditLog(Base):
    __tablename__ = 'audit_logs'
    id = Column(Integer, primary_key=True)
    ts = Column(DateTime, default=datetime.utcnow)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    org_id = Column(Integer, ForeignKey('organizations.id'), nullable=True)
    event = Column(String)
    ip = Column(String)
    session_id = Column(String)
    details = Column(JSON)

class ConsentLog(Base):
    __tablename__ = 'consent_logs'
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey('users.id'))
    ts = Column(DateTime, default=datetime.utcnow)
    accepted_privacy = Column(Integer, default=1)
    accepted_terms = Column(Integer, default=1)
    version = Column(String)
    ip = Column(String)

class PromptLog(Base):
    __tablename__ = 'prompt_logs'
    id = Column(Integer, primary_key=True)
    ts = Column(DateTime, default=datetime.utcnow)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=True)
    org_id = Column(Integer, ForeignKey('organizations.id'), nullable=True)
    query = Column(Text)
    answer = Column(Text)
    confidence = Column(Float, default=0.0)
    insufficient = Column(Integer, default=0)  # 0/1
    citations = Column(JSON)
    provider = Column(String)
    model = Column(String)

class AlertHistory(Base):
    __tablename__ = 'alert_history'
    id = Column(Integer, primary_key=True)
    ts = Column(DateTime, default=datetime.utcnow)
    rule_id = Column(Integer, ForeignKey('alert_rules.id'))
    event_id = Column(Integer, ForeignKey('data_events.id'), nullable=True)
    anomaly_id = Column(Integer, ForeignKey('anomalies.id'), nullable=True)
    org_id = Column(Integer, ForeignKey('organizations.id'), nullable=True)
    priority = Column(Integer, default=3)
    message = Column(Text)
    dedup_key = Column(String)
    delivered_email = Column(Integer, default=0)
    delivered_sms = Column(Integer, default=0)
    delivered_webhook = Column(Integer, default=0)
    status = Column(String)

class IpAllowlist(Base):
    __tablename__ = 'ip_allowlists'
    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey('organizations.id'))
    cidr = Column(String)
    label = Column(String)
    active = Column(Integer, default=1)

class OrgSettings(Base):
    __tablename__ = 'org_settings'
    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey('organizations.id'))
    sso_provider = Column(String)
    oidc_issuer = Column(String)
    oidc_client_id = Column(String)
    saml_entity_id = Column(String)
    saml_metadata_url = Column(String)
    retention_days_events = Column(Integer, default=180)
    retention_days_alerts = Column(Integer, default=365)
    retention_days_prompts = Column(Integer, default=365)
    retention_days_annotations = Column(Integer, default=365)
class Workspace(Base):
    __tablename__ = 'workspaces'
    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey('organizations.id'))
    name = Column(String)
    description = Column(Text)
    created_by = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.utcnow)

class Case(Base):
    __tablename__ = 'cases'
    id = Column(Integer, primary_key=True)
    org_id = Column(Integer, ForeignKey('organizations.id'))
    workspace_id = Column(Integer, ForeignKey('workspaces.id'), nullable=True)
    name = Column(String)
    description = Column(Text)
    status = Column(String, default='open')
    created_by = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.utcnow)

class CaseMembership(Base):
    __tablename__ = 'case_memberships'
    id = Column(Integer, primary_key=True)
    case_id = Column(Integer, ForeignKey('cases.id'))
    user_id = Column(Integer, ForeignKey('users.id'))
    role = Column(String, default='viewer')
    created_at = Column(DateTime, default=datetime.utcnow)

class EventTag(Base):
    __tablename__ = 'event_tags'
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey('data_events.id'))
    case_id = Column(Integer, ForeignKey('cases.id'), nullable=True)
    tag = Column(String)
    created_by = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.utcnow)

class EventAnnotation(Base):
    __tablename__ = 'event_annotations'
    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey('data_events.id'))
    case_id = Column(Integer, ForeignKey('cases.id'), nullable=True)
    author_user_id = Column(Integer, ForeignKey('users.id'))
    text = Column(Text)
    latitude = Column(Float)
    longitude = Column(Float)
    data = Column(JSON)
    ts = Column(DateTime, default=datetime.utcnow)

class CaseComment(Base):
    __tablename__ = 'case_comments'
    id = Column(Integer, primary_key=True)
    case_id = Column(Integer, ForeignKey('cases.id'))
    parent_id = Column(Integer, ForeignKey('case_comments.id'), nullable=True)
    author_user_id = Column(Integer, ForeignKey('users.id'))
    text = Column(Text)
    ts = Column(DateTime, default=datetime.utcnow)

class Report(Base):
    __tablename__ = 'reports'
    id = Column(Integer, primary_key=True)
    case_id = Column(Integer, ForeignKey('cases.id'))
    title = Column(String)
    content = Column(Text)
    created_by = Column(Integer, ForeignKey('users.id'))
    created_at = Column(DateTime, default=datetime.utcnow)
    last_export_ts = Column(DateTime)

def _safe_init_schema():
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
                    if 'fingerprint' not in cols:
                        conn.execute("ALTER TABLE data_events ADD COLUMN fingerprint TEXT")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_data_events_lat_lon ON data_events(latitude, longitude)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_anomalies_event_id ON anomalies(event_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_memberships_org_user ON org_memberships(org_id, user_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(ts)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_prompt_ts ON prompt_logs(ts)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_alert_rules_org ON alert_rules(org_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_alert_history_rule_ts ON alert_history(rule_id, ts)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_alert_history_dedup ON alert_history(dedup_key)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token)")
                    try:
                        res2 = conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name='org_settings'").fetchall()
                        cols2 = [r[0] for r in res2]
                        if 'retention_days_events' not in cols2:
                            conn.execute("ALTER TABLE org_settings ADD COLUMN retention_days_events INTEGER DEFAULT 180")
                        if 'retention_days_alerts' not in cols2:
                            conn.execute("ALTER TABLE org_settings ADD COLUMN retention_days_alerts INTEGER DEFAULT 365")
                        if 'retention_days_prompts' not in cols2:
                            conn.execute("ALTER TABLE org_settings ADD COLUMN retention_days_prompts INTEGER DEFAULT 365")
                        if 'retention_days_annotations' not in cols2:
                            conn.execute("ALTER TABLE org_settings ADD COLUMN retention_days_annotations INTEGER DEFAULT 365")
                    except Exception:
                        pass
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_workspaces_org ON workspaces(org_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_cases_org ON cases(org_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_cases_workspace ON cases(workspace_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_case_memberships_case_user ON case_memberships(case_id, user_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_event_tags_event ON event_tags(event_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_event_annotations_event ON event_annotations(event_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_case_comments_case_ts ON case_comments(case_id, ts)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_reports_case_ts ON reports(case_id, created_at)")
                    try:
                        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_data_events_fingerprint ON data_events(fingerprint)")
                    except Exception:
                        pass
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
                    if 'fingerprint' not in cols:
                        try:
                            conn.execute("ALTER TABLE data_events ADD COLUMN fingerprint TEXT")
                        except Exception:
                            pass
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_data_events_lat_lon ON data_events(latitude, longitude)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_anomalies_event_id ON anomalies(event_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_memberships_org_user ON org_memberships(org_id, user_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(ts)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_prompt_ts ON prompt_logs(ts)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_alert_rules_org ON alert_rules(org_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_alert_history_rule_ts ON alert_history(rule_id, ts)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_alert_history_dedup ON alert_history(dedup_key)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token)")
                    try:
                        rows2 = conn.execute("PRAGMA table_info('org_settings')").fetchall()
                        cols2 = [r[1] for r in rows2]
                        if 'retention_days_events' not in cols2:
                            conn.execute("ALTER TABLE org_settings ADD COLUMN retention_days_events INTEGER DEFAULT 180")
                        if 'retention_days_alerts' not in cols2:
                            conn.execute("ALTER TABLE org_settings ADD COLUMN retention_days_alerts INTEGER DEFAULT 365")
                        if 'retention_days_prompts' not in cols2:
                            conn.execute("ALTER TABLE org_settings ADD COLUMN retention_days_prompts INTEGER DEFAULT 365")
                        if 'retention_days_annotations' not in cols2:
                            conn.execute("ALTER TABLE org_settings ADD COLUMN retention_days_annotations INTEGER DEFAULT 365")
                    except Exception:
                        pass
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_workspaces_org ON workspaces(org_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_cases_org ON cases(org_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_cases_workspace ON cases(workspace_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_case_memberships_case_user ON case_memberships(case_id, user_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_event_tags_event ON event_tags(event_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_event_annotations_event ON event_annotations(event_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_case_comments_case_ts ON case_comments(case_id, ts)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_reports_case_ts ON reports(case_id, created_at)")
                    try:
                        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_data_events_fingerprint ON data_events(fingerprint)")
                    except Exception:
                        pass
            elif DATABASE_URL.startswith('postgresql'):
                with engine.connect() as conn:
                    res = conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name='data_events'").fetchall()
                    cols = [r[0] for r in res]
                    if 'confidence' not in cols:
                        conn.execute("ALTER TABLE data_events ADD COLUMN confidence DOUBLE PRECISION DEFAULT 0.5")
                    if 'fingerprint' not in cols:
                        conn.execute("ALTER TABLE data_events ADD COLUMN fingerprint TEXT")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_data_events_lat_lon ON data_events(latitude, longitude)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_anomalies_event_id ON anomalies(event_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_memberships_org_user ON org_memberships(org_id, user_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_logs(ts)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token)")
                    try:
                        res2 = conn.execute("SELECT column_name FROM information_schema.columns WHERE table_name='org_settings'").fetchall()
                        cols2 = [r[0] for r in res2]
                        if 'retention_days_events' not in cols2:
                            conn.execute("ALTER TABLE org_settings ADD COLUMN retention_days_events INTEGER DEFAULT 180")
                        if 'retention_days_alerts' not in cols2:
                            conn.execute("ALTER TABLE org_settings ADD COLUMN retention_days_alerts INTEGER DEFAULT 365")
                        if 'retention_days_prompts' not in cols2:
                            conn.execute("ALTER TABLE org_settings ADD COLUMN retention_days_prompts INTEGER DEFAULT 365")
                        if 'retention_days_annotations' not in cols2:
                            conn.execute("ALTER TABLE org_settings ADD COLUMN retention_days_annotations INTEGER DEFAULT 365")
                    except Exception:
                        pass
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_workspaces_org ON workspaces(org_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_cases_org ON cases(org_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_cases_workspace ON cases(workspace_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_case_memberships_case_user ON case_memberships(case_id, user_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_event_tags_event ON event_tags(event_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_event_annotations_event ON event_annotations(event_id)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_case_comments_case_ts ON case_comments(case_id, ts)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_reports_case_ts ON reports(case_id, created_at)")
                    try:
                        conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_data_events_fingerprint ON data_events(fingerprint)")
                    except Exception:
                        pass
        except Exception as _:
            pass
        return True, "schema ensured via runtime engine"
    except Exception as e:
        return False, str(e)

# Do not auto-run schema ensuring at import time; use /migrate endpoint instead