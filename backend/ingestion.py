import aiohttp
import asyncio
import json
import schedule
import time
from datetime import datetime, timezone
from hashlib import sha256
from sqlalchemy.orm import sessionmaker
from database import engine, DataEvent, Anomaly

Session = sessionmaker(bind=engine)

async def fetch_data(url, params=None):
    delays = [1, 2, 4]
    for d in delays + [0]:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, timeout=10) as response:
                    if response.status == 200:
                        return await response.json()
                    if response.status >= 500:
                        await asyncio.sleep(d)
                        continue
                    print(f"Error fetching {url}: {response.status}")
                    return None
        except Exception as e:
            await asyncio.sleep(d)
            continue
    return None

def _normalize_timestamp(ts: datetime | None) -> datetime:
    try:
        if ts is None:
            return datetime.utcnow().replace(tzinfo=timezone.utc)
        if ts.tzinfo is None:
            return ts.replace(tzinfo=timezone.utc)
        return ts.astimezone(timezone.utc)
    except Exception:
        return datetime.utcnow().replace(tzinfo=timezone.utc)

def _round_coord(x):
    try:
        if x is None:
            return None
        return round(float(x), 4)
    except Exception:
        return None

def _fingerprint(source: str, ts: datetime, lat, lon, data: dict | list | None) -> str:
    base = f"{source}|{ts.isoformat()[:16]}|{'' if lat is None else round(lat,3)}|{'' if lon is None else round(lon,3)}"
    key = ''
    try:
        if isinstance(data, dict):
            for k in ('incident_id','id','event_id','title','name'):
                v = data.get(k)
                if v is not None:
                    key = str(v); break
    except Exception:
        pass
    return sha256((base+'|'+key).encode('utf-8')).hexdigest()

def save_event(source: str, ts: datetime, latitude, longitude, payload: dict | list | None, confidence: float) -> int:
    tsn = _normalize_timestamp(ts)
    lat = _round_coord(latitude)
    lon = _round_coord(longitude)
    fp = _fingerprint(source, tsn, lat, lon, payload if isinstance(payload, dict) else None)
    with Session() as s:
        try:
            existing = s.query(DataEvent).filter(DataEvent.fingerprint == fp).first()
            if existing:
                try:
                    existing.confidence = max(float(confidence or 0.0), float(existing.confidence or 0.0))
                    if isinstance(existing.data, dict):
                        d = dict(existing.data)
                        d['dup_count'] = int(d.get('dup_count', 0)) + 1
                        existing.data = d
                except Exception:
                    pass
                s.commit()
                return 0
            ev = DataEvent(
                source=source,
                timestamp=tsn.replace(tzinfo=None),
                latitude=lat,
                longitude=lon,
                data=payload if isinstance(payload, (dict, list)) else {},
                confidence=float(confidence or 0.5),
                fingerprint=fp,
            )
            s.add(ev)
            s.commit()
            try:
                from main import evaluate_alerts_for_event
                evaluate_alerts_for_event(ev)
            except Exception:
                pass
            return 1
        except Exception:
            try:
                s.rollback()
            except Exception:
                pass
            return 0

async def ingest_noaa_alerts():
    """NOAA National Weather Service active alerts (free)"""
    print("[INGEST] Starting NOAA Alerts ingestion...")
    url = "https://api.weather.gov/alerts/active"
    try:
        data = await fetch_data(url)
        if data:
            feats = data.get('features') or []
            count = 0
            with Session() as s:
                for f in feats[:200]:
                    props = f.get('properties') or {}
                    geom = f.get('geometry') or {}
                    coords = None
                    try:
                        if geom.get('type') == 'Point':
                            coords = geom.get('coordinates')
                        elif geom.get('type') == 'Polygon':
                            ring = (geom.get('coordinates') or [[None]])[0]
                            if isinstance(ring, list) and ring:
                                coords = ring[0]
                    except Exception:
                        coords = None
                    lat = None; lon = None
                    if isinstance(coords, (list, tuple)) and len(coords) >= 2:
                        lon = float(coords[0]); lat = float(coords[1])
                    conf = 0.7 if (lat is not None and lon is not None) else 0.5
                    count += save_event("NOAA Alerts", datetime.utcnow(), lat, lon, props, conf)
                s.commit()
            print(f"[INGEST] NOAA Alerts: Ingested {count} alerts")
        else:
            print("[INGEST] NOAA Alerts: No data")
    except Exception as e:
        print(f"[INGEST] NOAA Alerts: Failed - {e}")


async def ingest_nasa_eonet():
    """NASA EONET events"""
    print("[INGEST] Starting NASA EONET ingestion...")
    url = "https://eonet.gsfc.nasa.gov/api/v3/events"
    try:
        data = await fetch_data(url)
        if data:
            events = data.get('events', [])
            count = 0
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
                    count += save_event("NASA EONET", ts, lat, lon, ev, conf)
                session.commit()
            print(f"[INGEST] NASA EONET: Successfully ingested {count} events")
        else:
            print("[INGEST] NASA EONET: No data received")
    except Exception as e:
        print(f"[INGEST] NASA EONET: Failed - {e}")

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
                    save_event("ODIN", ts, lat, lon, feat, conf)
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
    """NOAA Weather data"""
    print("[INGEST] Starting NOAA Weather ingestion...")
    url = "https://api.weather.gov/stations/KLAX/observations/latest"  # Example for LAX
    try:
        data = await fetch_data(url)
        if data:
            props = data.get('properties', {})
            with Session() as session:
                conf = _confidence_for_noaa(props)
                save_event("DTIC", datetime.utcnow(), 34.0, -118.0, props, conf)
                session.commit()
            print("[INGEST] DTIC (NOAA Weather): Successfully ingested 1 event")
        else:
            print("[INGEST] DTIC: No data received from NOAA")
    except Exception as e:
        print(f"[INGEST] DTIC: Failed - {e}")

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
    """Military Periscope - ADSB Aircraft data"""
    print("[INGEST] Starting ADS-B OpenSky ingestion...")
    url = "https://opensky-network.org/api/states/all"  # OpenSky API
    try:
        data = await fetch_data(url)
        if data:
            states = data.get('states', [])
            count = 0
            with Session() as session:
                for state in states[:10]:  # Limit for demo
                    conf = _confidence_for_adsb(state)
                    count += save_event("ADS-B OpenSky", datetime.utcnow(), state[6], state[5], state, conf)
                session.commit()
            print(f"[INGEST] ADS-B OpenSky: Successfully ingested {count} events")
        else:
            print("[INGEST] ADS-B OpenSky: No data received from OpenSky")
    except Exception as e:
        print(f"[INGEST] ADS-B OpenSky: Failed - {e}")

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
    """PUB LOG - AIS Maritime data"""
    print("[INGEST] Starting AIS Maritime ingestion...")
    try:
        reader, writer = await asyncio.open_connection('153.44.253.27', 5631)
        count = 0
        while True:
            line = await reader.readline()
            if not line:
                break
            try:
                data = json.loads(line.decode())
                if data.get('class') == 'AIS' and 'lat' in data and 'lon' in data:
                    with Session() as session:
                        conf = _confidence_for_ais(data)
                        count += save_event("AIS Maritime", datetime.utcnow(), data.get('lat'), data.get('lon'), data, conf)
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue # Ignore malformed lines
        print(f"[INGEST] AIS Maritime: Successfully ingested {count} events")
    except ConnectionRefusedError:
        print("[INGEST] AIS Maritime: AIS stream connection refused.")
    except Exception as e:
        print(f"[INGEST] AIS Maritime: Failed - {e}")
    finally:
        if 'writer' in locals() and writer:
            writer.close()
            await writer.wait_closed()

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
    """Global Terrorism DB - USGS Earthquake data"""
    print("[INGEST] Starting USGS Earthquakes ingestion...")
    url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson"
    try:
        data = await fetch_data(url)
        if data:
            features = data.get('features', [])
            count = 0
            with Session() as session:
                for feature in features:
                    coords = feature['geometry']['coordinates']
                    conf = _confidence_for_usgs(feature)
                    count += save_event("USGS Earthquakes", datetime.utcnow(), coords[1], coords[0], feature, conf)
                session.commit()
            print(f"[INGEST] USGS Earthquakes: Successfully ingested {count} events")
        else:
            print("[INGEST] USGS Earthquakes: No data received from USGS")
    except Exception as e:
        print(f"[INGEST] USGS Earthquakes: Failed - {e}")

async def ingest_radio_public():
    """Public radio directory (Radio Browser) as a proxy for RF activity"""
    print("[INGEST] Starting Radio Browser ingestion...")
    url = "https://de1.api.radio-browser.info/json/stations/search"
    params = {"name": "police", "order": "clickcount", "reverse": "true", "limit": 50}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params, timeout=15) as r:
                if r.status != 200:
                    print(f"[INGEST] Radio Browser: HTTP {r.status}")
                    return
                arr = await r.json()
                count = 0
                with Session() as s:
                    for st in arr:
                        lat = _round_coord(st.get('latitude'))
                        lon = _round_coord(st.get('longitude'))
                        if lat is None or lon is None:
                            continue
                        payload = {"name": st.get('name'), "url": st.get('url'), "country": st.get('countrycode'), "bitrate": st.get('bitrate')}
                        count += save_event("Public Radio", datetime.utcnow(), lat, lon, payload, 0.6)
                    s.commit()
                print(f"[INGEST] Public Radio: Ingested {count} stations")
    except Exception as e:
        print(f"[INGEST] Public Radio: Failed - {e}")

async def ingest_reddit_keywords():
    """Reddit keyword search (unauthenticated JSON)"""
    print("[INGEST] Starting Reddit keyword ingestion...")
    try:
        import os
        q = os.getenv('REDDIT_KEYWORDS', 'earthquake OR wildfire OR explosion OR protest')
        url = "https://www.reddit.com/search.json"
        params = {"q": q, "sort": "new", "limit": 50}
        async with aiohttp.ClientSession(headers={"User-Agent": "rtaip/1.0"}) as session:
            async with session.get(url, params=params, timeout=15) as r:
                if r.status != 200:
                    print(f"[INGEST] Reddit: HTTP {r.status}")
                    return
                jd = await r.json()
                children = (((jd or {}).get('data') or {}).get('children') or [])
                count = 0
                with Session() as s:
                    for ch in children:
                        d = (ch or {}).get('data') or {}
                        title = d.get('title')
                        # no reliable geo; store as non-geolocated intel
                        count += save_event("Reddit Intel", datetime.utcnow(), None, None, {"title": title, "sub": d.get('subreddit'), "url": f"https://reddit.com{d.get('permalink')}"}, 0.4)
                    s.commit()
                print(f"[INGEST] Reddit Intel: Ingested {count} posts")
    except Exception as e:
        print(f"[INGEST] Reddit Intel: Failed - {e}")

async def ingest_global_terrorism():
    """Global Terrorism DB - START data"""
    print("[INGEST] Starting Global Terrorism DB (START) ingestion...")
    try:
        # Using START Global Terrorism Database API
        url = "https://www.start.umd.edu/gtd/api/incidents"
        params = {
            "limit": 50,
            "order": "desc",
            "sort": "date"
        }
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                if response.status != 200:
                    print(f"[INGEST] Global Terrorism DB: HTTP {response.status}")
                    return
                data = await response.json()
                incidents = data.get("data", [])
                count = 0
                with Session() as s:
                    for incident in incidents:
                        lat = incident.get("latitude")
                        lon = incident.get("longitude")
                        
                        # Skip if no coordinates
                        if not lat or not lon:
                            continue
                            
                        count += save_event("Global Terrorism DB", datetime.utcnow(), float(lat), float(lon), {"incident_id": incident.get("incident_id"), "date": incident.get("date"), "country": incident.get("country", {}).get("name"), "region": incident.get("region", {}).get("name"), "attack_type": incident.get("attack_type", {}).get("name"), "target_type": incident.get("target_type", {}).get("name"), "weapon_type": incident.get("weapon_type", {}).get("name"), "fatalities": incident.get("nkill", 0), "wounded": incident.get("nwound", 0)}, 0.9)
                    s.commit()
                print(f"[INGEST] Global Terrorism DB: Successfully ingested {count} events")
    except Exception as e:
        print(f"[INGEST] Global Terrorism DB: Failed - {e}")


# Removed Reddit ingestion (ingest_reddit_social) as it is not relevant and lacked geolocation
def run_ingestion():
    # Create a new event loop for this background thread
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        print("[INGEST] Starting hourly data ingestion cycle...")
        loop.run_until_complete(asyncio.gather(
            ingest_nasa_eonet(),
            ingest_noaa_alerts(),
            ingest_adsb_aircraft(),
            ingest_ais_maritime(),
            ingest_usgs_seismic(),
            ingest_radio_public(),
            ingest_reddit_keywords(),
        ))
        print("[INGEST] Hourly ingestion cycle completed successfully")
        
        # Log summary of data ingested
        try:
            with Session() as session:
                total_events = session.query(DataEvent).count()
                print(f"[INGEST] Total events in database: {total_events}")
                
                # Count by source
                sources = ["NASA EONET", "NOAA Alerts", "ADS-B OpenSky", "AIS Maritime", "USGS Earthquakes", "Public Radio", "Reddit Intel"]
                for source in sources:
                    count = session.query(DataEvent).filter(DataEvent.source == source).count()
                    print(f"[INGEST] {source}: {count} events")
                    
        except Exception as e:
            print(f"[INGEST] Error getting summary stats: {e}")
            
    except Exception as e:
        print(f"[INGEST] Fatal error in ingestion cycle: {e}")
        import traceback
        traceback.print_exc()
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

# Connector registry
CONNECTORS = {
    "nasa_eonet": ingest_nasa_eonet,
    "noaa_alerts": ingest_noaa_alerts,
    "adsb_aircraft": ingest_adsb_aircraft,
    "ais_maritime": ingest_ais_maritime,
    "usgs_quakes": ingest_usgs_seismic,
    "radio_public": ingest_radio_public,
    "reddit_keywords": ingest_reddit_keywords,
}
ENABLED = set(CONNECTORS.keys())

def list_connectors():
    return sorted(CONNECTORS.keys())

def set_enabled(names):
    global ENABLED
    ENABLED = set(n for n in names if n in CONNECTORS)

async def run_selected(names=None):
    sel = list(ENABLED if not names else [n for n in names if n in CONNECTORS])
    await asyncio.gather(*[CONNECTORS[n]() for n in sel])

def schedule_ingestion():
    schedule.every(30).seconds.do(run_ingestion)
    while True:
        schedule.run_pending()
        time.sleep(1)

if __name__ == "__main__":
    schedule_ingestion()