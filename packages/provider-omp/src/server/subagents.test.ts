import { describe, expect, it } from "@effect/vitest";
import { extractOmpSubagentUpdates } from "./subagents.ts";
import { ompApprovalArgs } from "./driver.ts";
import type { AcpToolCallState } from "@t3tools/provider-acp/server/runtimeModel";
const call = (patch: Partial<AcpToolCallState> = {}): AcpToolCallState => ({
  toolCallId: "call-1",
  status: "inProgress",
  data: {
    name: "Tool",
    rawInput: {
      tasks: [
        { name: "Research", task: "Read the parser" },
        { name: "Review", task: "Review the parser" },
      ],
    },
  },
  ...patch,
});
describe("OMP task lineage", () => {
  it("tracks each batched assignment from dispatch through its result under stable identities", () => {
    const start = call();
    const pending = extractOmpSubagentUpdates(start);
    expect(pending.map((x) => [x.nativeTaskId, x.prompt, x.status])).toEqual([
      ["call-1:omp:0", "Read the parser", "running"],
      ["call-1:omp:1", "Review the parser", "running"],
    ]);
    const done = extractOmpSubagentUpdates({
      ...start,
      status: "completed",
      data: {
        ...start.data,
        rawOutput: {
          details: {
            results: [
              { index: 1, output: "Review done", resolvedModel: "provider/model" },
              { index: 0, output: "Research done" },
            ],
          },
        },
      },
    });
    expect(done.map((x) => [x.nativeTaskId, x.status, x.result])).toEqual([
      ["call-1:omp:0", "completed", "Research done"],
      ["call-1:omp:1", "completed", "Review done"],
    ]);
    expect(done[1]?.model).toBe("provider/model");
    expect(pending.every((update) => update.suppressNormalTool !== false)).toBe(true);
    const progress = extractOmpSubagentUpdates({
      ...start,
      status: "completed",
      data: {
        ...start.data,
        rawOutput: {
          details: {
            results: [],
            progress: [{ index: 0, status: "completed", recentOutput: ["Research done"] }],
            async: { state: "completed" },
          },
        },
      },
    });
    expect(progress[0]?.result).toBe("Research done");
  });
  it("preserves failed and interrupted child outcomes and ignores unrelated tools", () => {
    const start = call();
    const result = extractOmpSubagentUpdates({
      ...start,
      status: "completed",
      data: {
        ...start.data,
        rawOutput: {
          details: {
            results: [
              { index: 0, error: "No provider" },
              { index: 1, aborted: true },
            ],
          },
        },
      },
    });
    expect(result.map((x) => x.status)).toEqual(["failed", "interrupted"]);
    expect(extractOmpSubagentUpdates({ ...start, data: { name: "bash" } })).toEqual([]);
    expect(
      extractOmpSubagentUpdates({
        ...start,
        data: { name: "todo", rawInput: { task: "Not a subagent" } },
      }),
    ).toEqual([]);
  });
  it("does not treat a background launch acknowledgement as completed work", () => {
    const start = call();
    expect(
      extractOmpSubagentUpdates({
        ...start,
        status: "completed",
        data: { ...start.data, rawOutput: { details: { async: { state: "running" } } } },
      }).every((x) => x.status === "running"),
    ).toBe(true);
  });
});
it("maps T3 runtime permissions to OMP launch permissions", () => {
  expect(ompApprovalArgs("approval-required")).toEqual(["acp", "--approval-mode=always-ask"]);
  expect(ompApprovalArgs("auto-accept-edits")).toEqual(["acp", "--approval-mode=write"]);
  expect(ompApprovalArgs("full-access")).toEqual(["acp", "--approval-mode=yolo"]);
});
