const rad = (d: number): number => (d * Math.PI) / 180;
const deg = (r: number): number => (r * 180) / Math.PI;
const mod = (n: number, m: number): number => ((n % m) + m) % m;

/** Latitude and longitude of the point where the sun is directly overhead. */
export function subsolarPoint(date: Date): { lat: number; lon: number } {
  const jd = date.getTime() / 86_400_000 + 2_440_587.5;
  const n = jd - 2_451_545.0;
  const L = mod(280.46 + 0.9856474 * n, 360);
  const g = rad(mod(357.528 + 0.9856003 * n, 360));
  const lambda = rad(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const eps = rad(23.439 - 0.0000004 * n);
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const gmstHours = mod(18.697374558 + 24.06570982441908 * n, 24);
  let lon = mod(deg(ra) - gmstHours * 15 + 180, 360) - 180;
  if (lon < -180) lon += 360;
  return { lat: deg(decl), lon };
}

/** Polygon covering the half of the Earth currently in darkness. */
export function nightPolygon(date: Date): Array<[number, number]> {
  const { lat: decl, lon: sunLon } = subsolarPoint(date);
  const d = rad(Math.abs(decl) < 0.01 ? 0.01 : decl);
  const ring: Array<[number, number]> = [];
  for (let lon = -180; lon <= 180; lon += 2) {
    const h = rad(lon - sunLon);
    ring.push([lon, deg(Math.atan(-Math.cos(h) / Math.tan(d)))]);
  }
  const pole = decl >= 0 ? -90 : 90;
  ring.push([180, pole], [-180, pole], ring[0]!);
  return ring;
}
