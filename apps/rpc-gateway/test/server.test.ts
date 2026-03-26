import { afterEach, describe, expect, it } from "vitest";

import { buildServer } from "../src/server.js";

const openApps = new Set<ReturnType<typeof buildServer>>();

afterEach(async () => {
  await Promise.all(
    [...openApps].map(async (app) => {
      openApps.delete(app);
      await app.close();
    })
  );
});

function createFetchStub(responseBody: unknown) {
  const calls: Array<{
    init: RequestInit | undefined;
    input: string;
  }> = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    calls.push({
      input: typeof input === "string" ? input : input.toString(),
      init
    });

    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });
  };

  return {
    calls,
    fetchImpl
  };
}

function trackApp(app: ReturnType<typeof buildServer>) {
  openApps.add(app);
  return app;
}

describe("rpc gateway server", () => {
  it("forwards eth_chainId to the private upstream", async () => {
    const fetchStub = createFetchStub({
      jsonrpc: "2.0",
      id: 1,
      result: "0x13525e6"
    });
    const app = trackApp(
      buildServer({
        config: {
          upstreamUrl: "http://127.0.0.1:8545"
        },
        fetchImpl: fetchStub.fetchImpl
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: []
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      jsonrpc: "2.0",
      id: 1,
      result: "0x13525e6"
    });
    expect(fetchStub.calls).toHaveLength(1);
    expect(fetchStub.calls[0]).toMatchObject({
      input: "http://127.0.0.1:8545"
    });
    expect(JSON.parse(String(fetchStub.calls[0]?.init?.body))).toEqual({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_chainId",
      params: []
    });
  });

  it("forwards eth_sendRawTransaction to the private upstream", async () => {
    const fetchStub = createFetchStub({
      jsonrpc: "2.0",
      id: 2,
      result: "0xdeadbeef"
    });
    const app = trackApp(
      buildServer({
        fetchImpl: fetchStub.fetchImpl
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "eth_sendRawTransaction",
        params: ["0x02f87082053980843b9aca00847735940082520894"]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      jsonrpc: "2.0",
      id: 2,
      result: "0xdeadbeef"
    });
    expect(fetchStub.calls).toHaveLength(1);
  });

  it("rejects denied namespace methods before they reach upstream", async () => {
    const fetchStub = createFetchStub({
      jsonrpc: "2.0",
      id: 1,
      result: null
    });
    const app = trackApp(
      buildServer({
        fetchImpl: fetchStub.fetchImpl
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/",
      payload: {
        jsonrpc: "2.0",
        id: 9,
        method: "anvil_setCode",
        params: ["0xabc", "0x00"]
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      jsonrpc: "2.0",
      id: 9,
      error: {
        code: -32601,
        message: 'JSON-RPC method "anvil_setCode" is denied by gateway policy.'
      }
    });
    expect(fetchStub.calls).toHaveLength(0);
  });

  it("rate limits requests by client IP", async () => {
    let currentTime = 0;
    const fetchStub = createFetchStub({
      jsonrpc: "2.0",
      id: 1,
      result: "0x1"
    });
    const app = trackApp(
      buildServer({
        config: {
          rateLimitMaxRequests: 1,
          rateLimitWindowMs: 60_000
        },
        fetchImpl: fetchStub.fetchImpl,
        now: () => currentTime
      })
    );

    const firstResponse = await app.inject({
      method: "POST",
      url: "/",
      remoteAddress: "203.0.113.10",
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: []
      }
    });
    const secondResponse = await app.inject({
      method: "POST",
      url: "/",
      remoteAddress: "203.0.113.10",
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "eth_chainId",
        params: []
      }
    });

    currentTime += 1_000;

    const thirdResponse = await app.inject({
      method: "POST",
      url: "/",
      remoteAddress: "203.0.113.11",
      payload: {
        jsonrpc: "2.0",
        id: 3,
        method: "eth_chainId",
        params: []
      }
    });

    expect(firstResponse.statusCode).toBe(200);
    expect(secondResponse.statusCode).toBe(429);
    expect(secondResponse.json()).toEqual({
      jsonrpc: "2.0",
      id: 2,
      error: {
        code: -32005,
        message: "RPC gateway rate limit exceeded."
      }
    });
    expect(thirdResponse.statusCode).toBe(200);
    expect(fetchStub.calls).toHaveLength(2);
  });

  it("enforces the configured request body limit", async () => {
    const fetchStub = createFetchStub({
      jsonrpc: "2.0",
      id: 1,
      result: "0x1"
    });
    const app = trackApp(
      buildServer({
        config: {
          bodyLimitBytes: 64
        },
        fetchImpl: fetchStub.fetchImpl
      })
    );

    const response = await app.inject({
      method: "POST",
      url: "/",
      headers: {
        "content-type": "application/json"
      },
      payload: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_chainId",
        params: [],
        padding: "x".repeat(256)
      })
    });

    expect(response.statusCode).toBe(413);
    expect(fetchStub.calls).toHaveLength(0);
  });

  it("reports the configured chain id and upstream target on health", async () => {
    const app = trackApp(
      buildServer({
        config: {
          chainId: 20_260_326,
          upstreamUrl: "http://127.0.0.1:8545"
        }
      })
    );

    const response = await app.inject({
      method: "GET",
      url: "/health"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      service: "rpc-gateway",
      chainId: 20_260_326,
      upstreamUrl: "http://127.0.0.1:8545"
    });
  });
});
