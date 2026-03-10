export interface CliCommandPayload {
  command: string;
  args: string[];
  timestamp: number;
  automatonId: string;
}

export function tokenizeCommandInput(input: string): string[] {
  const matches = input.match(/"([^"]*)"|'([^']*)'|[^\s]+/g) ?? [];

  return matches.map((token) => {
    if (
      (token.startsWith("\"") && token.endsWith("\"")) ||
      (token.startsWith("'") && token.endsWith("'"))
    ) {
      return token.slice(1, -1);
    }

    return token;
  });
}

export function buildCliCommandPayload(
  input: string,
  automatonId: string,
  timestamp = Date.now()
): CliCommandPayload | null {
  const tokens = tokenizeCommandInput(input.trim());

  if (tokens.length === 0) {
    return null;
  }

  const [command, ...args] = tokens;

  return {
    command,
    args,
    timestamp,
    automatonId
  };
}

export function serializeCliCommandPayload(payload: CliCommandPayload): string {
  return JSON.stringify(payload);
}
