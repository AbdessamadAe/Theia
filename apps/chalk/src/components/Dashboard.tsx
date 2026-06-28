import * as React from "react";
import logoUrl from "../../assets/logo.png";
import { BoardIcon as ChalkBoardIcon, EmptyBoardSketch, WordmarkFlourish } from "@/components/chalk-art";
import {
  DownloadIcon,
  MoonIcon,
  MoreIcon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
} from "@/components/icons";
import { ProjectThumb } from "@/components/ProjectThumb";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Hint } from "@/components/ui/tooltip";
import { EXAMPLES } from "@/generated/examples";
import {
  type ChalkFile,
  createProject,
  deleteProject,
  duplicateProject,
  exportBundle,
  getFilesGrouped,
  importBundle,
  listProjects,
  type Project,
  renameProject,
} from "@/lib/db";
import type { Theme } from "@/lib/theme";
import { bundleToJson, fileToBundle, PROJECT_EXT, safeFileName, saveToDisk } from "@/lib/transfer";

const BLANK = "# Untitled\n\nStart your lecture here.\n";

function ago(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(ts).toLocaleDateString();
}

interface DashboardProps {
  theme: Theme;
  setTheme: (t: Theme) => void;
  onOpen: (projectId: string) => void;
}

type Toast = { msg: string; action?: { label: string; run: () => void } } | null;

export function Dashboard({ theme, setTheme, onOpen }: DashboardProps): React.ReactElement {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [files, setFiles] = React.useState<Map<string, ChalkFile[]>>(new Map());
  const [query, setQuery] = React.useState("");
  const [sort, setSort] = React.useState<"recent" | "name">("recent");
  const [loading, setLoading] = React.useState(true);
  const [toast, setToast] = React.useState<Toast>(null);
  const [dragging, setDragging] = React.useState(false);

  const [newOpen, setNewOpen] = React.useState(false);
  const [renaming, setRenaming] = React.useState<Project | null>(null);
  const [deleting, setDeleting] = React.useState<Project | null>(null);
  const fileInput = React.useRef<HTMLInputElement>(null);

  const refresh = React.useCallback(async () => {
    const [ps, fs] = await Promise.all([listProjects(), getFilesGrouped()]);
    setProjects(ps);
    setFiles(fs);
    setLoading(false);
  }, []);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const showToast = (t: Toast, ms = 5000): void => {
    setToast(t);
    if (t) window.setTimeout(() => setToast((cur) => (cur === t ? null : cur)), ms);
  };

  const sourceOf = (p: Project): string => files.get(p.id)?.[0]?.source ?? "";

  const shown = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((p) => !q || p.name.toLowerCase().includes(q));
    return sort === "name" ? [...list].sort((a, b) => a.name.localeCompare(b.name)) : list;
  }, [projects, query, sort]);

  // --- actions ---
  const createAndOpen = async (name: string, source: string): Promise<void> => {
    try {
      const { project } = await createProject(name.trim() || "Untitled", source);
      onOpen(project.id);
    } catch {
      showToast({ msg: "Couldn’t create the project (storage may be full). Try exporting one to free space." });
    }
  };

  const onDuplicate = async (p: Project): Promise<void> => {
    await duplicateProject(p.id);
    await refresh();
    showToast({ msg: `Duplicated “${p.name}”` });
  };

  const onConfirmDelete = async (p: Project): Promise<void> => {
    const bundle = await exportBundle(p.id); // keep for undo
    await deleteProject(p.id);
    setDeleting(null);
    await refresh();
    showToast({
      msg: `Deleted “${p.name}”`,
      action: {
        label: "Undo",
        run: async () => {
          await importBundle(bundle);
          await refresh();
          setToast(null);
        },
      },
    });
  };

  const onExportProject = async (p: Project): Promise<void> => {
    const bundle = await exportBundle(p.id);
    await saveToDisk(`${safeFileName(p.name)}${PROJECT_EXT}`, bundleToJson(bundle), "application/json");
  };
  const onExportChalk = async (p: Project): Promise<void> => {
    await saveToDisk(`${safeFileName(p.name)}.chalk`, sourceOf(p), "text/plain");
  };

  const importFiles = async (fileList: FileList | File[]): Promise<void> => {
    let lastId = "";
    for (const f of Array.from(fileList)) {
      try {
        const bundle = await fileToBundle(f);
        const project = await importBundle(bundle);
        lastId = project.id;
      } catch (e) {
        showToast({ msg: e instanceof Error ? e.message : "Couldn’t import that file." });
      }
    }
    await refresh();
    if (lastId) {
      showToast({ msg: "Imported — opening…" });
      onOpen(lastId);
    }
  };

  return (
    <div
      data-app-root
      className="bg-background min-h-full"
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) void importFiles(e.dataTransfer.files);
      }}
    >
      <input
        ref={fileInput}
        type="file"
        accept=".chalk,.json"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) void importFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* Header */}
      <header className="bg-card/60 sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2.5">
          <img src={logoUrl} alt="Theia" width={30} height={30} className="ring-border size-8 rounded-lg shadow-1 ring-1" />
          <span className="chalk-wordmark relative font-serif text-2xl font-semibold tracking-tight">
            Theia
            <WordmarkFlourish className="chalk-flourish text-live absolute -bottom-2 left-0 hidden h-2 w-full" />
          </span>
        </div>
        <div className="flex-1" />
        <Hint label="Import a .chalk or project file">
          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <UploadIcon /> <span className="hidden sm:inline">Import</span>
          </Button>
        </Hint>
        <Button id="new-project" variant="live" size="sm" onClick={() => setNewOpen(true)}>
          <PlusIcon /> New project
        </Button>
        <div className="bg-border mx-0.5 h-5 w-px" />
        <Segmented
          aria-label="Theme"
          value={theme}
          onChange={setTheme}
          className="p-0.5"
          options={[
            { value: "chalkboard", label: <ChalkBoardIcon className="size-4" />, ariaLabel: "Theia theme", title: "Theia" },
            { value: "dark", label: <MoonIcon className="size-4" />, ariaLabel: "Dark theme", title: "Dark" },
          ]}
        />
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-lg font-semibold">Your projects</h1>
            <p className="text-muted-foreground text-xs">
              Saved on this device. Use Export for backup or to move a project elsewhere.
            </p>
          </div>
          <div className="flex-1" />
          <div className="relative">
            <SearchIcon className="text-muted-foreground absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              aria-label="Search projects"
              className="border-input bg-card focus-visible:ring-ring h-9 w-full rounded-md border pl-8 pr-3 text-sm outline-none focus-visible:ring-2 sm:w-56"
            />
          </div>
          <Select value={sort} onValueChange={(v) => setSort(v as "recent" | "name")}>
            <SelectTrigger className="h-9 w-[130px]" aria-label="Sort projects">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Recent</SelectItem>
              <SelectItem value="name">Name</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? null : shown.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <EmptyBoardSketch className="text-muted-foreground h-36 w-auto" />
            <div>
              <p className="chalk-display text-foreground text-xl font-medium">
                {query ? "No projects match" : "No projects yet"}
              </p>
              <p className="text-muted-foreground text-sm">Create one, or drop a .chalk file here to import.</p>
            </div>
            {!query && (
              <Button variant="live" onClick={() => setNewOpen(true)}>
                <PlusIcon /> New project
              </Button>
            )}
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((p) => (
              <li
                key={p.id}
                className="group bg-card hover:border-live/50 relative rounded-xl border p-3 shadow-1 transition-colors"
              >
                <button
                  className="block w-full text-left focus-visible:outline-none"
                  onClick={() => onOpen(p.id)}
                  aria-label={`Open ${p.name}`}
                >
                  <ProjectThumb source={sourceOf(p)} />
                  <div className="mt-2.5 truncate text-sm font-medium">{p.name}</div>
                  <div className="text-muted-foreground text-xs">Edited {ago(p.updatedAt)}</div>
                </button>
                <ProjectMenu
                  onRename={() => setRenaming(p)}
                  onDuplicate={() => void onDuplicate(p)}
                  onExportProject={() => void onExportProject(p)}
                  onExportChalk={() => void onExportChalk(p)}
                  onDelete={() => setDeleting(p)}
                />
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* drag overlay */}
      {dragging && (
        <div className="bg-background/70 border-live pointer-events-none fixed inset-0 z-40 m-4 flex items-center justify-center rounded-2xl border-2 border-dashed backdrop-blur-sm">
          <p className="chalk-display text-foreground text-2xl">Drop to import</p>
        </div>
      )}

      <NewDialog open={newOpen} onClose={() => setNewOpen(false)} onCreate={(n, s) => void createAndOpen(n, s)} />
      <RenameDialog
        project={renaming}
        onClose={() => setRenaming(null)}
        onSave={async (name) => {
          if (renaming) {
            await renameProject(renaming.id, name);
            setRenaming(null);
            await refresh();
          }
        }}
      />
      <ConfirmDeleteDialog project={deleting} onClose={() => setDeleting(null)} onConfirm={(p) => void onConfirmDelete(p)} />

      {toast && (
        <div
          role="status"
          className="bg-foreground text-background fixed bottom-5 left-1/2 z-50 flex max-w-[80%] -translate-x-1/2 items-center gap-3 rounded-lg px-4 py-2 text-sm shadow-3"
        >
          {toast.msg}
          {toast.action && (
            <button className="font-medium underline" onClick={toast.action.run}>
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- per-card actions (hover/focus-revealed icon menu) ---------------------
function ProjectMenu(props: {
  onRename: () => void;
  onDuplicate: () => void;
  onExportProject: () => void;
  onExportChalk: () => void;
  onDelete: () => void;
}): React.ReactElement {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const item = "hover:bg-accent w-full rounded px-2 py-1.5 text-left text-sm";
  return (
    <div ref={ref} className="absolute right-3 top-3">
      <button
        aria-label="Project actions"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="bg-card/90 text-muted-foreground hover:text-foreground focus-visible:ring-ring flex size-7 items-center justify-center rounded-md border opacity-0 shadow-1 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 group-hover:opacity-100"
      >
        <MoreIcon className="size-4" />
      </button>
      {open && (
        <div role="menu" className="bg-popover absolute right-0 z-20 mt-1 w-44 rounded-lg border p-1 shadow-3">
          <button role="menuitem" className={item} onClick={() => { setOpen(false); props.onRename(); }}>Rename</button>
          <button role="menuitem" className={item} onClick={() => { setOpen(false); props.onDuplicate(); }}>Duplicate</button>
          <button role="menuitem" className={item} onClick={() => { setOpen(false); props.onExportProject(); }}>Export project (.chalkproj.json)</button>
          <button role="menuitem" className={item} onClick={() => { setOpen(false); props.onExportChalk(); }}>Export .chalk</button>
          <div className="bg-border my-1 h-px" />
          <button role="menuitem" className={`${item} text-destructive`} onClick={() => { setOpen(false); props.onDelete(); }}>Delete…</button>
        </div>
      )}
    </div>
  );
}

// --- dialogs ---------------------------------------------------------------
function NewDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (name: string, source: string) => void }): React.ReactElement {
  const [name, setName] = React.useState("");
  const [template, setTemplate] = React.useState("blank");
  React.useEffect(() => {
    if (open) {
      setName("");
      setTemplate("blank");
    }
  }, [open]);
  const create = (): void => {
    const source = template === "blank" ? BLANK : EXAMPLES.find((e) => e.id === template)?.source ?? BLANK;
    onCreate(name, source);
    onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(440px,92vw)] p-5">
        <DialogTitle className="text-base font-semibold">New project</DialogTitle>
        <label className="text-muted-foreground mt-4 block text-xs font-medium">Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
          placeholder="Untitled"
          aria-label="Project name"
          className="border-input bg-background focus-visible:ring-ring mt-1 h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
        />
        <label className="text-muted-foreground mt-3 block text-xs font-medium">Start from</label>
        <Select value={template} onValueChange={setTemplate}>
          <SelectTrigger className="mt-1 h-9 w-full" aria-label="Template">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="blank">Blank</SelectItem>
            {EXAMPLES.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="live" size="sm" onClick={create}>Create</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ project, onClose, onSave }: { project: Project | null; onClose: () => void; onSave: (name: string) => void }): React.ReactElement {
  const [name, setName] = React.useState("");
  React.useEffect(() => {
    if (project) setName(project.name);
  }, [project]);
  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(420px,92vw)] p-5">
        <DialogTitle className="text-base font-semibold">Rename project</DialogTitle>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && onSave(name.trim())}
          aria-label="Project name"
          className="border-input bg-background focus-visible:ring-ring mt-4 h-9 w-full rounded-md border px-3 text-sm outline-none focus-visible:ring-2"
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="live" size="sm" disabled={!name.trim()} onClick={() => onSave(name.trim())}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDeleteDialog({ project, onClose, onConfirm }: { project: Project | null; onClose: () => void; onConfirm: (p: Project) => void }): React.ReactElement {
  return (
    <Dialog open={!!project} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[min(420px,92vw)] p-5">
        <DialogTitle className="text-base font-semibold">Delete project?</DialogTitle>
        <p className="text-muted-foreground mt-2 text-sm">
          “{project?.name}” will be removed from this device. You can undo right after, or restore from an export.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="default" size="sm" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => project && onConfirm(project)}>
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
