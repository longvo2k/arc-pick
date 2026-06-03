import { describe, it, expect, vi } from "vitest";
import { createNanopaymentClient } from "../../src/server/nanopay.js";

describe("createNanopaymentClient", () => {
  it("uses nanopayClient when provided", async () => {
    const nanopayClient = { pay: vi.fn().mockResolvedValue({ txHash: "0xnano" }) };
    const fallbackTransfer = vi.fn();
    const c = createNanopaymentClient({ nanopayClient, fallbackTransfer });
    const r = await c.pay({ amountUsdc: 1000n, memo: "tick" });
    expect(r.method).toBe("nanopay");
    expect(r.txHash).toBe("0xnano");
    expect(fallbackTransfer).not.toHaveBeenCalled();
  });

  it("falls back to USDC.transferFrom when nanopayClient throws", async () => {
    const nanopayClient = { pay: vi.fn().mockRejectedValue(new Error("nanopay down")) };
    const fallbackTransfer = vi.fn().mockResolvedValue("0xusdc");
    const c = createNanopaymentClient({ nanopayClient, fallbackTransfer });
    const r = await c.pay({ amountUsdc: 1000n, memo: "tick" });
    expect(r.method).toBe("usdc-transfer");
    expect(r.txHash).toBe("0xusdc");
    expect(fallbackTransfer).toHaveBeenCalledWith({ amountUsdc: 1000n, memo: "tick" });
  });

  it("falls back when no nanopayClient is provided", async () => {
    const fallbackTransfer = vi.fn().mockResolvedValue("0xusdc-only");
    const c = createNanopaymentClient({ fallbackTransfer });
    const r = await c.pay({ amountUsdc: 500n, memo: "test" });
    expect(r.method).toBe("usdc-transfer");
    expect(r.txHash).toBe("0xusdc-only");
  });

  it("throws when both paths fail", async () => {
    const nanopayClient = { pay: vi.fn().mockRejectedValue(new Error("nanopay")) };
    const fallbackTransfer = vi.fn().mockRejectedValue(new Error("usdc"));
    const c = createNanopaymentClient({ nanopayClient, fallbackTransfer });
    await expect(c.pay({ amountUsdc: 1n, memo: "t" })).rejects.toThrow(/usdc/);
  });
});
