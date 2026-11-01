/**
 * Client side of the short bulk lock (Round 9). While an import / Find leads
 * runs in this tab: renew the server lock every ~20s (TTL 60s), and release
 * it the moment the tab goes away (pagehide → sendBeacon, keepalive fetch
 * fallback). Whatever was already imported/found stays saved.
 */
export const BULK_LOCK_HEARTBEAT_MS = 20_000;

export interface KeepaliveDeps {
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (id: unknown) => void;
  addPageHide: (fn: () => void) => void;
  removePageHide: (fn: () => void) => void;
  post: (url: string, body: string, opts: { beacon: boolean }) => void;
}

function browserDeps(): KeepaliveDeps {
  return {
    setInterval: (fn, ms) => window.setInterval(fn, ms),
    clearInterval: (id) => window.clearInterval(id as number),
    addPageHide: (fn) => window.addEventListener("pagehide", fn),
    removePageHide: (fn) => window.removeEventListener("pagehide", fn),
    post: (url, body, { beacon }) => {
      if (beacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
        if (navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))) return;
      }
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
        credentials: "same-origin",
      }).catch(() => undefined);
    },
  };
}

/**
 * Start renewing `boardId`'s lock; returns stop(). `onPageHide` runs first
 * on tab close (e.g. finalize the import run) before the release beacon.
 */
export function startBulkLockKeepalive(
  boardId: string,
  opts?: { onPageHide?: () => void; deps?: KeepaliveDeps; intervalMs?: number },
): () => void {
  const deps = opts?.deps ?? browserDeps();
  const url = `/api/boards/${encodeURIComponent(boardId)}/lock`;
  let stopped = false;
  const timer = deps.setInterval(() => {
    if (!stopped) deps.post(url, JSON.stringify({ action: "renew" }), { beacon: false });
  }, opts?.intervalMs ?? BULK_LOCK_HEARTBEAT_MS);
  const stop = () => {
    if (stopped) return;
    stopped = true;
    deps.clearInterval(timer);
    deps.removePageHide(onHide);
  };
  function onHide() {
    if (stopped) return;
    try {
      opts?.onPageHide?.();
    } catch {
      /* best-effort */
    }
    deps.post(url, JSON.stringify({ action: "release" }), { beacon: true });
    stop();
  }
  deps.addPageHide(onHide);
  return stop;
}
