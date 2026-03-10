import { describe, expect, it } from "vitest";

import {
  createInitialSpawnWizardState,
  describeFundingValidation,
  getFundingPreview
} from "./spawn-state";

describe("spawn-state", () => {
  it("computes the locked fee disclosure from gross USDC funding", () => {
    const preview = getFundingPreview(createInitialSpawnWizardState());

    expect(preview.grossDisplay).toBe("100.00 USDC");
    expect(preview.platformFeeDisplay).toBe("4.50 USDC");
    expect(preview.creationCostDisplay).toBe("8.00 USDC");
    expect(preview.netForwardDisplay).toBe("87.50 USDC");
    expect(preview.minimumMet).toBe(true);
  });

  it("rejects gross ETH funding below the $50 minimum", () => {
    const preview = getFundingPreview({
      ...createInitialSpawnWizardState(),
      asset: "eth",
      grossAmountInput: "0.01"
    });

    expect(preview.grossUsd).toBe(32);
    expect(preview.minimumMet).toBe(false);
    expect(describeFundingValidation(preview)).toContain(
      "Gross payment must be at least"
    );
  });
});
