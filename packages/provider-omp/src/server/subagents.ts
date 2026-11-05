import * as Predicate from "effect/Predicate";
import type { AcpToolCallState } from "@t3tools/provider-acp/server/runtimeModel";
import type { AcpAdapterV2SubagentUpdate } from "@t3tools/provider-acp/server/adapter";

const record = (value: unknown): Record<string, unknown> =>
  Predicate.isObject(value) ? value : {};
const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;
const array = (value: unknown): ReadonlyArray<unknown> => (Array.isArray(value) ? value : []);

export function extractOmpSubagentUpdates(
  tool: AcpToolCallState,
): ReadonlyArray<AcpAdapterV2SubagentUpdate> {
  if (typeof tool.data.name === "string" && !["task", "Tool"].includes(tool.data.name)) return [];
  const input = record(tool.data.rawInput);
  const tasks = Array.isArray(input.tasks) ? input.tasks : text(input.task) ? [input] : [];
  const output = record(tool.data.rawOutput);
  const details = record(output.details);
  const results = array(details.results);
  const progress = array(details.progress);
  return tasks.flatMap((entry, index) => {
    const task = record(entry);
    const prompt = text(task.task);
    if (!prompt) return [];
    const result = record(results.find((value) => record(value).index === index) ?? results[index]);
    const running = record(
      progress.find((value) => record(value).index === index) ?? progress[index],
    );
    const status: AcpAdapterV2SubagentUpdate["status"] =
      result.aborted === true || running.status === "aborted"
        ? "interrupted"
        : text(result.error) || running.status === "failed" || tool.status === "failed"
          ? "failed"
          : running.status === "completed" ||
              (tool.status === "completed" && details.async === undefined)
            ? "completed"
            : "running";
    return [
      {
        nativeTaskId: `${tool.toolCallId}:omp:${index}`,
        childSessionId: null,
        prompt,
        title: text(task.name) ?? text(task.agent) ?? text(running.agent) ?? "OMP agent",
        model:
          text(result.resolvedModelIdentity) ??
          text(result.resolvedModel) ??
          text(running.resolvedModelIdentity) ??
          text(running.resolvedModel) ??
          null,
        status,
        result:
          text(result.output) ??
          text(result.error) ??
          (status === "completed"
            ? array(running.recentOutput)
                .filter((line): line is string => typeof line === "string")
                .join("\n") || null
            : null),
        suppressNormalTool: true,
      },
    ];
  });
}
