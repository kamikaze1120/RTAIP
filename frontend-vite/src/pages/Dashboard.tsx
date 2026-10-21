import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Share2, Radar, Database, Globe, ArrowRight, Activity } from 'lucide-react';
import { graphStats, fetchFull } from '../services/graph';
import type { GNode } from '../services/graph';
import { getPipelineStatus, getBackendBase } from '../services/data';
import '../styles/osint.css';

type Stats = { entities: number; relationships: number; by_type: Record<string, number> } | null;
type SourceRow = { source: string; count_total: number; count_recent: number; last_ts?: string | null };

const TYPE_COLORS: Record<string, string> = {
  domain: '#38bdf8', subdomain: '#2dd4bf', ip: '#f59e0b', cert: '#a78bfa', org: '#34d399',
  email: '#f472b6', asn: '#fb7185', url: '#60a5fa', breach: '#fca5a5', location: '#4ade80', service: '#c084fc',
};
const colorFor = (t: string) => TYPE_COLORS[t] || '#7c8aa0';

const SEED_TYPES = ['domain', 'ip', 'email', 'org'];
const EXAMPLES = [{ t: 'domain', v: 'example.com' }, { t: 'ip', v: '8.8.8.8' }, { t: 'org', v: 'Cloudflare' }];

export default function Dashboard() {
  const navigate = useNavigate();
  const [seed, setSeed] = useState('');
  const [seedType, setSeedType] = useState('domain');
  const [stats, setStats] = useState<Stats>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [recent, setRecent] = useState<GNode[]>([]);
  const backend = getBackendBase();

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const s = await graphStats(); if (alive) setStats(s); } catch { /* ignore */ }
      try { const g = await fetchFull(12); if (alive) setRecent(g.nodes.slice(0, 9)); } catch { /* ignore */ }
      try { const p = await getPipelineStatus(24); if (alive && p) setSources(p.sources || []); } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, []);

  const recentEvents = useMemo(() => sources.reduce((a, s) => a + (s.count_recent || 0), 0), [sources]);

  const investigate = (v?: string, t?: string) => {
    const value = (v ?? seed).trim();
    const type = t ?? seedType;
    navigate(value ? `/graph?seed=${encodeURIComponent(value)}&type=${encodeURIComponent(type)}` : '/graph');
  };

  return (
    <div className="osint-wrap">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '2px 0 14px' }}>
        <div>
          <h1 className="osint-page-title">Operations</h1>
          <p className="osint-page-sub">Open-source intelligence — correlate public sources into a live entity graph.</p>
        </div>
        <span className="osint-live"><span className="osint-dot" /> Live</span>
      </div>

      {/* Command bar */}
      <div className="osint-cmd">
        <span className="lead"><Search size={15} /> Investigate</span>
        <select className="osint-select" value={seedType} onChange={(e) => setSeedType(e.target.value)}>
          {SEED_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          className="osint-input osint-mono"
          placeholder="domain · ip · email · organization"
          value={seed}
          spellCheck={false}
          onChange={(e) => setSeed(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') investigate(); }}
        />
        <div className="osint-quick">
          {EXAMPLES.map((e) => (
            <button key={e.v} onClick={() => { setSeed(e.v); setSeedType(e.t); investigate(e.v, e.t); }}>{e.v}</button>
          ))}
        </div>
        <button className="osint-btn" onClick={() => investigate()}>Run <ArrowRight size={15} /></button>
      </div>

      {!backend && (
        <div className="osint-tr" style={{ marginTop: 10, color: 'var(--o-warn)', fontSize: 12.5 }}>
          <Activity size={14} /> Backend not configured — set <code className="osint-mono">VITE_BACKEND_URL</code> to stream live data.
        </div>
      )}

      {/* Stat strip */}
      <div className="osint-strip" style={{ marginTop: 14 }}>
        <div className="cell"><span className="k"><Share2 size={12} /> Entities</span><span className="v accent">{stats?.entities ?? 0}</span><span className="s">in graph</span></div>
        <div className="cell"><span className="k"><Share2 size={12} /> Relationships</span><span className="v">{stats?.relationships ?? 0}</span><span className="s">edges mapped</span></div>
        <div className="cell"><span className="k"><Database size={12} /> Sources</span><span className="v">{sources.length || 0}</span><span className="s">connectors</span></div>
        <div className="cell"><span className="k"><Radar size={12} /> Events</span><span className="v">{recentEvents}</span><span className="s">last 24h</span></div>
      </div>

      {/* Panels */}
      <div className="osint-cols" style={{ gridTemplateColumns: '1.35fr 1fr', marginTop: 14 }}>
        <div className="osint-panel">
          <div className="osint-panel-head"><span className="icon"><Share2 size={14} /></span> Recent entities</div>
          <div className="osint-panel-body">
            {recent.length === 0 ? (
              <div className="osint-empty">No entities yet — run an investigation above.</div>
            ) : recent.map((n) => (
              <div key={n.id} className="osint-tr" style={{ cursor: 'pointer' }} onClick={() => navigate(`/graph?focusId=${n.id}`)}>
                <span className="osint-sw" style={{ background: colorFor(n.etype) }} />
                <span className="osint-chip" style={{ color: colorFor(n.etype), borderLeftColor: colorFor(n.etype) }}>{n.etype}</span>
                <span className="osint-mono osint-trunc" style={{ flex: 1 }}>{n.label || n.value}</span>
                <span className="osint-faint osint-mono" style={{ fontSize: 11 }}>{Math.round((n.confidence || 0) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="osint-panel">
          <div className="osint-panel-head"><span className="icon"><Globe size={14} /></span> Source status</div>
          <div className="osint-panel-body">
            {sources.length === 0 ? (
              <div className="osint-empty">No source activity reported.</div>
            ) : sources.slice(0, 9).map((s) => (
              <div key={s.source} className="osint-tr">
                <span className="osint-sw" style={{ background: s.count_recent > 0 ? 'var(--o-good)' : 'var(--o-faint)' }} />
                <span className="osint-trunc" style={{ flex: 1 }}>{s.source}</span>
                <span className="osint-faint osint-mono" style={{ fontSize: 11 }}>{s.count_recent}/{s.count_total}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Entity-type breakdown */}
      {stats && stats.by_type && Object.keys(stats.by_type).length > 0 && (
        <div className="osint-panel" style={{ marginTop: 14 }}>
          <div className="osint-panel-head"><span className="icon"><Database size={14} /></span> Entity types</div>
          <div className="osint-panel-body" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: 14 }}>
            {Object.entries(stats.by_type).sort((a, b) => b[1] - a[1]).map(([t, c]) => (
              <span key={t} className="osint-chip" style={{ color: colorFor(t), borderLeftColor: colorFor(t) }}>{t} · {c}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
