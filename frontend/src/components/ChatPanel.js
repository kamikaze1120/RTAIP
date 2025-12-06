import React, { useEffect, useMemo, useRef, useState } from 'react';

const suggestions = [
  'Explain the dashboard numbers using current data',
  'Summarize events by source (last 24 hours)',
  'Are there any anomalies right now?',
  'Which source has the most events?',
  'What is the current threat level and why?',
  'Show top geoclusters by source',
  'Describe the selected data sources and update cadence',
];

const ChatPanel = ({ apiBase, events = [], anomalies = [], filters = {}, sourceCounts = {}, threatScore = null, intelSummary = [] }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(() => {
    try { const raw = sessionStorage.getItem('rtaip_chat'); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [streaming, setStreaming] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).slice(2));
  const listRef = useRef(null);
  const [showLatestOnly, setShowLatestOnly] = useState(true);
  const [ollamaUrl] = useState(() => { try { return localStorage.getItem('rtaip_ollama_url') || process.env.REACT_APP_OLLAMA_URL || ''; } catch { return process.env.REACT_APP_OLLAMA_URL || ''; } });
  const [ollamaModel] = useState(() => { try { return localStorage.getItem('rtaip_ollama_model') || process.env.REACT_APP_OLLAMA_MODEL || 'gemma3'; } catch { return 'gemma3'; } });
  const ctx = useMemo(() => {
    const srcs = Object.entries(sourceCounts).map(([k,v]) => ({ source: k, count: v }));
    return {
      filters,
      counts: { events: events.length, anomalies: anomalies.length },
      sources: srcs,
      threat: threatScore,
      intel: intelSummary,
    };
  }, [events, anomalies, filters, sourceCounts, threatScore, intelSummary]);

  useEffect(() => {
    try { sessionStorage.setItem('rtaip_chat', JSON.stringify(messages)); } catch {}
  }, [messages]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, streaming]);

  const displayedMessages = useMemo(() => {
    if (!showLatestOnly) return messages;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return [messages[i]];
    }
    return [];
  }, [messages, showLatestOnly]);

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `rtaip_chat_${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const exportTXT = () => {
    const text = messages.map(m => `[${m.role}] ${m.ts} - ${m.text}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `rtaip_chat_${Date.now()}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const offlineAnswer = (q) => {
    const lc = q.toLowerCase();
    const lines = [];
    const total = events.length;
    const anoms = anomalies.length;
    const bySrc = events.reduce((acc, e) => { const k=(e.source||'unknown').toLowerCase(); acc[k]=(acc[k]||0)+1; return acc; }, {});
    const topSrc = Object.entries(bySrc).sort((a,b)=>b[1]-a[1])[0];
    if (lc.includes('how many') || lc.includes('count')) {
      lines.push(`Events: ${total}`);
      lines.push(`Anomalies: ${anoms}`);
    }
    if (lc.includes('which source') || lc.includes('most events') || lc.includes('top source')) {
      lines.push(topSrc ? `Top source: ${(topSrc[0]||'UNKNOWN').toUpperCase()} (${topSrc[1]})` : 'No sources active.');
    }
    if (lc.includes('anomal')) {
      lines.push(anoms > 0 ? `Anomalies present: ${anoms}` : 'No anomalies detected.');
    }
    if (lc.includes('threat')) {
      const lvl = threatScore && threatScore.level ? threatScore.level : 'Unknown';
      lines.push(`Threat level: ${lvl}`);
    }
    if (lc.includes('cluster')) {
      const quant = (n) => Math.round(n / 0.5) * 0.5;
      const clusters = events.slice(Math.max(0, events.length - 50)).reduce((acc, e) => {
        if (e.latitude == null || e.longitude == null) return acc;
        const key = `${quant(e.latitude).toFixed(2)},${quant(e.longitude).toFixed(2)}`;
        acc[key] = (acc[key]||0)+1; return acc;
      }, {});
      const top = Object.entries(clusters).sort((a,b)=>b[1]-a[1]).slice(0,3);
      if (top.length === 0) lines.push('No geoclusters identified.');
      else top.forEach(([k,v]) => lines.push(`Cluster ${k}: ${v}`));
    }
    if (lines.length === 0) {
      lines.push(`Events: ${total}`);
      lines.push(`Anomalies: ${anoms}`);
      Object.entries(bySrc).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>lines.push(`${(k||'UNKNOWN').toUpperCase()}: ${v}`));
    }
    return lines.join('\n');
  };

  const send = async (prompt) => {
    const q = (prompt ?? input).trim();
    if (!q) return;
    setInput('');
    const userMsg = { role: 'user', text: q, ts: new Date().toLocaleString() };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
  try {
      let full = '';
      if (ollamaUrl) {
        try {
          const base = String(ollamaUrl).replace(/\/+$/, '');
          const chatUrl = base.endsWith('/api') ? `${base}/chat` : `${base}/api/chat`;
          const genUrl = base.endsWith('/api') ? `${base}/generate` : `${base}/api/generate`;
          const res = await fetch(chatUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: ollamaModel, messages: [
              { role: 'system', content: 'You are an intelligence analyst for RTAIP. Use provided context and data.' },
              { role: 'user', content: q + '\n\nContext:\n' + JSON.stringify(ctx) }
            ], stream: false })
          });
          if (res.ok) {
            const jd = await res.json();
            const txt = String(jd?.message?.content || jd?.response || '').trim();
            if (txt.length > 0) full = txt;
          }
          if (!full) {
            const res2 = await fetch(genUrl, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model: ollamaModel, prompt: q + '\n\nContext:\n' + JSON.stringify(ctx) })
            });
            if (res2.ok) {
              const jd2 = await res2.json();
              const txt2 = String(jd2?.response || '').trim();
              if (txt2.length > 0) full = txt2;
            }
          }
        } catch {}
      }
      if (!full) {
        const offline = typeof navigator !== 'undefined' && navigator && navigator.onLine === false;
        if (offline) {
          const msg = offlineAnswer(q);
          let acc = '';
          const tokens = msg.split(/(\s+)/);
          for (let i = 0; i < tokens.length; i++) {
            acc += tokens[i];
            await new Promise(r => setTimeout(r, 10));
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last && last.role === 'assistant' && last.streaming) {
                const copy = [...prev];
                copy[copy.length - 1] = { ...last, text: acc };
                return copy;
              }
              return [...prev, { role: 'assistant', text: acc, ts: new Date().toLocaleString(), streaming: true }];
            });
          }
          return;
        }
        const ctl = new AbortController();
        const to = setTimeout(() => { try { ctl.abort(); } catch {} }, 12000);
        const res = await fetch(`${apiBase}/api/ai-analyst`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, sessionId, context: ctx }), signal: ctl.signal
        });
        clearTimeout(to);
        const data = await res.json();
        const fullRaw = String(data?.output || '').trim();
        full = fullRaw.length > 0 ? fullRaw : offlineAnswer(q);
        try {
          const preds = data?.predictions_points || [];
          if (Array.isArray(preds) && preds.length > 0) {
            window.dispatchEvent(new CustomEvent('rtaip_predictions', { detail: preds }));
          }
        } catch {}
      }
      try {
        const p = [];
      } catch {}
      let acc = '';
      const tokens = full.split(/(\s+)/);
      for (let i = 0; i < tokens.length; i++) {
        acc += tokens[i];
        await new Promise(r => setTimeout(r, 10));
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            const copy = [...prev];
            copy[copy.length - 1] = { ...last, text: acc };
            return copy;
          }
          return [...prev, { role: 'assistant', text: acc, ts: new Date().toLocaleString(), streaming: true }];
        });
      }
    } catch (e) {
      const msg = offlineAnswer(q);
      setMessages(prev => [...prev, { role: 'assistant', text: msg, ts: new Date().toLocaleString() }]);
    } finally {
      setStreaming(false);
      setMessages(prev => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        if (last && last.role === 'assistant') copy[copy.length - 1] = { ...last, streaming: false };
        return copy;
      });
    }
  };

  useEffect(() => {
    const h = (e) => {
      const q = (e && e.detail) || '';
      if (q) send(q);
    };
    window.addEventListener('rtaip_query', h);
    return () => window.removeEventListener('rtaip_query', h);
  }, []);

  return (
    <div className="tactical-panel" style={{ height: '100%' }}>
      <div className="panel-header" style={{ justifyContent: 'space-between' }}>
        <div style={{ color: 'var(--accent)' }}>RTAIP Analyst</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`button-tactical ${showLatestOnly ? 'active' : ''}`} onClick={() => setShowLatestOnly(v => !v)}>{showLatestOnly ? 'Latest' : 'History'}</button>
          <button className="button-tactical" onClick={exportTXT}>Export TXT</button>
          <button className="button-tactical" onClick={exportJSON}>Export JSON</button>
        </div>
      </div>
      <div className="p-2" style={{ height: 'calc(100% - 42px)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
          {suggestions.map(s => (
            <button key={s} className="button-tactical" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
        <div ref={listRef} style={{ flex: 1, overflowY: 'auto', border: '1px solid rgba(0,255,198,0.12)', borderRadius: 6, padding: 8 }}>
          {displayedMessages.length === 0 && <div style={{ opacity: 0.7 }}>Ask a question to the analyst…</div>}
          {displayedMessages.map((m, idx) => (
            <div key={idx} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, opacity: 0.65 }}>{m.ts} • {m.role.toUpperCase()}</div>
              <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder="Type your question…" className="button-tactical" style={{ flex: 1 }} />
          <button className="button-tactical" onClick={() => send()} disabled={streaming}>Send</button>
          <button className="button-tactical" onClick={() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }}>Scroll Latest</button>
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;