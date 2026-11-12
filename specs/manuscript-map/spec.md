# Feature: Manuscript Outline and Writing Hints

## Blueprint

### Context

Authors need to inspect manuscript structure and the contribution of the
passage they are writing. Outline & hints keeps those views beside the editor
without treating advisory cues or model interpretations as scientific judgments.

### Architecture

- [ADR-246](../../docs/adrs/implemented/ADR-246-place-live-outline-and-hints-in-context.md)
  places the guide in the right Context pane. Research questions, diary, and
  reviewer-response workflows remain in the left Writing guide.
- The domain analyzer derives heading hierarchy, paragraphs, counts, and local
  cues from composed Markdown. Prose before the first heading remains a root
  outline item. Branches collapse without changing authored content.
- Paragraph content is explicitly labeled as source excerpts. The active
  paragraph shows its full source text; inactive paragraph rows remain compact.
- Own-section words and citations stop at the next heading of any level.
  Descendant-inclusive totals cover the section's full subtree and exclude
  heading titles; the interface identifies which count it displays.
- The manuscript-map owner retains the corresponding composition source map
  and routes exact file-qualified ranges through the project-file owner. Its
  application binding receives the canonical Yjs document and subscribes
  directly to updates with disconnect teardown, so live outline and analysis
  refreshes do not wait for Preview. It rereads current project files on every
  refresh, rebuilds cached structure only when composed source changes, and
  selects within that cache on caret movement without recomposing.
- The caret identifies the active passage. A separate reading-position marker
  follows the source viewport. Optional following scrolls only the outline;
  ordinary source scrolling changes neither selection nor the AI target.
  Following a row taller than the outline viewport keeps its readable beginning
  in view instead of jumping to the bottom of the passage.
- Editing-pass cues are local and advisory. The current-passage view shows at
  most three cues; explicit whole-document review shows at most twenty. Both
  report the total matching count when results exceed the visible bound.
  Summary metrics retain one consistent value-over-label hierarchy at
  constrained widths.
- AI paragraph guidance is disabled initially and enabled only for the current
  session. The guide uses the existing model settings and provider adapter;
  it sends the active paragraph plus bounded section-title and neighboring-
  paragraph context after a 1.5-second pause. Its result is a tentative purpose
  and zero to three writing hints, as defined in
  [model operations](../model-operations/spec.md).
- Analysis distinguishes off, pending, current, stale, unclear, failed, and
  unavailable states. Edits, collaborator updates, target/context changes, and
  model-setting changes invalidate superseded results. Hidden-guide and
  input-method-composition states suspend requests and unsafe navigation.
- Guidance identifies missing model configuration separately from disabled
  session opt-in and an unsupported or absent prose passage. The setup action
  opens the existing connection settings through `ModelProviderSettings.open()`.
  Configuration availability makes no connectivity claim and triggers no
  provider probe. Local outline navigation and hints remain available without
  model configuration.
- Outline state, cues, model results, and session enablement are disposable
  browser state. They never enter manuscript files, Yjs, project history, or
  persisted candidates. Model failure never disables writing or the local map.

### Anti-Patterns

- Do not treat a heuristic cue as an error or automatically rewrite prose.
- Do not analyze fenced examples, front matter, or inert comments as prose.
- Do not require a model or network service to build or navigate the outline.
- Do not navigate stale offsets, infer source identity by text matching, or
  reuse another paragraph's interpretation after a target change.
- Do not send the whole manuscript, create background revision candidates, or
  infer section purposes and whole-document argument flow in this increment.

## Contract

### Definition of Done

- [x] The map shows heading hierarchy, section words, citations, and structural
      cues for heading jumps, placeholders, and single-sentence paragraphs.
- [x] Editing-purpose changes update deterministic cues without rebuilding
      coordinator-owned workflow state.
- [x] Outline & hints is a permanent right Context tab with responsive access,
      route restoration, and its own reading position.
- [x] Collapsible headings contain source-ordered paragraphs, including prose
      before the first heading; own and subtree counts are unambiguous.
- [x] Caret and reading-position markers remain distinct; following and source
      navigation preserve the editor's selection and focus policy.
- [x] Current-passage hints are bounded and whole-document review is explicit.
- [x] Session opt-in enables debounced active-paragraph purpose and hints through
      the existing provider settings, with visible availability and staleness.
- [x] Local and remote edits, context changes, provider changes, hidden views,
      and composition cannot publish an obsolete interpretation as current.
- [x] Unit and browser checks cover hierarchy, composed-file navigation,
      passage tracking, responsive access, and the non-mutating AI lifecycle.

### Regression Guardrails

- Structural analysis and editing passes remain deterministic and local.
- Source excerpts remain distinguishable from model-generated guidance, and
  the full active paragraph stays readable when following oversized rows.
- Exact source identity includes the owning file; repeated includes must not
  make an outline selection target an unrelated passage.
- Source ranges retain original UTF-16 offsets, including CRLF line endings;
  parsing must not normalize text and then navigate with shifted offsets.
- Source scrolling alone never triggers AI work or changes the revision target.
- All guidance uses advisory language; absent or unclear feedback is valid.
- No model response, retry, or navigation action writes manuscript content.

### Scenarios

**Scenario: Author follows a paragraph while writing**

- Given: a composed manuscript with nested headings and prose
- When: the author opens Outline & hints and moves the caret
- Then: the matching passage is identified and local hints reflect its current
  source without moving the source selection; the labeled source excerpt shows
  the active paragraph in full while inactive paragraphs stay compact

**Scenario: Author follows a long active paragraph**

- Given: the active paragraph row is taller than the outline viewport
- When: following brings that row into view
- Then: the paragraph's beginning remains readable instead of the outline
  jumping to its bottom, and the source selection stays fixed

**Scenario: Author browses another part of the manuscript**

- Given: a paragraph is selected for guidance
- When: the author scrolls the source and optionally follows its reading position
- Then: only the reading-position marker and outline viewport change; the
  guidance target and source caret stay fixed

**Scenario: A collaborator edits during AI analysis**

- Given: the author enabled paragraph analysis and a response is pending
- When: a collaborator changes the captured paragraph or its supplied context
- Then: the old response is discarded and any new analysis uses current input
  after the typing pause, without changing manuscript text

**Scenario: Model guidance is unavailable**

- Given: the configured provider fails or the active source has no prose target
- When: the guide updates
- Then: it identifies unavailable or failed analysis while editing, structural
  navigation, and local cues remain usable

**Scenario: Author has not configured a model**

- Given: model configuration is missing
- When: the author opens Outline & hints
- Then: guidance explains the missing setup separately from disabled analysis
  or an unsupported passage and offers the existing connection settings action;
  local outline and hints work without a connectivity probe

**Scenario: A configured model has not been enabled for guidance**

- Given: model settings exist and session opt-in is disabled
- When: the guide updates
- Then: it identifies analysis as disabled without claiming that the provider
  is connected or issuing an analysis or connectivity request
