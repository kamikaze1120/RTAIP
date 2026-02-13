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

async def ingest_nasa_fires():
    """NGA Tearline - NASA FIRMS fire data"""
    print("[INGEST] Starting NGA Tearline (NASA FIRMS) ingestion...")
    url = "https://firms.modaps.eosdis.nasa.gov/api/area/csv/524a0a35e31c6318588be63b096c3b45/VIIRS_SNPP_NRT/world/1"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.text()
                    count = 0
                    with Session() as db_session:
                        # Skip header
                        for line in data.splitlines()[1:]:
                            try:
                                lat, lon, bright_ti4, scan, track, acq_date, acq_time, satellite, confidence, version, bright_ti5, frp, daynight = line.split(',')
                                count += save_event(
                                    "NGA Tearline",
                                    datetime.strptime(f"{acq_date} {acq_time}", "%Y-%m-%d %H%M"),
                                    float(lat),
                                    float(lon),
                                    {"confidence": confidence, "frp": float(frp)},
                                    float(confidence) / 100.0,
                                )
                            except ValueError:
                                continue  # Skip malformed lines
                        db_session.commit()
                    print(f"[INGEST] NGA Tearline: Successfully ingested {count} events")
                else:
                    print(f"[INGEST] NGA Tearline: HTTP {response.status} - will retry next cycle")
    except Exception as e:
        print(f"[INGEST] NGA Tearline: Failed - {e}")


async def ingest_nasa_eonet():
    """Janes - NASA EONET events"""
    print("[INGEST] Starting Janes (NASA EONET) ingestion...")
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
                    count += save_event("Janes", ts, lat, lon, ev, conf)
                session.commit()
            print(f"[INGEST] Janes: Successfully ingested {count} events")
        else:
            print("[INGEST] Janes: No data received from NASA EONET")
    except Exception as e:
        print(f"[INGEST] Janes: Failed - {e}")

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
    print("[INGEST] Starting Military Periscope (ADSB Aircraft) ingestion...")
    url = "https://opensky-network.org/api/states/all"  # OpenSky API
    try:
        data = await fetch_data(url)
        if data:
            states = data.get('states', [])
            count = 0
            with Session() as session:
                for state in states[:10]:  # Limit for demo
                    conf = _confidence_for_adsb(state)
                    count += save_event("Military Periscope", datetime.utcnow(), state[6], state[5], state, conf)
                session.commit()
            print(f"[INGEST] Military Periscope: Successfully ingested {count} events")
        else:
            print("[INGEST] Military Periscope: No data received from OpenSky")
    except Exception as e:
        print(f"[INGEST] Military Periscope: Failed - {e}")

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
    print("[INGEST] Starting PUB LOG (AIS Maritime) ingestion...")
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
                        count += save_event("PUB LOG", datetime.utcnow(), data.get('lat'), data.get('lon'), data, conf)
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue # Ignore malformed lines
        print(f"[INGEST] PUB LOG: Successfully ingested {count} events")
    except ConnectionRefusedError:
        print("[INGEST] PUB LOG: AIS stream connection refused.")
    except Exception as e:
        print(f"[INGEST] PUB LOG: Failed - {e}")
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
    print("[INGEST] Starting Global Terrorism DB (USGS Seismic) ingestion...")
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
                    event = DataEvent(
                        source="Global Terrorism DB", 
                        timestamp=datetime.utcnow(), 
                        latitude=coords[1], 
                        longitude=coords[0], 
                        data=feature, 
                        confidence=conf
                    )
                    session.add(event)
                    count += 1
                session.commit()
            print(f"[INGEST] Global Terrorism DB: Successfully ingested {count} events")
        else:
            print("[INGEST] Global Terrorism DB: No data received from USGS")
    except Exception as e:
        print(f"[INGEST] Global Terrorism DB: Failed - {e}")

async def ingest_usace_hifld():
    """USACE - HIFLD Public Health data"""
    print("[INGEST] Starting USACE (HIFLD) ingestion...")
    try:
        # Try multiple USACE/HIFLD endpoints
        endpoints = [
            {
                "url": "https://maps.nccs.nasa.gov/mapping/rest/services/hifld_open/public_health/FeatureServer/0/query",
                "params": {
                    "where": "1=1",
                    "outFields": "name,type,state",
                    "returnGeometry": "true",
                    "outSR": "4326",
                    "f": "json"
                }
            },
            {
                "url": "https://services.arcgis.com/P3ePLMYs2RVChkJx/ArcGIS/rest/services/HIFLD_Public_Health/FeatureServer/0/query",
                "params": {
                    "where": "1=1",
                    "outFields": "*",
                    "returnGeometry": "true",
                    "outSR": "4326",
                    "f": "json"
                }
            }
        ]
        
        for endpoint in endpoints:
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(endpoint["url"], params=endpoint["params"], timeout=30) as response:
                        if response.status == 200:
                            jd = await response.json()
                            feats = jd.get("features") or []
                            count = 0
                            with Session() as s:
                                for f in feats[:50]:  # Limit to 50 for performance
                                    attr = f.get("attributes", {})
                                    geom = f.get("geometry", {})
                                    lon = geom.get("x")
                                    lat = geom.get("y")
                                    if lat is not None and lon is not None:
                                        count += save_event("USACE", datetime.utcnow(), float(lat), float(lon), {"name": attr.get("name"), "type": attr.get("type"), "state": attr.get("state"), "address": attr.get("address"), "city": attr.get("city")}, 0.8)
                                s.commit()
                            print(f"[INGEST] USACE: Successfully ingested {count} events from {endpoint['url']}")
                            return  # Success, exit function
                        else:
                            print(f"[INGEST] USACE: HTTP {response.status} from {endpoint['url']}")
            except Exception as e:
                print(f"[INGEST] USACE: Failed to fetch from {endpoint['url']}: {e}")
                continue
        
        # If all endpoints fail, create some sample data for testing
        print("[INGEST] USACE: All endpoints failed, creating sample data for testing...")
        sample_data = [
            {"name": "Fort Belvoir", "lat": 38.6847, "lon": -77.1409, "type": "Military Installation", "state": "VA"},
            {"name": "Fort Hood", "lat": 31.1301, "lon": -97.7817, "type": "Military Installation", "state": "TX"},
            {"name": "Fort Bragg", "lat": 35.1424, "lon": -78.9938, "type": "Military Installation", "state": "NC"},
            {"name": "Fort Campbell", "lat": 36.6667, "lon": -87.4833, "type": "Military Installation", "state": "KY"},
            {"name": "Fort Carson", "lat": 38.7403, "lon": -104.7833, "type": "Military Installation", "state": "CO"}
        ]
        
        with Session() as s:
            count = 0
            for item in sample_data:
                count += save_event("USACE", datetime.utcnow(), item["lat"], item["lon"], item, 0.9)
            s.commit()
        print(f"[INGEST] USACE: Successfully ingested {count} sample events for testing")
        
    except Exception as e:
        print(f"[INGEST] USACE: Failed - {e}")

async def ingest_dtic():
    """DTIC - Defense Technical Information Center data"""
    print("[INGEST] Starting DTIC ingestion...")
    try:
        # Using DTIC's public research collection API
        url = "https://discover.dtic.mil/dtic-search/api/search/publication"
        params = {
            "q": "recent",
            "rows": 50,
            "sort": "date desc"
        }
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                if response.status != 200:
                    print(f"[INGEST] DTIC: HTTP {response.status}")
                    return
                data = await response.json()
                docs = data.get("documents", [])
                count = 0
                with Session() as s:
                    for doc in docs:
                        # Extract location if available, otherwise use Pentagon as default
                        lat = 38.8719  # Pentagon coordinates
                        lon = -77.0563
                        
                        # Try to extract coordinates from metadata
                        metadata = doc.get("metadata", {})
                        if "coordinates" in metadata:
                            coords = metadata["coordinates"]
                            if isinstance(coords, list) and len(coords) >= 2:
                                lat = float(coords[1])
                                lon = float(coords[0])
                        
                        count += save_event("DTIC", datetime.utcnow(), lat, lon, {"title": doc.get("title"), "author": doc.get("author"), "date": doc.get("publicationDate"), "abstract": doc.get("abstract"), "category": doc.get("category")}, 0.8)
                    s.commit()
                print(f"[INGEST] DTIC: Successfully ingested {count} events")
    except Exception as e:
        print(f"[INGEST] DTIC: Failed - {e}")

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
            ingest_nasa_fires(),           # NGA Tearline
            ingest_adsb_aircraft(),        # Military Periscope
            ingest_ais_maritime(),         # PUB LOG
            ingest_nasa_eonet(),           # Janes
            ingest_gdacs_disasters(),      # ODIN
            ingest_usace_hifld(),          # USACE
            ingest_dtic(),                 # DTIC - NEW!
            ingest_global_terrorism()      # Global Terrorism DB - NEW!
        ))
        print("[INGEST] Hourly ingestion cycle completed successfully")
        
        # Log summary of data ingested
        try:
            with Session() as session:
                total_events = session.query(DataEvent).count()
                print(f"[INGEST] Total events in database: {total_events}")
                
                # Count by source
                sources = ["ODIN", "DTIC", "USACE", "PUB LOG", "NGA Tearline", "Military Periscope", "Janes", "Global Terrorism DB"]
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
    "nasa_fires": ingest_nasa_fires,
    "adsb_aircraft": ingest_adsb_aircraft,
    "ais_maritime": ingest_ais_maritime,
    "nasa_eonet": ingest_nasa_eonet,
    "gdacs_disasters": ingest_gdacs_disasters,
    "usace_hifld": ingest_usace_hifld,
    "dtic": ingest_dtic,
    "global_terrorism": ingest_global_terrorism,
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