import React, { useEffect, useRef } from 'react';
import type { RtaEvent } from '../services/data';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import { Circle as CircleStyle, Fill, Stroke } from 'ol/style';
import { fromLonLat } from 'ol/proj';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import CircleGeom from 'ol/geom/Circle';

export function MapComponent({ events, selectedId }: { events: RtaEvent[]; selectedId?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const layerRef = useRef<VectorLayer<VectorSource> | null>(null);
  const focusLayerRef = useRef<VectorLayer<VectorSource> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const vector = new VectorSource();
    const layer = new VectorLayer({
      source: vector,
      style: (f: any) => {
        const isFocus = f.get('id') === selectedId;
        return new CircleStyle({
          radius: isFocus ? 10 : 6,
          fill: new Fill({ color: isFocus ? 'rgba(255, 215, 0, 0.65)' : 'rgba(255,255,255,0.12)' }),
          stroke: new Stroke({ color: isFocus ? 'rgba(255, 215, 0, 0.9)' : 'rgba(255,255,255,0.25)', width: isFocus ? 3 : 2 }),
        }) as any;
      },
    });
    const focusLayer = new VectorLayer({
      source: new VectorSource(),
    });
    const map = new Map({
      target: ref.current,
      layers: [new TileLayer({ source: new OSM() }), layer, focusLayer],
      view: new View({ center: fromLonLat([0, 0]), zoom: 2 }),
    });
    mapRef.current = map;
    layerRef.current = layer;
    focusLayerRef.current = focusLayer;
    return () => { map.setTarget(undefined); };
  }, []);

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
      const km = radiusKmForSource(src);
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

  return <div ref={ref} className="w-full h-[60vh] border border-primary/20" />;
}

export default MapComponent;