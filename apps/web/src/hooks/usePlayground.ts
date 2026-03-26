import { useEffect, useState } from "react";
import type { PlaygroundMetadata } from "@ic-automaton/shared";

import { fetchPlaygroundMetadata } from "../api/playground";
import { resolveSpawnChainMetadata } from "../lib/wallet-transaction-helpers";

const DEFAULT_PLAYGROUND_LABEL = "Local development";
const DEFAULT_RESET_CADENCE_LABEL = "Manual local resets";

export interface UsePlaygroundResult {
  error: string | null;
  hasRuntimeMetadata: boolean;
  isLoading: boolean;
  metadata: PlaygroundMetadata | null;
  refresh: () => void;
}

function readOptionalString(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Failed to load runtime playground metadata.";
}

export function createFallbackPlaygroundMetadata(
  env: Record<string, string | undefined> = import.meta.env
): PlaygroundMetadata | null {
  const chainMetadata = resolveSpawnChainMetadata("base", null, env);

  if (chainMetadata === null) {
    return null;
  }

  return {
    environmentLabel:
      readOptionalString(env.VITE_PLAYGROUND_ENV_LABEL) ?? DEFAULT_PLAYGROUND_LABEL,
    environmentVersion: readOptionalString(env.VITE_PLAYGROUND_ENV_VERSION),
    maintenance: false,
    chain: {
      id: chainMetadata.chainId,
      name: chainMetadata.chainName,
      publicRpcUrl: chainMetadata.rpcUrl ?? "",
      nativeCurrency: {
        name: chainMetadata.currencyName,
        symbol: chainMetadata.currencySymbol,
        decimals: 18
      },
      explorerUrl: chainMetadata.blockExplorerUrl
    },
    faucet: {
      available: false,
      claimLimits: {
        windowSeconds: 86_400,
        maxClaimsPerWallet: 1,
        maxClaimsPerIp: 1
      },
      claimAssetAmounts: [
        {
          asset: "eth",
          amount: "1",
          decimals: 18
        },
        {
          asset: "usdc",
          amount: "250",
          decimals: 6
        }
      ]
    },
    reset: {
      lastResetAt: null,
      nextResetAt: null,
      cadenceLabel:
        readOptionalString(env.VITE_PLAYGROUND_RESET_CADENCE_LABEL) ??
        DEFAULT_RESET_CADENCE_LABEL
    }
  };
}

export function formatPlaygroundTimestamp(
  value: number | null,
  fallback = "Pending"
): string {
  if (value === null) {
    return fallback;
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

const fallbackPlaygroundMetadata = createFallbackPlaygroundMetadata();

export function usePlayground(): UsePlaygroundResult {
  const [metadata, setMetadata] = useState<PlaygroundMetadata | null>(
    fallbackPlaygroundMetadata
  );
  const [error, setError] = useState<string | null>(null);
  const [hasRuntimeMetadata, setHasRuntimeMetadata] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    setIsLoading(true);

    void fetchPlaygroundMetadata(controller.signal)
      .then((nextMetadata) => {
        setMetadata(nextMetadata);
        setHasRuntimeMetadata(true);
        setError(null);
      })
      .catch((nextError: unknown) => {
        if (controller.signal.aborted) {
          return;
        }

        setMetadata(fallbackPlaygroundMetadata);
        setHasRuntimeMetadata(false);
        setError(getErrorMessage(nextError));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [refreshToken]);

  return {
    error,
    hasRuntimeMetadata,
    isLoading,
    metadata,
    refresh() {
      setRefreshToken((current) => current + 1);
    }
  };
}
