export function formatCurrency(value: number | string): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(n) || n === null || n === undefined) return '0.00';
  return n.toFixed(2);
}
