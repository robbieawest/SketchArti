import type { ModelIndexEntry } from "../reference/model";

export const MODEL_INDEX_URL = new URL("models/index.json", document.baseURI).href;

let index: Promise<ModelIndexEntry[]> | undefined;

/** The bundled models/index.json, fetched once. */
export function loadModelIndex(): Promise<ModelIndexEntry[]> {
  index ??= fetch(MODEL_INDEX_URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((data: { models: ModelIndexEntry[] }) => data.models);
  index.catch(() => (index = undefined)); // let a later call retry
  return index;
}

/** Absolute URL of a path in the index (model.json, thumbnails). */
export function resolveModelPath(path: string): string {
  return new URL(path, MODEL_INDEX_URL).href;
}
