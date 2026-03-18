import { describe, expect, it } from "vitest";

import { getCanvasLayoutScale } from "./AutomatonCanvas";

describe("getCanvasLayoutScale", () => {
  it("caps the grid scale on large viewports", () => {
    expect(getCanvasLayoutScale(2200, 1400)).toBe(1.15);
  });

  it("keeps the base stage size unchanged", () => {
    expect(getCanvasLayoutScale(880, 520)).toBe(1);
  });

  it("shrinks to fit smaller viewports", () => {
    expect(getCanvasLayoutScale(640, 420)).toBeLessThan(1);
  });
});
