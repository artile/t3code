import { EnvironmentId, MessageId, ThreadId } from "@t3tools/contracts";
import {
  collectAssistantCitations,
  serializeAssistantCitation,
  withAssistantCitationComment,
} from "@t3tools/shared/assistantCitations";
import { createRef, useState } from "react";
import { expect, it } from "vite-plus/test";

import { page, userEvent } from "vite-plus/test/browser";

import { findAssistantCitationSourceAnchor } from "~/lib/assistantTextSelection";
import { AssistantSelectionToolbar } from "./chat/AssistantSelectionToolbar";
import { formatAssistantCitationForComposer } from "../composer-logic";
import { act, render } from "../../test/render";
import {
  ComposerPromptEditorTiptap as ComposerPromptEditor,
  type ComposerPromptEditorHandle,
} from "./ComposerPromptEditorTiptap";

const citation = {
  version: 1 as const,
  environmentId: EnvironmentId.make("environment"),
  threadId: ThreadId.make("thread"),
  messageId: MessageId.make("source"),
  text: "hello",
  start: 0,
  end: 5,
  prefix: "",
  suffix: "",
};
const promptBefore = `See ${serializeAssistantCitation(citation)} `;

function Composer({
  question,
  editorRef,
  selectionQuote = false,
}: {
  selectionQuote?: boolean;
  question: boolean;
  editorRef: React.RefObject<ComposerPromptEditorHandle | null>;
}) {
  const [prompt, setPrompt] = useState(selectionQuote ? "" : promptBefore);
  const [viewport, setViewport] = useState<HTMLElement | null>(null);
  const [answer, setAnswer] = useState("");
  return (
    <>
      <div ref={setViewport} data-assistant-citation-viewport="">
        {selectionQuote ? (
          <AssistantSelectionToolbar
            viewport={viewport}
            threadRef={citation}
            onCite={(quote, anchor) => {
              const value = formatAssistantCitationForComposer(quote);
              setPrompt(value);
              editorRef.current?.requestCitationComment({
                previousValue: prompt,
                value,
                citationStart: 0,
                sourceAnchor: anchor,
                insertedSpaces: { before: false, after: false },
              });
              return true;
            }}
          />
        ) : null}
        <p
          data-assistant-citation-source={citation.messageId}
          data-assistant-citation-environment={citation.environmentId}
          data-assistant-citation-thread={citation.threadId}
        >
          <span>hello</span> world
        </p>
      </div>
      <output data-prompt={prompt} data-answer={answer} />
      <ComposerPromptEditor
        editorRef={editorRef}
        value={question ? answer : prompt}
        cursor={0}
        contextRecords={new Map()}
        skills={[]}
        disabled={false}
        placeholder=""
        onChange={(next) => (question ? setAnswer(next) : setPrompt(next))}
        onCitationDraftSave={(replacedValue, savedValue) => {
          if (replacedValue === prompt) setPrompt(savedValue);
        }}
        onPaste={() => {}}
      />
    </>
  );
}

it("keeps an unsaved citation comment when a question takes the composer", async () => {
  const editorRef = createRef<ComposerPromptEditorHandle>();
  await using screen = await render(<Composer question={false} editorRef={editorRef} />);
  const drafts = () => screen.container.querySelector("output")?.dataset;

  const sourceAnchor = findAssistantCitationSourceAnchor(document, citation);
  if (!sourceAnchor) throw new Error("Citation source did not resolve");
  await act(async () =>
    editorRef.current?.requestCitationComment({
      previousValue: "See ",
      value: promptBefore,
      citationStart: "See ".length,
      sourceAnchor,
      insertedSpaces: { before: false, after: true },
    }),
  );
  const comment = page.getByLabelText("Comment on selected text");
  await expect.element(comment).toBeVisible();
  await comment.click();
  await userEvent.keyboard("check this");

  await screen.rerender(<Composer question editorRef={editorRef} />);
  expect(drafts()?.answer).toBe("");
  await screen.rerender(<Composer question={false} editorRef={editorRef} />);

  expect(drafts()?.prompt).toBe(
    `See ${serializeAssistantCitation(withAssistantCitationComment(citation, "check this"))} `,
  );
  await expect.element(page.getByLabelText("Edit citation comment")).toBeInTheDocument();
});

it("selects text, focuses the comment, and saves with Enter without extra clicks", async () => {
  const editorRef = createRef<ComposerPromptEditorHandle>();
  await using screen = await render(
    <Composer question={false} selectionQuote editorRef={editorRef} />,
  );
  await userEvent.dblClick(screen.getByText("hello", { exact: true }));
  const comment = page.getByLabelText("Comment on selected text");
  await expect.element(comment).toBeVisible();
  expect(document.activeElement).toBe(comment.element());
  await userEvent.keyboard("Перевір це{Enter}");
  await expect.element(comment).not.toBeInTheDocument();
  expect(
    collectAssistantCitations(screen.container.querySelector("output")?.dataset.prompt ?? "")[0]
      ?.citation.comment,
  ).toBe("Перевір це");
  await expect.element(page.getByLabelText("Edit citation comment")).toBeInTheDocument();
});
