// Streaming results out while people work. Nothing here is visible to the
// participant: sessions are cut into append-only chunks, queued in an
// IndexedDB outbox, and an uploader posts them whenever it can, retrying
// quietly until each is accepted.
//
// Wire protocol (whatever endpoint receives it implements just this). Every
// request is a POST to <VITE_SUBMIT_URL> with a JSON body sent as text/plain
// (a "simple" request: no CORS preflight):
//
// - `RegisterBody` → `{ "token": string }`. Issues a random upload token for
//   the participant; the endpoint can budget and revoke per token.
// - `ChunkBody` plus `"token"` → 2xx when stored. 401 means the token is
//   unknown (it is dropped and re-registered). The endpoint stores each
//   chunk under (participant, model, seq), so a re-sent chunk replaces
//   itself and retries never duplicate.

import type {
  LogEvent,
  ModeSegment,
  OpAction,
  ParticipantRecord,
  SessionRecord,
} from "./types";
import type { DocumentJson } from "../core/serialization";

export const APP_ID = "sketcharti";
/** Bump when the chunk shape changes. */
export const PAYLOAD_VERSION = 2;

export interface RegisterBody {
  app: typeof APP_ID;
  payloadVersion: number;
  kind: "register";
  participantId: string;
}

/** Where a session's stream has got to. Stored on the session record. */
export interface SyncCursor {
  /** Next chunk number. */
  seq: number;
  /** Events/actions already cut into chunks. */
  events: number;
  actions: number;
  /** When the last document snapshot was included (0 = never). */
  documentAt: number;
  /** finishedAt value last reported, so a finish is always sent. */
  finishedAt?: number;
}

export type ChunkBody =
  | {
      app: typeof APP_ID;
      payloadVersion: number;
      kind: "participant";
      participantId: string;
      createdAt: number;
      userAgent: string;
      participant: ParticipantRecord;
    }
  | {
      app: typeof APP_ID;
      payloadVersion: number;
      kind: "session";
      participantId: string;
      modelId: string;
      seq: number;
      createdAt: number;
      startedAt: number;
      updatedAt: number;
      finishedAt?: number;
      /** Index of `events[0]` in the session's full event log. */
      eventsFrom: number;
      events: LogEvent[];
      actionsFrom: number;
      actions: OpAction[];
      /** The whole mode timeline so far (small; the last chunk wins). */
      timeline: ModeSegment[];
      /** Occasional full snapshot, for checking replays against. */
      document?: DocumentJson;
      guideFrame?: SessionRecord["guideFrame"];
    };

/** Include a document snapshot at most this often (plus at finish). */
const DOCUMENT_EVERY_MS = 15 * 60_000;
/** Snapshots are a cross-check (the actions replay to the same document),
 *  so one too big for the endpoint's ~2 MB row limit is simply left out. */
const MAX_DOCUMENT_CHARS = 1_000_000;

export function participantChunk(participant: ParticipantRecord): ChunkBody {
  return {
    app: APP_ID,
    payloadVersion: PAYLOAD_VERSION,
    kind: "participant",
    participantId: participant.id,
    createdAt: Date.now(),
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    participant,
  };
}

/**
 * Cut whatever the session has gained since its cursor into one chunk and
 * advance the cursor (on the session record itself). Returns null when
 * there is nothing new. Pure apart from mutating `session.sync`.
 */
export function nextSessionChunk(
  session: SessionRecord,
  now: number,
  force = false,
): ChunkBody | null {
  const cursor: SyncCursor = session.sync ?? {
    seq: 0,
    events: 0,
    actions: 0,
    documentAt: 0,
  };
  const newEvents = session.events.length - cursor.events;
  const newActions = session.actions.length - cursor.actions;
  const finishNews = session.finishedAt !== cursor.finishedAt;
  if (!force && newEvents === 0 && newActions === 0 && !finishNews) return null;

  const withDocument =
    (finishNews ||
      cursor.documentAt === 0 ||
      (newActions > 0 && now - cursor.documentAt >= DOCUMENT_EVERY_MS)) &&
    JSON.stringify(session.document).length <= MAX_DOCUMENT_CHARS;

  const body: ChunkBody = {
    app: APP_ID,
    payloadVersion: PAYLOAD_VERSION,
    kind: "session",
    participantId: session.participantId,
    modelId: session.modelId,
    seq: cursor.seq,
    createdAt: now,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    ...(session.finishedAt !== undefined && { finishedAt: session.finishedAt }),
    eventsFrom: cursor.events,
    events: session.events.slice(cursor.events),
    actionsFrom: cursor.actions,
    actions: session.actions.slice(cursor.actions),
    timeline: session.timeline,
    ...(withDocument && { document: session.document }),
    ...(session.guideFrame && { guideFrame: session.guideFrame }),
  };
  session.sync = {
    seq: cursor.seq + 1,
    events: session.events.length,
    actions: session.actions.length,
    documentAt: withDocument ? now : cursor.documentAt,
    ...(session.finishedAt !== undefined && { finishedAt: session.finishedAt }),
  };
  // detach from the live arrays: the session keeps growing after this
  return structuredClone(body);
}

/** Relative file path a receiver stores a chunk at. Ids are reduced to
 *  safe characters here and again by the receiver. */
export function chunkPath(body: ChunkBody): string {
  const pid = safeId(body.participantId);
  if (body.kind === "participant") return `${pid}/participant.json`;
  return `${pid}/${safeId(body.modelId)}/${String(body.seq).padStart(6, "0")}.json`;
}

export function safeId(id: string): string {
  return id.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100) || "_";
}

/** Outbox key: sorts chunks of one session in order. */
export function outboxKey(body: ChunkBody): string {
  return chunkPath(body);
}
