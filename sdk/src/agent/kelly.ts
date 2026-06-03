export function kellyFraction(p: number, payoutMultiplier: number): number {
  if (payoutMultiplier <= 1) return 0;
  const b = payoutMultiplier - 1;
  const q = 1 - p;
  const f = (b * p - q) / b;
  return Math.max(0, f);
}

export function kellyQuarter(p: number, payoutMultiplier: number): number {
  return Math.min(0.5, kellyFraction(p, payoutMultiplier) / 4);
}

export function edgePoints(modelProb: number, impliedProb: number): number {
  return (modelProb - impliedProb) * 100;
}

export function payoutMultiplier(totalPool: bigint, outcomeStake: bigint, betSize: bigint): number {
  const newOutcomeStake = outcomeStake + betSize;
  const newTotalPool = totalPool + betSize;
  if (newOutcomeStake === 0n) return 0;
  return Number(newTotalPool) / Number(newOutcomeStake);
}
