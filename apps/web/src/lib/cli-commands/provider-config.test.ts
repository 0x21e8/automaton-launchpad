import { describe, expect, it } from "vitest";

import { buildCliCommandPayload } from "../cli-command-builder";
import {
  applyProviderConfigCommand,
  buildProviderConfigHelpLines,
  createInitialProviderConfigPreview
} from "./provider-config";

describe("provider-config commands", () => {
  it("stages OpenRouter and Brave updates for steward commands", () => {
    const openRouterPayload = buildCliCommandPayload(
      "provider openrouter set-key sk-or-12345678",
      "aaaaa-aa",
      1
    );
    const bravePayload = buildCliCommandPayload(
      'provider brave set-key "brv-abcdefghi"',
      "aaaaa-aa",
      1
    );

    expect(openRouterPayload).not.toBeNull();
    expect(bravePayload).not.toBeNull();

    const stagedOpenRouter = applyProviderConfigCommand(
      openRouterPayload!,
      createInitialProviderConfigPreview()
    );
    const stagedBrave = applyProviderConfigCommand(
      bravePayload!,
      stagedOpenRouter!.nextState
    );

    expect(stagedOpenRouter?.response).toContain("OpenRouter API key");
    expect(stagedBrave?.response).toContain("Brave Search API key");
    expect(stagedBrave?.nextState).toMatchObject({
      openRouterApiKey: "sk-or-12345678",
      braveSearchApiKey: "brv-abcdefghi"
    });
  });

  it("reports provider status and help commands", () => {
    const payload = buildCliCommandPayload("provider status", "aaaaa-aa", 1);
    const result = applyProviderConfigCommand(payload!, {
      openRouterApiKey: "sk-or-12345678",
      model: "openrouter/auto",
      braveSearchApiKey: null
    });

    expect(result?.response).toContain("OpenRouter key");
    expect(result?.response).toContain("Brave Search key");
    expect(buildProviderConfigHelpLines()).toContain("provider model set <modelId>");
  });
});
