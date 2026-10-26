// Drains the IndexedDB outbox to the endpoint in the background. Never
// surfaces anything to the participant: failures just mean the chunk stays
// queued and is retried later (also on the next visit). Protocol in sync.ts.

import {
  loadOutbox,
  loadParticipant,
  loadUploadToken,
  removeFromOutbox,
  saveUploadToken,
} from "./storage";
import { APP_ID, PAYLOAD_VERSION, type RegisterBody } from "./sync";

export const submitUrl: string | undefined =
  import.meta.env.VITE_SUBMIT_URL || undefined;

const BASE_DELAY_MS = 10_000;
const MAX_DELAY_MS = 5 * 60_000;

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let delay = BASE_DELAY_MS;
let started = false;

/** Begin the background loop (idempotent). No-op without an endpoint. */
export function startUploader(): void {
  if (started || !submitUrl) return;
  started = true;
  window.addEventListener("online", kickUploader);
  window.addEventListener("pagehide", beaconOutbox);
  kickUploader();
}

/** Try to drain now (e.g. right after queueing a chunk). */
export function kickUploader(): void {
  if (!started) return;
  clearTimeout(timer);
  void drain();
}

function post(body: unknown): Promise<Response> {
  return fetch(submitUrl!, {
    method: "POST",
    // text/plain keeps this a "simple" request: no CORS preflight
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
  });
}

/** The stored upload token, registering for one first if needed.
 *  Undefined before consent (no participant yet). */
async function ensureToken(): Promise<string | undefined> {
  const stored = await loadUploadToken();
  if (stored) return stored;
  const participant = await loadParticipant();
  if (!participant) return undefined;
  const register: RegisterBody = {
    app: APP_ID,
    payloadVersion: PAYLOAD_VERSION,
    kind: "register",
    participantId: participant.id,
  };
  const response = await post(register);
  if (!response.ok) throw new Error(`registration answered ${response.status}`);
  const { token } = (await response.json()) as { token?: unknown };
  if (typeof token !== "string" || !token) throw new Error("registration gave no token");
  await saveUploadToken(token);
  return token;
}

async function drain(): Promise<void> {
  if (running || !submitUrl) return;
  running = true;
  try {
    const outbox = await loadOutbox();
    const token = outbox.length > 0 ? await ensureToken() : undefined;
    let refused = 0;
    for (const { key, body } of token ? outbox : []) {
      const response = await post({ ...body, token });
      if (response.status === 401) {
        // the endpoint no longer knows this token: get a new one next round
        await saveUploadToken(undefined);
        throw new Error("upload token rejected");
      }
      if (response.status === 429 || response.status >= 500) {
        throw new Error(`endpoint answered ${response.status}`); // try later
      }
      if (!response.ok) {
        // refused for this chunk only (shape, size…): keep it queued but
        // don't let it hold back the chunks after it
        refused++;
        continue;
      }
      await removeFromOutbox(key);
    }
    if (refused > 0) throw new Error(`${refused} chunk(s) refused`);
    delay = BASE_DELAY_MS;
  } catch (error) {
    console.warn("upload deferred:", error);
    delay = Math.min(delay * 2, MAX_DELAY_MS);
  } finally {
    running = false;
    timer = setTimeout(() => void drain(), delay);
  }
}

/** Last-chance send as the page goes away. Beacons give no answer, so the
 *  chunks stay queued and are re-sent (idempotently) next time. Only
 *  possible once a token exists. */
function beaconOutbox(): void {
  if (!submitUrl || !navigator.sendBeacon) return;
  void Promise.all([loadOutbox(), loadUploadToken()]).then(([entries, token]) => {
    if (!token) return;
    for (const { body } of entries) {
      navigator.sendBeacon(
        submitUrl!,
        new Blob([JSON.stringify({ ...body, token })], { type: "text/plain;charset=utf-8" }),
      );
    }
  });
}
