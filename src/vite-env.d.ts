/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Receiver that upload chunks are POSTed to (see study/sync.ts);
   *  unset = chunks stay queued in the browser. */
  readonly VITE_SUBMIT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
