import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { sponsorBet } from "../../src/core/relay.js";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

describe("sponsorBet", () => {
  it("POSTs payload and returns the relayer's txHash", async () => {
    server.use(
      http.post("http://localhost:7787/api/relay/bet", async ({ request }) => {
        const body = await request.json() as any;
        expect(body.bettor).toBe("0x000000000000000000000000000000000000beef");
        return HttpResponse.json({ txHash: "0x" + "ab".repeat(32) });
      }),
    );
    const r = await sponsorBet({
      relayUrl: "http://localhost:7787/api/relay/bet",
      payload: {
        bettor: "0x000000000000000000000000000000000000beef",
        matchId: ("0x" + "01".repeat(32)) as `0x${string}`,
        outcome: 0,
        amount: "10000000",
        permit: { permitted: { token: "0x0000000000000000000000000000000000000000", amount: "10000000" }, nonce: "1", deadline: "1800000000" },
        permitSig: ("0x" + "11".repeat(65)) as `0x${string}`,
        userSig: ("0x" + "22".repeat(65)) as `0x${string}`,
        deadline: "1800000000",
      },
    });
    expect(r.txHash).toBe("0x" + "ab".repeat(32));
  });

  it("throws on 4xx with body", async () => {
    server.use(
      http.post("http://localhost:7787/api/relay/bet", () =>
        HttpResponse.json({ error: "rate limited" }, { status: 429 }),
      ),
    );
    await expect(
      sponsorBet({ relayUrl: "http://localhost:7787/api/relay/bet", payload: {} as any }),
    ).rejects.toThrow(/rate limited/);
  });
});
