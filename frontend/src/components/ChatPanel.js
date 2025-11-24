import React, { useEffect, useMemo, useRef, useState } from 'react';

const suggestions = [
  'Summary for last 24 hours',
  'How many anomalies by source in last 7 days',
  'List anomalies severity >= 6 in bbox:33,-120,40,-100',
  'Hotspots for anomalies last 24 hours',
  'Trend of anomalies over time',
  'Predict future anomalies',
];

const ChatPanel = ({ apiBase }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(() => {
    try { const raw = sessionStorage.getItem('rtaip_chat'); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  const [streaming, setStreaming] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).slice(2));
  const listRef = useRef(null);
  const [showLatestOnly, setShowLatestOnly] = useState(true);

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

  const send = async (prompt) => {
    const q = (prompt ?? input).trim();
    if (!q) return;
    setInput('');
    const userMsg = { role: 'user', text: q, ts: new Date().toLocaleString() };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true);
  try {
      const res = await fetch(`${apiBase}/api/ai-analyst`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, sessionId })
      });
      const data = await res.json();
      const full = String(data?.output || 'No analysis available.');
      try {
        const preds = data?.predictions_points || [];
        if (Array.isArray(preds) && preds.length > 0) {
          window.dispatchEvent(new CustomEvent('rtaip_predictions', { detail: preds }));
        }
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
      setMessages(prev => [...prev, { role: 'assistant', text: 'Error contacting analyst API.', ts: new Date().toLocaleString() }]);
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