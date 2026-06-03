import { encodeFunctionData, type Address, type Hex, type TypedData } from "viem";

const PERMIT2_DOMAIN_NAME = "Permit2";

function domain(chainId: number, verifyingContract: Address) {
  return { name: PERMIT2_DOMAIN_NAME, chainId, verifyingContract };
}

// ---------- SignatureTransfer (one-shot) ----------

export interface BuildBetPermitInput {
  owner: Address;
  token: Address;
  spender: Address;
  amount: bigint;
  nonce: bigint;
  deadline: bigint;
  chainId: number;
  permit2: Address;
  sign: (typedData: TypedDataPayload) => Promise<Hex>;
}

export interface PermitTransferFromStruct {
  permitted: { token: Address; amount: bigint };
  spender: Address;
  nonce: bigint;
  deadline: bigint;
}

export interface BuildBetPermitResult {
  permit: PermitTransferFromStruct;
  sig: Hex;
}

const PermitTransferFromTypes = {
  PermitTransferFrom: [
    { name: "permitted", type: "TokenPermissions" },
    { name: "spender", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
  TokenPermissions: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
  ],
} as const satisfies TypedData;

export interface TypedDataPayload {
  domain: { name: string; chainId: number; verifyingContract: Address };
  types: TypedData;
  primaryType: string;
  message: Record<string, unknown>;
}

export async function buildBetPermit(input: BuildBetPermitInput): Promise<BuildBetPermitResult> {
  const permit: PermitTransferFromStruct = {
    permitted: { token: input.token, amount: input.amount },
    spender: input.spender,
    nonce: input.nonce,
    deadline: input.deadline,
  };
  const typedData: TypedDataPayload = {
    domain: domain(input.chainId, input.permit2),
    types: PermitTransferFromTypes,
    primaryType: "PermitTransferFrom",
    message: permit as unknown as Record<string, unknown>,
  };
  const sig = await input.sign(typedData);
  return { permit, sig };
}

// ---------- AllowanceTransfer (recurring) ----------

export interface BuildAgentAllowanceInput {
  owner: Address;
  token: Address;
  spender: Address;
  capUsdc: bigint;
  expiration: number;
  nonce: number;
  chainId: number;
  permit2: Address;
  sign: (typedData: TypedDataPayload) => Promise<Hex>;
}

export interface AllowanceBatchStruct {
  details: { token: Address; amount: bigint; expiration: number; nonce: number };
  spender: Address;
  sigDeadline: bigint;
}

export interface BuildAgentAllowanceResult {
  allowance: AllowanceBatchStruct;
  sig: Hex;
}

const PermitSingleTypes = {
  PermitSingle: [
    { name: "details", type: "PermitDetails" },
    { name: "spender", type: "address" },
    { name: "sigDeadline", type: "uint256" },
  ],
  PermitDetails: [
    { name: "token", type: "address" },
    { name: "amount", type: "uint160" },
    { name: "expiration", type: "uint48" },
    { name: "nonce", type: "uint48" },
  ],
} as const satisfies TypedData;

export async function buildAgentAllowance(input: BuildAgentAllowanceInput): Promise<BuildAgentAllowanceResult> {
  const sigDeadline = BigInt(input.expiration);
  const allowance: AllowanceBatchStruct = {
    details: {
      token: input.token,
      amount: input.capUsdc,
      expiration: input.expiration,
      nonce: input.nonce,
    },
    spender: input.spender,
    sigDeadline,
  };
  const typedData: TypedDataPayload = {
    domain: domain(input.chainId, input.permit2),
    types: PermitSingleTypes,
    primaryType: "PermitSingle",
    message: allowance as unknown as Record<string, unknown>,
  };
  const sig = await input.sign(typedData);
  return { allowance, sig };
}

// ---------- Lockdown ----------

const LockdownAbiSnippet = [
  {
    type: "function",
    name: "lockdown",
    inputs: [
      {
        name: "approvals",
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "spender", type: "address" },
        ],
      },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export interface TokenSpenderPair { token: Address; spender: Address }

export function encodeLockdownCall(approvals: TokenSpenderPair[]): Hex {
  return encodeFunctionData({
    abi: LockdownAbiSnippet,
    functionName: "lockdown",
    args: [approvals],
  });
}
