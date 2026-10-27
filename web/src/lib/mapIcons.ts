import type { Map as MapLibreMap } from "maplibre-gl";

type Draw = (ctx: CanvasRenderingContext2D, s: number) => void;

const plane: Draw = (c, s) => {
  c.beginPath();
  c.moveTo(s * 0.5, s * 0.04);
  c.lineTo(s * 0.58, s * 0.38);
  c.lineTo(s * 0.96, s * 0.62);
  c.lineTo(s * 0.96, s * 0.72);
  c.lineTo(s * 0.58, s * 0.62);
  c.lineTo(s * 0.55, s * 0.86);
  c.lineTo(s * 0.7, s * 0.95);
  c.lineTo(s * 0.7, s * 1.0);
  c.lineTo(s * 0.5, s * 0.94);
  c.lineTo(s * 0.3, s * 1.0);
  c.lineTo(s * 0.3, s * 0.95);
  c.lineTo(s * 0.45, s * 0.86);
  c.lineTo(s * 0.42, s * 0.62);
  c.lineTo(s * 0.04, s * 0.72);
  c.lineTo(s * 0.04, s * 0.62);
  c.lineTo(s * 0.42, s * 0.38);
  c.closePath();
  c.fill();
};

const ship: Draw = (c, s) => {
  c.beginPath();
  c.moveTo(s * 0.5, s * 0.02);
  c.lineTo(s * 0.8, s * 0.3);
  c.lineTo(s * 0.8, s * 0.92);
  c.lineTo(s * 0.2, s * 0.92);
  c.lineTo(s * 0.2, s * 0.3);
  c.closePath();
  c.fill();
};

const sat: Draw = (c, s) => {
  c.fillRect(s * 0.4, s * 0.4, s * 0.2, s * 0.2);
  c.fillRect(s * 0.04, s * 0.42, s * 0.3, s * 0.16);
  c.fillRect(s * 0.66, s * 0.42, s * 0.3, s * 0.16);
  c.fillRect(s * 0.47, s * 0.2, s * 0.06, s * 0.2);
};

const camera: Draw = (c, s) => {
  c.beginPath();
  c.roundRect(s * 0.1, s * 0.28, s * 0.58, s * 0.44, s * 0.08);
  c.fill();
  c.beginPath();
  c.moveTo(s * 0.72, s * 0.45);
  c.lineTo(s * 0.94, s * 0.3);
  c.lineTo(s * 0.94, s * 0.7);
  c.lineTo(s * 0.72, s * 0.55);
  c.closePath();
  c.fill();
};

const ICONS: Record<string, Draw> = { "icon-plane": plane, "icon-ship": ship, "icon-sat": sat, "icon-camera": camera };

/** Monochrome icons registered as SDF so layers can tint them with icon-color. */
export function registerIcons(map: MapLibreMap): void {
  const size = 64;
  for (const [name, draw] of Object.entries(ICONS)) {
    if (map.hasImage(name)) continue;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    ctx.fillStyle = "#000";
    draw(ctx, size);
    const img = ctx.getImageData(0, 0, size, size);
    // SDF mode reads the alpha channel as a distance field, so an alpha mask is enough for a crisp tinted glyph.
    map.addImage(name, img, { sdf: true, pixelRatio: 2 });
  }
}
