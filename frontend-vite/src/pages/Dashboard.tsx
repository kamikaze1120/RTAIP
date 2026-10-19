import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { graphStats, fetchFull } from '../services/graph';
import type { GNode } from '../services/graph';
import { getPipelineStatus, getBackendBase } from '../services/data';
import '../styles/osint.css';

type Stats = { entities: number; relationships: number; by_type: Record<string, number> } | null;
type SourceRow = { source: string; count_total: number; count_recent: number; last_ts?: string | null };

const TYPE_COLORS: Record<string, string> = {
  domain: '#38bdf8', subdomain: '#22d3ee', ip: '#f59e0b', cert: '#a78bfa', org: '#34d399',
  email: '#f472b6', asn: '#fb7185', url: '#60a5fa', breach: '#fca5a5', location: '#4ade80', service: '#c084fc',
};
const colorFor = (t: string) => TYPE_COLORS[t] || '#94a3b8';

const SEED_TYPES = ['domain', 'ip', 'email', 'org'];
const EXAMPLES = [
  { t: 'domain', v: 'example.com' },
  { t: 'ip', v: '8.8.8.8' },
  { t: 'org', v: 'OpenAI' },
];

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
      try { const g = await fetchFull(12); if (alive) setRecent(g.nodes.slice(0, 8)); } catch { /* ignore */ }
      try { const p = await getPipelineStatus(24); if (alive && p) setSources(p.sources || []); } catch { /* ignore */ }
    })();
    return () => { alive = false; };
  }, []);

  const recentEvents = useMemo(() => sources.reduce((a, s) => a + (s.count_recent || 0), 0), [sources]);

  const investigate = (v?: string, t?: string) => {
    const value = (v ?? seed).trim();
    const type = t ?? seedType;
    if (!value) { navigate('/graph'); return; }
    navigate(`/graph?seed=${encodeURIComponent(value)}&type=${encodeURIComponent(type)}`);
  };

  const Stat = ({ k, v, s, accent }: { k: string; v: ReactNode; s?: string; accent?: boolean }) => (
    <div className="osint-card osint-stat">
      <div className="k">{k}</div>
      <div className={'v' + (accent ? ' accent' : '')}>{v}</div>
      {s && <div className="s">{s}</div>}
    </div>
  );

  return (
    <div className="osint-wrap" style={{ paddingTop: 20 }}>
      <section className="osint-hero">
        <h1>Open-Source Intelligence Console</h1>
        <p>Start an investigation from a single seed — a domain, IP, email, or organization. RTAIP correlates public sources into a live entity graph.</p>
        <div className="osint-searchbar">
          <select className="osint-select" value={seedType} onChange={(e) => setSeedType(e.target.value)}>
            {SEED_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            className="osint-input"
            placeholder="example.com  ·  8.8.8.8  ·  name@domain  ·  Acme Corp"
            value={seed}
            spellCheck={false}
            onChange={(e) => setSeed(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') investigate(); }}
          />
          <button className="osint-btn" onClick={() => investigate()}>Investigate →</button>
        </div>
        <div className="osint-quick">
          <span className="osint-faint" style={{ alignSelf: 'center', fontSize: 12 }}>Try:</span>
          {EXAMPLES.map((e) => (
            <button key={e.v} onClick={() => { setSeed(e.v); setSeedType(e.t); investigate(e.v, e.t); }}>{e.v}</button>
          ))}
        </div>
      </section>

      <section className="osint-stats" style={{ marginTop: 18 }}>
        <Stat k="Entities" v={stats?.entities ?? 0} accent s="in the graph" />
        <Stat k="Relationships" v={stats?.relationships ?? 0} s="edges mapped" />
        <Stat k="Sources" v={sources.length || 0} s="connectors active" />
        <Stat k="Recent events" v={recentEvents} s="last 24h" />
      </section>

      {!backend && (
        <div className="osint-card osint-card-pad" style={{ marginTop: 16, borderColor: 'var(--o-warn)' }}>
          <strong style={{ color: 'var(--o-warn)' }}>Backend not configured.</strong>{' '}
          <span className="osint-muted">Set <code className="osint-mono">VITE_BACKEND_URL</code> so the console can reach the RTAIP API. Investigations and live data appear once connected.</span>
        </div>
      )}

      <section className="osint-grid" style={{ gridTemplateColumns: '1.2fr 1fr', marginTop: 18 }}>
        <div className="osint-card osint-card-pad">
          <div className="osint-section-title">Recent entities</div>
          {recent.length === 0 ? (
            <div className="osint-empty">No entities yet — run an investigation above.</div>
          ) : (
            <div>
              {recent.map((n) => (
                <div
                  key={n.id}
                  className="osint-row"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/graph?focusId=${n.id}`)}
                >
                  <span style={{ width: 9, height: 9, borderRadius: 9, background: colorFor(n.etype) }} />
                  <span className="osint-chip">{n.etype}</span>
                  <span className="osint-mono" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.label || n.value}</span>
                  <span className="osint-spacer" />
                  <span className="osint-faint" style={{ fontSize: 11 }}>{Math.round((n.confidence || 0) * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="osint-card osint-card-pad">
          <div className="osint-section-title">Source status</div>
          {sources.length === 0 ? (
            <div className="osint-empty">No source activity reported.</div>
          ) : (
            <div>
              {sources.slice(0, 8).map((s) => (
                <div key={s.source} className="osint-row">
                  <span style={{ width: 8, height: 8, borderRadius: 8, background: s.count_recent > 0 ? 'var(--o-good)' : 'var(--o-faint)' }} />
                  <span style={{ fontSize: 13 }}>{s.source}</span>
                  <span className="osint-spacer" />
                  <span className="osint-faint osint-mono" style={{ fontSize: 11 }}>{s.count_recent}/{s.count_total}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {stats && stats.by_type && Object.keys(stats.by_type).length > 0 && (
        <section className="osint-card osint-card-pad" style={{ marginTop: 18 }}>
          <div className="osint-section-title">Entity types</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {Object.entries(stats.by_type).sort((a, b) => b[1] - a[1]).map(([t, c]) => (
              <span key={t} className="osint-chip" style={{ color: colorFor(t), borderLeft: `3px solid ${colorFor(t)}` }}>
                {t} · {c}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
