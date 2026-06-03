import elo from "./data/team-elo.json" with { type: "json" };

const TABLE: Record<string, number> = elo as Record<string, number>;
const DEFAULT_RATING = 1700;
const HOME_BONUS = 50;

export function rating(team: string): number {
  return TABLE[team] ?? DEFAULT_RATING;
}

export function impliedProbsFromElo(home: string, away: string): [number, number, number] {
  const rh = rating(home) + HOME_BONUS;
  const ra = rating(away);
  const diff = rh - ra;
  const pHomeRaw = 1 / (1 + Math.pow(10, -diff / 400));
  const closeness = 1 - Math.min(1, Math.abs(diff) / 400);
  const pDraw = 0.18 + 0.12 * closeness;
  const remaining = 1 - pDraw;
  const pHome = pHomeRaw * remaining;
  const pAway = (1 - pHomeRaw) * remaining;
  return [pHome, pDraw, pAway];
}
