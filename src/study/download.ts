import { APP_ID, PAYLOAD_VERSION } from "./sync";
import { modeTotals } from "./timeline";
import type { ParticipantRecord, SessionRecord } from "./types";

/** The testing download: the participant and every full session, with mode
 *  totals per session for a quick look. Same session shape the receiver
 *  reassembles from chunks. */
export function serializeDownload(
  participant: ParticipantRecord,
  sessions: SessionRecord[],
): string {
  return JSON.stringify({
    app: APP_ID,
    payloadVersion: PAYLOAD_VERSION,
    exportedAt: Date.now(),
    participant,
    sessions: sessions.map((session) => ({
      ...session,
      modeTotalsMs: modeTotals(session.timeline),
    })),
  });
}
