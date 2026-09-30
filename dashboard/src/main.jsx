import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { io } from 'socket.io-client';
import './styles.css';

const apiUrl = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const simulators = [
  ['SIM_REPLACEMENT', 'SIM replacement', 'SIM'],
  ['DEVICE_CHANGED', 'Device change', 'DEV'],
  ['NEW_RECIPIENT', 'New recipient', 'PAY'],
  ['LOCATION_UPDATE', 'New location', 'LOC'],
  ['SECURITY_CHANGE', 'Security change', 'SEC'],
];

async function api(path, options) {
  const response = await fetch(`${apiUrl}${path}`, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `Request failed (${response.status})`);
  return payload;
}

function dateTime(value) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }).format(new Date(value));
}

function deltaText(value) {
  return `${value > 0 ? '+' : ''}${value}`;
}

function App() {
  const [backend, setBackend] = useState('Checking');
  const [realtime, setRealtime] = useState('Connecting');
  const [trust, setTrust] = useState(null);
  const [events, setEvents] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [busy, setBusy] = useState('');
  const [amount, setAmount] = useState('24000');
  const [recipient, setRecipient] = useState('New recipient');
  const [error, setError] = useState('');

  async function refreshDashboard() {
    try {
      const health = await api('/health');
      setBackend(health.status === 'ok' ? 'Connected' : 'Offline');
      const [trustData, eventData, transactionData] = await Promise.all([
        api('/users/demo-user/trust'),
        api('/users/demo-user/events?limit=30'),
        api('/transactions?userId=demo-user'),
      ]);
      setTrust(trustData);
      setEvents(eventData);
      setTransactions(transactionData);
      setError('');
    } catch (requestError) {
      setBackend('Offline');
      setError(requestError.message);
    }
  }

  useEffect(() => {
    refreshDashboard();
    const socket = io(apiUrl);
    socket.on('connect', () => setRealtime('Live'));
    socket.on('disconnect', () => setRealtime('Reconnecting'));
    socket.on('trustUpdated', (update) => {
      setTrust((current) => ({ ...current, trustScore: update.trustScore, action: update.action }));
      refreshDashboard();
    });
    return () => socket.disconnect();
  }, []);

  async function simulate(type) {
    setBusy(type);
    setError('');
    try {
      await api('/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, userId: 'demo-user' }),
      });
      await refreshDashboard();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  }

  async function sendTransaction(event) {
    event.preventDefault();
    setBusy('transaction');
    setError('');
    try {
      await api('/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount), recipient, userId: 'demo-user' }),
      });
      await refreshDashboard();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy('');
    }
  }

  const score = trust?.trustScore ?? 0;
  const latest = events[0];
  const trustHistory = events.slice().reverse().map((item) => ({
    time: new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    trust: item.resultingTrust,
  }));

  return (
    <main className="shell">
      <header className="masthead">
        <div className="brand-lockup"><span className="brand-mark">S</span><div><p className="eyebrow">Trust operations / Stage 2</p><h1>Sentinel</h1></div></div>
        <div className="connection-group">
          <span className={`connection status-${backend.toLowerCase()}`}><i /> Backend: {backend}</span>
          <span className={`connection status-${realtime.toLowerCase()}`}><i /> Updates: {realtime}</span>
        </div>
      </header>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <section className="overview" aria-label="Trust overview">
        <div className="trust-panel">
          <div className="section-caption"><span>DEMO USER / TRUST</span><span>LIVE</span></div>
          <div className="trust-content">
            <div className="trust-meter" style={{ '--score': `${score}%` }}><div><strong>{trust ? score : '—'}</strong><span>TRUST</span></div></div>
            <div className="trust-copy"><p className="eyebrow">Current trust</p><h2>{trust?.action || 'Loading'}</h2><p>Score recalculated from the persisted event history.</p></div>
          </div>
          <div className="meter-scale"><span>0 / BLOCK</span><span>40 / STEP-UP</span><span>70 / ALLOW</span></div>
        </div>
        <div className="latest-panel">
          <div className="section-caption"><span>LATEST EVENT</span><span>{latest ? dateTime(latest.timestamp) : 'NO EVENTS'}</span></div>
          {latest ? <><p className="event-name">{latest.type}</p><div className="event-result"><span>Risk delta <b className={latest.riskDelta < 0 ? 'negative' : 'positive'}>{deltaText(latest.riskDelta)}</b></span><span>Trust after <b>{latest.resultingTrust}</b></span></div></> : <p className="empty-copy">No events recorded yet.</p>}
          <div className={`decision-chip decision-${(latest?.action || trust?.action || 'ALLOW').toLowerCase()}`}>{latest?.action || trust?.action || '—'}</div>
        </div>
      </section>

      <section className="workbench">
        <section className="timeline-panel" aria-labelledby="timeline-title">
          <div className="panel-heading"><div><p className="eyebrow">AUDIT TRAIL</p><h2 id="timeline-title">Event timeline</h2></div><span>{events.length} RECORDS</span></div>
          <div className="chart-block"><div className="chart-title">Trust history <span>0–100</span></div>{trustHistory.length ? <div className="trust-chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={trustHistory} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}><defs><linearGradient id="trustFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#43866a" stopOpacity={0.28} /><stop offset="100%" stopColor="#43866a" stopOpacity={0.02} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#e0e8e1" /><XAxis dataKey="time" tickLine={false} axisLine={false} tick={{ fill: '#75857d', fontSize: 10 }} /><YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickLine={false} axisLine={false} tick={{ fill: '#75857d', fontSize: 10 }} /><Tooltip contentStyle={{ border: '1px solid #d3ddd4', borderRadius: 0, fontSize: 12 }} formatter={(value) => [`${value}`, 'Trust']} /><Area type="monotone" dataKey="trust" stroke="#287452" fill="url(#trustFill)" strokeWidth={2} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div> : <p className="chart-empty">No trust history recorded.</p>}</div>
          {events.length ? <ol className="timeline">{events.map((item) => <li className="timeline-entry" key={item.id}>
            <time>{dateTime(item.timestamp)}</time><span className={`event-marker marker-${item.action.toLowerCase()}`} />
            <div className="timeline-detail"><div><strong>{item.type}</strong><span>{item.device?.model || 'Unknown device'}</span></div><div className="timeline-outcome"><b className={item.riskDelta < 0 ? 'negative' : 'positive'}>{deltaText(item.riskDelta)}</b><span>Trust {item.resultingTrust}</span><em className={`decision-${item.action.toLowerCase()}`}>{item.action}</em></div></div>
          </li>)}</ol> : <p className="empty-copy">The audit trail will appear here as events arrive.</p>}
        </section>

        <aside className="control-column">
          <section className="simulator-panel" aria-labelledby="simulator-title">
            <div className="panel-heading"><div><p className="eyebrow">REAL API REQUESTS</p><h2 id="simulator-title">Event simulator</h2></div></div>
            <div className="simulator-list">{simulators.map(([type, label, mark]) => <button className="simulator-button" key={type} onClick={() => simulate(type)} disabled={Boolean(busy)}><span>{mark}</span><b>{label}</b><i>{busy === type ? '…' : '+'}</i></button>)}</div>
          </section>

          <section className="transaction-panel" aria-labelledby="transaction-title">
            <div className="panel-heading"><div><p className="eyebrow">TRUST-GATED PAYMENT</p><h2 id="transaction-title">Try a transfer</h2></div></div>
            <form onSubmit={sendTransaction}>
              <label>Amount (KSh)<input type="number" min="1" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} required /></label>
              <label>Recipient<input value={recipient} onChange={(event) => setRecipient(event.target.value)} required /></label>
              <button className="submit-button" disabled={Boolean(busy)}>{busy === 'transaction' ? 'Evaluating…' : 'Evaluate transfer'}</button>
            </form>
            <div className="transaction-list">{transactions.slice(0, 3).map((item) => <div className="transaction-row" key={item.id}><span>KSh {Number(item.amount).toLocaleString()}</span><b className={`decision-${item.status.toLowerCase()}`}>{item.status.replace('_', ' ')}</b></div>)}</div>
          </section>
        </aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
