import aiohttp
import asyncio
import json
import schedule
import time
from datetime import datetime
from sqlalchemy.orm import sessionmaker
from database import engine, DataEvent, Anomaly

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
                # Only ingest recent (<=100 hours) data
                try:
                    if (datetime.utcnow() - ts).total_seconds() > 100 * 3600:
                        continue
                except Exception:
                    pass
                event = DataEvent(source="nasa_eonet", timestamp=ts, latitude=lat, longitude=lon, data=ev, confidence=conf)
                session.add(event)
            session.commit()

async def ingest_gdacs_disasters():
    try:
        # Query last 14 days, all event types, all alert levels
        to_dt = datetime.utcnow().date().isoformat()
        from_dt = (datetime.utcnow().date() - __import__('datetime').timedelta(days=14)).isoformat()
        # GDACS quickstart uses /events/geteventlist/SEARCH with query params
        params = {
            "eventlist": "EQ;FL;TC;VO;TS;DR;WF",
            "fromdate": from_dt,
            "todate": to_dt,
            "alertlevel": "red;orange;green"
        }
        url = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
        data = await fetch_data(url, params=params)
        if data:
            features = data.get('features') or []
            with Session() as session:
                for feat in features:
                    lat = None; lon = None; ts = datetime.utcnow()
                    try:
                        geom = feat.get('geometry') or {}
                        coords = geom.get('coordinates')
                        if isinstance(coords, (list, tuple)) and len(coords) >= 2 and isinstance(coords[0], (int,float)):
                            lon = float(coords[0]); lat = float(coords[1])
                        props = feat.get('properties') or {}
                        dt = props.get('fromdate') or props.get('updated') or props.get('todate')
                        if dt:
                            ts = datetime.fromisoformat(str(dt).replace('Z',''))
                    except Exception:
                        pass
                    conf = 0.6 if (lat is not None and lon is not None) else 0.4
                    # Only ingest recent (<=100 hours) data
                    try:
                        if (datetime.utcnow() - ts).total_seconds() > 100 * 3600:
                            continue
                    except Exception:
                        pass
                    event = DataEvent(source="gdacs_disasters", timestamp=ts, latitude=lat, longitude=lon, data=feat, confidence=conf)
                    session.add(event)
                session.commit()
    except Exception as e:
        print(f"GDACS ingestion failed: {e}")

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
        # Conditional backfill: if no anomalies for GDACS/EONET, ensure last 100 hours of data present
        try:
            with Session() as session:
                start = datetime.utcnow() - __import__('datetime').timedelta(hours=100)
                ev = session.query(DataEvent).filter(DataEvent.timestamp >= start).all()
                ids_by_src = { 'gdacs_disasters': set(), 'nasa_eonet': set() }
                for e in ev:
                    if e.source in ids_by_src:
                        ids_by_src[e.source].add(e.id)
                anom_ids = set(a.event_id for a in session.query(Anomaly).filter(Anomaly.timestamp >= start).all())
                need_backfill = any(len(ids_by_src[src] & anom_ids) == 0 for src in ids_by_src)
                if need_backfill:
                    # Re-run targeted ingestions; endpoints already filter to recent
                    loop.run_until_complete(asyncio.gather(ingest_nasa_eonet(), ingest_gdacs_disasters()))
        except Exception:
            pass
    finally:
        loop.close()

def schedule_ingestion():
    schedule.every(30).seconds.do(run_ingestion)
    while True:
        schedule.run_pending()
        time.sleep(1)

if __name__ == "__main__":
    schedule_ingestion()