import type { Address, Hex } from "viem";

export interface SponsorBetPayload {
  bettor: Address;
  matchId: Hex;
  outcome: 0 | 1 | 2;
  amount: string;
  permit: {
    permitted: { token: Address; amount: string };
    nonce: string;
    deadline: string;
  };
  permitSig: Hex;
  userSig: Hex;
  deadline: string;
}

export interface SponsorBetInput {
  relayUrl: string;
  payload: SponsorBetPayload;
  fetchImpl?: typeof fetch;
}

export interface SponsorBetResult { txHash: Hex }

export async function sponsorBet({ relayUrl, payload, fetchImpl }: SponsorBetInput): Promise<SponsorBetResult> {
  const f = fetchImpl ?? fetch;
  const res = await f(relayUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    const msg = (body && typeof body === "object" && "error" in body) ? String((body as any).error) : String(body);
    throw new Error(`Relay POST failed (${res.status}): ${msg}`);
  }
  return res.json() as Promise<SponsorBetResult>;
}
