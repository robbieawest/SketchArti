// IndexedDB persistence: one participant record and one session per model.
// It lives in this browser profile only, which is what lets a participant
// close the tab and come back to everything as they left it.

import type { ChunkBody } from "./sync";
import { outboxKey } from "./sync";
import type { ParticipantRecord, SessionRecord } from "./types";

const DB_NAME = "sketcharti";
const DB_VERSION = 2;
const PARTICIPANT = "participant";
const SESSIONS = "sessions";
/** Upload chunks not yet accepted by the receiver, keyed by their path. */
const OUTBOX = "outbox";
const PARTICIPANT_KEY = "me";
/** The endpoint's upload token for this participant (never uploaded). */
const TOKEN_KEY = "uploadToken";

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PARTICIPANT)) {
        db.createObjectStore(PARTICIPANT);
      }
      if (!db.objectStoreNames.contains(SESSIONS)) {
        db.createObjectStore(SESSIONS, { keyPath: "modelId" });
      }
      if (!db.objectStoreNames.contains(OUTBOX)) {
        db.createObjectStore(OUTBOX);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function run<T>(
  store: string,
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = body(tx.objectStore(store));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function loadParticipant(): Promise<ParticipantRecord | undefined> {
  return run(PARTICIPANT, "readonly", (s) => s.get(PARTICIPANT_KEY));
}

export async function saveParticipant(record: ParticipantRecord): Promise<void> {
  await run(PARTICIPANT, "readwrite", (s) => s.put(record, PARTICIPANT_KEY));
}

export function loadSession(modelId: string): Promise<SessionRecord | undefined> {
  return run(SESSIONS, "readonly", (s) => s.get(modelId));
}

export function loadAllSessions(): Promise<SessionRecord[]> {
  return run(SESSIONS, "readonly", (s) => s.getAll());
}

export async function saveSession(record: SessionRecord): Promise<void> {
  // the live tracker keeps mutating its arrays; store a snapshot
  await run(SESSIONS, "readwrite", (s) => s.put(structuredClone(record)));
}

export function loadUploadToken(): Promise<string | undefined> {
  return run(PARTICIPANT, "readonly", (s) => s.get(TOKEN_KEY));
}

export async function saveUploadToken(token: string | undefined): Promise<void> {
  if (token === undefined) {
    await run(PARTICIPANT, "readwrite", (s) => s.delete(TOKEN_KEY));
  } else {
    await run(PARTICIPANT, "readwrite", (s) => s.put(token, TOKEN_KEY));
  }
}

/** Save a session and queue the chunk cut from it in one transaction, so
 *  the session's sync cursor and the outbox can never disagree. */
export async function saveSessionWithChunk(
  record: SessionRecord,
  chunk: ChunkBody | null,
): Promise<void> {
  const db = await openDb();
  const snapshot = structuredClone(record);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SESSIONS, OUTBOX], "readwrite");
    tx.objectStore(SESSIONS).put(snapshot);
    if (chunk) tx.objectStore(OUTBOX).put(chunk, outboxKey(chunk));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function queueChunk(chunk: ChunkBody): Promise<void> {
  await run(OUTBOX, "readwrite", (s) => s.put(chunk, outboxKey(chunk)));
}

/** Outbox entries in key order (= per-session chunk order). */
export async function loadOutbox(): Promise<{ key: string; body: ChunkBody }[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX, "readonly");
    const store = tx.objectStore(OUTBOX);
    const keys = store.getAllKeys();
    const values = store.getAll();
    tx.oncomplete = () =>
      resolve(
        keys.result.map((key, i) => ({
          key: String(key),
          body: values.result[i] as ChunkBody,
        })),
      );
    tx.onerror = () => reject(tx.error);
  });
}

export async function removeFromOutbox(key: string): Promise<void> {
  await run(OUTBOX, "readwrite", (s) => s.delete(key));
}

/** Ask the browser not to evict our data under storage pressure. Best
 *  effort: browsers may decline, and nothing depends on the answer. */
export async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // ignored
  }
}
