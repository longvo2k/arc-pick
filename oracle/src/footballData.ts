export interface FdMatch {
  id: number;
  homeTeam: string;
  awayTeam: string;
  utcDate: string;
  status: "SCHEDULED" | "LIVE" | "FINISHED" | "POSTPONED" | "CANCELLED";
  score?: { fullTime: { home: number; away: number } };
}

export interface ListMatchesOpts { status?: FdMatch["status"]; }

export interface FootballDataClient {
  listMatches(opts?: ListMatchesOpts): Promise<FdMatch[]>;
}

export function createFakeFootballDataClient({ matches }: { matches: FdMatch[] }): FootballDataClient {
  return {
    async listMatches(opts) {
      if (opts?.status) return matches.filter((m) => m.status === opts.status);
      return matches;
    },
  };
}

export interface HttpClientOpts {
  base: string;
  apiKey?: string;
  competition?: string;
  fetchImpl?: typeof fetch;
}

export function createHttpFootballDataClient(opts: HttpClientOpts): FootballDataClient {
  const comp = opts.competition ?? "WC";
  const f = opts.fetchImpl ?? fetch;
  return {
    async listMatches(qopts) {
      const url = `${opts.base}/competitions/${comp}/matches${qopts?.status ? `?status=${qopts.status}` : ""}`;
      const headers: Record<string, string> = {};
      if (opts.apiKey) headers["X-Auth-Token"] = opts.apiKey;
      const res = await f(url, { headers });
      if (!res.ok) throw new Error(`football-data HTTP ${res.status}`);
      const body = await res.json() as { matches: any[] };
      return body.matches.map((m: any) => ({
        id: m.id,
        homeTeam: m.homeTeam?.tla ?? m.homeTeam?.shortName ?? m.homeTeam?.name ?? "?",
        awayTeam: m.awayTeam?.tla ?? m.awayTeam?.shortName ?? m.awayTeam?.name ?? "?",
        utcDate: m.utcDate,
        status: m.status,
        score: m.score?.fullTime?.home != null
          ? { fullTime: { home: m.score.fullTime.home, away: m.score.fullTime.away } }
          : undefined,
      }));
    },
  };
}
