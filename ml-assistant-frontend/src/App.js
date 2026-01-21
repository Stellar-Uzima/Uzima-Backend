import React, { useState, useEffect } from 'react';
import Auth from './Auth';
import Recommended from './Recommended';
import Dashboard from './Dashboard';
import PrescriptionVerification from './PrescriptionVerification';
import PrescriptionAuditLogs from './PrescriptionAuditLogs';
import { logQueryToBackend } from './queryLogger';

// Import ML model - will work if TensorFlow is installed, otherwise symptom checker will be disabled
import { trainModel, allSymptoms, allConditions, encodeSymptoms } from './mlModel';

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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState('');

  // Check authentication status on mount and when localStorage changes
  useEffect(() => {
    const token = localStorage.getItem('auth_token') || '';
    setAuthToken(token);
    setIsAuthenticated(!!token);
  }, []);

  const handleAuthChange = (authenticated) => {
    setIsAuthenticated(authenticated);
    const token = localStorage.getItem('auth_token') || '';
    setAuthToken(token);
    // Force re-render of components that depend on token
    window.dispatchEvent(new Event('auth-change'));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    if (!allSymptoms || allSymptoms.length === 0) {
      alert('ML model not available. Please install @tensorflow/tfjs');
      return;
    }
    setLoading(true);
    try {
      const model = await trainModel();
      const input = encodeSymptoms(selected);
      // Check if tf is available
      if (typeof window !== 'undefined' && window.tf) {
        const preds = model.predict(window.tf.tensor2d([input])).dataSync();
        const top3 = getTop3(Array.from(preds));
        setSuggestions(top3);
        const entry = { timestamp: Date.now(), symptoms: [...selected], suggestions: top3 };
        setLog(l => [...l, entry]);
        localStorage.setItem('ml_query_log', JSON.stringify([...log, entry]));
        logQueryToBackend(entry);
      } else {
        alert('TensorFlow.js not loaded. ML features unavailable.');
      }
    } catch (err) {
      console.error('ML model error:', err);
      alert('Error using ML model: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSymptomChange(symptom) {
    setSelected(sel => sel.includes(symptom) ? sel.filter(s => s !== symptom) : [...sel, symptom]);
  }

  return (
    <div style={{ maxWidth: 1024, margin: '2rem auto', fontFamily: 'sans-serif', padding: '20px' }}>
      {/* Authentication Component */}
      <Auth onAuthChange={handleAuthChange} />
      
      {/* Recommended for You section */}
      <Recommended token={authToken} />
      
      {/* Health Data Dashboard */}
      <Dashboard token={authToken} />
      
      {/* Prescription Verification System */}
      <PrescriptionVerification />
      
      {/* Prescription Audit Logs */}
      <PrescriptionAuditLogs />
      
      {/* Symptom Checker - Only show if ML model is available */}
      {allSymptoms && allSymptoms.length > 0 && (
        <>
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
        </>
      )}
    </div>
  );
}
