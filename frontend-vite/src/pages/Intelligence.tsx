import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Search, Database, Radio, AlertCircle, RefreshCw } from 'lucide-react';
import { getPipelineStatus, fetchSupabaseEvents } from '../services/data';
import type { RtaEvent } from '../services/data';
import '../styles/osint.css';

type SourceRow = { source: string; count_total: number; count_recent: number; last_ts?: string | null };
type LoadState = 'loading' | 'ready' | 'error';

const retryBtn: CSSProperties = {
  background: 'rgba(255,255,255,.04)', border: '1px solid var(--o-border-2)', color: 'var(--o-text)',
  borderRadius: 7, padding: '3px 10px', fontSize: 12, cursor: 'pointer', marginLeft: 6,
};

// Research & Sources.
// Shows the REAL public-source pipeline: which OSINT connectors are reporting
// and the events they have ingested. No fabricated reports, no classification
// markings — every row is public, authorized data with a source and timestamp,
// per the ethics policy.
export default function Intelligence() {
  const [state, setState] = useState<LoadState>('loading');
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [events, setEvents] = useState<RtaEvent[]>([]);
  const [query, setQuery] = useState('');
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setState('loading');
    (async () => {
      try {
        const [p, ev] = await Promise.all([getPipelineStatus(24 * 365), fetchSupabaseEvents()]);
        if (!alive) return;
        setSources(p?.sources ?? []);
        setEvents(Array.isArray(ev) ? ev : []);
        setState('ready');
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => { alive = false; };
  }, [nonce]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? events.filter((e) => `${e.source} ${e.timestamp} ${JSON.stringify(e.data ?? '')}`.toLowerCase().includes(q))
      : events;
    return list.slice(0, 200);
  }, [events, query]);

  return (
    <div className="osint-wrap">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '2px 0 14px' }}>
        <div>
          <h1 className="osint-page-title">Research &amp; Sources</h1>
          <p className="osint-page-sub">Public-source OSINT feed — every item carries a source and timestamp. No classified or fabricated content.</p>
        </div>
        <button className="osint-btn osint-btn-ghost" onClick={() => setNonce((n) => n + 1)} title="Refresh">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="osint-cols" style={{ gridTemplateColumns: '1fr 1.6fr' }}>
        {/* Source status */}
        <div className="osint-panel">
          <div className="osint-panel-head"><span className="icon"><Radio size={14} /></span> Source status</div>
          <div className="osint-panel-body">
            {state === 'loading' && <div className="osint-empty">Loading sources…</div>}
            {state === 'error' && (
              <div className="osint-empty" style={{ color: 'var(--o-warn)' }}>
                <AlertCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Could not reach the pipeline.
                <button style={retryBtn} onClick={() => setNonce((n) => n + 1)}>Retry</button>
              </div>
            )}
            {state === 'ready' && sources.length === 0 && (
              <div className="osint-empty">No connectors have reported yet. Enable sources in Settings, then run ingestion.</div>
            )}
            {state === 'ready' && sources.map((s) => (
              <div key={s.source} className="osint-tr">
                <span className="osint-sw" style={{ background: s.count_recent > 0 ? 'var(--o-good)' : 'var(--o-faint)' }} />
                <span className="osint-trunc" style={{ flex: 1 }}>{s.source}</span>
                <span className="osint-faint osint-mono" style={{ fontSize: 11 }}>{s.count_recent}/{s.count_total}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent public events */}
        <div className="osint-panel">
          <div className="osint-panel-head"><span className="icon"><Database size={14} /></span> Recent public events</div>
          <div className="osint-cmd" style={{ borderRadius: 0, border: 'none', borderBottom: '1px solid var(--o-border)' }}>
            <span className="lead"><Search size={14} /> Filter</span>
            <input
              className="osint-input osint-mono"
              placeholder="source, keyword…"
              value={query}
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="osint-panel-body" style={{ maxHeight: '64vh', overflowY: 'auto' }}>
            {state === 'loading' && <div className="osint-empty">Loading events…</div>}
            {state === 'error' && (
              <div className="osint-empty" style={{ color: 'var(--o-warn)' }}>
                <AlertCircle size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Failed to load events.
                <button style={retryBtn} onClick={() => setNonce((n) => n + 1)}>Retry</button>
              </div>
            )}
            {state === 'ready' && filtered.length === 0 && (
              <div className="osint-empty">
                {events.length === 0
                  ? 'No events ingested yet. Once connectors run, public events appear here.'
                  : 'No events match this filter.'}
              </div>
            )}
            {state === 'ready' && filtered.map((e) => (
              <div key={e.id} className="osint-tr">
                <span className="osint-chip">{e.source}</span>
                <span className="osint-mono osint-trunc" style={{ flex: 1 }}>
                  {typeof e.data === 'object' && e.data ? JSON.stringify(e.data).slice(0, 120) : String(e.data ?? '')}
                </span>
                <span className="osint-faint osint-mono" style={{ fontSize: 11 }}>{new Date(e.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
