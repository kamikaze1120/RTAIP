import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { enrich, fetchFull, pivot, graphStats } from '../services/graph';
import type { GLink, GNode, GraphData } from '../services/graph';

type SimNode = GNode & { x: number; y: number; vx: number; vy: number; fx?: number | null; fy?: number | null };

const TYPE_COLORS: Record<string, string> = {
  domain: '#38bdf8',
  subdomain: '#22d3ee',
  ip: '#f59e0b',
  cert: '#a78bfa',
  org: '#34d399',
  email: '#f472b6',
  asn: '#fb7185',
  netblock: '#fbbf24',
  url: '#60a5fa',
  hash: '#c084fc',
  event: '#94a3b8',
  location: '#4ade80',
};
const colorFor = (t: string) => TYPE_COLORS[t] || '#94a3b8';
const radiusFor = (n: SimNode) => (n.attrs && (n.attrs as Record<string, unknown>).seed ? 11 : 7);

export default function EntityGraph() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<GLink[]>([]);
  const alphaRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const [, setTick] = useState(0);

  const [seed, setSeed] = useState('example.com');
  const [seedType, setSeedType] = useState('domain');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [stats, setStats] = useState<{ entities: number; relationships: number; by_type: Record<string, number> } | null>(null);
  const [selected, setSelected] = useState<SimNode | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const dragRef = useRef<{ id: number | null; panning: boolean; px: number; py: number }>({ id: null, panning: false, px: 0, py: 0 });

  const step = useCallback(() => {
    const nodes = nodesRef.current;
    const links = linksRef.current;
    const alpha = alphaRef.current;
    if (nodes.length === 0) return;
    const idx = new Map(nodes.map((n, i) => [n.id, i]));

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.01; }
        const d = Math.sqrt(d2);
        const f = (2400 * alpha) / d2;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }
    for (const l of links) {
      const ai = idx.get(l.source); const bi = idx.get(l.target);
      if (ai == null || bi == null) continue;
      const a = nodes[ai]; const b = nodes[bi];
      const dx = b.x - a.x; const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d - 90) * 0.04 * alpha;
      const fx = (dx / d) * f; const fy = (dy / d) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
    for (const n of nodes) {
      n.vx += -n.x * 0.002 * alpha;
      n.vy += -n.y * 0.002 * alpha;
      if (n.fx != null && n.fy != null) { n.x = n.fx; n.y = n.fy; n.vx = 0; n.vy = 0; continue; }
      n.vx *= 0.82; n.vy *= 0.82;
      const sp = Math.hypot(n.vx, n.vy);
      const cap = 30;
      if (sp > cap) { n.vx = (n.vx / sp) * cap; n.vy = (n.vy / sp) * cap; }
      n.x += n.vx; n.y += n.vy;
    }
    alphaRef.current = Math.max(0, alpha - 0.006);
  }, []);

  const loop = useCallback(() => {
    step();
    setTick((t) => (t + 1) % 1000000);
    if (alphaRef.current > 0.005) {
      rafRef.current = requestAnimationFrame(loop);
    } else {
      rafRef.current = null;
    }
  }, [step]);

  const reheat = useCallback(() => {
    alphaRef.current = 1;
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const mergeGraph = useCallback((g: GraphData, anchor?: { x: number; y: number }) => {
    const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
    const cx = anchor?.x ?? 0;
    const cy = anchor?.y ?? 0;
    for (const n of g.nodes || []) {
      const ex = byId.get(n.id);
      if (ex) {
        Object.assign(ex, n);
      } else {
        const ang = Math.random() * Math.PI * 2;
        const rad = 40 + Math.random() * 120;
        const sn: SimNode = { ...n, x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad, vx: 0, vy: 0 };
        byId.set(n.id, sn);
      }
    }
    nodesRef.current = Array.from(byId.values());
    const linkIds = new Set(linksRef.current.map((l) => l.id));
    for (const l of g.links || []) {
      if (!linkIds.has(l.id)) {
        linksRef.current.push(l);
        linkIds.add(l.id);
      }
    }
    reheat();
  }, [reheat]);

  useEffect(() => () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); }, []);

  const refreshStats = useCallback(async () => {
    try { setStats(await graphStats()); } catch { /* ignore */ }
  }, []);

  const loadInitial = useCallback(async () => {
    setInitializing(true);
    setError(null);
    try {
      const g = await fetchFull(400);
      if (g.nodes.length) mergeGraph(g);
      await refreshStats();
      const sp = new URLSearchParams(window.location.search);
      const sv = sp.get("seed");
      const st = sp.get("type");
      const fid = sp.get("focusId");
      if (sv) {
        setSeed(sv);
        if (st) setSeedType(st);
        const res = await enrich(sv, st || "domain");
        mergeGraph(res);
        await refreshStats();
      } else if (fid && /^[0-9]+$/.test(fid)) {
        const pg = await pivot(Number(fid));
        if (pg.nodes.length) mergeGraph(pg);
      }
    } catch (e: unknown) {
      // Surface the failure instead of silently showing "0 entities".
      setError(e instanceof Error ? e.message : 'Could not reach the graph backend. Check that the API is deployed.');
    } finally {
      setInitializing(false);
    }
  }, [mergeGraph, refreshStats]);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  const onEnrich = useCallback(async () => {
    const v = seed.trim();
    if (!v) return;
    setBusy(true); setError(null);
    try {
      const g = await enrich(v, seedType);
      mergeGraph(g);
      await refreshStats();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Enrichment failed');
    } finally { setBusy(false); }
  }, [seed, seedType, mergeGraph, refreshStats]);

  const onPivot = useCallback(async (n: SimNode) => {
    setSelected(n);
    try {
      const g = await pivot(n.id);
      if (g.nodes.length) mergeGraph(g, { x: n.x, y: n.y });
    } catch { /* ignore */ }
  }, [mergeGraph]);

  const toWorld = (sx: number, sy: number) => {
    const v = viewRef.current;
    return { x: (sx - v.x) / v.k, y: (sy - v.y) / v.k };
  };
  const svgPoint = (e: React.PointerEvent | React.WheelEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDownNode = (e: React.PointerEvent, n: SimNode) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragRef.current.id = n.id;
    const p = svgPoint(e); const w = toWorld(p.x, p.y);
    n.fx = w.x; n.fy = w.y; alphaRef.current = Math.max(alphaRef.current, 0.4);
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(loop);
  };
  const onPointerDownBg = (e: React.PointerEvent) => {
    const p = svgPoint(e);
    dragRef.current.panning = true; dragRef.current.px = p.x; dragRef.current.py = p.y;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const p = svgPoint(e);
    if (d.id != null) {
      const n = nodesRef.current.find((x) => x.id === d.id);
      if (n) { const w = toWorld(p.x, p.y); n.fx = w.x; n.fy = w.y; alphaRef.current = Math.max(alphaRef.current, 0.3); if (rafRef.current == null) rafRef.current = requestAnimationFrame(loop); }
    } else if (d.panning) {
      setView((v) => ({ ...v, x: v.x + (p.x - d.px), y: v.y + (p.y - d.py) }));
      d.px = p.x; d.py = p.y;
    }
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    if (d.id != null) {
      const n = nodesRef.current.find((x) => x.id === d.id);
      if (n) { n.fx = null; n.fy = null; }
    }
    d.id = null; d.panning = false;
  };
  const onWheel = (e: React.WheelEvent) => {
    const p = svgPoint(e);
    setView((v) => {
      const k = Math.min(4, Math.max(0.2, v.k * (e.deltaY < 0 ? 1.1 : 0.9)));
      return { k, x: p.x - ((p.x - v.x) / v.k) * k, y: p.y - ((p.y - v.y) / v.k) * k };
    });
  };

  const nodes = nodesRef.current;
  const nodeIndex = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const legend = useMemo(() => Object.keys(TYPE_COLORS), []);

  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', background: '#0b0f17', color: '#e2e8f0' }}>
      <div style={{ display: 'flex', gap: 8, padding: '10px 14px', alignItems: 'center', borderBottom: '1px solid #1e293b', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 15, letterSpacing: 0.5 }}>Entity Graph</strong>
        <span style={{ color: '#64748b', fontSize: 12 }}>OSINT correlation &middot; public sources only</span>
        <div style={{ flex: 1 }} />
        <select value={seedType} onChange={(e) => setSeedType(e.target.value)}
          style={{ background: '#111827', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '6px 8px' }}>
          <option value="domain">domain</option>
          <option value="ip">ip</option>
          <option value="email">email</option>
          <option value="org">org</option>
        </select>
        <input value={seed} onChange={(e) => setSeed(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') onEnrich(); }}
          placeholder="example.com" spellCheck={false}
          style={{ background: '#111827', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 6, padding: '6px 10px', width: 240 }} />
        <button onClick={onEnrich} disabled={busy}
          style={{ background: busy ? '#1e293b' : '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: busy ? 'default' : 'pointer', fontWeight: 600 }}>
          {busy ? 'Enriching...' : 'Enrich'}
        </button>
        <button onClick={() => setView({ x: 0, y: 0, k: 1 })}
          style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid #334155', borderRadius: 6, padding: '7px 12px', cursor: 'pointer' }}>Reset view</button>
      </div>

      {error && (
        <div style={{ background: '#7f1d1d', color: '#fecaca', padding: '6px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1 }}>{error}</span>
          <button onClick={() => (busy ? onEnrich() : loadInitial())}
            style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.25)', borderRadius: 6, padding: '3px 12px', cursor: 'pointer', fontSize: 12 }}>
            Retry
          </button>
        </div>
      )}

      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <svg ref={svgRef} width="100%" height="100%" onPointerDown={onPointerDownBg} onPointerMove={onPointerMove}
          onPointerUp={onPointerUp} onPointerLeave={onPointerUp} onWheel={onWheel}
          style={{ cursor: dragRef.current.panning ? 'grabbing' : 'grab', display: 'block' }}>
          <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
            {linksRef.current.map((l) => {
              const a = nodeIndex.get(l.source); const b = nodeIndex.get(l.target);
              if (!a || !b) return null;
              return <line key={l.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#334155" strokeWidth={1 / view.k + 0.3} opacity={0.7} />;
            })}
            {nodes.map((n) => (
              <g key={n.id} transform={`translate(${n.x},${n.y})`}
                onPointerDown={(e) => onPointerDownNode(e, n)}
                onDoubleClick={() => onPivot(n)}
                onClick={(e) => { e.stopPropagation(); setSelected(n); }}
                style={{ cursor: 'pointer' }}>
                <circle r={radiusFor(n)} fill={colorFor(n.etype)} stroke={selected?.id === n.id ? '#fff' : '#0b0f17'} strokeWidth={selected?.id === n.id ? 2 : 1} />
                {view.k > 0.6 && (
                  <text x={radiusFor(n) + 3} y={4} fontSize={11 / Math.max(0.7, view.k)} fill="#cbd5e1" style={{ pointerEvents: 'none' }}>
                    {n.label.length > 32 ? n.label.slice(0, 31) + '...' : n.label}
                  </text>
                )}
              </g>
            ))}
          </g>
        </svg>

        <div style={{ position: 'absolute', left: 12, bottom: 12, background: 'rgba(15,23,42,0.85)', border: '1px solid #1e293b', borderRadius: 8, padding: '8px 10px', fontSize: 11, maxWidth: 180 }}>
          <div style={{ color: '#94a3b8', marginBottom: 4 }}>Entity types</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {legend.map((t) => (
              <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 9, height: 9, borderRadius: 9, background: colorFor(t) }} />{t}
              </span>
            ))}
          </div>
        </div>

        <div style={{ position: 'absolute', right: 12, top: 12, background: 'rgba(15,23,42,0.85)', border: '1px solid #1e293b', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
          <div><b>{stats?.entities ?? nodes.length}</b> entities</div>
          <div><b>{stats?.relationships ?? linksRef.current.length}</b> relationships</div>
        </div>

        {selected && (
          <div style={{ position: 'absolute', right: 12, bottom: 12, width: 260, background: 'rgba(15,23,42,0.95)', border: '1px solid #1e293b', borderRadius: 8, padding: 12, fontSize: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 10, background: colorFor(selected.etype) }} />
              <b style={{ textTransform: 'uppercase', letterSpacing: 0.5, color: '#94a3b8' }}>{selected.etype}</b>
              <div style={{ flex: 1 }} />
              <span style={{ cursor: 'pointer', color: '#64748b' }} onClick={() => setSelected(null)}>x</span>
            </div>
            <div style={{ wordBreak: 'break-all', marginBottom: 8 }}>{selected.value}</div>
            <div style={{ color: '#64748b', marginBottom: 8 }}>confidence {Math.round((selected.confidence || 0) * 100)}%</div>
            {selected.attrs && (selected.attrs as Record<string, unknown>).lat && (selected.attrs as Record<string, unknown>).lon ? (
              <a href={`/map?focus=${(selected.attrs as Record<string, unknown>).lat},${(selected.attrs as Record<string, unknown>).lon}`} target="_blank" rel="noreferrer" style={{ display: "block", textAlign: "center", marginBottom: 8, color: "#38bdf8", fontSize: 12 }}>View on live map ↗</a>
            ) : null}
            <button onClick={() => onPivot(selected)} style={{ width: '100%', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 0', cursor: 'pointer', fontWeight: 600 }}>
              Expand neighbors
            </button>
          </div>
        )}

        {nodes.length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', textAlign: 'center', pointerEvents: 'none' }}>
            <div>
              {initializing ? (
                <div style={{ fontSize: 14 }}>Loading graph…</div>
              ) : error ? (
                <>
                  <div style={{ fontSize: 15, marginBottom: 6, color: '#fca5a5' }}>Graph backend unavailable</div>
                  <div style={{ fontSize: 12 }}>The enrichment API did not respond. Use <b>Retry</b> above once it is deployed.</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 15, marginBottom: 6 }}>No entities yet</div>
                  <div style={{ fontSize: 12 }}>Enter a domain above and hit <b>Enrich</b> to build the graph from public sources.</div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
