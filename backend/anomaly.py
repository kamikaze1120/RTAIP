from sqlalchemy.orm import sessionmaker
from database import engine, DataEvent, Anomaly
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

def schedule_detection():
    schedule.every(60).seconds.do(detect_anomalies)
    while True:
        schedule.run_pending()
        time.sleep(1)

if __name__ == "__main__":
    schedule_detection()