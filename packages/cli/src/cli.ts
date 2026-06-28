#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildFile, outputPathFor } from "./build.js";
import { startDevServer } from "./serve.js";

const VERSION = "0.1.0";

const USAGE = `theia ${VERSION} — compile a Theia lecture into an interactive slide deck

Usage:
  theia build   <file.theia> [--out <file.html>]   compile to a slide bundle
  theia watch   <file.theia> [--port <n>]          serve with live reload
  theia present <file.theia> [--out <file.html>]   build, then open the deck

Options:
  --out <path>   output HTML path (default: alongside the source)
  --port <n>     dev-server port for watch (default: 4321)
  -h, --help     show this help
  -v, --version  show the version
`;

interface Args {
  command: string | undefined;
  file: string | undefined;
  out: string | undefined;
  port: number | undefined;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: undefined,
    file: undefined,
    out: undefined,
    port: undefined,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "-v" || a === "--version") args.version = true;
    else if (a === "--out") args.out = argv[++i];
    else if (a.startsWith("--out=")) args.out = a.slice("--out=".length);
    else if (a === "--port") args.port = Number(argv[++i]);
    else if (a.startsWith("--port=")) args.port = Number(a.slice("--port=".length));
    else if (!args.command) args.command = a;
    else if (!args.file) args.file = a;
  }
  return args;
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fail(message: string): never {
  process.stderr.write(`theia: ${message}\n`);
  process.exit(1);
}

/** Open a URL in the OS default browser. */
function openUrl(url: string): void {
  const platform = process.platform;
  const [cmd, cmdArgs] =
    platform === "darwin"
      ? ["open", [url]]
      : platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  const child = spawn(cmd, cmdArgs, { stdio: "ignore", detached: true });
  child.on("error", () => {
    process.stdout.write(`Open this in a browser:\n  ${url}\n`);
  });
  child.unref();
}

function build(file: string, out: string | undefined): ReturnType<typeof buildFile> {
  const result = buildFile(file, out);
  process.stdout.write(
    `✓ ${basename(result.input)} → ${basename(result.output)}  (${result.slides} slides, ${humanBytes(
      result.bytes,
    )})\n`,
  );
  for (const w of result.warnings) process.stderr.write(`  ⚠ ${w}\n`);
  return result;
}

async function watchFile(
  file: string,
  out: string | undefined,
  port: number | undefined,
): Promise<void> {
  const target = resolve(file);
  const outPath = out ? resolve(out) : outputPathFor(target);

  // Initial build before the server starts (so the first request succeeds).
  try {
    build(file, outPath);
  } catch (err) {
    process.stderr.write(`✗ build failed: ${(err as Error).message}\n`);
  }

  const server = await startDevServer(outPath, { port });
  openUrl(server.url);
  process.stdout.write(
    `serving ${basename(target)} at ${server.url} with live reload (Ctrl+C to stop)\n`,
  );

  const rebuild = (): void => {
    try {
      build(file, outPath);
      server.reload();
    } catch (err) {
      // Keep watching after a bad edit; report and leave the last good deck up.
      process.stderr.write(`✗ build failed: ${(err as Error).message}\n`);
    }
  };

  // Watch the containing directory so editor save-by-rename still triggers.
  let timer: NodeJS.Timeout | undefined;
  const dir = dirname(target);
  const name = basename(target);
  watch(dir, (_event, changed) => {
    if (changed !== name) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(rebuild, 60); // debounce rapid successive events
  });

  const shutdown = (): void => {
    void server.close().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.version) {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  if (args.help || !args.command) {
    process.stdout.write(USAGE);
    return;
  }

  const { command, file, out } = args;
  if (!["build", "watch", "present"].includes(command)) {
    fail(`unknown command "${command}". Run \`theia --help\`.`);
  }
  if (!file) fail(`no input file. Usage: theia ${command} <file.theia>`);
  if (!existsSync(resolve(file))) fail(`file not found: ${file}`);

  switch (command) {
    case "build":
      build(file, out);
      break;
    case "watch":
      void watchFile(file, out, args.port);
      break;
    case "present": {
      const result = build(file, out);
      openUrl(pathToFileURL(result.output).href);
      process.stdout.write(`opening ${basename(result.output)} …\n`);
      break;
    }
  }
}

main();
