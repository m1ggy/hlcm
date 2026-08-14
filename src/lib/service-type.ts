// Fallback for a Project with no ServiceType assigned — per
// docs/pipeline-stage-plan.md, "any project not on this list gets the
// neutral default until a color is assigned", never invisible or randomly
// colored.
export const UNMAPPED_SERVICE_COLOR = { hex: "#ECEFF1", textColor: "#37474F" };
