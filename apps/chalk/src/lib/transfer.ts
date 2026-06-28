/**
 * Import / export — how local-first projects stay portable (no backend).
 *
 *  - A single file exports as a raw `.chalk` (the exact source bytes; media is
 *    already inlined as data URIs, so it's self-contained).
 *  - A project exports as a `.chalkproj.json` bundle { version, name, files[] }.
 *    JSON (not zip) is deliberate: there are no separate binary assets to pack —
 *    media lives inline in the text — so JSON round-trips byte-perfectly with no
 *    extra dependency. (Zip would only matter if external assets arrive later.)
 *
 * Share-URL (ephemeral, one file, in the link) is a different thing from export
 * (durable, on disk); the UI labels both.
 */
import type { ProjectBundle } from "./db";

export const PROJECT_EXT = ".chalkproj.json";

/** Serialize a bundle for disk (stable, pretty-printed). */
export function bundleToJson(bundle: ProjectBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/** Parse + validate a bundle from disk; throws on a malformed file. */
export function parseBundle(text: string): ProjectBundle {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Not a valid Theia project file (invalid JSON).");
  }
  const b = data as Partial<ProjectBundle>;
  if (
    !b ||
    b.version !== 1 ||
    typeof b.name !== "string" ||
    !Array.isArray(b.files) ||
    !b.files.every((f) => f && typeof f.name === "string" && typeof f.source === "string")
  ) {
    throw new Error("Not a valid Theia project bundle.");
  }
  return { version: 1, name: b.name, files: b.files.map((f) => ({ name: f.name, source: f.source })) };
}

/** A single `.chalk` source as a one-file bundle named after the file. */
export function sourceToBundle(fileName: string, source: string): ProjectBundle {
  const name = fileName.replace(/\.chalk$/i, "").trim() || "Untitled";
  return { version: 1, name, files: [{ name: "main.chalk", source }] };
}

/** Turn a dropped/picked file into a bundle: a project bundle or a raw .chalk. */
export async function fileToBundle(file: File): Promise<ProjectBundle> {
  const text = await file.text();
  if (file.name.endsWith(PROJECT_EXT) || file.name.endsWith(".json")) {
    return parseBundle(text);
  }
  return sourceToBundle(file.name, text);
}

// --- Disk I/O (File System Access API where available, else download) ------

interface SaveFilePickerWindow {
  showSaveFilePicker?: (opts: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }> }>;
}

/** Save text to disk: native picker if available, else a normal download. */
export async function saveToDisk(suggestedName: string, text: string, mime: string): Promise<void> {
  const w = window as unknown as SaveFilePickerWindow;
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName,
        types: [{ description: "Theia", accept: { [mime]: [suggestedName.replace(/^.*(\.[^.]+)$/, "$1")] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return;
    } catch (err) {
      // User-cancelled the picker → nothing to do; other errors fall back.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  const blob = new Blob([text], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** A safe-ish filesystem name from a project name. */
export function safeFileName(name: string): string {
  return (name.trim() || "untitled").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}
