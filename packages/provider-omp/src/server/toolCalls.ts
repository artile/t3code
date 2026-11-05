import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import * as Predicate from "effect/Predicate";
import type { AcpToolCallState } from "@t3tools/provider-acp/server/runtimeModel";

const decodeArguments = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);

// OMP dispatches MCP through its write device rather than an ACP MCP tool call.
export function normalizeOmpToolCall(tool: AcpToolCallState): AcpToolCallState {
  const input = Predicate.isObject(tool.data.rawInput) ? tool.data.rawInput : undefined;
  const path = input && "path" in input ? input.path : undefined;
  if (tool.data.name !== "write" || typeof path !== "string") return tool;
  const match = /^xd:\/\/mcp__t3_code_([A-Za-z0-9_]+)$/.exec(path);
  if (!match?.[1]) return tool;
  const args =
    typeof input?.content === "string"
      ? Option.getOrUndefined(decodeArguments(input.content))
      : undefined;
  return {
    ...tool,
    data: {
      ...tool.data,
      meta: { serverId: "t3-code", toolName: match[1] },
      rawInput: { ...input, ...(args === undefined ? {} : { arguments: args }) },
    },
  };
}
