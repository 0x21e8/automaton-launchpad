import type { EscrowPaymentRecord } from "@ic-automaton/shared";

export interface EscrowAdapter {
  getEscrowPayment(sessionId: string): Promise<EscrowPaymentRecord | null>;
}

class UnconfiguredEscrowAdapter implements EscrowAdapter {
  async getEscrowPayment(): Promise<null> {
    return null;
  }
}

function normalizeEscrowPayment(
  payment: EscrowPaymentRecord | null
): EscrowPaymentRecord | null {
  if (!payment) {
    return null;
  }

  return {
    ...payment
  };
}

export class EscrowClient {
  private readonly adapter: EscrowAdapter;
  private readonly configured: boolean;

  constructor(options: {
    adapter?: EscrowAdapter;
    configured?: boolean;
  } = {}) {
    this.adapter = options.adapter ?? new UnconfiguredEscrowAdapter();
    this.configured = options.configured ?? options.adapter !== undefined;
  }

  isConfigured() {
    return this.configured;
  }

  async getEscrowPayment(
    sessionId: string,
    quoteTermsHash?: string
  ): Promise<EscrowPaymentRecord | null> {
    const payment = normalizeEscrowPayment(await this.adapter.getEscrowPayment(sessionId));

    if (!payment) {
      return null;
    }

    if (quoteTermsHash && payment.quoteTermsHash !== quoteTermsHash) {
      return null;
    }

    return payment;
  }
}
