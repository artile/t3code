import { describe, expect, it } from "@effect/vitest";
import { normalizeOmpToolCall } from "./toolCalls.ts";
import {
  extractMcpToolCallIdentity,
  mergeToolCallState,
} from "@t3tools/provider-acp/server/runtimeModel";
import { htmlRenderFromToolItem } from "@t3tools/shared/toolOutput";

describe("OMP MCP device calls", () => {
  it("keeps HTML output renderable after a partial ACP completion", () => {
    const initial = normalizeOmpToolCall({
      toolCallId: "render",
      kind: "execute",
      status: "pending",
      data: {
        name: "write",
        rawInput: {
          path: "xd://mcp__t3_code_html_render",
          content: '{"html":"<p>Quote</p>","title":"Page","height":80}',
        },
      },
    });
    const page = { attachmentId: "page-html", title: "Page", height: 80 };
    const finished = normalizeOmpToolCall(
      mergeToolCallState(initial, {
        toolCallId: "render",
        status: "completed",
        data: {
          rawOutput: { content: [{ type: "text", text: JSON.stringify({ htmlRender: page }) }] },
        },
      }),
    );
    expect(extractMcpToolCallIdentity(finished)).toEqual({
      server: "t3-code",
      tool: "html_render",
    });
    expect(finished.data.rawInput).toMatchObject({
      arguments: { html: "<p>Quote</p>", title: "Page", height: 80 },
    });
    expect(
      htmlRenderFromToolItem({ toolName: "t3-code.html_render", output: finished.data.rawOutput }),
    ).toEqual(page);
  });
  it("does not promote a file write or a foreign device to a T3 tool", () => {
    for (const path of [
      "page.html",
      "xd://mcp__foreign_html_render",
      "xd://mcp__t3_code_html_render/extra",
    ]) {
      const tool = {
        toolCallId: "file",
        data: { name: "write", rawInput: { path, content: "{}" } },
      };
      expect(normalizeOmpToolCall(tool)).toBe(tool);
    }
  });
});
