import type { PlaygroundMetadata } from "@ic-automaton/shared";

import { requestIndexerJson } from "./indexer";

export interface PlaygroundFaucetClaimResponse {
  ok: true;
  walletAddress: string;
  txHashes: {
    eth: string;
    usdc: string;
  };
  fundedAmounts: {
    eth: {
      amount: string;
      decimals: number;
      wei: string;
    };
    usdc: {
      amount: string;
      decimals: number;
      raw: string;
    };
  };
  balances: {
    ethWei: string;
    usdcRaw: string;
  };
}

export async function fetchPlaygroundMetadata(
  signal?: AbortSignal
): Promise<PlaygroundMetadata> {
  return requestIndexerJson<PlaygroundMetadata>("/api/playground", {
    signal
  });
}

export async function claimPlaygroundFaucet(
  walletAddress: string,
  signal?: AbortSignal
): Promise<PlaygroundFaucetClaimResponse> {
  return requestIndexerJson<PlaygroundFaucetClaimResponse>(
    "/api/playground/faucet",
    {
      method: "POST",
      body: {
        walletAddress
      },
      signal
    }
  );
}
