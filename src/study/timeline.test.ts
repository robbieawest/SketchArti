import { describe, expect, it } from "vitest";
import { ModeTracker, modeTotals } from "./timeline";

function clock() {
  let t = 1000;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("ModeTracker", () => {
  it("derives modes from pane, tool, panel actions and activity", () => {
    const c = clock();
    const tracker = new ModeTracker(c.now);
    tracker.start("open");
    expect(tracker.mode).toBe("idle");
    c.advance(100);
    tracker.setTool("draw");
    expect(tracker.mode).toBe("sketching");
    c.advance(500);
    tracker.setPane("reference");
    expect(tracker.mode).toBe("inspecting");
    c.advance(200);
    tracker.setPane("sketch");
    expect(tracker.mode).toBe("sketching");
    c.advance(50);
    tracker.panelAction("segmenting", "add-part");
    expect(tracker.mode).toBe("segmenting");
    c.advance(50);
    tracker.setTool("joint");
    expect(tracker.mode).toBe("rigging");
    c.advance(300);
    tracker.setAway(true, "hidden");
    expect(tracker.mode).toBe("away");
    c.advance(10_000);
    tracker.setAway(false, "visible");
    c.advance(100);
    tracker.setTool("articulate");
    c.advance(100);
    tracker.stop("close");

    expect(tracker.timeline.map((s) => s.mode)).toEqual([
      "idle",
      "sketching",
      "inspecting",
      "sketching",
      "segmenting",
      "rigging",
      "away",
      "rigging",
      "posing",
    ]);
    // segments are contiguous
    for (let i = 1; i < tracker.timeline.length; i++) {
      expect(tracker.timeline[i].start).toBe(tracker.timeline[i - 1].end);
    }
    const totals = modeTotals(tracker.timeline);
    expect(totals.away).toBe(10_000);
    expect(totals.sketching).toBe(550);
    expect(totals.inspecting).toBe(200);
  });

  it("drops zero-length segments and logs raw events", () => {
    const c = clock();
    const tracker = new ModeTracker(c.now);
    tracker.start("open");
    tracker.setTool("draw"); // same tick as the open
    c.advance(10);
    tracker.stop("close");
    expect(tracker.timeline).toEqual([
      { mode: "sketching", start: 1000, end: 1010 },
    ]);
    expect(tracker.events.map((e) => e.type)).toEqual([
      "session",
      "tool",
      "session",
    ]);
  });

  it("continues an existing chronology on resume", () => {
    const c = clock();
    const first = new ModeTracker(c.now);
    first.start("open");
    c.advance(100);
    first.stop("close");
    c.advance(60_000);
    const second = new ModeTracker(c.now, first.events, first.timeline);
    second.start("resume");
    c.advance(100);
    second.stop("close");
    expect(second.timeline).toHaveLength(2);
    expect(second.events.filter((e) => e.type === "session")).toHaveLength(4);
  });
});
