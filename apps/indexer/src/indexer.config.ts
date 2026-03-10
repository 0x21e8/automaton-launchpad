export const INDEXER_NETWORK_TARGETS = ["mainnet", "local"] as const;

export type IndexerNetworkTarget = (typeof INDEXER_NETWORK_TARGETS)[number];

export interface IndexerTargetConfig {
  canisterIds: string[];
  network: {
    target: IndexerNetworkTarget;
    local: {
      host: string;
      port: number;
    };
  };
}

export const INDEXER_TARGET_CONFIG = {
  canisterIds: ["txyno-ch777-77776-aaaaq-cai"],
  network: {
    target: "local",
    local: {
      host: "localhost",
      port: 8000
    }
  }
} satisfies IndexerTargetConfig;
