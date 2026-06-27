/**
 * Local-first project storage in IndexedDB. NO backend, NO accounts — projects
 * live on this device; portability is via export/import (see lib/transfer.ts).
 *
 * Schema (v1): `projects` (metadata) and `files` (the canonical .chalk source).
 * The data model is project → files[] (multi-file ready) though the UI ships one
 * file per project. The file's `source` text is the single source of truth —
 * ingested media lives inlined as data URIs in that text, not in a side store.
 */

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChalkFile {
  id: string;
  projectId: string;
  name: string;
  source: string;
  updatedAt: number;
}

/** A portable, durable project bundle (see lib/transfer.ts). */
export interface ProjectBundle {
  version: 1;
  name: string;
  files: Array<{ name: string; source: string }>;
}

const DB_NAME = "chalk-projects";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (): void => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) {
        db.createObjectStore("projects", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("files")) {
        const files = db.createObjectStore("files", { keyPath: "id" });
        files.createIndex("byProject", "projectId", { unique: false });
      }
    };
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error);
  });
  return dbPromise;
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = (): void => resolve(req.result);
    req.onerror = (): void => reject(req.error);
  });
}

/** Run `fn` against the named stores and resolve when the transaction commits. */
async function withTx<T>(
  stores: string[],
  mode: IDBTransactionMode,
  fn: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result: T;
    Promise.resolve(fn(tx)).then(
      (r) => {
        result = r;
      },
      (err) => {
        try {
          tx.abort();
        } catch {
          /* already aborting */
        }
        reject(err);
      },
    );
    tx.oncomplete = (): void => resolve(result);
    tx.onerror = (): void => reject(tx.error);
    tx.onabort = (): void => reject(tx.error ?? new Error("transaction aborted"));
  });
}

const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** True for the various shapes of "you're out of storage". */
export function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" || err.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

// --- Cross-tab notification (no silent clobbering) -------------------------
const channel =
  typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("chalk-projects") : null;

export interface SaveEvent {
  fileId: string;
  projectId: string;
  updatedAt: number;
}

/** Subscribe to saves from OTHER tabs. Returns an unsubscribe function. */
export function subscribeSaves(cb: (e: SaveEvent) => void): () => void {
  if (!channel) return () => {};
  const handler = (ev: MessageEvent): void => cb(ev.data as SaveEvent);
  channel.addEventListener("message", handler);
  return () => channel.removeEventListener("message", handler);
}

// --- CRUD ------------------------------------------------------------------

/** Create a project with a single starter file holding `source`. */
export async function createProject(
  name: string,
  source: string,
  fileName = "main.chalk",
): Promise<{ project: Project; file: ChalkFile }> {
  const now = Date.now();
  const project: Project = { id: uid(), name, createdAt: now, updatedAt: now };
  const file: ChalkFile = {
    id: uid(),
    projectId: project.id,
    name: fileName,
    source,
    updatedAt: now,
  };
  await withTx(["projects", "files"], "readwrite", (tx) => {
    tx.objectStore("projects").put(project);
    tx.objectStore("files").put(file);
  });
  return { project, file };
}

/** All projects, most-recently-edited first. */
export async function listProjects(): Promise<Project[]> {
  const all = await withTx(["projects"], "readonly", (tx) =>
    reqToPromise(tx.objectStore("projects").getAll() as IDBRequest<Project[]>),
  );
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | undefined> {
  return withTx(["projects"], "readonly", (tx) =>
    reqToPromise(tx.objectStore("projects").get(id) as IDBRequest<Project | undefined>),
  );
}

export async function getFilesByProject(projectId: string): Promise<ChalkFile[]> {
  const files = await withTx(["files"], "readonly", (tx) =>
    reqToPromise(
      tx.objectStore("files").index("byProject").getAll(projectId) as IDBRequest<ChalkFile[]>,
    ),
  );
  return files.sort((a, b) => a.updatedAt - b.updatedAt);
}

/** The project's primary (first) file — the one the single-file UI edits. */
export async function getPrimaryFile(projectId: string): Promise<ChalkFile | undefined> {
  return (await getFilesByProject(projectId))[0];
}

/** All files, grouped by project — one query to feed dashboard thumbnails. */
export async function getFilesGrouped(): Promise<Map<string, ChalkFile[]>> {
  const files = await withTx(["files"], "readonly", (tx) =>
    reqToPromise(tx.objectStore("files").getAll() as IDBRequest<ChalkFile[]>),
  );
  const map = new Map<string, ChalkFile[]>();
  for (const f of files) {
    const list = map.get(f.projectId) ?? [];
    list.push(f);
    map.set(f.projectId, list);
  }
  return map;
}

export async function renameProject(id: string, name: string): Promise<void> {
  await withTx(["projects"], "readwrite", async (tx) => {
    const store = tx.objectStore("projects");
    const p = await reqToPromise(store.get(id) as IDBRequest<Project | undefined>);
    if (p) store.put({ ...p, name, updatedAt: Date.now() });
  });
}

/** Persist a file's source (autosave). Bumps both file + project timestamps and
 * notifies other tabs. Returns the new updatedAt. May throw on quota. */
export async function updateFileSource(fileId: string, source: string): Promise<number> {
  const now = Date.now();
  const projectId = await withTx(["files", "projects"], "readwrite", async (tx) => {
    const files = tx.objectStore("files");
    const file = await reqToPromise(files.get(fileId) as IDBRequest<ChalkFile | undefined>);
    if (!file) throw new Error(`file ${fileId} not found`);
    files.put({ ...file, source, updatedAt: now });
    const projects = tx.objectStore("projects");
    const project = await reqToPromise(
      projects.get(file.projectId) as IDBRequest<Project | undefined>,
    );
    if (project) projects.put({ ...project, updatedAt: now });
    return file.projectId;
  });
  channel?.postMessage({ fileId, projectId, updatedAt: now } satisfies SaveEvent);
  return now;
}

/** Deep-copy a project and its files under fresh ids. */
export async function duplicateProject(id: string): Promise<Project> {
  const source = await getProject(id);
  if (!source) throw new Error(`project ${id} not found`);
  const files = await getFilesByProject(id);
  const now = Date.now();
  const copy: Project = {
    id: uid(),
    name: `${source.name} (copy)`,
    createdAt: now,
    updatedAt: now,
  };
  await withTx(["projects", "files"], "readwrite", (tx) => {
    tx.objectStore("projects").put(copy);
    const store = tx.objectStore("files");
    for (const f of files) {
      store.put({ ...f, id: uid(), projectId: copy.id, updatedAt: now });
    }
  });
  return copy;
}

export async function deleteProject(id: string): Promise<void> {
  const files = await getFilesByProject(id);
  await withTx(["projects", "files"], "readwrite", (tx) => {
    tx.objectStore("projects").delete(id);
    const store = tx.objectStore("files");
    for (const f of files) store.delete(f.id);
  });
}

/** Create a project from an imported bundle (round-trips name + files). */
export async function importBundle(bundle: ProjectBundle): Promise<Project> {
  const now = Date.now();
  const project: Project = { id: uid(), name: bundle.name, createdAt: now, updatedAt: now };
  await withTx(["projects", "files"], "readwrite", (tx) => {
    tx.objectStore("projects").put(project);
    const store = tx.objectStore("files");
    const files = bundle.files.length ? bundle.files : [{ name: "main.chalk", source: "" }];
    for (const f of files) {
      store.put({
        id: uid(),
        projectId: project.id,
        name: f.name,
        source: f.source,
        updatedAt: now,
      } satisfies ChalkFile);
    }
  });
  return project;
}

/** A project as a portable bundle (for export). */
export async function exportBundle(id: string): Promise<ProjectBundle> {
  const project = await getProject(id);
  if (!project) throw new Error(`project ${id} not found`);
  const files = await getFilesByProject(id);
  return { version: 1, name: project.name, files: files.map((f) => ({ name: f.name, source: f.source })) };
}

/** Best-effort storage usage, for proactive quota warnings. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}
