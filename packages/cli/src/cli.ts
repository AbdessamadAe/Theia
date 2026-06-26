#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, watch } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildFile, outputPathFor } from "./build.js";

const VERSION = "0.1.0";

const USAGE = `chalk ${VERSION} — compile a Chalk lecture into an interactive slide deck

Usage:
  chalk build   <file.chalk> [--out <file.html>]   compile to a slide bundle
  chalk watch   <file.chalk> [--out <file.html>]   rebuild on every change
  chalk present <file.chalk> [--out <file.html>]   build, then open the deck

Options:
  --out <path>   output HTML path (default: alongside the source)
  -h, --help     show this help
  -v, --version  show the version
`;

interface Args {
  command: string | undefined;
  file: string | undefined;
  out: string | undefined;
  help: boolean;
  version: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    command: undefined,
    file: undefined,
    out: undefined,
    help: false,
    version: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "-h" || a === "--help") args.help = true;
    else if (a === "-v" || a === "--version") args.version = true;
    else if (a === "--out") args.out = argv[++i];
    else if (a.startsWith("--out=")) args.out = a.slice("--out=".length);
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
  process.stderr.write(`chalk: ${message}\n`);
  process.exit(1);
}

/** Open a file in the OS default application (used by `present`). */
function openInBrowser(file: string): void {
  const url = pathToFileURL(file).href;
  const platform = process.platform;
  const [cmd, cmdArgs] =
    platform === "darwin"
      ? ["open", [url]]
      : platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  const child = spawn(cmd, cmdArgs, { stdio: "ignore", detached: true });
  child.on("error", () => {
    process.stdout.write(`Open this file in a browser:\n  ${url}\n`);
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
  return result;
}

function watchFile(file: string, out: string | undefined): void {
  const target = resolve(file);
  const outPath = out ? resolve(out) : outputPathFor(target);

  const rebuild = (): void => {
    try {
      build(file, outPath);
    } catch (err) {
      process.stderr.write(`✗ build failed: ${(err as Error).message}\n`);
    }
  };

  rebuild();
  process.stdout.write(`watching ${basename(target)} … (Ctrl+C to stop)\n`);

  // Watch the containing directory so editor save-by-rename still triggers.
  let timer: NodeJS.Timeout | undefined;
  const dir = dirname(target);
  const name = basename(target);
  watch(dir, (_event, changed) => {
    if (changed !== name) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(rebuild, 60); // debounce rapid successive events
  });
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
    fail(`unknown command "${command}". Run \`chalk --help\`.`);
  }
  if (!file) fail(`no input file. Usage: chalk ${command} <file.chalk>`);
  if (!existsSync(resolve(file))) fail(`file not found: ${file}`);

  switch (command) {
    case "build":
      build(file, out);
      break;
    case "watch":
      watchFile(file, out);
      break;
    case "present": {
      const result = build(file, out);
      openInBrowser(result.output);
      process.stdout.write(`opening ${basename(result.output)} …\n`);
      break;
    }
  }
}

main();
