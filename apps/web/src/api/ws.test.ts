import { afterEach, describe, expect, it, vi } from "vitest";

import { subscribeToRealtimeEvents } from "./ws";

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  readonly url: string;
  readyState = 0;
  private readonly listeners = new Map<string, Array<() => void>>();
  close = vi.fn(() => {
    this.readyState = 3;
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  addEventListener(event: string, listener: () => void) {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  }

  emit(event: "open" | "error") {
    for (const listener of this.listeners.get(event) ?? []) {
      listener();
    }
  }
}

function installWindow(origin: string) {
  Object.defineProperty(globalThis, "window", {
    value: {
      location: {
        origin
      }
    },
    configurable: true
  });
}

function restoreWindow(originalWindow: typeof globalThis.window) {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: typeof globalThis.window }).window;
    return;
  }

  Object.defineProperty(globalThis, "window", {
    value: originalWindow,
    configurable: true
  });
}

describe("subscribeToRealtimeEvents", () => {
  const originalWindow = globalThis.window;
  const originalWebSocket = globalThis.WebSocket;

  afterEach(() => {
    MockWebSocket.instances = [];
    restoreWindow(originalWindow);
    globalThis.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  it("waits for open before closing a disposed connecting socket", () => {
    installWindow("http://127.0.0.1:5173");
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;

    const cleanup = subscribeToRealtimeEvents({}, {});
    const socket = MockWebSocket.instances[0]!;

    cleanup();
    expect(socket.close).not.toHaveBeenCalled();

    socket.readyState = 1;
    socket.emit("open");
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("suppresses error callbacks after cleanup", () => {
    installWindow("http://127.0.0.1:5173");
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    const onError = vi.fn();

    const cleanup = subscribeToRealtimeEvents({}, { onError });
    const socket = MockWebSocket.instances[0]!;

    cleanup();
    socket.emit("error");

    expect(onError).not.toHaveBeenCalled();
  });
});
