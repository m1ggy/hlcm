// Split out from pipeline.ts on purpose: that file imports prisma, which
// pulls the `pg` driver (Node builtins: dns/fs/net/tls) into any client
// component that imports it — breaks the browser bundle. This file has zero
// imports so client components can safely use the label map.
import type { $Enums } from "@/generated/prisma/client";

export const PIPELINE_LABELS: Record<$Enums.Pipeline, string> = {
  HOME_CARE: "Home Care",
  CILA_GROUP_HOME: "CILA / Group Home",
  MCO: "MCO",
};
