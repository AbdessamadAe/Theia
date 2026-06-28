import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it } from "vitest";
import { getPrimaryFile, listProjects, migrateChalkSource } from "../src/lib/db.js";

// Seed a *pre-rename* (schema v1) "chalk-projects" database directly, with a
// project whose file uses the old `.chalk` name and the old `chalk.*` cell API —
// then let the app's openDB (v2) run its upgrade migration on first access.
const PROJECT_ID = "p-legacy";
const OLD_SOURCE = '## Old\n\n```js\nconst a = chalk.slider("a");\nchalk.tex("" + a);\n```\n';

beforeAll(async () => {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.open("chalk-projects", 1);
    req.onupgradeneeded = (): void => {
      const db = req.result;
      db.createObjectStore("projects", { keyPath: "id" });
      const files = db.createObjectStore("files", { keyPath: "id" });
      files.createIndex("byProject", "projectId", { unique: false });
    };
    req.onsuccess = (): void => {
      const db = req.result;
      const tx = db.transaction(["projects", "files"], "readwrite");
      tx.objectStore("projects").put({ id: PROJECT_ID, name: "Legacy", createdAt: 1, updatedAt: 1 });
      tx.objectStore("files").put({ id: "f1", projectId: PROJECT_ID, name: "main.chalk", source: OLD_SOURCE });
      tx.oncomplete = (): void => (db.close(), resolve());
      tx.onerror = (): void => reject(tx.error);
    };
    req.onerror = (): void => reject(req.error);
  });
});

describe("Chalk → Theia migration", () => {
  it("migrateChalkSource rewrites only the cell-API surface, not prose", () => {
    expect(migrateChalkSource('chalk.slider("a") + chalk.tex(x)')).toBe('theia.slider("a") + theia.tex(x)');
    // a word that merely contains "chalk" or prose "Chalk" is untouched
    expect(migrateChalkSource("The Chalk talk about chalkboards")).toBe("The Chalk talk about chalkboards");
  });

  it("opens a pre-rename v1 project and upgrades its file (cells + extension) to Theia", async () => {
    // First DB access triggers openDB(v2) → the v1→v2 upgrade migration.
    expect((await listProjects()).map((p) => p.name)).toContain("Legacy");
    const file = await getPrimaryFile(PROJECT_ID);
    expect(file).toBeTruthy();
    expect(file!.name).toBe("main.theia"); // .chalk → .theia
    expect(file!.source).toContain('theia.slider("a")'); // chalk.* → theia.*
    expect(file!.source).toContain("theia.tex");
    expect(file!.source).not.toContain("chalk.");
  });
});
