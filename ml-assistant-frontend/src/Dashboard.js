import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
  Brush,
  ScatterChart,
  Scatter,
  ZAxis
} from 'recharts';

function useVitalsMetrics({ from, to, bucket, token, patientId }) {
  const [data, setData] = useState({ series: [], heatmap: [], bucket, range: { from, to } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (bucket) params.set('bucket', bucket);
    if (patientId) params.set('patientId', patientId);
    fetch(`/api/metrics/vitals?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((e) => !cancelled && setError(e))
      .finally(() => !cancelled && setLoading(false));
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
  const { data, loading } = useVitalsMetrics({ ...range, bucket, token, patientId });

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

      <div style={{ width: '100%', height: 300, marginTop: 16 }}>
        <ResponsiveContainer>
          <LineChart data={series} role="img" aria-label="Average Heart Rate Over Time">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="avgHeartRate" name="Heart Rate" stroke="#0ea5e9" dot={false} yAxisId="left" />
            <Line type="monotone" dataKey="avgSpo2" name="SpO2" stroke="#10b981" dot={false} yAxisId="right" />
            <Brush height={20} travellerWidth={8} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ width: '100%', height: 300, marginTop: 24 }}>
        <ResponsiveContainer>
          <BarChart data={series} role="img" aria-label="Average Blood Pressure">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="bucket" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="avgSystolic" name="Systolic" fill="#f59e0b" />
            <Bar dataKey="avgDiastolic" name="Diastolic" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ width: '100%', height: 320, marginTop: 24 }}>
        <ResponsiveContainer>
          <ScatterChart role="img" aria-label="Heart Rate Heatmap by Day/Hour">
            <XAxis type="number" dataKey="hour" name="Hour" domain={[0,23]} tickCount={24} />
            <YAxis type="number" dataKey="dow" name="Day of Week" domain={[1,7]} tickCount={7} />
            <ZAxis type="number" dataKey="avgHeartRate" range={[60, 400]} name="Avg HR" />
            <Tooltip cursor={{ strokeDasharray: '3 3' }} />
            <Scatter data={heat} fill="#6366f1" />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {loading && <div role="status" aria-live="polite">Loading metrics…</div>}
    </section>
  );
}


