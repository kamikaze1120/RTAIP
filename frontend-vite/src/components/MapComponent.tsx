import React, { useEffect, useRef, useState } from 'react';
import { RtaEvent, getAssetIcon, getThreatIcon } from '../services/data';
import { Map, View } from 'ol';
import { fromLonLat } from 'ol/proj';
import { OSM } from 'ol/source';
import { Vector as VectorSource } from 'ol/source';
import { Tile as TileLayer, Vector as VectorLayer } from 'ol/layer';
import { Feature } from 'ol';
import { Point as OlPoint } from 'ol/geom';
import { Style, Icon } from 'ol/style';

interface MapComponentProps {
  events: RtaEvent[];
  focus: RtaEvent | null;
}

export default function MapComponent({ events, focus }: MapComponentProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<Map | null>(null);
  const [layers, setLayers] = useState<VectorLayer<VectorSource<Feature<OlPoint>>>[]>([]);

  useEffect(() => {
    if (!mapRef.current) return;

    const baseLayer = new TileLayer({ source: new OSM() });
    const view = new View({
      center: fromLonLat([-98.5795, 39.8283]),
      zoom: 4,
    });

    mapInstance.current = new Map({
      target: mapRef.current,
      layers: [baseLayer],
      view,
    });

    return () => {
      if (mapInstance.current) {
        mapInstance.current.setTarget(undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!mapInstance.current) return;
    if (focus && typeof focus.longitude === 'number' && typeof focus.latitude === 'number') {
      const view = mapInstance.current.getView();
      view.animate({
        center: fromLonLat([focus.longitude, focus.latitude]),
        zoom: 8,
        duration: 500,
      });
    }
  }, [focus]);

  useEffect(() => {
    if (!mapInstance.current) return;

    // Clear existing vector layers
    layers.forEach(layer => mapInstance.current?.removeLayer(layer));

    const eventFeatures = events.filter(event => typeof event.longitude === 'number' && typeof event.latitude === 'number').map(event => {
      const feature = new Feature({
        geometry: new OlPoint(fromLonLat([event.longitude as number, event.latitude as number])),
        ...event,
      });
      let iconSrc = '/icons/dot.svg';
      if (event.source.includes('asset')) iconSrc = getAssetIcon();
      if (event.source.includes('threat')) iconSrc = getThreatIcon();
      feature.setStyle(new Style({
        image: new Icon({
          src: iconSrc,
          scale: 0.8,
        }),
      }));
      return feature;
    });

    const eventLayer = new VectorLayer({
      source: new VectorSource({
        features: eventFeatures,
      }),
    });

    mapInstance.current.addLayer(eventLayer);
    setLayers([eventLayer]);

  }, [events]);

  return <div ref={mapRef} className="w-full h-full" />;
}