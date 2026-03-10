import { describe, expect, it } from "vitest";

import { resolveIndexerConfig } from "../src/config.js";
import { INDEXER_TARGET_CONFIG } from "../src/indexer.config.js";
import { buildServer, formatStartupError } from "../src/server.js";

describe("indexer config", () => {
  it("uses the dedicated target config file as the default ingestion source", () => {
    const config = resolveIndexerConfig({});

    expect(config.ingestion).toEqual(INDEXER_TARGET_CONFIG);
    expect(config.icHost).toBe("http://localhost:8000");
    expect(config.corsAllowedOrigins).toEqual([
      "http://127.0.0.1:5173",
      "http://localhost:5173"
    ]);
  });

  it("allows deployment-time env overrides for network targeting without replacing canister IDs", () => {
    const config = resolveIndexerConfig({
      INDEXER_INGESTION_NETWORK_TARGET: "mainnet",
      INDEXER_INGESTION_LOCAL_HOST: "replica.internal",
      INDEXER_INGESTION_LOCAL_PORT: "4943"
    });

    expect(config.ingestion.canisterIds).toEqual(INDEXER_TARGET_CONFIG.canisterIds);
    expect(config.ingestion.network.target).toBe("mainnet");
    expect(config.ingestion.network.local.host).toBe("replica.internal");
    expect(config.ingestion.network.local.port).toBe(4943);
    expect(config.icHost).toBe("https://ic0.app");
  });

  it("derives the IC host from the configured network target", () => {
    const config = resolveIndexerConfig(
      {},
      {
        ingestion: {
          canisterIds: ["aaaaa-aa"],
          network: {
            target: "mainnet",
            local: {
              host: "127.0.0.1",
              port: 4943
            }
          }
        }
      }
    );

    expect(config.ingestion.canisterIds).toEqual(["aaaaa-aa"]);
    expect(config.icHost).toBe("https://ic0.app");
  });

  it("applies local replica env overrides to the derived IC host", () => {
    const config = resolveIndexerConfig({
      INDEXER_INGESTION_LOCAL_HOST: "127.0.0.1",
      INDEXER_INGESTION_LOCAL_PORT: "4943"
    });

    expect(config.ingestion.network.target).toBe("local");
    expect(config.icHost).toBe("http://127.0.0.1:4943");
  });

  it("accepts deployment-time CORS origin overrides", () => {
    const config = resolveIndexerConfig({
      INDEXER_CORS_ALLOWED_ORIGINS: "https://app.example.com, http://127.0.0.1:4173"
    });

    expect(config.corsAllowedOrigins).toEqual([
      "https://app.example.com",
      "http://127.0.0.1:4173"
    ]);
  });

  it("fails when the canister list is empty", () => {
    expect(() =>
      resolveIndexerConfig(
        {},
        {
          ingestion: {
            canisterIds: [],
            network: {
              target: "local",
              local: {
                host: "localhost",
                port: 8000
              }
            }
          }
        }
      )
    ).toThrowError("Indexer ingestion config must include at least one canister ID.");
  });

  it("fails when a canister ID format is invalid", () => {
    expect(() =>
      resolveIndexerConfig(
        {},
        {
          ingestion: {
            canisterIds: ["not-a-canister-id"],
            network: {
              target: "local",
              local: {
                host: "localhost",
                port: 8000
              }
            }
          }
        }
      )
    ).toThrowError("Indexer ingestion config canisterIds[0] must be a valid canister ID.");
  });

  it("fails when the network target is unsupported", () => {
    expect(() =>
      resolveIndexerConfig(
        {
          INDEXER_INGESTION_NETWORK_TARGET: "staging"
        },
        {
          ingestion: {
            canisterIds: ["aaaaa-aa"],
            network: {
              target: "mainnet",
              local: {
                host: "localhost",
                port: 8000
              }
            }
          }
        }
      )
    ).toThrowError('Indexer ingestion config network.target must be one of "mainnet", "local".');
  });

  it("fails when local mode is missing the local host or port", () => {
    expect(() =>
      resolveIndexerConfig(
        {
          INDEXER_INGESTION_LOCAL_HOST: "",
          INDEXER_INGESTION_LOCAL_PORT: "0"
        },
        {
          ingestion: {
            canisterIds: ["aaaaa-aa"],
            network: {
              target: "local",
              local: {
                host: "",
                port: 0
              }
            }
          }
        }
      )
    ).toThrowError('network.local.host must be set when network.target is "local".');
  });

  it("fails server startup immediately when the ingestion config is invalid", () => {
    expect(() =>
      buildServer({
        config: {
          ingestion: {
            canisterIds: [],
            network: {
              target: "local",
              local: {
                host: "localhost",
                port: 8000
              }
            }
          }
        }
      })
    ).toThrowError("Invalid indexer ingestion config:");
  });

  it("formats invalid ingestion startup failures with config guidance", () => {
    const error = new Error(
      'Invalid indexer ingestion config:\n- Indexer ingestion config network.target must be one of "mainnet", "local". Received: "staging".'
    );

    expect(formatStartupError(error)).toContain(
      "Indexer startup aborted: invalid ingestion target configuration."
    );
    expect(formatStartupError(error)).toContain("apps/indexer/src/indexer.config.ts");
    expect(formatStartupError(error)).toContain("INDEXER_INGESTION_NETWORK_TARGET");
    expect(formatStartupError(error)).toContain(
      'Indexer ingestion config network.target must be one of "mainnet", "local".'
    );
  });
});
