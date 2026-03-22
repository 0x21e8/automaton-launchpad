import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", async () => {
    const uptimeMs = Date.now() - fastify.startedAt;
    const database = await fastify.indexerStore.getHealth();
    const factory = await fastify.factoryClient.getFactoryHealth();
    const seedCanisterIds = await fastify.indexerStore.listConfiguredCanisterIds();
    const factoryDiscoveredCanisterIds =
      await fastify.indexerStore.listFactoryDiscoveredCanisterIds();
    const trackedCanisterIds = await fastify.indexerStore.listTrackedCanisterIds();
    const overlapCanisterIds = seedCanisterIds.filter((canisterId) => {
      return factoryDiscoveredCanisterIds.includes(canisterId);
    });
    const { ingestion } = fastify.indexerConfig;
    const targetNetwork =
      ingestion.network.target === "local"
        ? {
            target: ingestion.network.target,
            icHost: fastify.indexerConfig.icHost,
            localReplica: {
              host: ingestion.network.local.host,
              port: ingestion.network.local.port
            }
          }
        : {
            target: ingestion.network.target,
            icHost: fastify.indexerConfig.icHost,
            localReplica: null
          };

    const mode =
      seedCanisterIds.length > 0 && factoryDiscoveredCanisterIds.length > 0
        ? "both"
        : seedCanisterIds.length > 0
          ? "seeds_only"
          : factoryDiscoveredCanisterIds.length > 0
            ? "factory_only"
            : "none";

    return {
      ok: true,
      service: "indexer",
      uptimeMs,
      timestamp: new Date().toISOString(),
      database,
      discovery: {
        mode,
        seedCanisterIds,
        factoryDiscoveredCanisterIds,
        trackedCanisterIds,
        overlapCanisterIds,
        counts: {
          seedCanisters: seedCanisterIds.length,
          factoryDiscoveredCanisters: factoryDiscoveredCanisterIds.length,
          trackedCanisters: trackedCanisterIds.length,
          duplicateCanisters: overlapCanisterIds.length
        },
        targetNetwork,
        factoryCanisterId: fastify.indexerConfig.factoryCanisterId ?? null,
        factoryConfigured: fastify.factoryClient.isConfigured()
      },
      factory,
      realtime: fastify.realtimeHub.getSnapshot(),
      polling: {
        fastIntervalMs: fastify.indexerConfig.fastPollIntervalMs,
        slowIntervalMs: fastify.indexerConfig.slowPollIntervalMs,
        priceIntervalMs: fastify.indexerConfig.pricePollIntervalMs,
        live: fastify.automatonIndexer.getSnapshot()
      }
    };
  });
};
