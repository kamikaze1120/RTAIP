import { Style, Text, Fill, Stroke } from 'ol/style';
import Icon from 'ol/style/Icon';

function svg(color: string, shape: 'triangle'|'square'|'pentagon'|'circle') {
  if (shape === 'triangle') return `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><polygon points='12,3 3,21 21,21' fill='${color}' stroke='white' stroke-width='2'/></svg>`;
  if (shape === 'square') return `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><rect x='4' y='4' width='16' height='16' fill='${color}' stroke='white' stroke-width='2'/></svg>`;
  if (shape === 'pentagon') return `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><polygon points='12,2 3,9 6,21 18,21 21,9' fill='${color}' stroke='white' stroke-width='2'/></svg>`;
  return `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><circle cx='12' cy='12' r='9' fill='${color}' stroke='white' stroke-width='2'/></svg>`;
}

export function milStyleFor(source: string, focus: boolean): Style {
  const s = String(source || '').toLowerCase();
  let shape: 'triangle'|'square'|'pentagon'|'circle' = 'circle';
  let color = 'rgba(255,255,255,0.20)';
  let label = 'EVT';
  if (s.includes('usgs')) { shape = 'triangle'; color = 'rgba(255,0,0,0.70)'; label = 'SEI'; }
  else if (s.includes('noaa')) { shape = 'square'; color = 'rgba(255,165,0,0.70)'; label = 'WX'; }
  else if (s.includes('gdacs') || s.includes('eonet') || s.includes('nasa')) { shape = 'pentagon'; color = 'rgba(0,200,255,0.70)'; label = 'DIS'; }
  else if (s.includes('adsb')) { shape = 'triangle'; color = 'rgba(0,255,200,0.70)'; label = 'AIR'; }
  else if (s.includes('ais')) { shape = 'circle'; color = 'rgba(0,50,200,0.70)'; label = 'VES'; }
  const svgData = svg(color, shape);
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(svgData)}`;
  const image = new Icon({ src, scale: focus ? 1.2 : 1.0, crossOrigin: 'anonymous' });
  const text = new Text({ text: label, font: '11px JetBrains Mono, monospace', offsetY: -14, fill: new Fill({ color: 'white' }), stroke: new Stroke({ color: 'black', width: 2 }) });
  return new Style({ image, text });
}