/**
 * Applies default tenant/organization scoping to a query filter so
 * data lookups never accidentally span tenants. Cross-tenant access
 * must be requested explicitly via `allowCrossTenant`.
 */
export interface TenantScopedFilter {
  organizationId: string;
  [key: string]: unknown;
}

export function applyTenantScope<T extends Record<string, unknown>>(
  filter: T,
  organizationId: string | null | undefined,
  options: { allowCrossTenant?: boolean } = {},
): T | TenantScopedFilter {
  if (options.allowCrossTenant) {
    return filter;
  }

  if (!organizationId) {
    throw new Error(
      'organizationId is required to scope this query; pass allowCrossTenant to bypass explicitly',
    );
  }

  return { ...filter, organizationId };
}
