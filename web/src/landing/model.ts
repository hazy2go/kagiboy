/**
 * The console model, fetched as early as a page knows it needs it: in parallel with the three.js
 * chunk instead of after it. One download is shared until a scene takes it.
 */
const URL_ = "/3d/kagiboy.glb";
let pending: Promise<ArrayBuffer> | null = null;

/** Starts the download (if it isn't running already). */
export function prefetchModel() {
  pending ??= fetch(URL_).then((r) => {
    if (!r.ok) throw new Error(`model ${r.status}`);
    return r.arrayBuffer();
  });
  pending.catch(() => (pending = null));
}

/** The model's bytes; the next page visit starts a fresh (HTTP-cached) download. */
export function takeModel(): Promise<ArrayBuffer> {
  prefetchModel();
  const p = pending!;
  pending = null;
  return p;
}
