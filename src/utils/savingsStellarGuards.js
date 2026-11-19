// Savings withdrawal rules and Stellar submission checks. Closes #1518, #1528.

// Pure check: nothing is mutated, so a rejection leaves records unchanged.
function checkWithdrawal({ amount, balance, goal, dailyLimit = Infinity, withdrawnToday = 0 }) {
  if (!(amount > 0)) return { ok: false, reason: 'Invalid amount' };
  if (amount > balance) return { ok: false, reason: 'Insufficient balance' };
  if (withdrawnToday + amount > dailyLimit) return { ok: false, reason: 'Daily limit exceeded' };
  if (goal && goal.status === 'active' && !goal.allowEarlyWithdrawal && new Date() < new Date(goal.targetDate)) {
    return { ok: false, reason: 'Goal is still active' };
  }
  return { ok: true };
}

const seenHashes = new Set();

// `verifySignature(tx)` is injected (e.g. wraps the Stellar SDK) to keep this dependency-free.
function verifyStellarSubmission(tx, { networkPassphrase, verifySignature, seen = seenHashes }) {
  if (!tx || !tx.hash || !tx.signature) return { ok: false, reason: 'Missing hash or signature' };
  if (tx.networkPassphrase !== networkPassphrase) return { ok: false, reason: 'Wrong network' };
  if (seen.has(tx.hash)) return { ok: false, reason: 'Replayed submission' };
  if (!verifySignature(tx)) return { ok: false, reason: 'Invalid signature' };
  seen.add(tx.hash);
  return { ok: true };
}

module.exports = { checkWithdrawal, verifyStellarSubmission };
