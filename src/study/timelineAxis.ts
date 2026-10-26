import type { ModeSegment } from "./types";

/** A stretch of the session: real time mapped onto the drawn axis. Breaks
 *  (long away spells, or the page being closed) get a fixed width instead
 *  of their real length. */
export interface AxisPiece {
  realStart: number;
  realEnd: number;
  axisStart: number;
  axisEnd: number;
  isBreak: boolean;
}

export interface AxisTick {
  axis: number;
  /** Working minutes at this tick. */
  minutes: number;
}

/** Away for longer than this (or no recording at all) is drawn as a break. */
export const BREAK_AFTER_MS = 5 * 60_000;
/** Width of a break on the axis, in axis milliseconds. */
const BREAK_WIDTH_MS = 60_000;
const TICK_STEPS_MIN = [1, 2, 5, 10, 15, 30, 60, 120, 240];

/**
 * The time axis of a session timeline, SketchLab style, except that long
 * breaks are squeezed to a fixed-width mark: a participant who comes back
 * the next day doesn't turn the plot into two slivers and a gap. Axis
 * units are milliseconds of "drawn time"; everything outside breaks maps
 * 1:1.
 */
export class TimelineAxis {
  readonly pieces: AxisPiece[] = [];

  constructor(timeline: ModeSegment[], breakAfterMs = BREAK_AFTER_MS) {
    const segments = [...timeline]
      .filter((s) => s.end > s.start)
      .sort((a, b) => a.start - b.start);
    let axis = 0;
    let cursor: number | undefined;
    const push = (realStart: number, realEnd: number, isBreak: boolean) => {
      if (realEnd <= realStart) return;
      const last = this.pieces[this.pieces.length - 1];
      if (last && last.isBreak === isBreak) {
        // merge neighbours of the same kind (a gap next to a long away)
        if (!isBreak) axis += realEnd - last.realEnd;
        last.realEnd = realEnd;
        last.axisEnd = axis;
        return;
      }
      const width = isBreak ? BREAK_WIDTH_MS : realEnd - realStart;
      this.pieces.push({
        realStart,
        realEnd,
        axisStart: axis,
        axisEnd: axis + width,
        isBreak,
      });
      axis += width;
    };
    for (const segment of segments) {
      const start = cursor === undefined ? segment.start : Math.max(segment.start, cursor);
      if (cursor !== undefined && start > cursor) {
        push(cursor, start, start - cursor > breakAfterMs);
      }
      const longAway = segment.mode === "away" && segment.end - start > breakAfterMs;
      push(start, segment.end, longAway);
      cursor = Math.max(cursor ?? segment.end, segment.end);
    }
  }

  get start(): number {
    return this.pieces[0]?.realStart ?? 0;
  }

  get end(): number {
    return this.pieces[this.pieces.length - 1]?.realEnd ?? 0;
  }

  /** Total drawn length. */
  get length(): number {
    return this.pieces[this.pieces.length - 1]?.axisEnd ?? 0;
  }

  get breaks(): AxisPiece[] {
    return this.pieces.filter((p) => p.isBreak);
  }

  /** Working time (breaks excluded), in ms. */
  get workingMs(): number {
    return this.pieces.reduce(
      (sum, p) => sum + (p.isBreak ? 0 : p.realEnd - p.realStart),
      0,
    );
  }

  toAxis(real: number): number {
    const piece = this.find(real, "real");
    if (!piece) return real < this.start ? 0 : this.length;
    const f = (real - piece.realStart) / Math.max(piece.realEnd - piece.realStart, 1);
    return piece.axisStart + f * (piece.axisEnd - piece.axisStart);
  }

  toReal(axis: number): number {
    const piece = this.find(axis, "axis");
    if (!piece) return axis <= 0 ? this.start : this.end;
    const f = (axis - piece.axisStart) / Math.max(piece.axisEnd - piece.axisStart, 1);
    return piece.realStart + f * (piece.realEnd - piece.realStart);
  }

  /** Axis position after `ms` of working time. */
  workingToAxis(ms: number): number {
    let left = ms;
    for (const p of this.pieces) {
      if (p.isBreak) continue;
      const span = p.realEnd - p.realStart;
      if (left <= span) return p.axisStart + left;
      left -= span;
    }
    return this.length;
  }

  /** Round-minute ticks of working time, about `target` of them. */
  ticks(target = 8): AxisTick[] {
    const minutes = this.workingMs / 60_000;
    const step =
      TICK_STEPS_MIN.find((s) => minutes / s <= target) ??
      TICK_STEPS_MIN[TICK_STEPS_MIN.length - 1];
    const ticks: AxisTick[] = [];
    for (let m = 0; m <= minutes + 1e-9; m += step) {
      ticks.push({ axis: this.workingToAxis(m * 60_000), minutes: m });
    }
    return ticks;
  }

  private find(value: number, by: "real" | "axis"): AxisPiece | undefined {
    for (const p of this.pieces) {
      const [lo, hi] = by === "real" ? [p.realStart, p.realEnd] : [p.axisStart, p.axisEnd];
      if (value >= lo && value <= hi) return p;
    }
    // inside a gap between pieces can't happen (pieces are contiguous)
    return undefined;
  }
}
