#!/usr/bin/env python3
"""
Manual data insertion script for RTAIP
Run this to immediately populate your database with sample data from all sources
"""

import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from datetime import datetime, timedelta
from database import Session, DataEvent

# Sample data for immediate insertion
SAMPLE_DATA = [
    # ODIN - GDACS disaster data
    {
        "source": "ODIN",
        "timestamp": datetime.utcnow() - timedelta(hours=2),
        "latitude": 35.6762,
        "longitude": 139.6503,
        "data": {
            "event_type": "earthquake",
            "magnitude": 5.2,
            "depth": 10,
            "location": "Tokyo, Japan",
            "description": "Moderate earthquake detected",
            "severity": "moderate"
        },
        "confidence": 0.85
    },
    {
        "source": "ODIN", 
        "timestamp": datetime.utcnow() - timedelta(hours=5),
        "latitude": 37.7749,
        "longitude": -122.4194,
        "data": {
            "event_type": "wildfire",
            "area": 2500,
            "location": "California, USA",
            "description": "Wildfire spreading in forest area",
            "severity": "high"
        },
        "confidence": 0.78
    },
    
    # DTIC - Defense research
    {
        "source": "DTIC",
        "timestamp": datetime.utcnow() - timedelta(days=1),
        "latitude": 38.8719,
        "longitude": -77.0563,
        "data": {
            "title": "Advanced Radar Systems Research",
            "author": "Defense Research Team",
            "category": "military_technology",
            "classification": "unclassified",
            "abstract": "Research on next-generation radar systems"
        },
        "confidence": 0.92
    },
    {
        "source": "DTIC",
        "timestamp": datetime.utcnow() - timedelta(days=3),
        "latitude": 34.0522,
        "longitude": -118.2437,
        "data": {
            "title": "Cybersecurity Threat Analysis",
            "author": "Cyber Defense Division",
            "category": "cybersecurity",
            "classification": "unclassified",
            "abstract": "Analysis of emerging cyber threats"
        },
        "confidence": 0.88
    },
    
    # USACE - HIFLD infrastructure
    {
        "source": "USACE",
        "timestamp": datetime.utcnow() - timedelta(hours=6),
        "latitude": 38.6847,
        "longitude": -77.1409,
        "data": {
            "name": "Fort Belvoir",
            "type": "Military Installation",
            "state": "VA",
            "capacity": 15000,
            "facility_type": "Army Base"
        },
        "confidence": 0.95
    },
    {
        "source": "USACE",
        "timestamp": datetime.utcnow() - timedelta(hours=12),
        "latitude": 31.1301,
        "longitude": -97.7817,
        "data": {
            "name": "Fort Hood",
            "type": "Military Installation", 
            "state": "TX",
            "capacity": 45000,
            "facility_type": "Army Base"
        },
        "confidence": 0.96
    },
    
    # PUB LOG - Maritime data
    {
        "source": "PUB LOG",
        "timestamp": datetime.utcnow() - timedelta(hours=1),
        "latitude": 34.0522,
        "longitude": -118.2437,
        "data": {
            "vessel_name": "MSC Vessel Alpha",
            "vessel_type": "cargo",
            "imo": 1234567,
            "mmsi": 987654321,
            "destination": "Los Angeles Port",
            "cargo_type": "military_supplies"
        },
        "confidence": 0.82
    },
    {
        "source": "PUB LOG",
        "timestamp": datetime.utcnow() - timedelta(hours=4),
        "latitude": 37.8044,
        "longitude": -122.2711,
        "data": {
            "vessel_name": "Naval Support Vessel",
            "vessel_type": "military_auxiliary",
            "imo": 7654321,
            "mmsi": 123456789,
            "destination": "Oakland Port",
            "cargo_type": "military_equipment"
        },
        "confidence": 0.89
    },
    
    # NGA Tearline - Fire data
    {
        "source": "NGA Tearline",
        "timestamp": datetime.utcnow() - timedelta(hours=3),
        "latitude": 35.0,
        "longitude": -120.0,
        "data": {
            "confidence": "high",
            "frp": 45.2,
            "satellite": "VIIRS",
            "brightness": 1200,
            "fire_type": "wildfire"
        },
        "confidence": 0.91
    },
    {
        "source": "NGA Tearline",
        "timestamp": datetime.utcnow() - timedelta(hours=8),
        "latitude": 40.0,
        "longitude": -115.0,
        "data": {
            "confidence": "moderate",
            "frp": 32.1,
            "satellite": "VIIRS",
            "brightness": 980,
            "fire_type": "controlled_burn"
        },
        "confidence": 0.76
    },
    
    # Military Periscope - Aircraft data
    {
        "source": "Military Periscope",
        "timestamp": datetime.utcnow() - timedelta(minutes=30),
        "latitude": 38.8951,
        "longitude": -77.0364,
        "data": {
            "callsign": "AIR1",
            "icao24": "a12345",
            "aircraft_type": "military_transport",
            "origin_country": "USA",
            "velocity": 450,
            "altitude": 25000
        },
        "confidence": 0.87
    },
    {
        "source": "Military Periscope",
        "timestamp": datetime.utcnow() - timedelta(hours=2),
        "latitude": 34.0522,
        "longitude": -118.2437,
        "data": {
            "callsign": "PATROL2",
            "icao24": "b67890",
            "aircraft_type": "surveillance",
            "origin_country": "USA",
            "velocity": 320,
            "altitude": 15000
        },
        "confidence": 0.83
    },
    
    # Janes - Event data
    {
        "source": "Janes",
        "timestamp": datetime.utcnow() - timedelta(days=2),
        "latitude": 51.5074,
        "longitude": -0.1278,
        "data": {
            "event_title": "Defense Technology Conference",
            "event_type": "conference",
            "severity": "informational",
            "description": "International defense technology exhibition",
            "participants": 5000
        },
        "confidence": 0.79
    },
    {
        "source": "Janes",
        "timestamp": datetime.utcnow() - timedelta(days=5),
        "latitude": 48.8566,
        "longitude": 2.3522,
        "data": {
            "event_title": "NATO Defense Meeting",
            "event_type": "military_coordination",
            "severity": "informational",
            "description": "NATO defense ministers meeting",
            "participants": 30
        },
        "confidence": 0.85
    },
    
    # Global Terrorism DB
    {
        "source": "Global Terrorism DB",
        "timestamp": datetime.utcnow() - timedelta(days=7),
        "latitude": 33.3152,
        "longitude": 44.3661,
        "data": {
            "incident_id": "2024001",
            "date": "2024-01-15",
            "country": "Iraq",
            "region": "Middle East",
            "attack_type": "Bombing",
            "target_type": "Military",
            "fatalities": 2,
            "wounded": 5
        },
        "confidence": 0.92
    },
    {
        "source": "Global Terrorism DB",
        "timestamp": datetime.utcnow() - timedelta(days=10),
        "latitude": 28.7041,
        "longitude": 77.1025,
        "data": {
            "incident_id": "2024002",
            "date": "2024-01-10",
            "country": "India",
            "region": "South Asia",
            "attack_type": "Shooting",
            "target_type": "Government",
            "fatalities": 1,
            "wounded": 3
        },
        "confidence": 0.88
    }
]

def insert_sample_data():
    """Insert sample data into the database"""
    print("[SAMPLE DATA] Starting manual data insertion...")
    
    session = Session()
    try:
        # Clear existing sample data first (optional)
        # session.query(DataEvent).filter(DataEvent.confidence < 0.95).delete()
        
        count = 0
        for data in SAMPLE_DATA:
            # Check if this exact data already exists
            existing = session.query(DataEvent).filter(
                DataEvent.source == data["source"],
                DataEvent.latitude == data["latitude"],
                DataEvent.longitude == data["longitude"],
                DataEvent.timestamp >= data["timestamp"] - timedelta(minutes=5)
            ).first()
            
            if not existing:
                event = DataEvent(**data)
                session.add(event)
                count += 1
                print(f"[SAMPLE DATA] Added {data['source']} event at {data['latitude']}, {data['longitude']}")
            else:
                print(f"[SAMPLE DATA] Skipping duplicate {data['source']} event")
        
        session.commit()
        print(f"[SAMPLE DATA] Successfully inserted {count} sample events")
        
        # Show final counts by source
        sources = ["ODIN", "DTIC", "USACE", "PUB LOG", "NGA Tearline", "Military Periscope", "Janes", "Global Terrorism DB"]
        print("\n[SAMPLE DATA] Current database summary:")
        total = 0
        for source in sources:
            source_count = session.query(DataEvent).filter(DataEvent.source == source).count()
            print(f"  {source}: {source_count} events")
            total += source_count
        
        print(f"  TOTAL: {total} events")
        
    except Exception as e:
        print(f"[SAMPLE DATA] Error inserting data: {e}")
        session.rollback()
        raise
    finally:
        session.close()

if __name__ == "__main__":
    insert_sample_data()