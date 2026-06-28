import { readFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";

/**
 * A tiny zero-dependency dev server for `theia watch`.
 *
 * It serves the freshly-built deck (re-read from disk on every request, so a
 * rebuild is picked up immediately) and exposes a Server-Sent Events endpoint
 * the injected client listens on. Calling `reload()` pushes an event and the
 * open browser reloads itself — no websocket library, no build-time changes to
 * the shipped bundle (the reload snippet is injected only when served here).
 */

const SSE_PATH = "/__theia_livereload";

/** Injected into served HTML only (never written to the build artifact). */
const RELOAD_SNIPPET = `<script>
(function () {
  try {
    var es = new EventSource(${JSON.stringify(SSE_PATH)});
    es.addEventListener("reload", function () { location.reload(); });
  } catch (e) { /* live reload unavailable; deck still works */ }
})();
</script>`;

export interface DevServer {
  url: string;
  /** Tell every connected browser to reload. */
  reload(): void;
  close(): Promise<void>;
}

function injectReload(html: string): string {
  return html.includes("</body>")
    ? html.replace("</body>", `${RELOAD_SNIPPET}\n</body>`)
    : html + RELOAD_SNIPPET;
}

/** Resolve once the server is listening on `port`, or reject (e.g. in use). */
function tryListen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException): void => {
      server.removeListener("listening", onListening);
      reject(err);
    };
    const onListening = (): void => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
}

export interface ServeOptions {
  host?: string;
  /** Preferred port; if taken, the next few ports are tried. */
  port?: number;
}

/** Start the dev server for a built HTML deck. */
export async function startDevServer(
  htmlPath: string,
  options: ServeOptions = {},
): Promise<DevServer> {
  const host = options.host ?? "127.0.0.1";
  const clients = new Set<ServerResponse>();

  const server = createServer(
    (req: IncomingMessage, res: ServerResponse): void => {
      const url = (req.url ?? "/").split("?")[0] ?? "/";

      // Live-reload event stream.
      if (url === SSE_PATH) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write(":\n\n"); // open the stream
        clients.add(res);
        req.on("close", () => clients.delete(res));
        return;
      }

      // Everything else serves the (freshly read) deck with reload injected.
      if (url === "/" || url === "/index.html" || url.endsWith(".html")) {
        readFile(htmlPath, "utf8")
          .then((html) => {
            res.writeHead(200, {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-cache",
            });
            res.end(injectReload(html));
          })
          .catch(() => {
            res.writeHead(500);
            res.end("Build not ready.");
          });
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    },
  );

  // Find a free port, starting at the preferred one.
  const preferred = options.port ?? 4321;
  let bound = false;
  let lastErr: unknown;
  for (let port = preferred; port < preferred + 20; port++) {
    try {
      await tryListen(server, host, port);
      bound = true;
      break;
    } catch (err) {
      lastErr = err;
      if ((err as NodeJS.ErrnoException).code !== "EADDRINUSE") throw err;
    }
  }
  if (!bound) throw lastErr ?? new Error("Could not bind a port");

  const address = server.address();
  const port = typeof address === "object" && address ? address.port : preferred;

  return {
    url: `http://${host}:${port}/`,
    reload(): void {
      for (const res of clients) res.write("event: reload\ndata: 1\n\n");
    },
    close(): Promise<void> {
      for (const res of clients) res.end();
      clients.clear();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
