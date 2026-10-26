// Study-wide switches, kept in one place so conditions can be tried out
// before the study (e.g. which proportion guides participants may use).

import type { SnapLevel } from "../engine/CanvasSurface";
import type { GuideKind } from "../engine/ReferenceGuide";

export const STUDY_CONFIG = {
  /** Guides offered in the sketch view, in menu order. Drop entries to
   *  withhold them; leave only "none" to hide the control entirely. */
  guides: ["none", "box", "parts", "ghost"] as GuideKind[],
  defaultGuide: "none" as GuideKind,
  /** Starting snap level for the plane/joint gizmos. */
  snap: "fine" as SnapLevel,
  /** Testing only: a "Download data" button in the top bar and picker.
   *  Turn off for the real study. */
  allowDownload: true,
};

export const GUIDE_LABELS: Record<GuideKind, string> = {
  none: "No guide",
  box: "Guide: outer box",
  parts: "Guide: part boxes",
  ghost: "Guide: ghost model",
};
