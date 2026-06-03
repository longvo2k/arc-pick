export interface SlidingWindowInput {
  limit: number;
  windowMs: number;
  now?: () => number;
}

export interface SlidingWindow {
  allow: (key: string) => boolean;
}

export function createSlidingWindow({ limit, windowMs, now }: SlidingWindowInput): SlidingWindow {
  const buckets = new Map<string, number[]>();
  const clock = now ?? (() => Date.now());
  return {
    allow(key: string) {
      const t = clock();
      const arr = buckets.get(key) ?? [];
      const fresh = arr.filter((ts) => t - ts < windowMs);
      if (fresh.length >= limit) {
        buckets.set(key, fresh);
        return false;
      }
      fresh.push(t);
      buckets.set(key, fresh);
      return true;
    },
  };
}
