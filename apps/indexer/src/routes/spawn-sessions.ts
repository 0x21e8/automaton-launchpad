import type {
  CreateSpawnSessionRequest,
  SpawnEventType,
  SpawnSessionDetail,
  SpawnedAutomatonRecord
} from "@ic-automaton/shared";
import type { FastifyInstance, FastifyPluginAsync } from "fastify";

function normalizeLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(Math.floor(parsed), 100);
}

function normalizeCursor(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function selectSpawnSessionEventType(detail: SpawnSessionDetail): SpawnEventType {
  switch (detail.session.state) {
    case "complete":
      return "spawn.session.completed";
    case "failed":
      return "spawn.session.failed";
    case "expired":
      return "spawn.session.expired";
    default:
      return "spawn.session.updated";
  }
}

function shouldBroadcastSpawnSessionUpdate(
  previous: SpawnSessionDetail | null,
  next: SpawnSessionDetail
) {
  if (!previous) {
    return true;
  }

  return (
    previous.session.updatedAt !== next.session.updatedAt ||
    previous.session.state !== next.session.state ||
    previous.session.paymentStatus !== next.session.paymentStatus ||
    previous.audit.length !== next.audit.length ||
    previous.registryRecord?.canisterId !== next.registryRecord?.canisterId ||
    previous.escrow?.updatedAt !== next.escrow?.updatedAt ||
    previous.escrow?.paymentStatus !== next.escrow?.paymentStatus
  );
}

async function resolveSpawnSessionDetail(
  fastify: FastifyInstance,
  sessionId: string
): Promise<SpawnSessionDetail | null> {
  const cached = await fastify.indexerStore.getSpawnSessionDetail(sessionId);
  const factorySnapshot = await fastify.factoryClient.getSpawnSession(sessionId);

  if (!factorySnapshot) {
    return cached;
  }

  const escrow = await fastify.escrowClient.getEscrowPayment(
    sessionId,
    factorySnapshot.session.quoteTermsHash
  );
  const detail: SpawnSessionDetail = {
    session: factorySnapshot.session,
    audit: factorySnapshot.audit,
    escrow: escrow ?? cached?.escrow ?? null,
    registryRecord: factorySnapshot.registryRecord ?? cached?.registryRecord ?? null
  };

  await fastify.indexerStore.upsertSpawnSession(detail);
  if (shouldBroadcastSpawnSessionUpdate(cached, detail)) {
    fastify.realtimeHub.broadcast({
      type: selectSpawnSessionEventType(detail),
      session: detail.session,
      audit: detail.audit
    });
  }

  return detail;
}

async function resolveRegistryRecord(
  fastify: FastifyInstance,
  canisterId: string
): Promise<SpawnedAutomatonRecord | null> {
  if (fastify.factoryClient.isConfigured()) {
    const record = await fastify.factoryClient.getSpawnedAutomaton(canisterId);
    if (record) {
      await fastify.indexerStore.upsertSpawnedAutomatonRegistry([record]);
      return record;
    }
  }

  return fastify.indexerStore.getSpawnedAutomatonRegistryRecord(canisterId);
}

export const spawnSessionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/spawn-sessions", async (request, reply) => {
    if (!fastify.factoryClient.isConfigured()) {
      reply.code(503);
      return {
        ok: false,
        error: "Factory client is not configured"
      };
    }

    const body = request.body as CreateSpawnSessionRequest;
    return fastify.factoryClient.createSpawnSession(body);
  });

  fastify.get("/api/spawn-sessions/:sessionId", async (request, reply) => {
    const params = request.params as { sessionId: string };
    const detail = await resolveSpawnSessionDetail(fastify, params.sessionId);

    if (!detail) {
      reply.code(404);
      return {
        ok: false,
        error: "Spawn session not found",
        sessionId: params.sessionId
      };
    }

    return detail;
  });

  fastify.post("/api/spawn-sessions/:sessionId/retry", async (request, reply) => {
    if (!fastify.factoryClient.isConfigured()) {
      reply.code(503);
      return {
        ok: false,
        error: "Factory client is not configured"
      };
    }

    const params = request.params as { sessionId: string };
    return fastify.factoryClient.retrySpawnSession(params.sessionId);
  });

  fastify.post("/api/spawn-sessions/:sessionId/refund", async (request, reply) => {
    if (!fastify.factoryClient.isConfigured()) {
      reply.code(503);
      return {
        ok: false,
        error: "Factory client is not configured"
      };
    }

    const params = request.params as { sessionId: string };
    return fastify.factoryClient.claimSpawnRefund(params.sessionId);
  });

  fastify.get("/api/spawned-automatons", async (request) => {
    const query = request.query as {
      cursor?: string;
      limit?: string;
    };
    const cursor = normalizeCursor(query.cursor);
    const limit = normalizeLimit(query.limit);

    if (fastify.factoryClient.isConfigured()) {
      const page = await fastify.factoryClient.listSpawnedAutomatons(cursor, limit);
      await fastify.indexerStore.upsertSpawnedAutomatonRegistry(page.items);
      return page;
    }

    return fastify.indexerStore.listSpawnedAutomatonRegistry({
      cursor,
      limit
    });
  });

  fastify.get("/api/spawned-automatons/:canisterId", async (request, reply) => {
    const params = request.params as { canisterId: string };
    const record = await resolveRegistryRecord(fastify, params.canisterId);

    if (!record) {
      reply.code(404);
      return {
        ok: false,
        error: "Spawned automaton registry record not found",
        canisterId: params.canisterId
      };
    }

    return record;
  });
};
