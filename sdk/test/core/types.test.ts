import { describe, it, expect } from "vitest";
import { bytes32ToAscii, asciiToBytes32 } from "../../src/core/types.js";

describe("bytes32 ASCII roundtrip", () => {
  it("encodes and decodes a 3-char team code", () => {
    const arg = asciiToBytes32("ARG");
    expect(arg).toBe("0x4152470000000000000000000000000000000000000000000000000000000000");
    expect(bytes32ToAscii(arg)).toBe("ARG");
  });

  it("decodes a real bytes32 from on-chain", () => {
    expect(bytes32ToAscii("0x4d45580000000000000000000000000000000000000000000000000000000000")).toBe("MEX");
  });

  it("rejects strings longer than 32 chars", () => {
    expect(() => asciiToBytes32("X".repeat(33))).toThrow();
  });

  it("handles empty string", () => {
    expect(asciiToBytes32("")).toBe("0x" + "0".repeat(64));
    expect(bytes32ToAscii("0x" + "0".repeat(64))).toBe("");
  });
});
