/**
 * The Chalk playground shell: a CodeMirror editor on the left, a live compiled
 * deck (in an isolated iframe) on the right, recompiling as you type. All
 * compilation is client-side via the engine's shared `compileChalk` core; the
 * only "backend" is static hosting.
 */
import { compileChalk } from "@chalk/render-slides/core";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { chalk } from "./chalk-lang.js";
import { ASSETS } from "./generated/assets.js";
import { EXAMPLES } from "./generated/examples.js";
import { buildShareUrl, readShareFromHash, SHARE_LIMIT } from "./share.js";

const $ = <T extends HTMLElement>(sel: string): T =>
  document.querySelector(sel) as T;

const previewEl = $<HTMLIFrameElement>("#preview");
const errorEl = $<HTMLElement>("#error");
const statusEl = $<HTMLElement>("#status");
const examplesSel = $<HTMLSelectElement>("#examples");
const toastEl = $<HTMLElement>("#toast");

let currentId = "shared";

// --- Examples dropdown ------------------------------------------------------
for (const ex of EXAMPLES) {
  const opt = document.createElement("option");
  opt.value = ex.id;
  opt.textContent = ex.label;
  examplesSel.append(opt);
}

// --- Compile + preview ------------------------------------------------------
let lastGoodHtml = "";

function compileAndShow(source: string): void {
  const { html, error, slides } = compileChalk(source, { assets: ASSETS });
  if (error || !html) {
    errorEl.hidden = false;
    errorEl.textContent = `Compile error: ${error ?? "no output"}`;
    // Never blank the preview — keep the last good deck visible.
    return;
  }
  errorEl.hidden = true;
  lastGoodHtml = html;
  previewEl.srcdoc = html;
  statusEl.textContent = `${slides} slide${slides === 1 ? "" : "s"}`;
}

// Debounced recompile so typing stays responsive; heavy runtimes (Pyodide /
// three.js) live inside the iframe and only load when the source needs them.
let timer: number | undefined;
function scheduleCompile(source: string): void {
  if (timer) clearTimeout(timer);
  timer = window.setTimeout(() => compileAndShow(source), 250);
}

// --- Editor -----------------------------------------------------------------
const initialShared = readShareFromHash(location.hash);
const initialSource = initialShared ?? EXAMPLES[0]!.source;
if (!initialShared) currentId = EXAMPLES[0]!.id;

const view = new EditorView({
  parent: $("#editor"),
  state: EditorState.create({
    doc: initialSource,
    extensions: [
      basicSetup,
      chalk(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((u) => {
        if (u.docChanged) scheduleCompile(u.state.doc.toString());
      }),
    ],
  }),
});

function setEditorContent(source: string): void {
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: source },
  });
  compileAndShow(source); // immediate on programmatic load
}

// --- Toolbar ----------------------------------------------------------------
examplesSel.addEventListener("change", () => {
  const ex = EXAMPLES.find((e) => e.id === examplesSel.value);
  if (ex) {
    currentId = ex.id;
    setEditorContent(ex.source);
  }
});

$("#present").addEventListener("click", () => {
  void previewEl.requestFullscreen?.();
});

function toast(message: string, ms = 3200): void {
  toastEl.textContent = message;
  toastEl.hidden = false;
  window.setTimeout(() => (toastEl.hidden = true), ms);
}

$("#share").addEventListener("click", async () => {
  const source = view.state.doc.toString();
  const { url, encoded, overLimit } = buildShareUrl(location.href, source);
  if (overLimit) {
    toast(
      `This deck is large (${encoded.length} chars > ${SHARE_LIMIT}); a URL may be truncated. Use Download to share a file instead.`,
      6000,
    );
    return;
  }
  history.replaceState(null, "", url);
  try {
    await navigator.clipboard.writeText(url);
    toast("Share link copied to clipboard — opening a copy in a new tab…");
  } catch {
    toast("Share link is in the address bar — opening a copy in a new tab…");
  }
  window.open(url, "_blank", "noopener");
});

$("#download").addEventListener("click", () => {
  if (!lastGoodHtml) return;
  const blob = new Blob([lastGoodHtml], { type: "text/html" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${currentId || "chalk-deck"}.html`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// Mobile: toggle between editing and viewing the deck.
$("#view-toggle").addEventListener("click", () => {
  const showing = document.body.classList.toggle("show-deck");
  $("#view-toggle").textContent = showing ? "Edit" : "Deck";
});

// On a shared link, default mobile to the deck view.
if (initialShared && window.matchMedia("(max-width: 800px)").matches) {
  document.body.classList.add("show-deck");
  $("#view-toggle").textContent = "Edit";
}

// --- First paint ------------------------------------------------------------
compileAndShow(initialSource);
