import type { FastifyPluginAsync } from "fastify";

import { FaucetError } from "../lib/faucet.js";

export const faucetRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/api/playground/faucet", async (request, reply) => {
    const body = request.body as {
      walletAddress?: unknown;
    };

    try {
      return await fastify.faucetService.claim({
        ipAddress: request.ip,
        walletAddress: body?.walletAddress
      });
    } catch (error) {
      if (error instanceof FaucetError) {
        if (error.statusCode >= 500) {
          request.log.error(error);
        }

        if (
          error.statusCode === 429 &&
          typeof error.body.retryAfterSeconds === "number"
        ) {
          reply.header("retry-after", error.body.retryAfterSeconds);
        }

        reply.code(error.statusCode);
        return error.body;
      }

      request.log.error(error);
      reply.code(502);
      return {
        ok: false,
        error: "Faucet funding failed."
      };
    }
  });
};
