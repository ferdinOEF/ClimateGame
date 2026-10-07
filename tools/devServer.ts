import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";

/**
 * Starts a Vite dev server for a headless tool, and — the part that matters —
 * actually stops it again.
 *
 * WHY THIS IS NOT THREE LINES INLINE
 *
 * Both `smoke.ts` and `walkthrough.ts` had their own copy of
 * `spawn("npm", ["run", "dev", ...], { shell: true })` followed by
 * `server.kill()` in a `finally`. That looks correct and leaks a server every
 * run on Windows, for a reason worth writing down:
 *
 * `shell: true` means the spawned process is `cmd.exe`, not Vite. Vite is a
 * grandchild. `ChildProcess.kill()` signals only the direct child, so cmd dies
 * and Vite carries on holding the port. The symptom is not an error — it is
 * the script appearing to hang after it has finished all its work, because
 * Node will not exit while a child process is still attached, and then the
 * NEXT run failing on `--strictPort` because the last one is still listening.
 *
 * The fix is `taskkill /T`, which walks the tree. POSIX gets the same effect
 * from killing the process group, which `detached: true` is what makes
 * possible.
 */

const ROOT = path.resolve(import.meta.dirname, "..");

export interface DevServer {
  url: string;
  /** Kills the server and everything it spawned. Safe to call twice. */
  stop: () => void;
}

/**
 * Boots a dev server on `port` and resolves once it answers.
 *
 * `--strictPort` on purpose: silently landing on a different port would mean
 * the tool tests a server it did not start, which on a second concurrent run
 * is a genuinely confusing failure.
 */
export async function startDevServer(port: number, timeoutMs = 30000): Promise<DevServer> {
  const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
  const child: ChildProcess = spawn(npmCmd, ["run", "dev", "--", "--port", String(port), "--strictPort"], {
    cwd: ROOT,
    stdio: "pipe",
    shell: true,
    // POSIX: puts the server in its own process group so the whole group can
    // be signalled at once. Ignored on Windows, which uses taskkill below.
    detached: process.platform !== "win32"
  });

  // Drained rather than inherited: Vite is chatty, and its output interleaved
  // with a tool's own progress makes both unreadable. A pipe left unread can
  // also fill and block the writer.
  child.stdout?.on("data", () => {});
  child.stderr?.on("data", () => {});

  let stopped = false;
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    try {
      if (process.platform === "win32") {
        if (child.pid !== undefined) {
          // /T walks the tree, /F does not ask. Errors are ignored: by the
          // time this runs the tree may already be gone, and a teardown that
          // throws would mask whatever the tool was actually reporting.
          spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        }
      } else if (child.pid !== undefined) {
        process.kill(-child.pid, "SIGTERM");
      }
    } catch {
      /* already dead */
    }
    child.kill();
  };

  // A tool that crashes mid-run, or is interrupted, should still give the port
  // back. Without these the next run fails on --strictPort for no visible
  // reason.
  process.once("exit", stop);
  process.once("SIGINT", () => {
    stop();
    process.exit(130);
  });

  const url = `http://localhost:${port}`;
  await waitForServer(url, timeoutMs, stop);
  return { url, stop };
}

function waitForServer(url: string, timeoutMs: number, stop: () => void): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = (): void => {
      fetch(url)
        .then(() => resolve())
        .catch(() => {
          if (Date.now() - start > timeoutMs) {
            stop();
            reject(new Error(`Timed out waiting for the dev server at ${url}`));
          } else {
            setTimeout(tryOnce, 250);
          }
        });
    };
    tryOnce();
  });
}
