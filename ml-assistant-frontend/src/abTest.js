// Simple A/B test assignment and CTR logging for frontend
export function getAbGroup(userId) {
  return (userId.charCodeAt(0) % 2 === 0) ? 'A' : 'B';
}

export function logClick(articleId, group, token) {
  fetch('/api/recommendations/abtest/click', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({ articleId, group })
  });
}
