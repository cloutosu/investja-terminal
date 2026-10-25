import type { Team, TeamWithDelta } from '../types';

export function computeDeltas(teams: Team[], prevEquities: Map<string, number>): TeamWithDelta[] {
  return teams.map((t) => {
    const prev = prevEquities.get(t.name);
    const deltaDollar = prev !== undefined ? t.equity - prev : 0;
    const deltaPercent = prev !== undefined && prev > 0 ? (deltaDollar / prev) * 100 : 0;
    return { ...t, deltaDollar, deltaPercent };
  });
}
