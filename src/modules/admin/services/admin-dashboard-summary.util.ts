/**
 * Aggregates the raw counters an admin dashboard needs into a single
 * summary object, grouped by a caller-supplied time window and optional
 * region. Intended to sit behind an admin-only guarded controller route.
 */
export interface DashboardWindow {
  from: Date;
  to: Date;
  region?: string;
}

export interface DashboardSummary {
  window: DashboardWindow;
  totalUsers: number;
  totalTransactions: number;
  totalCampaigns: number;
}

export function buildDashboardSummary(
  window: DashboardWindow,
  counts: { users: number; transactions: number; campaigns: number },
): DashboardSummary {
  if (window.to < window.from) {
    throw new Error('Dashboard window "to" must not be before "from"');
  }

  return {
    window,
    totalUsers: counts.users,
    totalTransactions: counts.transactions,
    totalCampaigns: counts.campaigns,
  };
}
