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
                                event = DataEvent(
                                    source="NGA Tearline",
                                    timestamp=datetime.strptime(f"{acq_date} {acq_time}", "%Y-%m-%d %H%M"),
                                    latitude=float(lat),
                                    longitude=float(lon),
                                    data={"confidence": confidence, "frp": float(frp)},
                                    confidence=float(confidence) / 100.0
                                )
                                db_session.add(event)
                                count += 1
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
                    event = DataEvent(source="Janes", timestamp=ts, latitude=lat, longitude=lon, data=ev, confidence=conf)
                    session.add(event)
                    count += 1
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
                    event = DataEvent(source="ODIN", timestamp=ts, latitude=lat, longitude=lon, data=feat, confidence=conf)
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
    """NOAA Weather data"""
    print("[INGEST] Starting NOAA Weather ingestion...")
    url = "https://api.weather.gov/stations/KLAX/observations/latest"  # Example for LAX
    try:
        data = await fetch_data(url)
        if data:
            props = data.get('properties', {})
            with Session() as session:
                conf = _confidence_for_noaa(props)
                event = DataEvent(
                    source="DTIC",  # Changed to DTIC as requested
                    timestamp=datetime.utcnow(), 
                    latitude=34.0, 
                    longitude=-118.0, 
                    data=props, 
                    confidence=conf
                )
                session.add(event)
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
                    event = DataEvent(
                        source="Military Periscope", 
                        timestamp=datetime.utcnow(), 
                        latitude=state[6], 
                        longitude=state[5], 
                        data=state, 
                        confidence=conf
                    )
                    session.add(event)
                    count += 1
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
                        event = DataEvent(
                            source="PUB LOG",
                            timestamp=datetime.utcnow(),
                            latitude=data.get('lat'),
                            longitude=data.get('lon'),
                            data=data,
                            confidence=conf
                        )
                        session.add(event)
                        session.commit()
                        count += 1
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
        url = "https://maps.nccs.nasa.gov/mapping/rest/services/hifld_open/public_health/FeatureServer/0/query"
        params = {
            "where": "1=1",
            "outFields": "name,type,state",
            "returnGeometry": "true",
            "outSR": "4326",
            "f": "json"
        }
        async with aiohttp.ClientSession() as session:
            async with session.get(url, params=params) as response:
                if response.status != 200:
                    print(f"[INGEST] USACE: HTTP {response.status}")
                    return
                jd = await response.json()
                feats = jd.get("features") or []
                count = 0
                with Session() as s:
                    for f in feats[:100]:
                        attr = f.get("attributes", {})
                        geom = f.get("geometry", {})
                        lon = geom.get("x")
                        lat = geom.get("y")
                        ev = DataEvent(
                            source="USACE",
                            timestamp=datetime.utcnow(),
                            latitude=float(lat) if isinstance(lat, (int,float)) else None,
                            longitude=float(lon) if isinstance(lon, (int,float)) else None,
                            data={"name": attr.get("name"), "type": attr.get("type"), "state": attr.get("state")},
                            confidence=1.0 if (lat is not None and lon is not None) else 0.6
                        )
                        s.add(ev)
                        count += 1
                    s.commit()
                print(f"[INGEST] USACE: Successfully ingested {count} events")
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
                        
                        ev = DataEvent(
                            source="DTIC",
                            timestamp=datetime.utcnow(),
                            latitude=lat,
                            longitude=lon,
                            data={
                                "title": doc.get("title"),
                                "author": doc.get("author"),
                                "date": doc.get("publicationDate"),
                                "abstract": doc.get("abstract"),
                                "category": doc.get("category")
                            },
                            confidence=0.8
                        )
                        s.add(ev)
                        count += 1
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
                            
                        ev = DataEvent(
                            source="Global Terrorism DB",
                            timestamp=datetime.utcnow(),
                            latitude=float(lat),
                            longitude=float(lon),
                            data={
                                "incident_id": incident.get("incident_id"),
                                "date": incident.get("date"),
                                "country": incident.get("country", {}).get("name"),
                                "region": incident.get("region", {}).get("name"),
                                "attack_type": incident.get("attack_type", {}).get("name"),
                                "target_type": incident.get("target_type", {}).get("name"),
                                "weapon_type": incident.get("weapon_type", {}).get("name"),
                                "fatalities": incident.get("nkill", 0),
                                "wounded": incident.get("nwound", 0)
                            },
                            confidence=0.9
                        )
                        s.add(ev)
                        count += 1
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

def schedule_ingestion():
    schedule.every(30).seconds.do(run_ingestion)
    while True:
        schedule.run_pending()
        time.sleep(1)

if __name__ == "__main__":
    schedule_ingestion()