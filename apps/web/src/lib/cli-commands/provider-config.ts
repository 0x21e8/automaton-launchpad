import type { CliCommandPayload } from "../cli-command-builder";

export interface ProviderConfigPreviewState {
  openRouterApiKey: string | null;
  model: string | null;
  braveSearchApiKey: string | null;
}

export interface ProviderConfigCommandResult {
  nextState: ProviderConfigPreviewState;
  response: string;
}

function redactSecret(secret: string | null): string {
  if (secret === null) {
    return "not configured";
  }

  if (secret.length <= 8) {
    return "configured";
  }

  return `${secret.slice(0, 4)}...${secret.slice(-4)}`;
}

export function createInitialProviderConfigPreview(): ProviderConfigPreviewState {
  return {
    openRouterApiKey: null,
    model: null,
    braveSearchApiKey: null
  };
}

export function buildProviderConfigHelpLines(): string[] {
  return [
    "provider status",
    "provider openrouter set-key <apiKey>",
    "provider openrouter clear-key",
    "provider model set <modelId>",
    "provider model clear",
    "provider brave set-key <apiKey>",
    "provider brave clear-key"
  ];
}

function formatProviderStatus(state: ProviderConfigPreviewState): string {
  return `OpenRouter key: ${redactSecret(state.openRouterApiKey)} | Model: ${state.model ?? "not configured"} | Brave Search key: ${redactSecret(state.braveSearchApiKey)}`;
}

export function applyProviderConfigCommand(
  payload: CliCommandPayload,
  state: ProviderConfigPreviewState
): ProviderConfigCommandResult | null {
  if (payload.command.toLowerCase() !== "provider") {
    return null;
  }

  const [section, action, ...rest] = payload.args;
  const normalizedSection = section?.toLowerCase();
  const normalizedAction = action?.toLowerCase();

  if (normalizedSection === "status" || normalizedSection === undefined) {
    return {
      nextState: state,
      response: formatProviderStatus(state)
    };
  }

  if (normalizedSection === "openrouter") {
    if (normalizedAction === "set-key" && rest.length > 0) {
      const secret = rest.join(" ").trim();

      return {
        nextState: {
          ...state,
          openRouterApiKey: secret
        },
        response: `OpenRouter API key staged for signed steward update (${redactSecret(secret)}).`
      };
    }

    if (normalizedAction === "clear-key") {
      return {
        nextState: {
          ...state,
          openRouterApiKey: null
        },
        response: "OpenRouter API key cleared from the staged steward command."
      };
    }
  }

  if (normalizedSection === "model") {
    if (normalizedAction === "set" && rest.length > 0) {
      const model = rest.join(" ").trim();

      return {
        nextState: {
          ...state,
          model
        },
        response: `Inference model staged for signed steward update: ${model}.`
      };
    }

    if (normalizedAction === "clear") {
      return {
        nextState: {
          ...state,
          model: null
        },
        response: "Inference model cleared from the staged steward command."
      };
    }
  }

  if (normalizedSection === "brave") {
    if (normalizedAction === "set-key" && rest.length > 0) {
      const secret = rest.join(" ").trim();

      return {
        nextState: {
          ...state,
          braveSearchApiKey: secret
        },
        response: `Brave Search API key staged for signed steward update (${redactSecret(secret)}).`
      };
    }

    if (normalizedAction === "clear-key") {
      return {
        nextState: {
          ...state,
          braveSearchApiKey: null
        },
        response: "Brave Search API key cleared from the staged steward command."
      };
    }
  }

  return {
    nextState: state,
    response: `Unknown provider command. Try: ${buildProviderConfigHelpLines().join(" | ")}`
  };
}
