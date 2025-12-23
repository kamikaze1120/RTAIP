import React, { useEffect, useRef, useState } from 'react';
import type { RtaEvent } from '../services/data';
import { eventSeverity } from '../services/data';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import Heatmap from 'ol/layer/Heatmap';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, Stroke, Text, Style } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import CircleGeom from 'ol/geom/Circle';

export function MapComponent({ events, selectedId, predictionPoints = [], showPredictions = false, simRadiusKm, showHospitals = false, onSelect }: { events: RtaEvent[]; selectedId?: string; predictionPoints?: Array<{ lat: number; lon: number; weight: number }>; showPredictions?: boolean; simRadiusKm?: number; showHospitals?: boolean; onSelect?: (id: string) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const layerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const focusLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const heatLayerRef = useRef<Heatmap | null>(null);
  const infraLayerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const [detail, setDetail] = useState<{ id: string; x: number; y: number; zoom: number } | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const vector = new VectorSource();
    const layer = new VectorLayer({
      source: vector,
      style: (f: any) => {
        const isFocus = f.get('id') === selectedId;
        const src = String(f.get('source') || '').toLowerCase();
        const emoji = src.includes('usgs') ? '🌋' : src.includes('noaa') ? '⛈️' : src.includes('gdacs') ? '🛰️' : '📍';
        const circle = new CircleStyle({
          radius: isFocus ? 10 : 6,
          fill: new Fill({ color: isFocus ? 'rgba(255, 215, 0, 0.65)' : 'rgba(255,255,255,0.12)' }),
          stroke: new Stroke({ color: isFocus ? 'rgba(255, 215, 0, 0.9)' : 'rgba(255,255,255,0.25)', width: isFocus ? 3 : 2 }),
        }) as any;
        const text = new Style({
          text: new Text({
            text: emoji,
            font: '16px system-ui',
            offsetY: -14,
          }),
        });
        return [circle, text] as any;
      },
    });
    const focusLayer = new VectorLayer({
      source: new VectorSource(),
    });
    const heatLayer = new Heatmap({
      source: new VectorSource(),
      blur: 12,
      radius: 8,
    });
    const infraLayer = new VectorLayer({ source: new VectorSource() });
    const map = new Map({
      target: ref.current,
      layers: [new TileLayer({ source: new OSM() }), layer, heatLayer, infraLayer, focusLayer],
      view: new View({ center: fromLonLat([0, 0]), zoom: 2 }),
    });
    mapRef.current = map;
    layerRef.current = layer;
    focusLayerRef.current = focusLayer;
    heatLayerRef.current = heatLayer;
    infraLayerRef.current = infraLayer;
    return () => { map.setTarget(undefined); };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const handler = (evt: any) => {
      const pixel = map.getEventPixel(evt.originalEvent);
      const feature = map.forEachFeatureAtPixel(pixel, (f: any) => f);
      if (!feature) { setDetail(null); return; }
      const id = feature.get('id');
      const z = map.getView().getZoom();
      const zoom = typeof z === 'number' && isFinite(z) ? z : 2;
      const [x, y] = pixel as [number, number];
      setDetail({ id, x, y, zoom });
      onSelect?.(id);
    };
    map.on('singleclick', handler);
    const hover = (evt: any) => {
      const pixel = map.getEventPixel(evt.originalEvent);
      const feature = map.forEachFeatureAtPixel(pixel, (f: any) => f);
      if (!feature) { setDetail(null); return; }
      const id = feature.get('id');
      const z = map.getView().getZoom();
      const zoom = typeof z === 'number' && isFinite(z) ? z : 2;
      const [x, y] = pixel as [number, number];
      setDetail({ id, x, y, zoom });
    };
    map.on('pointermove', hover);
    return () => { map.un('singleclick', handler as any); map.un('pointermove', hover as any); };
  }, [onSelect]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const source = layer.getSource();
    if (!source) return;
    source.clear();
    events.forEach((e) => {
      if (e.longitude == null || e.latitude == null) return;
      const f = new Feature({ geometry: new Point(fromLonLat([e.longitude, e.latitude])) });
      f.set('id', e.id);
      f.set('source', e.source);
      source.addFeature(f);
    });
  }, [events]);

  useEffect(() => {
    if (!selectedId) return;
    const layer = layerRef.current;
    const map = mapRef.current;
    const focusLayer = focusLayerRef.current;
    if (!layer || !map) return;
    const source = layer.getSource();
    if (!source) return;
    const fs = source.getFeatures();
    const f = fs.find((x: any) => x.get('id') === selectedId);
    if (!f) return;
    const geom = f.getGeometry() as Point;
    const center = geom.getCoordinates();
    map.getView().animate({ center, zoom: 6, duration: 600 });
    layer.changed();
    if (focusLayer) {
      const s = focusLayer.getSource();
      s?.clear();
      const src = String(f.get('source') || '').toLowerCase();
      const km = typeof simRadiusKm === 'number' ? simRadiusKm : radiusKmForSource(src);
      const circle = new CircleGeom(center, km * 1000);
      const outline = new Feature(circle);
      outline.setStyle(new CircleStyle({
        radius: 0,
        fill: new Fill({ color: 'rgba(255, 215, 0, 0.08)' }),
        stroke: new Stroke({ color: 'rgba(255, 215, 0, 0.6)', width: 2 }),
      }) as any);
      s?.addFeature(outline);
    }
  }, [selectedId]);

  function radiusKmForSource(src?: string) {
    const s = String(src || '').toLowerCase();
    if (s.includes('usgs')) return 120;
    if (s.includes('noaa')) return 60;
    if (s.includes('gdacs')) return 200;
    if (s.includes('fema')) return 40;
    return 80;
  }

  useEffect(() => {
    const heat = heatLayerRef.current;
    if (!heat) return;
    const src = heat.getSource();
    src?.clear();
    if (!showPredictions) return;
    predictionPoints.forEach((p: { lat: number; lon: number; weight: number }) => {
      const f = new Feature({ geometry: new Point(fromLonLat([p.lon, p.lat])) });
      (f as any).set('weight', Math.min(1, Math.max(0.1, p.weight)));
      src?.addFeature(f);
    });
  }, [predictionPoints, showPredictions]);

  useEffect(() => {
    const infra = infraLayerRef.current;
    if (!infra) return;
    const src = infra.getSource();
    src?.clear();
    if (!showHospitals) return;
    events.filter((e: RtaEvent) => String(e.source).toLowerCase().includes('hifld')).forEach((e: RtaEvent) => {
      if (e.longitude == null || e.latitude == null) return;
      const f = new Feature({ geometry: new Point(fromLonLat([e.longitude, e.latitude])) });
      src?.addFeature(f);
    });
  }, [showHospitals, events]);

  return (
    <div className="relative">
      <div ref={ref} className="w-full h-[60vh] border border-primary/20" />
      {detail && (() => {
        const ev = events.find(e => e.id === detail.id);
        if (!ev) return null;
        const sev = eventSeverity(ev);
        const more = (detail.zoom || 2) >= 5;
        return (
          <div style={{ left: detail.x + 12, top: detail.y + 12 }} className="absolute z-40 clip-corner-sm border border-primary/20 bg-background/95 px-3 py-2 text-xs w-[280px]">
            <div className="text-primary">{String(ev.source || '').toUpperCase()} • Risk {Math.round(sev*100)}%</div>
            <div className="text-muted-foreground">{new Date(ev.timestamp).toLocaleString()}</div>
            {more && <div className="mt-1 text-[11px] whitespace-pre-wrap">{JSON.stringify(ev.data || {}, null, 2)}</div>}
          </div>
        );
      })()}
    </div>
  );
}

export default MapComponent;