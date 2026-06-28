import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createProject,
  deleteProject,
  duplicateProject,
  exportBundle,
  getPrimaryFile,
  getProject,
  importBundle,
  listProjects,
  renameProject,
  updateFileSource,
} from "../src/lib/db.js";
import { debounce } from "../src/lib/debounce.js";

// Each test starts from a clean database.
beforeEach(async () => {
  for (const p of await listProjects()) await deleteProject(p.id);
});

describe("IndexedDB project CRUD", () => {
  it("creates a project with a primary file and lists it", async () => {
    const { project, file } = await createProject("Calc 101", "## Slide\n\nHi");
    expect(file.projectId).toBe(project.id);
    const list = await listProjects();
    expect(list.map((p) => p.name)).toContain("Calc 101");
    const primary = await getPrimaryFile(project.id);
    expect(primary?.source).toBe("## Slide\n\nHi");
  });

  it("renames a project", async () => {
    const { project } = await createProject("Old", "x");
    await renameProject(project.id, "New");
    expect((await getProject(project.id))?.name).toBe("New");
  });

  it("duplicates a project (fresh ids, copied source)", async () => {
    const { project } = await createProject("Orig", "## A\n\nbody");
    const copy = await duplicateProject(project.id);
    expect(copy.id).not.toBe(project.id);
    expect(copy.name).toBe("Orig (copy)");
    expect((await getPrimaryFile(copy.id))?.source).toBe("## A\n\nbody");
    // Editing the copy must not touch the original.
    const copyFile = await getPrimaryFile(copy.id);
    await updateFileSource(copyFile!.id, "changed");
    expect((await getPrimaryFile(project.id))?.source).toBe("## A\n\nbody");
  });

  it("deletes a project and its files", async () => {
    const { project } = await createProject("Doomed", "x");
    await deleteProject(project.id);
    expect(await getProject(project.id)).toBeUndefined();
    expect(await getPrimaryFile(project.id)).toBeUndefined();
  });

  it("lists most-recently-edited first", async () => {
    const a = await createProject("A", "1");
    await new Promise((r) => setTimeout(r, 5));
    const b = await createProject("B", "2");
    await new Promise((r) => setTimeout(r, 5));
    await updateFileSource((await getPrimaryFile(a.project.id))!.id, "1-edited"); // touches A
    expect((await listProjects())[0]!.name).toBe("A");
    expect((await listProjects())[1]!.name).toBe("B");
    void b;
  });
});

describe("autosave: debounce + restore", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("coalesces rapid edits into one write, and the value restores", async () => {
    vi.useRealTimers(); // creation uses real async
    const { file } = await createProject("Notes", "v0");
    vi.useFakeTimers();

    const writes: string[] = [];
    const save = debounce((src: string) => {
      writes.push(src);
    }, 600);
    save("v1");
    save("v2");
    save("v3"); // only the last should land
    vi.advanceTimersByTime(600);
    expect(writes).toEqual(["v3"]);

    vi.useRealTimers();
    await updateFileSource(file.id, "v3"); // the autosaver's effect
    expect((await getPrimaryFile(file.projectId))?.source).toBe("v3"); // survives "reload"
  });
});

describe("export → import round-trip", () => {
  it("reproduces an identical project", async () => {
    const { project } = await createProject("Round Trip", '## S\n\n@image f of "data:image/png;base64,AAAA" alt:"x"');
    const bundle = await exportBundle(project.id);
    const reopened = await importBundle(bundle);
    expect(reopened.id).not.toBe(project.id);
    expect(reopened.name).toBe("Round Trip");
    expect((await getPrimaryFile(reopened.id))?.source).toBe((await getPrimaryFile(project.id))?.source);
  });
});
