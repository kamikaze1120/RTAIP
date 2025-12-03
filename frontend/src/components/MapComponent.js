import React, { useRef, useEffect } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import ClusterSource from 'ol/source/Cluster';
import Heatmap from 'ol/layer/Heatmap';
import WebGLPoints from 'ol/layer/WebGLPoints';
import { fromLonLat } from 'ol/proj';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
// removed unused LineString import
import Style from 'ol/style/Style';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import CircleStyle from 'ol/style/Circle';

const sourceStyles = {
  adsb: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#1e90ff' }), stroke: new Stroke({ color: '#0b5fa5', width: 2 }) }) }),
  ais: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#32cd32' }), stroke: new Stroke({ color: '#1a7f1a', width: 2 }) }) }),
  usgs_seismic: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#ff8c00' }), stroke: new Stroke({ color: '#bf6500', width: 2 }) }) }),
  noaa_weather: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#8a2be2' }), stroke: new Stroke({ color: '#5c1c99', width: 2 }) }) }),
  gdacs_disasters: new Style({ image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#00bcd4' }), stroke: new Stroke({ color: '#008fa1', width: 2 }) }) }),
  fema_disasters: new Style({ image: new CircleStyle({ radius: 7, fill: new Fill({ color: '#17a2b8' }), stroke: new Stroke({ color: '#0f7280', width: 2 }) }) }),
  hifld_infra: new Style({ image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#ffc107' }), stroke: new Stroke({ color: '#b58900', width: 2 }) }) }),
  census_pop: new Style({ image: new CircleStyle({ radius: 5, fill: new Fill({ color: '#20c997' }), stroke: new Stroke({ color: '#158c6d', width: 2 }) }) }),
  default: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#999' }), stroke: new Stroke({ color: '#666', width: 2 }) }) }),
};

const anomalyStyle = new Style({ image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#dc3545' }), stroke: new Stroke({ color: '#7a1f26', width: 2 }) }) });

const basemapFor = (style) => {
  if (style === 'light') return new XYZ({ url: 'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png' });
  if (style === 'dark') return new XYZ({ url: 'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png' });
  if (style === 'satellite') return new XYZ({ url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' });
  if (style === 'terrain') return new XYZ({ url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png' });
  return new OSM();
};

const MapComponent = ({ events, anomalies, focusEventId, onSelect, basemapStyle, useWebGL, onPerfUpdate }) => {
  const mapRef = useRef();
  const fpsRef = useRef({ last: performance.now(), frames: 0 });
  const eventSourceRef = useRef();
  const anomalySourceRef = useRef();
  const predictionSourceRef = useRef();
  const heatmapSourceRef = useRef();
  const mapInstanceRef = useRef();
  const eventsSigRef = useRef('');
  const anomsSigRef = useRef('');
  const onSelectRef = useRef(onSelect);
  const onPerfUpdateRef = useRef(onPerfUpdate);

  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);
  useEffect(() => { onPerfUpdateRef.current = onPerfUpdate; }, [onPerfUpdate]);

  useEffect(() => {
    const cleanupFns = [];
    const map = new Map({
      target: mapRef.current,
      layers: [ new TileLayer({ source: basemapFor(basemapStyle) }) ],
      view: new View({ center: fromLonLat([0, 0]), zoom: 2 }),
    });
    mapInstanceRef.current = map;

    const heatmapSource = new VectorSource();
    heatmapSourceRef.current = heatmapSource;
    const heatmapLayer = new Heatmap({ source: heatmapSource, blur: 12, radius: 10 });
    map.addLayer(heatmapLayer);

    const eventSource = new VectorSource();
    eventSourceRef.current = eventSource;
    const clusterSource = new ClusterSource({ distance: 40, source: eventSource });
    let eventLayer;
    if (useWebGL) {
      eventLayer = new WebGLPoints({ source: eventSource, style: { symbol: { symbolType: 'circle', size: 8, color: '#00ffc6', opacity: 0.9 } } });
    } else {
      eventLayer = new VectorLayer({ source: clusterSource, style: (feature) => {
        const size = feature.get('features')?.length || 1;
        const radius = Math.min(24, 8 + Math.log(size + 1) * 4);
        return new Style({ image: new CircleStyle({ radius, fill: new Fill({ color: 'rgba(0,255,198,0.35)' }), stroke: new Stroke({ color: 'rgba(0,255,198,0.85)', width: 2 }) }) });
      } });
    }
    map.addLayer(eventLayer);

    const anomalySource = new VectorSource();
    anomalySourceRef.current = anomalySource;
    let anomalyLayer;
    if (useWebGL) {
      anomalyLayer = new WebGLPoints({ source: anomalySource, style: { symbol: { symbolType: 'circle', size: 10, color: '#dc3545', opacity: 0.9 } } });
    } else {
      const anomalyCluster = new ClusterSource({ distance: 40, source: anomalySource });
      anomalyLayer = new VectorLayer({ source: anomalyCluster, style: (feature) => {
        const size = feature.get('features')?.length || 1;
        const radius = Math.min(26, 10 + Math.log(size + 1) * 4);
        return new Style({ image: new CircleStyle({ radius, fill: new Fill({ color: 'rgba(220,53,69,0.45)' }), stroke: new Stroke({ color: '#dc3545', width: 2 }) }) });
      } });
    }
    map.addLayer(anomalyLayer);

    const predictionSource = new VectorSource();
    predictionSourceRef.current = predictionSource;
    const predictionLayer = new VectorLayer({ source: predictionSource, style: new Style({ image: new CircleStyle({ radius: 10, fill: new Fill({ color: 'rgba(111,66,193,0.7)' }), stroke: new Stroke({ color: '#6f42c1', width: 2 }) }) }) });
    map.addLayer(predictionLayer);

    const handleClick = (evt) => {
      let selectedId = null;
      map.forEachFeatureAtPixel(evt.pixel, (feature) => {
        const clustered = feature.get('features');
        if (Array.isArray(clustered) && clustered.length > 0) {
          const child = clustered[0];
          const id = child.get('eventId');
          if (id) { selectedId = id; return true; }
        }
        const id = feature.get('eventId');
        if (id) { selectedId = id; return true; }
        return false;
      });
      const cb = onSelectRef.current;
      if (selectedId && typeof cb === 'function') {
        cb(selectedId);
      }
    };
    map.on('click', handleClick);

    let rafId;
    const tick = () => {
      const now = performance.now();
      const delta = now - fpsRef.current.last;
      fpsRef.current.frames++;
      if (delta >= 1000) {
        const fps = fpsRef.current.frames;
        fpsRef.current.frames = 0;
        fpsRef.current.last = now;
        const perfCb = onPerfUpdateRef.current;
        if (typeof perfCb === 'function') {
          try { perfCb({ fps, events: eventSourceRef.current?.getFeatures().length || 0, anomalies: anomalySourceRef.current?.getFeatures().length || 0 }); } catch {}
        }
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    cleanupFns.push(() => cancelAnimationFrame(rafId));

    return () => {
      map.un('click', handleClick);
      map.setTarget(undefined);
      cleanupFns.forEach(fn => { try { fn(); } catch {} });
    };
  }, [basemapStyle, useWebGL]);

  useEffect(() => {
    const eventSource = eventSourceRef.current;
    const anomalySource = anomalySourceRef.current;
    const heatmapSource = heatmapSourceRef.current;
    if (!eventSource || !anomalySource || !heatmapSource) return;
    const eSig = `${events.length}:${events[0]?.id || ''}:${events[events.length-1]?.id || ''}`;
    const aSig = `${anomalies.length}:${anomalies[0]?.id || ''}:${anomalies[anomalies.length-1]?.id || ''}`;
    const eChanged = eSig !== eventsSigRef.current;
    const aChanged = aSig !== anomsSigRef.current;
    if (!eChanged && !aChanged) {
      return;
    }
    eventsSigRef.current = eSig;
    anomsSigRef.current = aSig;
    eventSource.clear();
    anomalySource.clear();
    heatmapSource.clear();

    events.forEach(event => {
      if (event.latitude && event.longitude) {
        const feature = new Feature({ geometry: new Point(fromLonLat([event.longitude, event.latitude])) });
        feature.setStyle(sourceStyles[event.source] || sourceStyles.default);
        feature.set('eventId', event.id);
        feature.set('meta', event);
        eventSource.addFeature(feature);
        // do not add every event to heatmap to avoid repaint flicker; anomalies drive heat
      }
    });

    const weightFromAnomaly = (anomaly) => {
      let w = 0.5;
      if (typeof anomaly.severity === 'number') w = Math.min(1, Math.max(0, anomaly.severity / 10));
      if (anomaly.description && typeof anomaly.description === 'string') {
        const m = anomaly.description.match(/score=([\-0-9\.]+)/);
        if (m) {
          const s = parseFloat(m[1]);
          if (!isNaN(s)) { const nw = Math.max(0, -s); w = Math.min(1, nw); }
        }
      }
      return w;
    };

    anomalies.forEach(anomaly => {
      const event = events.find(e => e.id === anomaly.event_id);
      if (event && event.latitude && event.longitude) {
        const coords = fromLonLat([event.longitude, event.latitude]);
        const feature = new Feature({ geometry: new Point(coords) });
        feature.setStyle(anomalyStyle);
        feature.set('eventId', event.id);
        feature.set('meta', { ...event, anomaly });
        anomalySource.addFeature(feature);
        const heatFeature = new Feature({ geometry: new Point(coords) });
        heatFeature.set('weight', weightFromAnomaly(anomaly));
        heatmapSource.addFeature(heatFeature);
      }
    });
  }, [events, anomalies]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    const eventSource = eventSourceRef.current;
    const anomalySource = anomalySourceRef.current;
    if (!map || !eventSource || !anomalySource || !focusEventId) return;
    const feature = eventSource.getFeatures().find(f => f.get('eventId') === focusEventId) ||
                    anomalySource.getFeatures().find(f => f.get('eventId') === focusEventId);
    if (feature) {
      const geom = feature.getGeometry();
      if (geom) {
        const coords = geom.getCoordinates();
        map.getView().animate({ center: coords, zoom: 6, duration: 500 });
      }
    }
  }, [focusEventId]);

  useEffect(() => {
    const handler = (e) => {
      const src = predictionSourceRef.current;
      if (!src) return;
      const preds = (e && e.detail) || [];
      src.clear();
      preds.forEach(p => {
        const lat = p.latitude; const lon = p.longitude;
        if (lat == null || lon == null) return;
        const feature = new Feature({ geometry: new Point(fromLonLat([lon, lat])) });
        feature.set('meta', p);
        src.addFeature(feature);
      });
    };
    window.addEventListener('rtaip_predictions', handler);
    return () => { window.removeEventListener('rtaip_predictions', handler); };
  }, []);

  useEffect(() => {
    const handler = (e) => {
      const map = mapInstanceRef.current;
      if (!map) return;
      const d = (e && e.detail) || {};
      const lon = d.lon, lat = d.lat; const zoom = d.zoom || 6;
      if (lon == null || lat == null) return;
      map.getView().animate({ center: fromLonLat([lon, lat]), zoom, duration: 500 });
    };
    window.addEventListener('rtaip_focus', handler);
    return () => { window.removeEventListener('rtaip_focus', handler); };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapRef} style={{ position: 'absolute', inset: 0 }} />
      <div style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '6px 8px', fontSize: 12, pointerEvents: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, display: 'inline-block', borderRadius: '50%', background: 'rgba(0,255,198,0.85)' }}></span>
          Events
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, display: 'inline-block', borderRadius: '50%', background: '#dc3545' }}></span>
          Anomalies
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, display: 'inline-block', borderRadius: '50%', background: '#6f42c1' }}></span>
          Predictions
        </div>
      </div>
    </div>
  );
};

export default MapComponent;