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

async def ingest_nasa_eonet():
    url = "https://eonet.gsfc.nasa.gov/api/v3/events"
    data = await fetch_data(url)
    if data:
        events = data.get('events', [])
        with Session() as session:
            for ev in events:
                geos = ev.get('geometry') or ev.get('geometries') or []
                lat = None; lon = None
                ts = datetime.utcnow()
                if geos:
                    g = geos[-1]
                    coords = g.get('coordinates')
                    dt = g.get('date') or g.get('datetime')
                    try:
                        ts = datetime.fromisoformat((dt or '').replace('Z',''))
                    except Exception:
                        ts = datetime.utcnow()
                    if isinstance(coords, (list, tuple)) and len(coords) >= 2:
                        lon = float(coords[0]); lat = float(coords[1])
                conf = 0.7 if (lat is not None and lon is not None) else 0.5
                event = DataEvent(source="nasa_eonet", timestamp=ts, latitude=lat, longitude=lon, data=ev, confidence=conf)
                session.add(event)
            session.commit()

async def ingest_gdacs_disasters():
    url = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/json"
    data = await fetch_data(url)
    if data:
        items = data.get('features') or data.get('events') or data.get('items') or []
        # Some responses use 'events' with 'eventlist', others GeoJSON 'features'
        with Session() as session:
            for item in items:
                lat = None; lon = None; ts = datetime.utcnow()
                if isinstance(item, dict):
                    lat = item.get('lat') or item.get('latitude')
                    lon = item.get('lon') or item.get('longitude')
                    dt = item.get('fromdate') or item.get('eventdate') or item.get('updated')
                    try:
                        if dt:
                            ts = datetime.fromisoformat(str(dt).replace('Z',''))
                    except Exception:
                        ts = datetime.utcnow()
                try:
                    lat = float(lat) if lat is not None else None
                    lon = float(lon) if lon is not None else None
                except Exception:
                    lat = None; lon = None
                conf = 0.6 if (lat is not None and lon is not None) else 0.4
                event = DataEvent(source="gdacs_disasters", timestamp=ts, latitude=lat, longitude=lon, data=item, confidence=conf)
                session.add(event)
            session.commit()

def _confidence_for_noaa(props):
    try:
        wind = props.get('wind', props.get('windSpeed'))
        temp = props.get('temp', props.get('temperature'))
        c = 0.5
        if wind is not None and temp is not None:
            c = 0.8
        return float(c)
    except Exception:
        return 0.5

async def ingest_noaa_weather():
    url = "https://api.weather.gov/stations/KLAX/observations/latest"  # Example for LAX
    data = await fetch_data(url)
    if data:
        props = data.get('properties', {})
        with Session() as session:
            conf = _confidence_for_noaa(props)
            event = DataEvent(source="noaa_weather", timestamp=datetime.utcnow(), latitude=34.0, longitude=-118.0, data=props, confidence=conf)  # Example coords
            session.add(event)
            session.commit()

def _confidence_for_adsb(state):
    try:
        lat = state[6]
        lon = state[5]
        callsign = state[1]
        c = 0.4
        if lat is not None and lon is not None:
            c += 0.4
        if callsign:
            c += 0.2
        return float(min(1.0, max(0.0, c)))
    except Exception:
        return 0.5

async def ingest_adsb_aircraft():
    url = "https://opensky-network.org/api/states/all"  # OpenSky API
    data = await fetch_data(url)
    if data:
        states = data.get('states', [])
        with Session() as session:
            for state in states[:10]:  # Limit for demo
                conf = _confidence_for_adsb(state)
                event = DataEvent(source="adsb", timestamp=datetime.utcnow(), latitude=state[6], longitude=state[5], data=state, confidence=conf)
                session.add(event)
            session.commit()

def _confidence_for_ais(item):
    try:
        imo = item.get('imo') or item.get('mmsi')
        lat = item.get('lat')
        lon = item.get('lon')
        c = 0.4
        if lat is not None and lon is not None:
            c += 0.4
        if imo:
            c += 0.2
        return float(min(1.0, max(0.0, c)))
    except Exception:
        return 0.5

async def ingest_ais_maritime():
    # Using a free AIS source, e.g., Norwegian stream (simplified, needs proper handling)
    url = "http://aisstream.io/api/vessels"  # Placeholder, actual might need TCP
    data = await fetch_data(url)
    if data:
        with Session() as session:
            for item in data:
                conf = _confidence_for_ais(item)
                event = DataEvent(source="ais", timestamp=datetime.utcnow(), latitude=item.get('lat'), longitude=item.get('lon'), data=item, confidence=conf)
                session.add(event)
            session.commit()

def _confidence_for_usgs(feature):
    try:
        props = feature.get('properties', {})
        mag = props.get('mag')
        c = 0.6
        if mag and mag >= 4:
            c = 0.85
        return float(c)
    except Exception:
        return 0.5

async def ingest_usgs_seismic():
    url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson"
    data = await fetch_data(url)
    if data:
        features = data.get('features', [])
        with Session() as session:
            for feature in features:
                coords = feature['geometry']['coordinates']
                conf = _confidence_for_usgs(feature)
                event = DataEvent(source="usgs_seismic", timestamp=datetime.utcnow(), latitude=coords[1], longitude=coords[0], data=feature, confidence=conf)
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
            ingest_usgs_seismic(),
            ingest_nasa_eonet(),
            ingest_gdacs_disasters()
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