from sqlalchemy.orm import sessionmaker
from database import engine, DataEvent, Anomaly, AlertRule
from sklearn.ensemble import IsolationForest
import numpy as np
import schedule
import time

Session = sessionmaker(bind=engine)

def detect_anomalies():
    with Session() as session:
        events = session.query(DataEvent).all()
        if not events:
            print("Anomaly detection: no events available yet")
            return
        
        # Prepare data for ML: lat, lon
        coords = [[e.latitude, e.longitude] for e in events if e.latitude is not None and e.longitude is not None]
        data = np.array(coords)
        if len(data) < 2:
            print("Anomaly detection: insufficient geospatial data for IsolationForest")
            return
        
        model = IsolationForest(contamination=0.1)
        model.fit(data)
        preds = model.predict(data)
        scores = model.decision_function(data)
        
        for i, pred in enumerate(preds):
            if pred == -1:  # Anomaly
                # Derive severity from anomaly score (more negative -> higher severity)
                score = float(scores[i])
                sev = int(np.clip(10 * max(0.0, -score), 1, 9))
                anomaly = Anomaly(
                    event_id=events[i].id,
                    type="geo_spatial",
                    severity=sev,
                    description=f"Detected geospatial anomaly (algo=IsolationForest, score={score:.4f})",
                    timestamp=events[i].timestamp,
                )
                session.add(anomaly)
        
        # Rule-based: high seismic if mag > 4
        for event in events:
            if event.source == "usgs_seismic":
                mag = event.data.get('properties', {}).get('mag') if isinstance(event.data, dict) else None
                if mag and mag > 4:
                    anomaly = Anomaly(
                        event_id=event.id,
                        type="seismic_high",
                        severity=7,
                        description=f"High magnitude earthquake (rule=mag>4, mag={mag})",
                        timestamp=event.timestamp,
                    )
                    session.add(anomaly)
        
        session.commit()

        # Evaluate alert rules and notify
        rules = session.query(AlertRule).all()
        if rules:
            # Map event id to event for quick lookup
            ev_by_id = {e.id: e for e in events}
            for a in session.query(Anomaly).order_by(Anomaly.id.desc()).limit(50).all():
                ev = ev_by_id.get(a.event_id)
                if not ev:
                    continue
                for r in rules:
                    if r.source and ev.source != r.source:
                        continue
                    if a.severity < (r.severity_threshold or 0):
                        continue
                    if (ev.confidence or 0.0) < (r.min_confidence or 0.0):
                        continue
                    lat, lon = ev.latitude, ev.longitude
                    if not _in_bbox(lat, lon, r):
                        continue
                    _send_email_alert(r, a, ev)
                    _broadcast_alert(a, ev)

def schedule_detection():
    schedule.every(60).seconds.do(detect_anomalies)
    while True:
        schedule.run_pending()
        time.sleep(1)

def _in_bbox(lat, lon, r: AlertRule):
    try:
        if None in (lat, lon):
            return False
        if r.min_lat is None or r.min_lon is None or r.max_lat is None or r.max_lon is None:
            return True
        return (r.min_lat <= lat <= r.max_lat) and (r.min_lon <= lon <= r.max_lon)
    except Exception:
        return False

def _send_email_alert(r: AlertRule, a: Anomaly, ev: DataEvent):
    try:
        import os, smtplib
        from email.mime.text import MIMEText
        host = os.getenv("SMTP_HOST")
        port = int(os.getenv("SMTP_PORT", "587"))
        user = os.getenv("SMTP_USERNAME")
        pwd = os.getenv("SMTP_PASSWORD")
        from_addr = os.getenv("EMAIL_FROM")
        to_addr = r.email_to or os.getenv("EMAIL_TO_DEFAULT")
        if not (host and user and pwd and from_addr and to_addr):
            return
        msg = MIMEText(f"Anomaly {a.type} sev={a.severity} src={ev.source} at ({ev.latitude},{ev.longitude}) {a.timestamp}")
        msg["Subject"] = f"RTAIP Alert: {a.type}"
        msg["From"] = from_addr
        msg["To"] = to_addr
        server = smtplib.SMTP(host, port)
        server.starttls()
        server.login(user, pwd)
        server.sendmail(from_addr, [to_addr], msg.as_string())
        server.quit()
    except Exception:
        pass

def _broadcast_alert(a: Anomaly, ev: DataEvent):
    try:
        # Import late to avoid circular init
        from main import broadcast_alert
        text = f"ANOMALY {a.type} sev={a.severity} src={ev.source} at ({ev.latitude},{ev.longitude})"
        broadcast_alert(text)
    except Exception:
        pass

if __name__ == "__main__":
    schedule_detection()