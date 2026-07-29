import { acceptCompletion, autocompletion, completionStatus, startCompletion, type CompletionContext } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  keymap,
  type Command,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { getCM, vim } from "@replit/codemirror-vim";
import { applyAwarenessUpdate, Awareness, encodeAwarenessUpdate } from "y-protocols/awareness";
import * as Y from "yjs";
import { yCollab } from "y-codemirror.next";

type Indentation = Readonly<{ style: "spaces" | "tabs"; size: number }>;

type Check = Readonly<{ name: string; passed: boolean; detail: string }>;

type SpikeResult = Readonly<{
  checks: readonly Check[];
  startupMilliseconds: number;
  longDocumentCharacters: number;
}>;

declare global {
  interface Window {
    runCodeMirrorParitySpike(): Promise<SpikeResult>;
  }
}

const completionSource = (context: CompletionContext) => {
  const citation = context.matchBefore(/\[@[\w-]*/);
  if (citation) {
    return {
      from: citation.from,
      options: [{ label: "[@doe2024]", type: "reference" }],
    };
  }

  const include = context.matchBefore(/::include\{[\w./-]*/);
  return include
    ? {
        from: include.from,
        options: [{ label: "::include{notes.md}", type: "keyword" }],
      }
    : null;
};

const scholarmarkDecorators = [
  new MatchDecorator({
    regexp: /^#{1,6}\s[^\n]*/gm,
    decoration: Decoration.mark({ class: "cm-scholarmark-heading" }),
  }),
  new MatchDecorator({
    regexp: /\[@[\w-]+(?:,\s*p\.\s*\d+)?\]/g,
    decoration: Decoration.mark({ class: "cm-scholarmark-citation" }),
  }),
  new MatchDecorator({
    regexp: /^::(?:label|include|figure|table)[^\n]*/gm,
    decoration: Decoration.mark({ class: "cm-scholarmark-directive" }),
  }),
  new MatchDecorator({
    regexp: /<!--[\s\S]*?-->/g,
    decoration: Decoration.mark({ class: "cm-scholarmark-comment" }),
  }),
] as const;

const scholarmarkPresentation = scholarmarkDecorators.map((decorator) =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = decorator.createDeco(view);
      }

      update(update: ViewUpdate): void {
        this.decorations = decorator.updateDeco(update, this.decorations);
      }
    },
    { decorations: (instance) => instance.decorations },
  ),
);

const indentationCommand =
  (indentation: Indentation): Command =>
  (view) => {
    const range = view.state.selection.main;
    if (!range.empty) return false;

    const line = view.state.doc.lineAt(range.head);
    const column = range.head - line.from;
    const inserted = indentation.style === "tabs" ? "\t" : " ".repeat(indentation.size - (column % indentation.size));
    view.dispatch({
      changes: { from: range.head, insert: inserted },
      selection: { anchor: range.head + inserted.length },
    });
    return true;
  };

const editorExtensions = (
  ytext: Y.Text,
  awareness: Awareness,
  undoManager: Y.UndoManager,
  indentation: Indentation,
): readonly Extension[] => [
  markdown(),
  history(),
  autocompletion({ override: [completionSource], activateOnTyping: true, interactionDelay: 0 }),
  ...scholarmarkPresentation,
  yCollab(ytext, awareness, { undoManager }),
  EditorView.contentAttributes.of({
    "aria-label": "CodeMirror parity manuscript",
    autocapitalize: "sentences",
    autocomplete: "on",
    spellcheck: "true",
  }),
  EditorView.theme({
    "&": { height: "260px" },
    ".cm-scroller": { overflow: "auto" },
    ".cm-scholarmark-citation": { textDecoration: "underline" },
    ".cm-scholarmark-directive": { fontWeight: "600" },
    ".cm-scholarmark-comment": { opacity: "0.65" },
  }),
  Prec.high(
    keymap.of([
      {
        key: "Tab",
        run: (view) => acceptCompletion(view) || indentationCommand(indentation)(view),
      },
    ]),
  ),
  keymap.of([...defaultKeymap, ...historyKeymap]),
];

const syncDocuments = (left: Y.Doc, right: Y.Doc): (() => void) => {
  const leftToRight = (update: Uint8Array, origin: unknown): void => {
    if (origin !== right) Y.applyUpdate(right, update, left);
  };
  const rightToLeft = (update: Uint8Array, origin: unknown): void => {
    if (origin !== left) Y.applyUpdate(left, update, right);
  };
  left.on("update", leftToRight);
  right.on("update", rightToLeft);
  return () => {
    left.off("update", leftToRight);
    right.off("update", rightToLeft);
  };
};

const dispatchKey = (view: EditorView, key: string): void => {
  view.contentDOM.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
};

const waitForView = async (): Promise<void> => new Promise((resolve) => window.setTimeout(resolve, 80));

const check = (name: string, passed: boolean, detail: string): Check => ({
  name,
  passed,
  detail,
});

window.runCodeMirrorParitySpike = async (): Promise<SpikeResult> => {
  const host = document.createElement("main");
  document.body.append(host);
  const local = new Y.Doc();
  const remote = new Y.Doc();
  const localText = local.getText("manuscript");
  localText.insert(0, "# Evidence\n::label{sec-evidence}\n\nSee [@doe2024].\n");
  Y.applyUpdate(remote, Y.encodeStateAsUpdate(local));
  const stopSync = syncDocuments(local, remote);
  const localAwareness = new Awareness(local);
  const remoteAwareness = new Awareness(remote);
  const undoManager = new Y.UndoManager(localText);
  const startedAt = performance.now();
  const view = new EditorView({
    state: EditorState.create({
      doc: localText.toString(),
      extensions: editorExtensions(localText, localAwareness, undoManager, {
        style: "spaces",
        size: 2,
      }),
    }),
    parent: host,
  });
  const startupMilliseconds = performance.now() - startedAt;
  const checks: Check[] = [];

  view.dispatch({
    selection: { anchor: view.state.doc.length },
    changes: { from: view.state.doc.length, insert: "Local" },
  });
  await waitForView();
  checks.push(
    check(
      "local Yjs synchronization",
      remote.getText("manuscript").toString().endsWith("Local"),
      "A CodeMirror transaction reached the peer Y.Text.",
    ),
  );

  remote.getText("manuscript").insert(0, "Remote: ");
  await waitForView();
  checks.push(
    check(
      "remote Yjs synchronization",
      view.state.doc.toString().startsWith("Remote: "),
      "A peer Y.Text update reached the CodeMirror document.",
    ),
  );

  const relative = Y.createRelativePositionFromTypeIndex(localText, 3);
  remote.getText("manuscript").insert(0, "++");
  const resolved = Y.createAbsolutePositionFromRelativePosition(relative, local);
  checks.push(
    check(
      "relative selection stability",
      resolved?.index === 5,
      `The remembered offset resolved to ${resolved?.index ?? "nothing"} after a peer insertion.`,
    ),
  );

  remoteAwareness.setLocalStateField("user", { name: "Remote researcher", color: "#835" });
  remoteAwareness.setLocalStateField("cursor", {
    anchor: Y.createRelativePositionFromTypeIndex(remote.getText("manuscript"), 2),
    head: Y.createRelativePositionFromTypeIndex(remote.getText("manuscript"), 5),
  });
  applyAwarenessUpdate(localAwareness, encodeAwarenessUpdate(remoteAwareness, [remote.clientID]), remote);
  await waitForView();
  checks.push(
    check(
      "presence projection",
      localAwareness.getStates().has(remote.clientID) && host.querySelector(".cm-ySelection") !== null,
      "A remote awareness state and selection decoration were rendered.",
    ),
  );

  const beforeUndo = localText.length;
  undoManager.clear();
  view.dispatch({ changes: { from: view.state.doc.length, insert: " undo-me" } });
  await waitForView();
  undoManager.stopCapturing();
  undoManager.undo();
  await waitForView();
  checks.push(
    check("shared undo", localText.length === beforeUndo, "Y.UndoManager reverted the local CodeMirror transaction on both peers."),
  );

  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: "[@do" },
    selection: { anchor: 4 },
  });
  view.focus();
  startCompletion(view);
  await waitForView();
  const statusBeforeTab = completionStatus(view.state);
  dispatchKey(view, "Tab");
  await waitForView();
  const completionDocument = view.state.doc.toString();
  checks.push(
    check(
      "completion before indentation",
      completionDocument === "[@doe2024]",
      `Tab handled an ${statusBeforeTab ?? "unavailable"} citation completion and produced ${JSON.stringify(completionDocument)}.`,
    ),
  );

  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: "a" },
    selection: { anchor: 1 },
  });
  dispatchKey(view, "Tab");
  await waitForView();
  checks.push(
    check(
      "two-space indentation",
      view.state.doc.toString() === "a ",
      "Tab inserted spaces to the next two-column stop when no completion was visible.",
    ),
  );

  const tabsHost = document.createElement("section");
  host.append(tabsHost);
  const tabsDoc = new Y.Doc();
  const tabsText = tabsDoc.getText("manuscript");
  tabsText.insert(0, "a");
  const tabsAwareness = new Awareness(tabsDoc);
  const tabsView = new EditorView({
    state: EditorState.create({
      doc: "a",
      selection: { anchor: 1 },
      extensions: editorExtensions(tabsText, tabsAwareness, new Y.UndoManager(tabsText), { style: "tabs", size: 4 }),
    }),
    parent: tabsHost,
  });
  dispatchKey(tabsView, "Tab");
  await waitForView();
  checks.push(
    check(
      "literal-tab indentation",
      tabsView.state.doc.toString() === "a\t",
      "The same command inserted a literal tab for a tab-style preference.",
    ),
  );

  view.dispatch({
    changes: {
      from: 0,
      to: view.state.doc.length,
      insert: "# Heading\n::include{notes.md}\n[@doe2024]\n<!-- review -->",
    },
  });
  await waitForView();
  checks.push(
    check(
      "Scholarmark presentation",
      host.querySelector(".cm-scholarmark-heading") !== null &&
        host.querySelector(".cm-scholarmark-citation") !== null &&
        host.querySelector(".cm-scholarmark-directive") !== null &&
        host.querySelector(".cm-scholarmark-comment") !== null,
      "Markdown headings and bounded Scholarmark tokens received visible decorations.",
    ),
  );

  const content = view.contentDOM;
  checks.push(
    check(
      "editable accessibility attributes",
      content.getAttribute("aria-label") === "CodeMirror parity manuscript" && content.getAttribute("spellcheck") === "true",
      "The editable surface exposes its label and native spellcheck request.",
    ),
  );

  const vimHost = document.createElement("section");
  host.append(vimHost);
  const vimView = new EditorView({
    state: EditorState.create({
      doc: "alpha\nbeta\n",
      extensions: [vim(), keymap.of(defaultKeymap)],
    }),
    parent: vimHost,
  });
  vimView.focus();
  dispatchKey(vimView, "d");
  dispatchKey(vimView, "d");
  await waitForView();
  checks.push(
    check(
      "Vim command delegation",
      vimView.state.doc.toString() === "beta\n" && getCM(vimView) !== null,
      "The maintained Vim extension handled the documented dd command.",
    ),
  );

  const longDocumentCharacters = 250_000;
  const longHost = document.createElement("section");
  host.append(longHost);
  const longStartedAt = performance.now();
  const longView = new EditorView({
    doc: "Research paragraph with [@doe2024].\n".repeat(Math.ceil(longDocumentCharacters / 37)),
    extensions: [markdown(), ...scholarmarkPresentation],
    parent: longHost,
  });
  const longStartup = performance.now() - longStartedAt;
  checks.push(
    check(
      "long-document startup",
      longStartup < 1_000,
      `${longDocumentCharacters.toLocaleString()} characters initialized in ${longStartup.toFixed(1)} ms.`,
    ),
  );

  longView.destroy();
  vimView.destroy();
  tabsView.destroy();
  view.destroy();
  stopSync();
  localAwareness.destroy();
  remoteAwareness.destroy();
  tabsAwareness.destroy();
  local.destroy();
  remote.destroy();
  tabsDoc.destroy();
  host.remove();

  return { checks, startupMilliseconds, longDocumentCharacters };
};
