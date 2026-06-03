import { describe, it, expect } from "vitest";
import { runOnce } from "../src/poller.js";
import { createFakeFootballDataClient } from "../src/footballData.js";

describe("runOnce", () => {
  it("calls upsertMatch for SCHEDULED and submitResult for FINISHED matches", async () => {
    const fd = createFakeFootballDataClient({
      matches: [
        { id: 1, homeTeam: "ARG", awayTeam: "MEX", utcDate: "2026-06-11T19:00:00Z", status: "SCHEDULED" },
        { id: 2, homeTeam: "FRA", awayTeam: "DEN", utcDate: "2026-06-12T19:00:00Z", status: "FINISHED", score: { fullTime: { home: 2, away: 1 } } },
      ],
    });
    const upserts: any[] = [];
    const submits: any[] = [];
    await runOnce({
      fd,
      onUpsertMatch: async (m) => { upserts.push(m); },
      onSubmitResult: async (r) => { submits.push(r); },
      now: () => new Date("2026-06-13T00:00:00Z"),
      knownResults: new Set<string>(),
    });
    expect(upserts.length).toBe(2);
    expect(submits.length).toBe(1);
    expect(submits[0].matchId).toBeDefined();
    expect(submits[0].homeScore).toBe(2);
  });

  it("skips matches whose result was already submitted", async () => {
    const fd = createFakeFootballDataClient({
      matches: [{ id: 2, homeTeam: "FRA", awayTeam: "DEN", utcDate: "2026-06-12T19:00:00Z", status: "FINISHED", score: { fullTime: { home: 2, away: 1 } } }],
    });
    const submits: any[] = [];
    const known = new Set<string>();
    await runOnce({
      fd, onUpsertMatch: async () => {}, onSubmitResult: async (r) => { submits.push(r); known.add(r.matchId); },
      now: () => new Date(), knownResults: known,
    });
    expect(submits.length).toBe(1);
    submits.length = 0;
    await runOnce({
      fd, onUpsertMatch: async () => {}, onSubmitResult: async (r) => { submits.push(r); },
      now: () => new Date(), knownResults: known,
    });
    expect(submits.length).toBe(0);
  });
});
