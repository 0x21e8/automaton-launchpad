export const ALLOWED_RPC_METHODS = [
  "eth_chainId",
  "net_version",
  "eth_blockNumber",
  "eth_call",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_getBalance",
  "eth_getCode",
  "eth_getTransactionCount",
  "eth_getBlockByNumber",
  "eth_getTransactionByHash",
  "eth_getTransactionReceipt",
  "eth_getLogs",
  "eth_sendRawTransaction"
] as const;

export const DENIED_RPC_PREFIXES = [
  "anvil_",
  "hardhat_",
  "debug_",
  "admin_",
  "personal_",
  "txpool_",
  "evm_"
] as const;

export interface JsonRpcRequest {
  id?: unknown;
  jsonrpc?: unknown;
  method?: unknown;
  params?: unknown;
}

export interface RpcMethodDecision {
  allowed: boolean;
  errorCode: number;
  message: string;
  statusCode: number;
}

export interface IpRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
}

function createAllowedDecision(): RpcMethodDecision {
  return {
    allowed: true,
    errorCode: 0,
    message: "",
    statusCode: 200
  };
}

export function isJsonRpcRequest(value: unknown): value is JsonRpcRequest {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractJsonRpcId(value: unknown) {
  if (!isJsonRpcRequest(value)) {
    return null;
  }

  return value.id ?? null;
}

export function createJsonRpcErrorResponse(id: unknown, code: number, message: string) {
  return {
    jsonrpc: "2.0" as const,
    id: id ?? null,
    error: {
      code,
      message
    }
  };
}

export function evaluateRpcMethod(method: unknown): RpcMethodDecision {
  if (typeof method !== "string" || method.trim() === "") {
    return {
      allowed: false,
      errorCode: -32600,
      message: "JSON-RPC request must include a method name.",
      statusCode: 400
    };
  }

  if (DENIED_RPC_PREFIXES.some((prefix) => method.startsWith(prefix))) {
    return {
      allowed: false,
      errorCode: -32601,
      message: `JSON-RPC method "${method}" is denied by gateway policy.`,
      statusCode: 403
    };
  }

  if (!ALLOWED_RPC_METHODS.includes(method as (typeof ALLOWED_RPC_METHODS)[number])) {
    return {
      allowed: false,
      errorCode: -32601,
      message: `JSON-RPC method "${method}" is not allowed by gateway policy.`,
      statusCode: 403
    };
  }

  return createAllowedDecision();
}

export function createIpRateLimiter(options: {
  maxRequests: number;
  windowMs: number;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const entries = new Map<string, { count: number; resetAt: number }>();

  return {
    check(ip: string): IpRateLimitResult {
      const currentTime = now();
      const entry = entries.get(ip);

      if (entry === undefined || entry.resetAt <= currentTime) {
        const nextEntry = {
          count: 1,
          resetAt: currentTime + options.windowMs
        };

        entries.set(ip, nextEntry);
        return {
          allowed: true,
          remaining: Math.max(0, options.maxRequests - 1),
          resetAt: nextEntry.resetAt,
          retryAfterMs: 0
        };
      }

      if (entry.count >= options.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: entry.resetAt,
          retryAfterMs: entry.resetAt - currentTime
        };
      }

      entry.count += 1;
      return {
        allowed: true,
        remaining: Math.max(0, options.maxRequests - entry.count),
        resetAt: entry.resetAt,
        retryAfterMs: 0
      };
    }
  };
}
