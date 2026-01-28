// Utility to log queries to backend
export async function logQueryToBackend({ symptoms, suggestions, timestamp }) {
  try {
    await fetch('/api/query-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symptoms, suggestions, timestamp }),
    });
  } catch (e) {
    // Silently fail, do not block UI
  }
}
