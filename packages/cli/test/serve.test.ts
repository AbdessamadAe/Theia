import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startDevServer, type DevServer } from "../src/serve.js";

let server: DevServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

function tempDeck(html: string): string {
  const dir = mkdtempSync(join(tmpdir(), "theia-serve-"));
  const path = join(dir, "deck.html");
  writeFileSync(path, html, "utf8");
  return path;
}

describe("startDevServer", () => {
  it("serves the deck with the live-reload client injected", async () => {
    const path = tempDeck("<!doctype html><html><body><h1>Hi</h1></body></html>");
    server = await startDevServer(path, { port: 0 });

    const res = await fetch(server.url);
    const body = await res.text();
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("<h1>Hi</h1>"); // original content preserved
    expect(body).toContain("/__theia_livereload"); // reload client injected
    expect(body).toContain("EventSource");
  });

  it("re-reads the file each request, so a rebuild is served immediately", async () => {
    const path = tempDeck("<body>v1</body>");
    server = await startDevServer(path, { port: 0 });

    expect(await (await fetch(server.url)).text()).toContain("v1");
    writeFileSync(path, "<body>v2</body>", "utf8"); // simulate a rebuild
    expect(await (await fetch(server.url)).text()).toContain("v2");
  });

  it("pushes a reload event to connected SSE clients", async () => {
    const path = tempDeck("<body>x</body>");
    server = await startDevServer(path, { port: 0 });

    const res = await fetch(new URL("/__theia_livereload", server.url));
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Trigger a reload shortly after we start reading the stream.
    setTimeout(() => server!.reload(), 20);

    let received = "";
    while (!received.includes("event: reload")) {
      const { value, done } = await reader.read();
      if (done) break;
      received += decoder.decode(value);
    }
    await reader.cancel();
    expect(received).toContain("event: reload");
  });
});
