import "fastify";

import type { IndexerConfig } from "./config.js";
import type { AutomatonIndexer } from "./polling/automaton-indexer.js";
import type { EscrowClient } from "./integrations/escrow-client.js";
import type { FactoryClient } from "./integrations/factory-client.js";
import type { IndexerStore } from "./store/sqlite.js";
import type { RealtimeHub } from "./ws/events.js";

declare module "fastify" {
  interface FastifyInstance {
    escrowClient: EscrowClient;
    factoryClient: FactoryClient;
    automatonIndexer: AutomatonIndexer;
    indexerConfig: IndexerConfig;
    indexerStore: IndexerStore;
    realtimeHub: RealtimeHub;
    startedAt: number;
  }
}
