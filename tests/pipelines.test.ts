import { describe, expect, it } from "vitest";
import { pipelineForLicenseType } from "@/lib/pipeline";
import { PIPELINE_LABELS, pipelineLabels, visiblePipelines } from "@/lib/pipeline-labels";

// Pipelines per workspace: a case's pipeline is its license type's own
// setting (no more matching on "CILA"/"IDPH"/"IDOA"), and each workspace can
// rename the three pipelines or hide the ones it doesn't use.

describe("pipeline for a license type", () => {
  it("is the license type's own setting, whatever it's called", () => {
    expect(pipelineForLicenseType({ pipeline: "HOME_CARE" })).toBe("HOME_CARE");
    expect(pipelineForLicenseType({ pipeline: "CILA_GROUP_HOME" })).toBe("CILA_GROUP_HOME");
  });

  it("is MCO for a case with no license type", () => {
    expect(pipelineForLicenseType(null)).toBe("MCO");
  });
});

describe("workspace pipeline names", () => {
  it("uses the built-in name unless the workspace renamed it", () => {
    expect(pipelineLabels(null)).toEqual(PIPELINE_LABELS);
    expect(pipelineLabels({ CILA_GROUP_HOME: { label: "Group Homes" }, MCO: { label: "  " } })).toEqual({
      HOME_CARE: "Home Care",
      CILA_GROUP_HOME: "Group Homes",
      MCO: "MCO",
    });
  });

  it("leaves hidden pipelines out of the tabs, but never hides all of them", () => {
    expect(visiblePipelines({ CILA_GROUP_HOME: { hidden: true } })).toEqual(["HOME_CARE", "MCO"]);
    expect(visiblePipelines({ HOME_CARE: { hidden: true }, CILA_GROUP_HOME: { hidden: true }, MCO: { hidden: true } })).toEqual([
      "HOME_CARE",
      "CILA_GROUP_HOME",
      "MCO",
    ]);
  });
});
