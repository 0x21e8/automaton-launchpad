import { describe, expect, it } from "vitest";

import {
  buildCommandHelpRows,
  commandRegistry,
  describeAuthLevel,
  findCommandDefinition
} from "./cli-command-registry";

describe("cli command registry", () => {
  it("exposes the real command surface with the expected auth split", () => {
    expect(findCommandDefinition("help")?.authLevel).toBe("public");
    expect(findCommandDefinition("connect")?.authLevel).toBe("public");
    expect(findCommandDefinition("send")?.authLevel).toBe("wallet");
    expect(findCommandDefinition("steward-send")?.authLevel).toBe("steward");
    expect(findCommandDefinition("unknown")).toBeNull();
  });

  it("builds readable help rows for the panel", () => {
    const rows = buildCommandHelpRows();

    expect(rows).toHaveLength(commandRegistry.length);
    expect(rows[0]).toMatchObject({
      name: "help",
      authLabel: "Public"
    });
    expect(describeAuthLevel("steward")).toBe("Steward required");
  });
});
