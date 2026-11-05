import { ProviderDriverKind, type ServerProvider } from "@t3tools/contracts";
import {
  makeAcpRegistryDriver,
  makeAcpRegistryAdapterV2,
  AcpRegistryAdapterV2Driver,
  type AcpRegistryDriverEnv,
} from "@t3tools/provider-acp-registry/server";
import { AcpRegistrySettings } from "@t3tools/provider-acp-registry/settings";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as DateTime from "effect/DateTime";
import * as Stream from "effect/Stream";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { probeOmpUsage } from "./usage.ts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { resolveSelfInvocation } from "@t3tools/shared/nodeRuntime";
import { readCustomModelEntries } from "@t3tools/shared/model";
import { mergeProviderInstanceEnvironment } from "@t3tools/provider-core/server/instanceEnvironment";
import * as ProviderContinuationRequests from "@t3tools/provider-core/server/ProviderContinuationRequests";
import type { ProviderDriver } from "@t3tools/provider-core/server/driver";
import { ProviderAdapterDriverCreateError } from "@t3tools/provider-core/server/adapterDriver";
import { OmpSettings } from "../settings.ts";
import { extractOmpSubagentUpdates } from "./subagents.ts";
import { AcpProviderCapabilitiesV2 } from "@t3tools/provider-acp/server/adapter";

const OMP = ProviderDriverKind.make("omp");
const decodeSettings = Schema.decodeSync(OmpSettings);
const decodeAcp = Schema.decodeSync(AcpRegistrySettings);

// OMP permissions are launch flags, not ACP session modes.
export function ompApprovalArgs(mode: string): ReadonlyArray<string> {
  return [
    "acp",
    mode === "auto"
      ? "--auto-approve"
      : `--approval-mode=${mode === "full-access" ? "yolo" : mode === "auto-accept-edits" ? "write" : "always-ask"}`,
  ];
}

const createAdapter: typeof AcpRegistryAdapterV2Driver.create = Effect.fn("OmpAdapter.create")(
  function* (input) {
    const hostEnvironment = yield* HostProcess.Environment;
    return yield* makeAcpRegistryAdapterV2({
      instanceId: input.instanceId,
      settings: { ...input.config, enabled: input.enabled },
      environment: yield* mergeProviderInstanceEnvironment(input.environment, hostEnvironment),
      selfInvocation: yield* resolveSelfInvocation(),
      continuationRequests: yield* ProviderContinuationRequests.ProviderContinuationRequests,
      driverKind: OMP,
      settingsForRuntimePolicy: (policy) => ({
        ...input.config,
        enabled: input.enabled,
        commandArgs: ompApprovalArgs(policy.runtimeMode),
      }),
      nativeFlavor: {
        capabilities: {
          ...AcpProviderCapabilitiesV2,
          subagents: {
            ...AcpProviderCapabilitiesV2.subagents,
            supportsSubagents: true,
            emitsSubagentLifecycle: true,
          },
        },
        extractSubagentUpdate: (tool) => extractOmpSubagentUpdates(tool)[0],
        extractSubagentUpdates: extractOmpSubagentUpdates,
        subagentsIdleOnTurnCompletion: true,
      },
    }).pipe(
      Effect.mapError(
        (cause) =>
          new ProviderAdapterDriverCreateError({
            driver: OMP,
            instanceId: input.instanceId,
            detail: "Failed to create OMP adapter.",
            cause,
          }),
      ),
    );
  },
);
const base = makeAcpRegistryDriver({
  driverKind: OMP,
  displayName: "OMP",
  hasDefaultInstance: true,
  createAdapter,
});
export type OmpDriverEnv = AcpRegistryDriverEnv;
export const OmpDriver: ProviderDriver<OmpSettings, OmpDriverEnv> = {
  driverKind: base.driverKind,
  metadata: base.metadata,
  configSchema: OmpSettings,
  defaultConfig: () => decodeSettings({}),
  create: Effect.fn("OmpDriver.create")(function* (input) {
    const instance = yield* base.create({
      ...input,
      config: decodeAcp({
        enabled: input.enabled,
        source: "local",
        agentId: "omp",
        commandPath: input.config.binaryPath || "omp",
        commandArgs: ["acp"],
        authMethodId: "agent",
        customModels: readCustomModelEntries(input.config.customModels).map((model) => model.slug),
      }),
    });
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const environment = yield* mergeProviderInstanceEnvironment(input.environment);
    const usage = yield* Effect.cachedWithTTL(
      Effect.gen(function* () {
        const now = yield* DateTime.now;
        return yield* probeOmpUsage(input.config, DateTime.formatIso(now), environment);
      }).pipe(Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner)),
      "1 minute",
    );
    const enrich = Effect.fn("OmpDriver.enrich")(function* (snapshot: ServerProvider) {
      const quota = yield* usage;
      return {
        ...snapshot,
        ...(quota.usageLimits ? { usageLimits: quota.usageLimits } : {}),
        auth:
          quota.auth.status === "authenticated"
            ? { ...snapshot.auth, status: "authenticated" as const }
            : snapshot.auth,
      };
    });
    return {
      ...instance,
      snapshot: {
        ...instance.snapshot,
        getSnapshot: instance.snapshot.getSnapshot.pipe(Effect.flatMap(enrich)),
        refresh: instance.snapshot.refresh.pipe(Effect.flatMap(enrich)),
        streamChanges: instance.snapshot.streamChanges.pipe(Stream.mapEffect(enrich)),
      },
    };
  }),
};
