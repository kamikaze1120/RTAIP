import React, { useRef, useEffect } from 'react';
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import Heatmap from 'ol/layer/Heatmap';
import { fromLonLat } from 'ol/proj';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import Style from 'ol/style/Style';
import Icon from 'ol/style/Icon';
import Fill from 'ol/style/Fill';
import Stroke from 'ol/style/Stroke';
import CircleStyle from 'ol/style/Circle';

const sourceStyles = {
  adsb: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#1e90ff' }), stroke: new Stroke({ color: '#0b5fa5', width: 2 }) }) }),
  ais: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#32cd32' }), stroke: new Stroke({ color: '#1a7f1a', width: 2 }) }) }),
  usgs_seismic: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#ff8c00' }), stroke: new Stroke({ color: '#bf6500', width: 2 }) }) }),
  noaa_weather: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#8a2be2' }), stroke: new Stroke({ color: '#5c1c99', width: 2 }) }) }),
  default: new Style({ image: new CircleStyle({ radius: 6, fill: new Fill({ color: '#999' }), stroke: new Stroke({ color: '#666', width: 2 }) }) }),
};

const anomalyStyle = new Style({ image: new CircleStyle({ radius: 8, fill: new Fill({ color: '#dc3545' }), stroke: new Stroke({ color: '#7a1f26', width: 2 }) }) });

const MapComponent = ({ events, anomalies, focusEventId, onSelect }) => {
  const mapRef = useRef();

  useEffect(() => {
    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({ source: new OSM() }),
      ],
      view: new View({ center: fromLonLat([0, 0]), zoom: 2 }),
    });

    const heatmapSource = new VectorSource();
    const heatmapLayer = new Heatmap({ source: heatmapSource, blur: 12, radius: 10 });
    map.addLayer(heatmapLayer);

    const eventSource = new VectorSource();
    const eventLayer = new VectorLayer({ source: eventSource });
    map.addLayer(eventLayer);

    const anomalySource = new VectorSource();
    const anomalyLayer = new VectorLayer({ source: anomalySource, style: anomalyStyle });
    map.addLayer(anomalyLayer);

    events.forEach(event => {
      if (event.latitude && event.longitude) {
        const feature = new Feature({
          geometry: new Point(fromLonLat([event.longitude, event.latitude])),
        });
        feature.setStyle(sourceStyles[event.source] || sourceStyles.default);
        feature.set('eventId', event.id);
        feature.set('meta', event);
        eventSource.addFeature(feature);
      }
    });

    const weightFromAnomaly = (anomaly) => {
      let w = 0.5;
      if (typeof anomaly.severity === 'number') {
        w = Math.min(1, Math.max(0, anomaly.severity / 10));
      }
      if (anomaly.description && typeof anomaly.description === 'string') {
        const m = anomaly.description.match(/score=([\-0-9\.]+)/);
        if (m) {
          const s = parseFloat(m[1]);
          if (!isNaN(s)) {
            const nw = Math.max(0, -s); // more negative -> stronger weight
            w = Math.min(1, nw);
          }
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

        // Add to heatmap with weight derived from severity/score
        const heatFeature = new Feature({ geometry: new Point(coords) });
        heatFeature.set('weight', weightFromAnomaly(anomaly));
        heatmapSource.addFeature(heatFeature);
      }
    });

    // Click handler: select feature and bubble up selection
    const handleClick = (evt) => {
      let selectedId = null;
      map.forEachFeatureAtPixel(evt.pixel, (feature) => {
        const id = feature.get('eventId');
        if (id) {
          selectedId = id;
          return true; // stop after first hit
        }
        return false;
      });
      if (selectedId && typeof onSelect === 'function') {
        onSelect(selectedId);
      }
    };
    map.on('click', handleClick);

    // Focus/zoom to event if focusEventId changes
    if (focusEventId) {
      const feature = eventSource.getFeatures().find(f => f.get('eventId') === focusEventId) ||
                      anomalySource.getFeatures().find(f => f.get('eventId') === focusEventId);
      if (feature) {
        const geom = feature.getGeometry();
        if (geom) {
          const coords = geom.getCoordinates();
          map.getView().animate({ center: coords, zoom: 6, duration: 500 });
        }
      }
    }

    return () => {
      map.un('click', handleClick);
      map.setTarget(undefined);
    };
  }, [events, anomalies, focusEventId, onSelect]);

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
};

export default MapComponent;