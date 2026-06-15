// Pure helpers, unit-tested with Vitest. As engine systems migrate from
// public/js/ into typed modules, their math lands here and gets coverage.

/** Format a number as Indian-grouped rupees, e.g. 100000 -> "₹1,00,000". */
export function formatINR(n: number): string {
  const s = Math.round(Math.abs(n)).toString();
  const sign = n < 0 ? '-' : '';
  if (s.length <= 3) return sign + '₹' + s;
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return sign + '₹' + rest + ',' + last3;
}

/** Chaos decays a fixed number of points per in-game day (one day = daySeconds real seconds). */
export function chaosDecayPerSecond(pointsPerDay: number, daySeconds: number): number {
  return pointsPerDay / daySeconds;
}
