// Reading study results back for the data viewer. Two sources:
//   - a results folder (one folder per participant, one per model, each
//     with sketch.json + log.json, and optionally summary.json at the top),
//   - a single "Download data" file from this app.
// File access is abstracted as path → reader, so this stays DOM-free.

import type { DocumentJson } from "../core/serialization";
import type { LogEvent, ModeSegment, OpAction, SessionRecord } from "./types";

export interface ResultLog {
  modelId: string;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number | null;
  timeline: ModeSegment[];
  events: LogEvent[];
  actions: OpAction[];
  guideFrame?: SessionRecord["guideFrame"];
  warnings?: string[];
}

export interface ResultSession {
  modelId: string;
  finished: boolean;
  /** Time not away, in ms. */
  activeMs: number;
  strokes: number;
  parts: number;
  joints: number;
  loadSketch(): Promise<DocumentJson>;
  loadLog(): Promise<ResultLog>;
}

export interface ResultParticipant {
  code: string;
  profile?: Record<string, string>;
  sessions: ResultSession[];
}

export type FileReaders = Map<string, () => Promise<string>>;

export function activeMs(timeline: ModeSegment[]): number {
  return timeline.reduce(
    (sum, s) => sum + (s.mode === "away" ? 0 : Math.max(0, s.end - s.start)),
    0,
  );
}

function countsOf(sketch: DocumentJson) {
  return {
    strokes: sketch.strokes.length,
    parts: sketch.parts?.length ?? 0,
    joints: sketch.joints?.length ?? 0,
  };
}

/** Lazily parsed JSON, read at most once. */
function lazyJson<T>(read: () => Promise<string>): () => Promise<T> {
  let value: Promise<T> | undefined;
  return () => (value ??= read().then((text) => JSON.parse(text) as T));
}

interface SummaryRow {
  participant: string;
  model: string;
  finished: boolean;
  activeMinutes: number;
  strokes: number;
  parts: number;
  joints: number;
}

/**
 * A results folder, as produced by the study's results script. Paths may
 * start with any prefix (the folder's own name); only the last segments
 * matter: `<code>/participant.json`, `<code>/<model>/sketch.json|log.json`,
 * `summary.json`. Stats come from summary.json when present, otherwise
 * from reading every session.
 */
export async function loadResultsFolder(files: FileReaders): Promise<ResultParticipant[]> {
  const participants = new Map<string, ResultParticipant>();
  const sessionFiles = new Map<string, { sketch?: () => Promise<string>; log?: () => Promise<string> }>();
  let summary: SummaryRow[] | undefined;

  const participant = (code: string) => {
    let p = participants.get(code);
    if (!p) participants.set(code, (p = { code, sessions: [] }));
    return p;
  };

  // summary.json at the shallowest level is the folder's own
  const summaryPath = [...files.keys()]
    .filter((path) => path.split("/").pop() === "summary.json")
    .sort((a, b) => a.split("/").length - b.split("/").length)[0];
  if (summaryPath) {
    try {
      summary = JSON.parse(await files.get(summaryPath)!()) as SummaryRow[];
    } catch {
      summary = undefined;
    }
  }

  for (const [path, read] of files) {
    const parts = path.split("/");
    const name = parts[parts.length - 1];
    if (name === "participant.json" && parts.length >= 2) {
      const record = JSON.parse(await read()) as { profile?: Record<string, string> };
      participant(parts[parts.length - 2]).profile = record.profile;
    } else if ((name === "sketch.json" || name === "log.json") && parts.length >= 3) {
      const key = `${parts[parts.length - 3]}/${parts[parts.length - 2]}`;
      const entry = sessionFiles.get(key) ?? {};
      entry[name === "sketch.json" ? "sketch" : "log"] = read;
      sessionFiles.set(key, entry);
    }
  }

  for (const [key, entry] of sessionFiles) {
    if (!entry.sketch || !entry.log) continue;
    const [code, modelId] = key.split("/");
    const loadSketch = lazyJson<DocumentJson>(entry.sketch);
    const loadLog = lazyJson<ResultLog>(entry.log);
    const row = summary?.find((r) => r.participant === code && r.model === modelId);
    let stats;
    if (row) {
      stats = {
        finished: row.finished,
        activeMs: row.activeMinutes * 60_000,
        strokes: row.strokes,
        parts: row.parts,
        joints: row.joints,
      };
    } else {
      const [sketch, log] = await Promise.all([loadSketch(), loadLog()]);
      stats = {
        finished: log.finishedAt != null,
        activeMs: activeMs(log.timeline),
        ...countsOf(sketch),
      };
    }
    participant(code).sessions.push({ modelId, ...stats, loadSketch, loadLog });
  }

  return sortParticipants([...participants.values()].filter((p) => p.sessions.length > 0));
}

/** A "Download data" file from this app: one participant, full sessions. */
export function loadDownload(text: string): ResultParticipant[] {
  const data = JSON.parse(text) as {
    app?: string;
    participant?: { id: string; profile?: Record<string, string> };
    sessions?: SessionRecord[];
  };
  if (data.app !== "sketcharti" || !data.participant || !Array.isArray(data.sessions)) {
    throw new Error("not a SketchArti download");
  }
  return sortParticipants([
    {
      code: data.participant.id.slice(0, 8),
      profile: data.participant.profile,
      sessions: data.sessions.map((s) => ({
        modelId: s.modelId,
        finished: s.finishedAt !== undefined,
        activeMs: activeMs(s.timeline),
        ...countsOf(s.document),
        loadSketch: async () => s.document,
        loadLog: async () => ({
          modelId: s.modelId,
          startedAt: s.startedAt,
          updatedAt: s.updatedAt,
          finishedAt: s.finishedAt,
          timeline: s.timeline,
          events: s.events,
          actions: s.actions,
          guideFrame: s.guideFrame,
        }),
      })),
    },
  ]);
}

function sortParticipants(list: ResultParticipant[]): ResultParticipant[] {
  for (const p of list) p.sessions.sort((a, b) => a.modelId.localeCompare(b.modelId));
  return list.sort((a, b) => a.code.localeCompare(b.code));
}

export function participantTotals(p: ResultParticipant) {
  return {
    models: p.sessions.length,
    finished: p.sessions.filter((s) => s.finished).length,
    activeMs: p.sessions.reduce((sum, s) => sum + s.activeMs, 0),
    strokes: p.sessions.reduce((sum, s) => sum + s.strokes, 0),
  };
}

/** "1 h 05 min", "12 min", "40 s". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const minutes = Math.round(totalSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;
}
