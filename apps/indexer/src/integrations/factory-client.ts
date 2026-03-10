import type {
  CreateSpawnSessionRequest,
  CreateSpawnSessionResponse,
  RefundSpawnResponse,
  RetrySpawnResponse,
  SpawnSessionStatusResponse,
  SpawnedAutomatonRecord,
  SpawnedAutomatonRegistryPage
} from "@ic-automaton/shared";

export interface FactoryAdapter {
  createSpawnSession(
    request: CreateSpawnSessionRequest
  ): Promise<CreateSpawnSessionResponse>;
  getSpawnSession(sessionId: string): Promise<SpawnSessionStatusResponse | null>;
  retrySpawnSession(sessionId: string): Promise<RetrySpawnResponse>;
  claimSpawnRefund(sessionId: string): Promise<RefundSpawnResponse>;
  listSpawnedAutomatons(
    cursor: string | undefined,
    limit: number
  ): Promise<SpawnedAutomatonRegistryPage>;
  getSpawnedAutomaton(canisterId: string): Promise<SpawnedAutomatonRecord | null>;
}

export interface FactorySessionSnapshot extends SpawnSessionStatusResponse {
  registryRecord: SpawnedAutomatonRecord | null;
}

class UnconfiguredFactoryAdapter implements FactoryAdapter {
  async createSpawnSession(): Promise<CreateSpawnSessionResponse> {
    throw new Error("Factory adapter is not configured.");
  }

  async getSpawnSession(): Promise<null> {
    return null;
  }

  async retrySpawnSession(): Promise<RetrySpawnResponse> {
    throw new Error("Factory adapter is not configured.");
  }

  async claimSpawnRefund(): Promise<RefundSpawnResponse> {
    throw new Error("Factory adapter is not configured.");
  }

  async listSpawnedAutomatons(): Promise<SpawnedAutomatonRegistryPage> {
    return {
      items: [],
      nextCursor: null
    };
  }

  async getSpawnedAutomaton(): Promise<null> {
    return null;
  }
}

function normalizeSessionStatus(
  response: SpawnSessionStatusResponse
): SpawnSessionStatusResponse {
  return {
    session: {
      ...response.session,
      childIds: [...response.session.childIds],
      config: {
        ...response.session.config,
        strategies: [...response.session.config.strategies],
        skills: [...response.session.config.skills]
      }
    },
    audit: response.audit.map((entry) => ({ ...entry }))
  };
}

function normalizeCreateSpawnSessionResponse(
  response: CreateSpawnSessionResponse
): CreateSpawnSessionResponse {
  return {
    session: normalizeSessionStatus({
      session: response.session,
      audit: []
    }).session,
    quote: {
      ...response.quote,
      payment: {
        ...response.quote.payment
      }
    }
  };
}

function normalizeRegistryRecord(
  record: SpawnedAutomatonRecord | null
): SpawnedAutomatonRecord | null {
  if (!record) {
    return null;
  }

  return {
    ...record,
    childIds: [...record.childIds]
  };
}

export class FactoryClient {
  private readonly adapter: FactoryAdapter;
  private readonly configured: boolean;

  constructor(options: {
    adapter?: FactoryAdapter;
    configured?: boolean;
  } = {}) {
    this.adapter = options.adapter ?? new UnconfiguredFactoryAdapter();
    this.configured = options.configured ?? options.adapter !== undefined;
  }

  isConfigured() {
    return this.configured;
  }

  async createSpawnSession(
    request: CreateSpawnSessionRequest
  ): Promise<CreateSpawnSessionResponse> {
    return normalizeCreateSpawnSessionResponse(
      await this.adapter.createSpawnSession(request)
    );
  }

  async getSpawnSession(sessionId: string): Promise<FactorySessionSnapshot | null> {
    const response = await this.adapter.getSpawnSession(sessionId);

    if (!response) {
      return null;
    }

    const normalized = normalizeSessionStatus(response);
    const registryRecord = normalized.session.automatonCanisterId
      ? await this.adapter.getSpawnedAutomaton(normalized.session.automatonCanisterId)
      : null;

    return {
      ...normalized,
      registryRecord: normalizeRegistryRecord(registryRecord)
    };
  }

  async retrySpawnSession(sessionId: string): Promise<RetrySpawnResponse> {
    const response = await this.adapter.retrySpawnSession(sessionId);

    return {
      session: normalizeSessionStatus({
        session: response.session,
        audit: []
      }).session
    };
  }

  async claimSpawnRefund(sessionId: string): Promise<RefundSpawnResponse> {
    return this.adapter.claimSpawnRefund(sessionId);
  }

  async listSpawnedAutomatons(
    cursor: string | undefined,
    limit: number
  ): Promise<SpawnedAutomatonRegistryPage> {
    const page = await this.adapter.listSpawnedAutomatons(cursor, limit);

    return {
      items: page.items.map((record) => {
        return {
          ...record,
          childIds: [...record.childIds]
        };
      }),
      nextCursor: page.nextCursor
    };
  }

  async getSpawnedAutomaton(canisterId: string): Promise<SpawnedAutomatonRecord | null> {
    const record = await this.adapter.getSpawnedAutomaton(canisterId);
    return normalizeRegistryRecord(record);
  }
}
