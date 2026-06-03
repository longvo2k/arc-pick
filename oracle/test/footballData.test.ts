import { describe, it, expect } from "vitest";
import { createFakeFootballDataClient } from "../src/footballData.js";

describe("createFakeFootballDataClient", () => {
  it("returns the seeded matches", async () => {
    const c = createFakeFootballDataClient({
      matches: [
        { id: 1, homeTeam: "ARG", awayTeam: "MEX", utcDate: "2026-06-11T19:00:00Z", status: "SCHEDULED" },
        { id: 2, homeTeam: "FRA", awayTeam: "DEN", utcDate: "2026-06-12T19:00:00Z", status: "FINISHED", score: { fullTime: { home: 2, away: 1 } } },
      ],
    });
    const r = await c.listMatches();
    expect(r.length).toBe(2);
    expect(r[0]!.homeTeam).toBe("ARG");
    expect(r[1]!.score?.fullTime.home).toBe(2);
  });

  it("filters by status", async () => {
    const c = createFakeFootballDataClient({
      matches: [
        { id: 1, homeTeam: "ARG", awayTeam: "MEX", utcDate: "2026-06-11T19:00:00Z", status: "SCHEDULED" },
        { id: 2, homeTeam: "FRA", awayTeam: "DEN", utcDate: "2026-06-12T19:00:00Z", status: "FINISHED", score: { fullTime: { home: 2, away: 1 } } },
      ],
    });
    const r = await c.listMatches({ status: "FINISHED" });
    expect(r.length).toBe(1);
    expect(r[0]!.id).toBe(2);
  });
});
