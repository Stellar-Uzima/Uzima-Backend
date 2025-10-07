import React, { useState } from 'react';
import Recommended from './Recommended';
import Dashboard from './Dashboard';
import { trainModel, allSymptoms, allConditions, encodeSymptoms } from './mlModel';
import { logQueryToBackend } from './queryLogger';

const disclaimer = 'This tool is not a medical professional. For medical advice, consult a qualified healthcare provider.';

function getTop3(preds) {
  return preds
    .map((score, idx) => ({ condition: allConditions[idx], score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export default function App() {
  const [selected, setSelected] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState([]);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    const model = await trainModel();
    const input = encodeSymptoms(selected);
    const preds = model.predict(tf.tensor2d([input])).dataSync();
    const top3 = getTop3(Array.from(preds));
    setSuggestions(top3);
    setLoading(false);
    // Log query (no PII)
    const entry = { timestamp: Date.now(), symptoms: [...selected], suggestions: top3 };
    setLog(l => [...l, entry]);
    localStorage.setItem('ml_query_log', JSON.stringify([...log, entry]));
    logQueryToBackend(entry);
  }

  function handleSymptomChange(symptom) {
    setSelected(sel => sel.includes(symptom) ? sel.filter(s => s !== symptom) : [...sel, symptom]);
  }

  return (
    <div style={{ maxWidth: 1024, margin: '2rem auto', fontFamily: 'sans-serif' }}>
      {/* Recommended for You section (token prop to be replaced with real auth token) */}
      <Recommended token={window.localStorage.getItem('auth_token') || ''} />
      <Dashboard token={window.localStorage.getItem('auth_token') || ''} />
      <h2>Symptom Checker</h2>
      <p style={{ color: 'red', fontWeight: 'bold' }}>{disclaimer}</p>
      <form onSubmit={handleSubmit}>
        <div>
          {allSymptoms.map(symptom => (
            <label key={symptom} style={{ display: 'block', margin: '4px 0' }}>
              <input
                type="checkbox"
                checked={selected.includes(symptom)}
                onChange={() => handleSymptomChange(symptom)}
              />
              {symptom}
            </label>
          ))}
        </div>
        <button type="submit" disabled={loading || selected.length === 0}>
          {loading ? 'Checking...' : 'Get Suggestions'}
        </button>
      </form>
      {suggestions.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3>Top Suggestions</h3>
          <ol>
            {suggestions.map(s => (
              <li key={s.condition}>
                {s.condition} ({(s.score * 100).toFixed(1)}%)
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
