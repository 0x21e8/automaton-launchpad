import { readFile } from "node:fs/promises";

import type { PlaygroundMetadata } from "@ic-automaton/shared";
import type { FastifyPluginAsync } from "fastify";

function clonePlaygroundMetadata(metadata: PlaygroundMetadata): PlaygroundMetadata {
  return {
    ...metadata,
    chain: {
      ...metadata.chain,
      nativeCurrency: {
        ...metadata.chain.nativeCurrency
      }
    },
    faucet: {
      ...metadata.faucet,
      claimLimits: {
        ...metadata.faucet.claimLimits
      },
      claimAssetAmounts: metadata.faucet.claimAssetAmounts.map((claimAssetAmount) => ({
        ...claimAssetAmount
      }))
    },
    reset: {
      ...metadata.reset
    }
  };
}

function parseOptionalBoolean(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

function parseOptionalEnvironmentVersion(value: unknown) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

function parseOptionalTimestamp(value: unknown) {
  if (value === null) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  if (normalized.length === 0) {
    return null;
  }

  const numericValue = Number(normalized);
  if (Number.isFinite(numericValue)) {
    return numericValue;
  }

  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? undefined : parsed;
}

async function resolvePlaygroundMetadata(fastify: {
  indexerConfig: {
    playground: {
      metadata: PlaygroundMetadata;
      statusFilePath: string;
    };
  };
  log: {
    warn: (details: Record<string, unknown>, message: string) => void;
  };
}) {
  const baseMetadata = clonePlaygroundMetadata(fastify.indexerConfig.playground.metadata);

  try {
    const fileContents = await readFile(fastify.indexerConfig.playground.statusFilePath, "utf8");
    const status = JSON.parse(fileContents) as {
      environmentVersion?: unknown;
      lastResetAt?: unknown;
      maintenance?: unknown;
      nextResetAt?: unknown;
    };
    const environmentVersion = parseOptionalEnvironmentVersion(status.environmentVersion);
    const maintenance = parseOptionalBoolean(status.maintenance);
    const lastResetAt = parseOptionalTimestamp(status.lastResetAt);
    const nextResetAt = parseOptionalTimestamp(status.nextResetAt);

    return {
      ...baseMetadata,
      environmentVersion:
        environmentVersion === undefined ? baseMetadata.environmentVersion : environmentVersion,
      maintenance: maintenance ?? baseMetadata.maintenance,
      reset: {
        ...baseMetadata.reset,
        lastResetAt: lastResetAt === undefined ? baseMetadata.reset.lastResetAt : lastResetAt,
        nextResetAt: nextResetAt === undefined ? baseMetadata.reset.nextResetAt : nextResetAt
      }
    } satisfies PlaygroundMetadata;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return baseMetadata;
    }

    fastify.log.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        statusFilePath: fastify.indexerConfig.playground.statusFilePath
      },
      "Failed to read playground status file; falling back to static metadata."
    );

    return baseMetadata;
  }
}

export const playgroundRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/playground", async () => {
    return resolvePlaygroundMetadata(fastify);
  });
};
