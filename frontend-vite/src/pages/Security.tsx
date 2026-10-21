import { useEffect, useState } from 'react';
import api from '../services/api';
import '../styles/osint.css';

interface AuditLog {
  timestamp: string;
  event: string;
  user: string;
  details: object;
}

export default function Security() {
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get('/audit');
        setAuditLogs(Array.isArray(response.data) ? response.data : []);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  return (
    <div className="osint-wrap">
      <div style={{ margin: '2px 0 14px' }}>
        <h1 className="osint-page-title">Security &amp; Audit</h1>
        <p className="osint-page-sub">Tamper-evident audit trail of platform activity. No sign-in required.</p>
      </div>

      <div className="osint-panel">
        <div className="osint-panel-head">Audit Log</div>
        <div className="osint-panel-body" style={{ overflowX: 'auto', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--o-faint)', textTransform: 'uppercase', fontSize: 11, letterSpacing: 1 }}>
                <th style={{ padding: '10px 14px' }}>Timestamp</th>
                <th style={{ padding: '10px 14px' }}>Event</th>
                <th style={{ padding: '10px 14px' }}>User</th>
                <th style={{ padding: '10px 14px' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.length > 0 ? (
                auditLogs.map((log, index) => (
                  <tr key={index} style={{ borderTop: '1px solid var(--o-border)' }}>
                    <td className="osint-mono" style={{ padding: '10px 14px', color: 'var(--o-muted)' }}>{new Date(log.timestamp).toLocaleString()}</td>
                    <td style={{ padding: '10px 14px' }}>{log.event}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--o-muted)' }}>{log.user}</td>
                    <td className="osint-mono" style={{ padding: '10px 14px', color: 'var(--o-faint)', fontSize: 11 }}>{JSON.stringify(log.details)}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={4} className="osint-empty">No audit logs found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
