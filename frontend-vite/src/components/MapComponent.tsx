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

export function MapComponent({ events }: { events: RtaEvent[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const layerRef = useRef<VectorLayer<VectorSource> | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const vector = new VectorSource();
    const layer = new VectorLayer({
      source: vector,
      style: () => {
        return new CircleStyle({
          radius: 6,
          fill: new Fill({ color: 'rgba(255,255,255,0.12)' }),
          stroke: new Stroke({ color: 'rgba(255,255,255,0.25)', width: 2 }),
        }) as any;
      },
    });
    const map = new Map({
      target: ref.current,
      layers: [new TileLayer({ source: new OSM() }), layer],
      view: new View({ center: fromLonLat([0, 0]), zoom: 2 }),
    });
    mapRef.current = map;
    layerRef.current = layer;
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
      source.addFeature(f);
    });
  }, [events]);

  return <div ref={ref} className="w-full h-[60vh] border border-primary/20" />;
}

export default MapComponent;