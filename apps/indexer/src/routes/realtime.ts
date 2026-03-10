import type { FastifyPluginAsync } from "fastify";

export const realtimeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.route({
    method: "GET",
    url: fastify.indexerConfig.websocketPath,
    handler: async (_request, reply) => {
      reply.code(426);
      reply.header("connection", "Upgrade");
      reply.header("upgrade", "websocket");

      return {
        ok: false,
        error: "Upgrade Required",
        realtime: fastify.realtimeHub.getSnapshot()
      };
    },
    wsHandler: (socket, request) => {
      const query = request.query as { canisterId?: string; sessionId?: string };
      const canisterId =
        typeof query.canisterId === "string" && query.canisterId.trim().length > 0
          ? query.canisterId.trim()
          : undefined;
      const sessionId =
        typeof query.sessionId === "string" && query.sessionId.trim().length > 0
          ? query.sessionId.trim()
          : undefined;

      fastify.realtimeHub.connect(socket, {
        canisterId,
        sessionId
      });
    }
  });
};
