import React, { useEffect, useMemo, useState } from 'react';

// Recharts is optional - conditionally render dashboard
let hasRecharts = false;
let RechartsComponents = {};

// Try to dynamically import recharts if available
if (typeof window !== 'undefined') {
  // Will be set if recharts is available
  window.__rechartsAvailable = false;
}

function useVitalsMetrics({ from, to, bucket, token, patientId }) {
  const [data, setData] = useState({ series: [], heatmap: [], bucket, range: { from, to } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    
    let cancelled = false;
    setLoading(true);
    setError(null);
    
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (bucket) params.set('bucket', bucket);
    if (patientId) params.set('patientId', patientId);
    
    fetch(`http://localhost:3000/api/metrics/vitals?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        }
        const contentType = r.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Response is not JSON');
        }
        return r.json();
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e);
          console.warn('Dashboard metrics fetch failed:', e.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [from, to, bucket, token, patientId]);

  return { data, loading, error };
}

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export default function Dashboard({ token, patientId }) {
  const [range, setRange] = useState({ from: isoDaysAgo(365), to: new Date().toISOString() });
  const [bucket, setBucket] = useState('day');
  const { data, loading, error } = useVitalsMetrics({ ...range, bucket, token, patientId });

  const series = useMemo(() => (data.series || []).map(p => ({
    bucket: p._id || p.bucket || 'n/a',
    avgHeartRate: p.avgHeartRate,
    avgSystolic: p.avgSystolic,
    avgDiastolic: p.avgDiastolic,
    avgTemperatureC: p.avgTemperatureC,
    avgSpo2: p.avgSpo2,
    avgRespiratoryRate: p.avgRespiratoryRate,
    count: p.count
  })), [data]);

  const heat = useMemo(() => (data.heatmap || []).map(c => ({
    dow: (c._id?.dow ?? c.dow),
    hour: (c._id?.hour ?? c.hour),
    avgHeartRate: c.avgHeartRate,
    count: c.count
  })), [data]);

  // Simple dashboard without charts if recharts is not available
  return (
    <section aria-label="Vitals Dashboard" style={{ padding: 16 }}>
      <header style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Health Data Dashboard</h2>
        <label>
          <span className="sr-only">Bucket size</span>
          <select aria-label="Bucket size" value={bucket} onChange={e => setBucket(e.target.value)}>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </label>
        <label>
          <span className="sr-only">From date</span>
          <input aria-label="From date" type="date" value={range.from.slice(0,10)} onChange={e => setRange(r => ({ ...r, from: new Date(e.target.value).toISOString() }))} />
        </label>
        <label>
          <span className="sr-only">To date</span>
          <input aria-label="To date" type="date" value={range.to.slice(0,10)} onChange={e => setRange(r => ({ ...r, to: new Date(e.target.value).toISOString() }))} />
        </label>
      </header>

      {/* Simple table view instead of charts */}
      <div style={{ marginTop: 16 }}>
        <h3>Vitals Data</h3>
        {series.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Period</th>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Heart Rate</th>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>SpO2</th>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Systolic</th>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Diastolic</th>
                <th style={{ border: '1px solid #ddd', padding: '8px' }}>Count</th>
              </tr>
            </thead>
            <tbody>
              {series.slice(0, 10).map((item, idx) => (
                <tr key={idx}>
                  <td style={{ border: '1px solid #ddd', padding: '8px' }}>{item.bucket}</td>
                  <td style={{ border: '1px solid #ddd', padding: '8px' }}>{item.avgHeartRate?.toFixed(1) || 'N/A'}</td>
                  <td style={{ border: '1px solid #ddd', padding: '8px' }}>{item.avgSpo2?.toFixed(1) || 'N/A'}</td>
                  <td style={{ border: '1px solid #ddd', padding: '8px' }}>{item.avgSystolic?.toFixed(1) || 'N/A'}</td>
                  <td style={{ border: '1px solid #ddd', padding: '8px' }}>{item.avgDiastolic?.toFixed(1) || 'N/A'}</td>
                  <td style={{ border: '1px solid #ddd', padding: '8px' }}>{item.count || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p>No data available for the selected period.</p>
        )}
      </div>

      {loading && <div role="status" aria-live="polite">Loading metrics…</div>}
      {error && <div style={{ color: 'red' }}>Error loading metrics: {error.message || String(error)}</div>}
    </section>
  );
}
