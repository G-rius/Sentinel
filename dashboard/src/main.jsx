import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const sections = [
  ['Risk', 'Risk signals will appear here in a later stage.'],
  ['Events', 'Incoming Sentinel events will appear here.'],
  ['Device', 'Device continuity details will appear here.'],
  ['Location', 'Location context will appear here.'],
  ['Transactions', 'Transaction context will appear here.'],
];

function App() {
  const [status, setStatus] = useState('Checking...');

  useEffect(() => {
    fetch(`${apiUrl}/health`)
      .then((response) => {
        if (!response.ok) throw new Error('Health check failed');
        return response.json();
      })
      .then((payload) => setStatus(payload.status === 'ok' ? 'Connected' : 'Offline'))
      .catch(() => setStatus('Offline'));
  }, []);

  return (
    <main className="shell">
      <header className="header">
        <div>
          <p className="eyebrow">Stage 1 / Foundation</p>
          <h1>Sentinel</h1>
        </div>
        <div className={`status status-${status.toLowerCase()}`}>
          <span className="status-dot" /> Backend: {status}
        </div>
      </header>

      <section className="intro">
        <p className="eyebrow">Operations dashboard</p>
        <h2>Continuity, made visible.</h2>
        <p>Sentinel connects the signals that will help explain identity and transaction risk.</p>
      </section>

      <section className="grid" aria-label="Sentinel dashboard areas">
        {sections.map(([title, description]) => (
          <article className="panel" key={title}>
            <span className="panel-index">0{sections.findIndex(([name]) => name === title) + 1}</span>
            <h3>{title}</h3>
            <p>{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
