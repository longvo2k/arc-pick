import { describe, it, expect, vi } from "vitest";
import { buildAgentServer } from "../src/server.js";

describe("agent control plane", () => {
  it("POST /control/spawn returns 200 with agent id", async () => {
    const spawn = vi.fn().mockResolvedValue({ id: "agent-1" });
    const list = vi.fn().mockResolvedValue([]);
    const pause = vi.fn();
    const app = buildAgentServer({ spawn, list, pause });
    const res = await app.inject({
      method: "POST",
      url: "/control/spawn",
      payload: { ownerWallet: "0x000000000000000000000000000000000000beef", strategy: "conservative", capUsdc: "50000000", expirySeconds: 86400 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).id).toBe("agent-1");
  });

  it("GET /agents returns the list", async () => {
    const list = vi.fn().mockResolvedValue([{ id: "x", status: "active", capUsdc: "50000000", spentUsdc: "0", strategy: "conservative" }]);
    const app = buildAgentServer({ spawn: vi.fn(), list, pause: vi.fn() });
    const res = await app.inject({ method: "GET", url: "/agents" });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).agents.length).toBe(1);
  });

  it("POST /control/pause/:id calls pause", async () => {
    const pause = vi.fn().mockResolvedValue(undefined);
    const app = buildAgentServer({ spawn: vi.fn(), list: vi.fn().mockResolvedValue([]), pause });
    const res = await app.inject({ method: "POST", url: "/control/pause/agent-1" });
    expect(res.statusCode).toBe(200);
    expect(pause).toHaveBeenCalledWith("agent-1");
  });
});
