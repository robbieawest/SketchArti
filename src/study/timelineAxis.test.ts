import { describe, expect, it } from "vitest";
import { TimelineAxis } from "./timelineAxis";
import type { ModeSegment } from "./types";

const MIN = 60_000;
const HOUR = 60 * MIN;

describe("TimelineAxis", () => {
  it("maps a continuous session one to one", () => {
    const axis = new TimelineAxis([
      { mode: "sketching", start: 1000, end: 1000 + 10 * MIN },
      { mode: "away", start: 1000 + 10 * MIN, end: 1000 + 12 * MIN },
      { mode: "rigging", start: 1000 + 12 * MIN, end: 1000 + 20 * MIN },
    ]);
    expect(axis.breaks).toHaveLength(0);
    expect(axis.length).toBe(20 * MIN);
    expect(axis.toAxis(1000 + 5 * MIN)).toBe(5 * MIN);
    expect(axis.toReal(15 * MIN)).toBe(1000 + 15 * MIN);
  });

  it("squeezes long away spells and closed-page gaps into breaks", () => {
    const segments: ModeSegment[] = [
      { mode: "sketching", start: 0, end: 10 * MIN },
      { mode: "away", start: 10 * MIN, end: 2 * HOUR },
      // page closed until the next day
      { mode: "posing", start: 20 * HOUR, end: 20 * HOUR + 5 * MIN },
    ];
    const axis = new TimelineAxis(segments);
    expect(axis.breaks).toHaveLength(1); // the away and the gap merge
    expect(axis.breaks[0].realEnd).toBe(20 * HOUR);
    expect(axis.workingMs).toBe(15 * MIN);
    expect(axis.length).toBe(16 * MIN); // 15 working + a one-minute break
    // round trips outside the break
    for (const real of [0, 5 * MIN, 20 * HOUR + 2 * MIN]) {
      expect(axis.toReal(axis.toAxis(real))).toBeCloseTo(real);
    }
    expect(axis.toAxis(20 * HOUR + 5 * MIN)).toBe(axis.length);
  });

  it("puts ticks on working minutes", () => {
    const axis = new TimelineAxis([
      { mode: "sketching", start: 0, end: 10 * MIN },
      { mode: "away", start: 10 * MIN, end: HOUR },
      { mode: "sketching", start: HOUR, end: HOUR + 10 * MIN },
    ]);
    const ticks = axis.ticks(8);
    expect(ticks.map((t) => t.minutes)).toEqual([0, 5, 10, 15, 20]);
    // 15 working minutes sits 5 minutes past the one-minute break
    expect(ticks[3].axis).toBe(16 * MIN);
  });
});
