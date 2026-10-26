"use client";

import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Edge, Entity } from "@/lib/types";
import { ENTITY_STYLE } from "@/lib/ui";

interface SimNode extends SimulationNodeDatum {
  id: string;
  entity: Entity;
  r: number;
  degree: number;
}
type SimLink = SimulationLinkDatum<SimNode> & { type: string };

interface Props {
  entities: Entity[];
  edges: Edge[];
  hiddenTypes: ReadonlySet<string>;
  selectedId: string | null;
  seedIds: ReadonlySet<string>;
  fitToken: number;
  onSelect: (id: string | null) => void;
}

const BASE_R: Record<string, number> = { domain: 10, ip: 7, asn: 8, org: 8, subdomain: 5, location: 6, nameserver: 6, mailserver: 6, email: 8, cert: 6 };

export function GraphCanvas({ entities, edges, hiddenTypes, selectedId, seedIds, fitToken, onSelect }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sim = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodes = useRef(new Map<string, SimNode>());
  const links = useRef<SimLink[]>([]);
  const view = useRef({ x: 0, y: 0, k: 1 });
  const size = useRef({ w: 800, h: 600, dpr: 1 });
  const hover = useRef<string | null>(null);
  const selected = useRef<string | null>(selectedId);
  const seeds = useRef(seedIds);
  const raf = useRef(0);
  const interaction = useRef<{ mode: "none" | "pan" | "node"; id?: string; sx: number; sy: number; moved: boolean; vx: number; vy: number }>({ mode: "none", sx: 0, sy: 0, moved: false, vx: 0, vy: 0 });
  const [tooltip, setTooltip] = useState<{ left: number; top: number; text: string; sub: string } | null>(null);
  const hasFitted = useRef(false);

  const draw = useCallback(() => {
    raf.current = 0;
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const { w, h, dpr } = size.current;
    const { x, y, k } = view.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(k, k);

    const sel = selected.current;
    const hov = hover.current;
    const neighbors = new Set<string>();
    if (sel || hov) {
      const focus = sel ?? hov;
      for (const l of links.current) {
        const s = (l.source as SimNode).id;
        const t = (l.target as SimNode).id;
        if (s === focus) neighbors.add(t);
        if (t === focus) neighbors.add(s);
      }
    }
    const dim = Boolean(sel || hov);
    const focus = sel ?? hov;

    ctx.lineWidth = 1 / k;
    for (const l of links.current) {
      const s = l.source as SimNode;
      const t = l.target as SimNode;
      if (s.x === undefined || s.y === undefined || t.x === undefined || t.y === undefined) continue;
      const touches = focus !== null && (s.id === focus || t.id === focus);
      ctx.strokeStyle = touches ? "rgba(45,212,191,0.85)" : dim ? "rgba(135,152,173,0.10)" : "rgba(135,152,173,0.28)";
      ctx.lineWidth = (touches ? 1.8 : 1) / k;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }

    const labelAll = k > 1.5;
    for (const n of nodes.current.values()) {
      if (n.x === undefined || n.y === undefined) continue;
      const style = ENTITY_STYLE[n.entity.type];
      const isFocus = n.id === focus;
      const faded = dim && !isFocus && !neighbors.has(n.id);
      ctx.globalAlpha = faded ? 0.25 : 1;
      if (seeds.current.has(n.id)) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(45,212,191,0.5)";
        ctx.lineWidth = 1.5 / k;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = style.color;
      ctx.fill();
      if (n.id === sel) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2.5 / k;
        ctx.stroke();
      }
      const showLabel = labelAll || isFocus || n.id === sel || seeds.current.has(n.id) || n.degree >= 4 || neighbors.has(n.id);
      if (showLabel) {
        const text = n.entity.label.length > 34 ? `${n.entity.label.slice(0, 33)}…` : n.entity.label;
        ctx.font = `${12 / k}px ${getComputedStyle(document.body).fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.lineWidth = 3 / k;
        ctx.strokeStyle = "rgba(6,10,16,0.95)";
        ctx.strokeText(text, n.x, n.y + n.r + 4 / k);
        ctx.fillStyle = faded ? "rgba(231,238,246,0.5)" : "#e7eef6";
        ctx.fillText(text, n.x, n.y + n.r + 4 / k);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }, []);

  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(draw);
  }, [draw]);

  const fit = useCallback(() => {
    const list = [...nodes.current.values()].filter((n) => n.x !== undefined && n.y !== undefined);
    if (list.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of list) {
      minX = Math.min(minX, (n.x as number) - n.r);
      maxX = Math.max(maxX, (n.x as number) + n.r);
      minY = Math.min(minY, (n.y as number) - n.r);
      maxY = Math.max(maxY, (n.y as number) + n.r);
    }
    const { w, h } = size.current;
    const pad = 70;
    const k = Math.min(2.2, Math.max(0.15, Math.min((w - pad * 2) / Math.max(1, maxX - minX), (h - pad * 2) / Math.max(1, maxY - minY))));
    view.current = { k, x: w / 2 - ((minX + maxX) / 2) * k, y: h / 2 - ((minY + maxY) / 2) * k };
    schedule();
  }, [schedule]);

  // Create the simulation once.
  useEffect(() => {
    const s = forceSimulation<SimNode, SimLink>()
      .force("link", forceLink<SimNode, SimLink>().id((d) => d.id).distance(52).strength(0.5))
      .force("charge", forceManyBody<SimNode>().strength((d) => -70 - d.r * 6).distanceMax(420))
      .force("collide", forceCollide<SimNode>().radius((d) => d.r + 6))
      .force("x", forceX<SimNode>(0).strength(0.03))
      .force("y", forceY<SimNode>(0).strength(0.03))
      .force("center", forceCenter(0, 0))
      .alphaDecay(0.03)
      .on("tick", schedule);
    sim.current = s;
    return () => {
      s.stop();
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [schedule]);

  // Keep the simulation in step with the data.
  useEffect(() => {
    const s = sim.current;
    if (!s) return;
    const visible = new Map(entities.filter((e) => !hiddenTypes.has(e.type)).map((e) => [e.id, e]));
    for (const id of [...nodes.current.keys()]) if (!visible.has(id)) nodes.current.delete(id);
    const degree = new Map<string, number>();
    const linkList: SimLink[] = [];
    for (const e of edges) {
      if (!visible.has(e.source) || !visible.has(e.target)) continue;
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
      linkList.push({ source: e.source, target: e.target, type: e.type });
    }
    for (const [id, entity] of visible) {
      const deg = degree.get(id) ?? 0;
      const r = (BASE_R[entity.type] ?? 6) + Math.min(10, Math.sqrt(deg) * 1.6);
      const existing = nodes.current.get(id);
      if (existing) {
        existing.entity = entity;
        existing.r = r;
        existing.degree = deg;
      } else {
        const anchor = edges.find((e) => (e.source === id || e.target === id) && nodes.current.has(e.source === id ? e.target : e.source));
        const near = anchor ? nodes.current.get(anchor.source === id ? anchor.target : anchor.source) : undefined;
        nodes.current.set(id, {
          id,
          entity,
          r,
          degree: deg,
          x: (near?.x ?? 0) + (Math.random() - 0.5) * 40,
          y: (near?.y ?? 0) + (Math.random() - 0.5) * 40,
        });
      }
    }
    links.current = linkList;
    s.nodes([...nodes.current.values()]);
    (s.force("link") as ReturnType<typeof forceLink<SimNode, SimLink>>).links(linkList);
    s.alpha(0.7).restart();
    schedule();
    if (!hasFitted.current && nodes.current.size > 3) {
      hasFitted.current = true;
      setTimeout(fit, 700);
    }
    if (nodes.current.size === 0) hasFitted.current = false;
  }, [entities, edges, hiddenTypes, schedule, fit]);

  useEffect(() => {
    if (fitToken > 0) fit();
  }, [fitToken, fit]);

  useEffect(() => {
    selected.current = selectedId;
    seeds.current = seedIds;
    schedule();
  }, [selectedId, seedIds, schedule]);

  // Size the canvas to its container.
  useEffect(() => {
    const el = wrap.current;
    const c = canvas.current;
    if (!el || !c) return;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = el.clientWidth;
      const h = el.clientHeight;
      size.current = { w, h, dpr };
      c.width = Math.floor(w * dpr);
      c.height = Math.floor(h * dpr);
      view.current = view.current.k === 1 && view.current.x === 0 ? { k: 1, x: w / 2, y: h / 2 } : view.current;
      schedule();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [schedule]);

  const toWorld = (clientX: number, clientY: number) => {
    const rect = canvas.current?.getBoundingClientRect();
    const px = clientX - (rect?.left ?? 0);
    const py = clientY - (rect?.top ?? 0);
    const { x, y, k } = view.current;
    return { px, py, wx: (px - x) / k, wy: (py - y) / k };
  };

  const hit = (wx: number, wy: number): SimNode | null => {
    let best: SimNode | null = null;
    let bestD = Infinity;
    for (const n of nodes.current.values()) {
      if (n.x === undefined || n.y === undefined) continue;
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d <= n.r + 4 / view.current.k && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  };

  // Wheel zoom needs a non passive listener.
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = c.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const { x, y, k } = view.current;
      const nk = Math.min(6, Math.max(0.1, k * Math.exp(-e.deltaY * 0.0015)));
      view.current = { k: nk, x: px - ((px - x) / k) * nk, y: py - ((py - y) / k) * nk };
      schedule();
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, [schedule]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const { wx, wy } = toWorld(e.clientX, e.clientY);
    const n = hit(wx, wy);
    interaction.current = n
      ? { mode: "node", id: n.id, sx: e.clientX, sy: e.clientY, moved: false, vx: 0, vy: 0 }
      : { mode: "pan", sx: e.clientX, sy: e.clientY, moved: false, vx: view.current.x, vy: view.current.y };
    if (n) {
      n.fx = n.x;
      n.fy = n.y;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const it = interaction.current;
    const { px, py, wx, wy } = toWorld(e.clientX, e.clientY);
    if (it.mode === "pan") {
      if (Math.hypot(e.clientX - it.sx, e.clientY - it.sy) > 3) it.moved = true;
      view.current = { ...view.current, x: it.vx + (e.clientX - it.sx), y: it.vy + (e.clientY - it.sy) };
      schedule();
      return;
    }
    if (it.mode === "node" && it.id) {
      if (Math.hypot(e.clientX - it.sx, e.clientY - it.sy) > 3) it.moved = true;
      const n = nodes.current.get(it.id);
      if (n && it.moved) {
        n.fx = wx;
        n.fy = wy;
        sim.current?.alphaTarget(0.25).restart();
      }
      return;
    }
    const n = hit(wx, wy);
    const id = n?.id ?? null;
    if (id !== hover.current) {
      hover.current = id;
      schedule();
    }
    setTooltip(n ? { left: Math.max(4, Math.min(px + 14, size.current.w - 210)), top: py + 14, text: n.entity.label, sub: `${ENTITY_STYLE[n.entity.type].label}${n.degree ? `, ${n.degree} link${n.degree === 1 ? "" : "s"}` : ""}` } : null);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const it = interaction.current;
    if (it.mode === "node" && it.id) {
      const n = nodes.current.get(it.id);
      if (n) {
        n.fx = null;
        n.fy = null;
      }
      sim.current?.alphaTarget(0);
      if (!it.moved) onSelect(it.id);
    } else if (it.mode === "pan" && !it.moved) {
      onSelect(null);
    }
    interaction.current = { mode: "none", sx: 0, sy: 0, moved: false, vx: 0, vy: 0 };
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvas}
        className="absolute inset-0 h-full w-full touch-none cursor-grab active:cursor-grabbing"
        style={{ width: "100%", height: "100%" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => {
          hover.current = null;
          setTooltip(null);
          schedule();
        }}
        role="img"
        aria-label={`Entity graph with ${entities.length} entities and ${edges.length} relationships`}
      />
      {tooltip ? (
        <div className="pointer-events-none absolute z-10 rounded-md border border-line bg-panel2 px-2.5 py-1.5 text-xs shadow-xl" style={{ left: tooltip.left, top: tooltip.top }}>
          <div className="font-medium text-ink">{tooltip.text}</div>
          <div className="text-dim">{tooltip.sub}</div>
        </div>
      ) : null}
    </div>
  );
}
