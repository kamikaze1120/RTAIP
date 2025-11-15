import aiohttp
import asyncio
import json
import schedule
import time
from datetime import datetime
from sqlalchemy.orm import sessionmaker
from database import engine, DataEvent

Session = sessionmaker(bind=engine)

async def fetch_data(url, params=None):
    async with aiohttp.ClientSession() as session:
        async with session.get(url, params=params) as response:
            if response.status == 200:
                return await response.json()
            else:
                print(f"Error fetching {url}: {response.status}")
                return None

async def ingest_nasa_fires():
    # NASA FIRMS API example (simplified, use actual endpoint)
    url = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/12345/VIIRS/1"  # Placeholder, need proper API
    data = await fetch_data(url)
    if data:
        with Session() as session:
            for item in data:  # Assuming list of fires
                event = DataEvent(source="nasa_fires", timestamp=datetime.utcnow(), latitude=item.get('latitude'), longitude=item.get('longitude'), data=item)
                session.add(event)
            session.commit()

async def ingest_noaa_weather():
    url = "https://api.weather.gov/stations/KLAX/observations/latest"  # Example for LAX
    data = await fetch_data(url)
    if data:
        props = data.get('properties', {})
        with Session() as session:
            event = DataEvent(source="noaa_weather", timestamp=datetime.utcnow(), latitude=34.0, longitude=-118.0, data=props)  # Example coords
            session.add(event)
            session.commit()

async def ingest_adsb_aircraft():
    url = "https://opensky-network.org/api/states/all"  # OpenSky API
    data = await fetch_data(url)
    if data:
        states = data.get('states', [])
        with Session() as session:
            for state in states[:10]:  # Limit for demo
                event = DataEvent(source="adsb", timestamp=datetime.utcnow(), latitude=state[6], longitude=state[5], data=state)
                session.add(event)
            session.commit()

async def ingest_ais_maritime():
    # Using a free AIS source, e.g., Norwegian stream (simplified, needs proper handling)
    url = "http://aisstream.io/api/vessels"  # Placeholder, actual might need TCP
    data = await fetch_data(url)
    if data:
        with Session() as session:
            for item in data:
                event = DataEvent(source="ais", timestamp=datetime.utcnow(), latitude=item.get('lat'), longitude=item.get('lon'), data=item)
                session.add(event)
            session.commit()

async def ingest_usgs_seismic():
    url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson"
    data = await fetch_data(url)
    if data:
        features = data.get('features', [])
        with Session() as session:
            for feature in features:
                coords = feature['geometry']['coordinates']
                event = DataEvent(source="usgs_seismic", timestamp=datetime.utcnow(), latitude=coords[1], longitude=coords[0], data=feature)
                session.add(event)
            session.commit()

# Removed Reddit ingestion (ingest_reddit_social) as it is not relevant and lacked geolocation
def run_ingestion():
    # Create a new event loop for this background thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(asyncio.gather(
            ingest_nasa_fires(),
            ingest_noaa_weather(),
            ingest_adsb_aircraft(),
            ingest_ais_maritime(),
            ingest_usgs_seismic()
        ))
    finally:
        loop.close()

def schedule_ingestion():
    schedule.every(30).seconds.do(run_ingestion)
    while True:
        schedule.run_pending()
        time.sleep(1)

if __name__ == "__main__":
    schedule_ingestion()