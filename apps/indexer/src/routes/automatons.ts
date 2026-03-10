import type { FastifyPluginAsync } from "fastify";

import type { AutomatonTier, ChainSlug } from "@ic-automaton/shared";

function normalizeLimit(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(Math.floor(parsed), 100);
}

function normalizeCursor(value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export const automatonRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get("/api/automatons", async (request) => {
    const query = request.query as {
      steward?: string;
      chain?: ChainSlug;
      tier?: AutomatonTier;
    };

    return fastify.indexerStore.listAutomatons({
      steward: normalizeString(query.steward),
      chain: normalizeString(query.chain) as ChainSlug | undefined,
      tier: normalizeString(query.tier) as AutomatonTier | undefined
    });
  });

  fastify.get("/api/automatons/:canisterId", async (request, reply) => {
    const params = request.params as { canisterId: string };
    const automaton = await fastify.indexerStore.getAutomatonDetail(params.canisterId);

    if (!automaton) {
      reply.code(404);
      return {
        ok: false,
        error: "Automaton not found",
        canisterId: params.canisterId
      };
    }

    return automaton;
  });

  fastify.get("/api/automatons/:canisterId/monologue", async (request) => {
    const params = request.params as { canisterId: string };
    const query = request.query as {
      before?: string;
      limit?: string;
    };

    return fastify.indexerStore.listMonologue(params.canisterId, {
      before: normalizeCursor(query.before),
      limit: normalizeLimit(query.limit)
    });
  });
};
