import { describe, expect, it } from "vitest";
import { chunkPath, nextSessionChunk, type ChunkBody } from "./sync";
import type { SessionRecord } from "./types";

function session(): SessionRecord {
  return {
    modelId: "placeholder-lamp",
    participantId: "a1b2c3d4-0000",
    startedAt: 0,
    updatedAt: 0,
    document: { format: "interactive-arti-design", version: 6, strokes: [] },
    events: [],
    timeline: [],
    actions: [],
  };
}

type SessionChunk = Extract<ChunkBody, { kind: "session" }>;

describe("nextSessionChunk", () => {
  it("cuts append-only chunks that reassemble the whole session", () => {
    const s = session();
    const chunks: SessionChunk[] = [];
    const cut = (now: number, force = false) => {
      const c = nextSessionChunk(s, now, force);
      if (c) chunks.push(c as SessionChunk);
      return c;
    };

    s.events.push({ t: 1, type: "session" });
    expect(cut(1000)).not.toBeNull();
    expect(cut(2000)).toBeNull(); // nothing new
    for (let i = 0; i < 5; i++) {
      s.events.push({ t: 10 + i, type: "tool" });
      s.actions.push({ t: 10 + i, kind: "push", label: "Draw stroke", mode: "sketching", ops: [] });
    }
    cut(3000);
    s.actions.push({ t: 20, kind: "undo", label: "Draw stroke", mode: "sketching", ops: [] });
    cut(4000);
    s.finishedAt = 5000;
    const finish = cut(5000) as SessionChunk;
    expect(finish.finishedAt).toBe(5000);
    expect(finish.document).toBeDefined(); // finishing always snapshots

    expect(chunks.map((c) => c.seq)).toEqual([0, 1, 2, 3]);
    const events = chunks.flatMap((c) => c.events);
    const actions = chunks.flatMap((c) => c.actions);
    expect(events).toEqual(s.events);
    expect(actions).toEqual(s.actions);
    chunks.forEach((c, i) => {
      if (i > 0) expect(c.eventsFrom).toBe(chunks[i - 1].eventsFrom + chunks[i - 1].events.length);
    });
  });

  it("includes the document first time and then only every 15 minutes", () => {
    const s = session();
    s.actions.push({ t: 0, kind: "push", label: "x", mode: "sketching", ops: [] });
    expect((nextSessionChunk(s, 1000) as SessionChunk).document).toBeDefined();
    s.actions.push({ t: 1, kind: "push", label: "x", mode: "sketching", ops: [] });
    expect((nextSessionChunk(s, 60_000) as SessionChunk).document).toBeUndefined();
    s.actions.push({ t: 2, kind: "push", label: "x", mode: "sketching", ops: [] });
    expect((nextSessionChunk(s, 20 * 60_000) as SessionChunk).document).toBeDefined();
  });

  it("detaches chunks from the live session", () => {
    const s = session();
    s.events.push({ t: 1, type: "a" });
    const c = nextSessionChunk(s, 1) as SessionChunk;
    s.timeline.push({ mode: "idle", start: 0, end: 1 });
    expect(c.timeline).toHaveLength(0);
  });

  it("names files by participant, model and sequence", () => {
    const s = session();
    s.events.push({ t: 1, type: "a" });
    const c = nextSessionChunk(s, 1)!;
    expect(chunkPath(c)).toBe("a1b2c3d4-0000/placeholder-lamp/000000.json");
    expect(chunkPath({ ...(c as SessionChunk), modelId: "../../etc" })).toBe(
      "a1b2c3d4-0000/______etc/000000.json",
    );
  });

  it("leaves out snapshots too big for the endpoint", () => {
    const s = session();
    s.document = { ...s.document, strokes: [{ big: "x".repeat(1_100_000) } as never] };
    s.events.push({ t: 1, type: "a" });
    expect((nextSessionChunk(s, 1) as SessionChunk).document).toBeUndefined();
  });
});
