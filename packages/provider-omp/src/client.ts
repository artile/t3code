import { ProviderDriverKind } from "@t3tools/contracts";
import { defineProviderClient } from "@t3tools/provider-core/client";
import { OmpSettings } from "./settings.ts";
export const ompClient = defineProviderClient({
  driverKind: ProviderDriverKind.make("omp"),
  label: "OMP",
  settingsSchema: OmpSettings,
  acpRegistryAgentIds: ["omp"],
  icon: {
    viewBox: "0 0 64 64",
    fill: { light: "#f97316", dark: "#fb923c" },
    paths: [{ d: "M14 16h36v8H40v32h-8V24h-6v22h-8V24h-4z" }],
  },
});
