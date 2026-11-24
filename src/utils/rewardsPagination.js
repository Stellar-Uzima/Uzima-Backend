// Leaderboard pagination/rank and rewards history paging. Closes #1552, #1555.
const clamp = (n, min, max) => Math.min(Math.max(Number(n) || min, min), max);

function parsePaging(query = {}, maxLimit = 100) {
  const page = clamp(query.page, 1, 1e6);
  const limit = clamp(query.limit, 1, maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}

// Ties broken by id so ordering stays deterministic across requests.
const sortLeaderboard = (rows) =>
  [...rows].sort((a, b) => b.points - a.points || String(a.id).localeCompare(String(b.id)));

function leaderboardPage(rows, query) {
  const { page, limit, skip } = parsePaging(query);
  const sorted = sortLeaderboard(rows);
  const items = sorted.slice(skip, skip + limit).map((r, i) => ({ rank: skip + i + 1, userId: r.id, points: r.points }));
  return { items, page, limit, total: sorted.length };
}

// Only rank and points are returned, never other profile fields.
const getRank = (rows, userId) => {
  const sorted = sortLeaderboard(rows);
  const idx = sorted.findIndex((r) => String(r.id) === String(userId));
  return idx === -1 ? null : { rank: idx + 1, points: sorted[idx].points };
};

// History for the authenticated user only, newest first.
function rewardsHistoryPage(events, userId, query) {
  const { page, limit, skip } = parsePaging(query);
  const mine = events.filter((e) => String(e.userId) === String(userId)).sort((a, b) => new Date(b.at) - new Date(a.at));
  const items = mine.slice(skip, skip + limit).map(({ type, amount, reward, at }) => ({ type, amount, reward, at }));
  return { items, page, limit, total: mine.length };
}

module.exports = { parsePaging, leaderboardPage, getRank, rewardsHistoryPage };
