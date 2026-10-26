import { describe, expect, it } from "vitest";
import { formatDuration, loadDownload, loadResultsFolder, participantTotals } from "./results";

const MIN = 60_000;

const sketch = (strokes: number) => ({
  format: "interactive-arti-design",
  version: 6,
  strokes: Array.from({ length: strokes }, (_, i) => ({ id: `s${i}` })),
  parts: [{ id: "p" }],
  joints: [],
});

const log = (finished: boolean) => ({
  modelId: "m",
  startedAt: 0,
  updatedAt: 20 * MIN,
  ...(finished && { finishedAt: 20 * MIN }),
  timeline: [
    { mode: "sketching", start: 0, end: 10 * MIN },
    { mode: "away", start: 10 * MIN, end: 15 * MIN },
    { mode: "rigging", start: 15 * MIN, end: 20 * MIN },
  ],
  events: [],
  actions: [],
});

function files(entries: Record<string, unknown>) {
  return new Map(
    Object.entries(entries).map(([path, value]) => [path, async () => JSON.stringify(value)]),
  );
}

describe("loadResultsFolder", () => {
  it("finds participants and sessions under any folder prefix", async () => {
    const participants = await loadResultsFolder(
      files({
        "out/abc12345/participant.json": { profile: { role: "student" } },
        "out/abc12345/lamp/sketch.json": sketch(3),
        "out/abc12345/lamp/log.json": log(true),
        "out/abc12345/cabinet/sketch.json": sketch(5),
        "out/abc12345/cabinet/log.json": log(false),
        "out/def67890/lamp/sketch.json": sketch(1),
        "out/def67890/lamp/log.json": log(false),
      }),
    );
    expect(participants.map((p) => p.code)).toEqual(["abc12345", "def67890"]);
    const [first] = participants;
    expect(first.profile).toEqual({ role: "student" });
    expect(first.sessions.map((s) => s.modelId)).toEqual(["cabinet", "lamp"]);
    expect(participantTotals(first)).toEqual({
      models: 2,
      finished: 1,
      activeMs: 30 * MIN, // away excluded
      strokes: 8,
    });
  });

  it("takes stats from summary.json when there is one", async () => {
    const [p] = await loadResultsFolder(
      files({
        "out/summary.json": [
          {
            participant: "abc12345",
            model: "lamp",
            finished: true,
            activeMinutes: 42,
            strokes: 99,
            parts: 4,
            joints: 3,
          },
        ],
        "out/abc12345/lamp/sketch.json": sketch(3),
        "out/abc12345/lamp/log.json": log(false),
      }),
    );
    expect(p.sessions[0]).toMatchObject({ finished: true, activeMs: 42 * MIN, strokes: 99 });
  });
});

describe("loadDownload", () => {
  it("reads the app's own download", async () => {
    const [p] = loadDownload(
      JSON.stringify({
        app: "sketcharti",
        participant: { id: "test-1234-5678", profile: {} },
        sessions: [{ ...log(true), document: sketch(2) }],
      }),
    );
    expect(p.code).toBe("test-123");
    expect(p.sessions[0]).toMatchObject({ finished: true, strokes: 2, activeMs: 15 * MIN });
    expect((await p.sessions[0].loadLog()).timeline).toHaveLength(3);
  });

  it("rejects other files", () => {
    expect(() => loadDownload("{}")).toThrow();
  });
});

describe("formatDuration", () => {
  it("reads naturally", () => {
    expect(formatDuration(40_000)).toBe("40 s");
    expect(formatDuration(12 * MIN)).toBe("12 min");
    expect(formatDuration(65 * MIN)).toBe("1 h 05 min");
  });
});
