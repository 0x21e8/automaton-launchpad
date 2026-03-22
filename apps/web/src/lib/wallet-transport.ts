export type Eip1193RequestArgs = {
  method: string;
  params?: unknown[] | Record<string, unknown>;
};

export interface WalletTransport {
  request<T = unknown>(args: Eip1193RequestArgs): Promise<T>;
}
