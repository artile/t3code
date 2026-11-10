import { createContext, useEffect, useLayoutEffect, useState, type RefObject } from "react";
import type { LegendListRef } from "@legendapp/list/react";
import { MessageId, type RunId, type ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Option from "effect/Option";
import type { MessagesTimelineRow } from "./MessagesTimeline.logic";
import type { TimelineViewport } from "./timelineViewport";
import { settleListScroll } from "./useTimelinePositionRestore";
import type { TimelineEntry } from "../../session-logic";

export interface ReplyReadingRequest extends ScopedThreadRef {
  readonly runId: RunId;
  readonly key: string;
}

declare module "@tanstack/react-router" {
  interface HistoryState {
    notifiedReply?: ReplyReadingRequest;
  }
}

const Marker = Schema.Struct({ messageId: MessageId, lastUserId: Schema.NullOr(MessageId) });
const StoredReading = Schema.Struct({
  handled: Schema.NullOr(Schema.String),
  marker: Schema.NullOr(Marker),
  anchor: Schema.NullOr(MessageId),
});
const decodeReading = Schema.decodeUnknownOption(Schema.fromJsonString(StoredReading));
const storageKey = (identity: string) => `t3:reply-reading:${identity}`;
function readReading(identity: string) {
  try {
    return Option.getOrElse(decodeReading(sessionStorage.getItem(storageKey(identity))), () => ({
      handled: null,
      marker: null,
      anchor: null,
    }));
  } catch {
    return { handled: null, marker: null, anchor: null };
  }
}

export const ReplyReadingMarkerContext = createContext<MessageId | null>(null);

function finalReplyRow(rows: ReadonlyArray<MessagesTimelineRow>, runId: RunId) {
  return rows.findLast(
    (row) =>
      row.kind === "message" && row.message.role === "assistant" && row.message.runId === runId,
  );
}

/** The first row after the user message that started the run: the top of the reply. */
function replyStartRow(rows: ReadonlyArray<MessagesTimelineRow>, runId: RunId) {
  const start = rows.findIndex(
    (row) => row.kind === "message" && row.message.role === "user" && row.message.runId === runId,
  );
  return start >= 0 ? rows[start + 1] : undefined;
}

export function useReplyReading({
  identity,
  request,
  rows,
  entries,
  listRef,
  viewport,
  listReady,
}: {
  identity: string;
  request: ReplyReadingRequest | null;
  rows: ReadonlyArray<MessagesTimelineRow>;
  entries: ReadonlyArray<TimelineEntry>;
  listRef: RefObject<LegendListRef | null>;
  viewport: RefObject<TimelineViewport | null>;
  listReady: boolean;
}) {
  const [visit, setVisit] = useState(() => ({ identity, ...readReading(identity) }));
  if (visit.identity !== identity) setVisit({ identity, ...readReading(identity) });
  const lastUser = entries.findLast(
    (entry) => entry.kind === "message" && entry.message.role === "user",
  );
  const lastUserId = lastUser?.kind === "message" ? lastUser.message.id : null;
  const marker = visit.identity === identity ? visit.marker : readReading(identity).marker;
  const markerExpired = marker !== null && lastUserId !== null && marker.lastUserId !== lastUserId;
  if (markerExpired && visit.identity === identity) setVisit({ ...visit, marker: null });
  const pending = request !== null && visit.handled !== request.key;
  const target = request ? finalReplyRow(rows, request.runId) : undefined;
  // Fork: open the reply at its start, not at its last message, so the reader reads top-down.
  const targetId = request ? (replyStartRow(rows, request.runId)?.id ?? target?.id) : undefined;
  const targetMessageId = target?.kind === "message" ? target.message.id : null;

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- persists the notification reading marker across a browser reload
  useEffect(() => {
    if (visit.identity !== identity) return;
    try {
      sessionStorage.setItem(
        storageKey(identity),
        JSON.stringify({ handled: visit.handled, marker: visit.marker, anchor: visit.anchor }),
      );
    } catch {
      /* Storage can be disabled by the browser. */
    }
  }, [identity, visit]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- positions the virtual list on the notified final reply before revealing it
  useLayoutEffect(() => {
    const list = listRef.current;
    const view = viewport.current;
    if (!pending || !request || !listReady || !targetId || !targetMessageId || !list || !view)
      return;
    view.navigate({ releasesFollow: true });
    const release = view.holdProgrammaticScroll();
    let stopped = false;
    const finish = (keepAnchor = true) => {
      if (stopped) return;
      stopped = true;
      release();
      unsubscribe();
      setVisit({
        identity,
        handled: request.key,
        marker: { messageId: targetMessageId, lastUserId },
        anchor: keepAnchor ? targetMessageId : null,
      });
    };
    const unsubscribe = view.subscribe(() => {
      finish(false);
      void list.scrollToOffset({ offset: view.scrollNode.scrollTop, animated: false });
    });
    const index = list.getState().indexByKey(targetId);
    if (index === undefined) {
      release();
      unsubscribe();
      return;
    }
    void list
      .scrollToIndex({ index, animated: false, viewPosition: 0, viewOffset: 24 })
      .then(async () => {
        if (stopped || listRef.current !== list) return;
        await settleListScroll(
          list,
          (node) => {
            const state = list.getState();
            const current = state.indexByKey(targetId);
            const element = current === undefined ? undefined : state.elementAtIndex(current);
            return element
              ? Math.max(
                  0,
                  node.scrollTop +
                    element.getBoundingClientRect().top -
                    node.getBoundingClientRect().top -
                    24,
                )
              : undefined;
          },
          () => stopped || listRef.current !== list,
        );
        finish();
      });
    return () => {
      stopped = true;
      release();
      unsubscribe();
    };
  }, [
    identity,
    request,
    pending,
    targetId,
    targetMessageId,
    lastUserId,
    listReady,
    listRef,
    viewport,
  ]);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- releases notification end space when the reader explicitly moves the viewport
  useEffect(() => {
    if (!visit.anchor || !listReady) return;
    return viewport.current?.subscribe((navigation) => {
      if (navigation.source === "pointer") return;
      setVisit((current) => (current.anchor ? { ...current, anchor: null } : current));
    });
  }, [visit.anchor, listReady, viewport]);

  return {
    anchorMessageId: pending ? targetMessageId : visit.anchor,
    positioning: pending && (!listReady || targetId !== undefined),
    targetId: pending ? targetId : undefined,
    markerId: markerExpired ? null : (marker?.messageId ?? null),
  };
}
