import type { FastifyPluginAsync } from "fastify";

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/health", async () => {
    const uptimeMs = Date.now() - fastify.startedAt;
    const database = await fastify.indexerStore.getHealth();
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

    return {
      ok: true,
      service: "indexer",
      uptimeMs,
      timestamp: new Date().toISOString(),
      database,
      discovery: {
        seedCanisterIds: ingestion.canisterIds,
        targetNetwork,
        factoryCanisterId: fastify.indexerConfig.factoryCanisterId ?? null,
        factoryConfigured: fastify.factoryClient.isConfigured(),
        escrowConfigured: fastify.escrowClient.isConfigured()
      },
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
