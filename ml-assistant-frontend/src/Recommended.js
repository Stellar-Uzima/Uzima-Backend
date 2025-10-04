// React component for "Recommended for You" section
import React, { useEffect, useState } from 'react';

function Recommended({ token }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [optOut, setOptOut] = useState(false);

  useEffect(() => {
    fetch('/api/recommendations', {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        setArticles(data.recommendations || []);
        setOptOut(data.optOut);
        setLoading(false);
      });
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
