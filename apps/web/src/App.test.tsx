import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App", () => {
  it("renders the grid stage, drawer shell, and spawn wizard shell", () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain("ic-automaton");
    expect(markup).toContain("LIVE");
    expect(markup).toContain("Wallet not detected");
    expect(markup).toContain("Automaton grid");
    expect(markup).toContain("Spawn Automaton");
    expect(markup).toContain("Step 1 of 6");
    expect(markup).toContain("Select Chain");
    expect(markup).toContain("Select an automaton");
    expect(markup).toContain("Command Surface");
  });
});
