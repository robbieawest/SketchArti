import type { LogEvent, ModeSegment, StudyMode } from "./types";

/** Which pane the participant last interacted with. */
export type Pane = "reference" | "sketch";

/** The editor's tool names (mirrors the sketch editor's ToolName). */
export type ToolName =
  | "none"
  | "draw"
  | "erase"
  | "select"
  | "segment"
  | "articulate"
  | "joint";

const TOOL_MODES: Record<ToolName, StudyMode> = {
  none: "idle",
  draw: "sketching",
  erase: "sketching",
  select: "sketching",
  segment: "segmenting",
  joint: "rigging",
  articulate: "posing",
};

/**
 * Derives the study mode from the pane, tool and activity, and keeps the
 * session's chronology: contiguous mode segments plus a free-form event
 * log. Pure — time comes from the injected clock — so it is unit-testable
 * and the ui only has to feed it raw facts.
 *
 * Panel actions can override the tool's mode for one stretch (e.g. working
 * the Parts panel while drawing counts as segmenting) until the next tool
 * change or pane switch.
 */
export class ModeTracker {
  readonly events: LogEvent[];
  readonly timeline: ModeSegment[];
  private pane: Pane = "sketch";
  private tool: ToolName = "none";
  private override: StudyMode | null = null;
  private away = false;
  private current: ModeSegment | null = null;

  constructor(
    private readonly now: () => number = Date.now,
    events: LogEvent[] = [],
    timeline: ModeSegment[] = [],
  ) {
    this.events = events;
    this.timeline = timeline;
  }

  get mode(): StudyMode {
    if (this.away) return "away";
    if (this.pane === "reference") return "inspecting";
    return this.override ?? TOOL_MODES[this.tool];
  }

  /** Begin (or resume) recording; the first segment opens now. */
  start(type: "open" | "resume"): void {
    this.log("session", { action: type });
    this.openSegment();
  }

  /** Close the open segment, e.g. before saving or finishing. */
  stop(reason: string): void {
    this.closeSegment();
    this.log("session", { action: reason });
  }

  /** Bring the open segment up to now without ending it (for autosave). */
  touch(): void {
    if (this.current) this.current.end = this.now();
  }

  log(type: string, data?: Record<string, unknown>): void {
    this.events.push({ t: this.now(), type, ...(data && { data }) });
  }

  setPane(pane: Pane): void {
    if (pane === this.pane) return;
    this.pane = pane;
    this.override = null;
    this.log("pane", { pane });
    this.update();
  }

  setTool(tool: ToolName): void {
    if (tool === this.tool) return;
    this.tool = tool;
    this.override = null;
    this.log("tool", { tool });
    this.update();
  }

  /** A panel action that implies a mode regardless of the tool. */
  panelAction(mode: StudyMode, action: string, data?: Record<string, unknown>): void {
    this.pane = "sketch";
    this.override = mode;
    this.log("panel", { action, ...data });
    this.update();
  }

  setAway(away: boolean, reason: string): void {
    if (away === this.away) return;
    this.away = away;
    this.log("activity", { away, reason });
    this.update();
  }

  private update(): void {
    if (!this.current || this.current.mode === this.mode) return;
    this.closeSegment();
    this.openSegment();
  }

  private openSegment(): void {
    const t = this.now();
    this.current = { mode: this.mode, start: t, end: t };
    this.timeline.push(this.current);
  }

  private closeSegment(): void {
    if (!this.current) return;
    this.current.end = this.now();
    // zero-length segments (two switches in one tick) carry no information
    if (this.current.end === this.current.start) this.timeline.pop();
    this.current = null;
  }
}

/** Total milliseconds per mode across a timeline. */
export function modeTotals(timeline: ModeSegment[]): Record<StudyMode, number> {
  const totals: Record<StudyMode, number> = {
    inspecting: 0,
    sketching: 0,
    segmenting: 0,
    rigging: 0,
    posing: 0,
    idle: 0,
    away: 0,
  };
  for (const segment of timeline) {
    totals[segment.mode] += segment.end - segment.start;
  }
  return totals;
}
