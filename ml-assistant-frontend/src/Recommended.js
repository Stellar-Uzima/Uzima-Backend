// React component for "Recommended for You" section
import React, { useEffect, useState } from 'react';

function Recommended({ token }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [optOut, setOptOut] = useState(false);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    
    let cancelled = false;
    setLoading(true);
    
    fetch('http://localhost:3000/api/recommendations', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) {
          return { recommendations: [], optOut: false };
        }
        return res.json();
      })
      .then(data => {
        if (!cancelled) {
          setArticles(data.recommendations || []);
          setOptOut(data.optOut);
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.warn('Recommendations fetch failed:', err.message);
          setArticles([]);
          setOptOut(false);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    
    return () => { cancelled = true; };
  }, [token]);

  if (loading) return <div>Loading recommendations...</div>;
  if (optOut) return <div>You have opted out of personalized recommendations.</div>;
  if (!articles.length) return <div>No recommendations at this time.</div>;

  return (
    <div>
      <h3>Recommended for You</h3>
      <ul>
        {articles.map(article => (
          <li key={article._id}>
            <a href={article.url} target="_blank" rel="noopener noreferrer">{article.title}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Recommended;
