import type {
  CreateSpawnSessionRequest,
  CreateSpawnSessionResponse,
  RefundSpawnResponse,
  RetrySpawnResponse,
  SpawnSessionDetail
} from "@ic-automaton/shared";

import { requestIndexerJson } from "./indexer";

export async function createSpawnSession(
  request: CreateSpawnSessionRequest,
  signal?: AbortSignal
): Promise<CreateSpawnSessionResponse> {
  return requestIndexerJson<CreateSpawnSessionResponse>("/api/spawn-sessions", {
    method: "POST",
    body: request,
    signal
  });
}

export async function fetchSpawnSessionDetail(
  sessionId: string,
  signal?: AbortSignal
): Promise<SpawnSessionDetail> {
  return requestIndexerJson<SpawnSessionDetail>(`/api/spawn-sessions/${sessionId}`, {
    signal
  });
}

export async function retrySpawnSession(
  sessionId: string,
  signal?: AbortSignal
): Promise<RetrySpawnResponse> {
  return requestIndexerJson<RetrySpawnResponse>(
    `/api/spawn-sessions/${sessionId}/retry`,
    {
      method: "POST",
      signal
    }
  );
}

export async function refundSpawnSession(
  sessionId: string,
  signal?: AbortSignal
): Promise<RefundSpawnResponse> {
  return requestIndexerJson<RefundSpawnResponse>(
    `/api/spawn-sessions/${sessionId}/refund`,
    {
      method: "POST",
      signal
    }
  );
}
