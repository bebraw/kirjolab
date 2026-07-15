# Feature: Research Context Pane

## Blueprint

### Context

Kirjolab should let a researcher keep the current writing target visible while
checking the rendered manuscript or reading its supporting sources. The right
side of the workspace is therefore a research-context surface, not a preview
component with an unrelated PDF workflow elsewhere.

The feature implements the interface boundary chosen in ADR-053 and extended by
ADR-055, ADR-056, ADR-071, ADR-073, and ADR-081. It hosts semantic preview, the
owner-private reference library, the selected-passage Writing assistant,
publication/PDF research resources, and grounded-revision review without
changing their canonical data, selector, authorization, or rendering contracts.

### Architecture

- The desktop workspace has two primary document surfaces: an authoring editor
  on the left and a tabbed research-context pane on the right. A compact
  resource-navigation rail may remain ancillary to those surfaces.
- The ancillary rail separates project files from research. Files is the
  initial mode; Research presents bounded collapsible project collections
  rather than duplicating the permanent private Library destination.
- The context tab model uses a discriminated target keyed by stable identity:
  the singleton manuscript Preview, singleton owner Library, singleton Writing
  assistant, a publication UUID, a workspace PDF UUID, a private library PDF
  UUID, or a model-candidate UUID. One target can have at most one open tab.
- Preview is the initial permanent tab, followed by Library and Writing
  assistant. None can be closed or replaced, and each retains its own scroll
  position when another context becomes active.
- In standalone Library mode, the permanent Library tab, open private-resource
  tabs, and resource actions share the global header. Private PDF help and page
  controls are omitted there because annotation feedback is contextual and the
  persistent left rail is the sole page-navigation control. The context panel
  begins directly below that single row. Workspace mode retains its pane-local
  context strip because those tabs apply only to the context side of the
  authoring split.
- Closing the active private-resource tab in standalone Library mode activates
  the permanent Library destination and replaces the document route with
  `/library`. Workspace resource tabs retain the shared previous-neighbor
  fallback behavior.
- Writing assistant contains the selected-passage instruction, explicit model
  connection settings, request status, and draft inventory. Activating its tab
  never starts a model request; a generated candidate opens its resource-keyed
  review tab without removing the assistant destination.
- Publication and PDF tabs are closable. One unpinned resource tab serves as
  the replaceable follow-context slot; pinned tabs are not replaced by later
  navigation.
- Candidate tabs follow the same close, pin, replace, dedupe, and local-scroll
  rules. Their review renders immutable original/replacement text and evidence
  snapshots, with navigation to current evidence resources when available.
  Rejecting returns to Writing assistant for rapid redrafting; applying keeps
  the accepted review visible.
- Each PDF tab retains its page, within-page scroll, and focused annotation.
  Reopening or focusing an existing PDF target restores that local reading
  context rather than loading a duplicate tab.
- Private library PDFs use distinct `library-pdf:` identities, retain local
  page and scroll state, and reuse the reader in private-highlight mode. Project
  intake, citation, highlighting, and annotation controls are unavailable in
  that mode. A selection remains ephemeral until the owner explicitly saves a
  page, quote, and optional comment to the private library.
- Private library PDF page navigation and annotation modes share a persistent
  left icon rail. Annotation editors, overview, and project sharing appear in
  a transient inspector only when requested or required. Page-anchored note
  pins and freehand strokes persist in the owner library using normalized page
  coordinates and rerender on page change.
- Touch surround swipes and unzoomed, horizontally dominant Mac trackpad
  gestures change one page at a time. Two-finger pinch gestures scale only the
  PDF. The fitted page uses the reader's actual content width without exposing
  a redundant horizontal scrollbar; zoomed pages retain native panning, and pen
  input updates the active path without rebuilding saved markup.
- PDF zoom transforms the committed page during active touch or trackpad input.
  Rendering is debounced and buffered offscreen; canvas, text layer, geometry,
  and zoom state commit together only after the complete frame is ready.
- The same compact row exposes annotated export only after a private annotation
  exists. Export downloads an owner-authorized derived copy and does not change
  the context tab, source artifact, project state, or research-share state.
- A private PDF context may expose the existing project-reference and private-
  research sharing commands as a staged project-use section. Reference linkage,
  rights review, PDF sharing, highlight sharing, and revocation remain distinct
  commands whose current state is derived from authorized snapshots.
- The semantic preview and `PdfEvidenceViewer` remain independent views behind
  one context-pane controller. Switching tabs must not recreate a resource
  identity or mutate the manuscript, PDF, or annotation records.
- Active target, tab order, open/closed state, pin state, permanent-tab scroll,
  PDF page, PDF scroll, and focused annotation are local browser state.
  They must not be written to Yjs, the workspace snapshot, Durable Object
  SQLite, or collaboration control messages.
- Stable, reconstructible workspace selections are reflected in bounded query
  parameters: active non-entry file, rail, authoring mode, narrow surface,
  desktop layout, active context target, and the active PDF page or focused
  annotation. Refresh and copied workspace URLs restore those selections only
  after their ids are reconciled against the authorized snapshots.
- Context-target changes push browser history. Incidental view changes and PDF
  page turns replace the current history entry so Back follows meaningful
  research navigation rather than replaying every local adjustment. Unknown
  query parameters remain untouched.
- Draft text, form contents, open/pinned inactive tabs, scroll offsets, pane
  widths, selections, and dialog state do not enter the URL. They remain
  ephemeral or use their existing browser-local storage contract.
- On desktop, a pointer- and keyboard-operable separator resizes Authoring and
  Context while preserving readable minimum widths. The local authoring width
  is remembered per workspace and context kind. Preview, Library, and Writing
  assistant share one stable proportion, while a wide PDF reading layout does
  not force that proportion onto the permanent tabs.
- A desktop view control switches among Split, Editor only, Context only, and
  PDF only. The choice is local per workspace, survives reload, never enters
  collaborative state, and triggers PDF rerendering after geometry changes.
- PDF only activates an open PDF or the first project PDF when available; an
  empty project explains that a PDF must be added instead of showing a broken
  viewer.
- Local tab state is scoped to the current workspace. Switching workspaces
  reconciles it against the new authorized snapshot so a stale tab cannot show
  a resource from another workspace.
- Reconciliation authorizes `pdf:` tabs from the workspace snapshot and
  `library-pdf:` tabs from the current owner-library snapshot; neither scope
  grants the other.
- Publications, PDFs, annotations, claims, model candidates, and typed
  relationships remain shared durable resources behind the existing workspace
  authorization boundary. Context navigation addresses them by stable resource
  ids, never by title, citation key, or filename.
- `PublicationPdfLink` is a stable, durable, workspace-scoped many-to-many
  association with a unique publication/PDF pair. It projects `has-artifact`
  from publication to PDF in workspace knowledge navigation.
- Opening a citation or publication focuses its publication context. That view
  lists zero, one, or several explicitly linked PDFs; selecting one opens its
  resource-keyed PDF tab. With no link, publication metadata remains useful and
  the view presents an honest unlinked state rather than a broken viewer.
- An imported PDF with no publication link remains a usable standalone PDF
  context. Linking or unlinking it is explicit and never deletes the PDF,
  publication, or annotations.
- An unused imported PDF can be explicitly removed from its project together
  with its stored bytes. Removal is blocked with dependency counts while any
  highlight or publication/PDF link still refers to it; relationships are
  never silently cascaded from a rail action.
- An unlinked PDF exposes an inline DOI intake with separate lookup, reviewed
  acceptance, and cancellation states. Successful **Add to library & connect**
  opens the stable publication context but never inserts manuscript syntax.
- Opening an annotation focuses its PDF, page, and stored highlight. Navigating
  from that annotation to a manuscript passage restores the Authoring surface
  and selects only a currently resolved durable anchor.
- **Add to library**, **Cite in manuscript**, and **Connect as evidence** are
  separate, labelled commands. Context navigation has no implicit mutation
  side effects.
- Activating **Library** refreshes the current owner's authorized library in
  place. Contextual **Manage in library** actions focus that same tab instead of
  opening a modal or creating another tab.
- On narrow screens, only Authoring or Context is presented as the primary
  surface. A keyboard-operable switch changes surfaces without discarding the
  current tab or any per-tab reading position.

### Interaction Contracts

- The tab list uses standard tab semantics: the container has `tablist`, each
  tab has `tab`, the active tab exposes `aria-selected="true"`, and its content
  has `tabpanel` with an accessible label relationship.
- The tab row owns active-context status, page navigation, pin, and close
  controls. A PDF filename appears in its resource tab instead of being
  repeated in a second content header.
- Left/Right Arrow moves tab focus, Home/End reaches the first/last tab, Enter
  or Space activates a focused tab, and a close control is independently
  labelled. Closing the active resource selects the nearest remaining tab;
  permanent Preview, Library, and Writing assistant tabs are never removed.
- Opening an existing resource tab activates it without changing tab order or
  resetting its reading position.
- Automatic navigation may replace only the unpinned follow-context resource
  tab. It must never replace Preview, Library, Writing assistant, or a pinned
  tab.
- The replaceable-tab control uses the behavioral labels **Keep tab** and
  **Allow replacement**; its accessible name and title explain what opening the
  next research resource will do.
- Selecting text in a visible PDF populates an annotation draft for that exact
  PDF and page and immediately paints its pending geometry over the page so
  the researcher does not lose visual context. Its PDF target is locked to the
  visible artifact. Saving the draft remains an explicit durable action.
- Reference intake is folded by default because identification is a distinct
  research task. A PDF with exactly one linked publication exposes a labelled
  citation action beside evidence capture; linking a highlight to selected
  manuscript prose remains a separate labelled save action.
- Citing a visible publication requires an explicit command and a valid current
  remembered Yjs-relative editor insertion point. If no safe insertion point
  exists, the command is unavailable; it never falls back to position zero or
  guesses.
- Linking a PDF to a publication requires an explicit action against two known
  resources in the current workspace. It does not cite the publication or
  connect an annotation to manuscript prose.
- DOI lookup and cancellation are non-mutating. Acceptance remains disabled
  while a request is active, and a response for a PDF that is no longer active
  cannot replace the current context.

### API Contracts

- `WorkspaceSnapshot.publicationPdfLinks` contains durable
  `PublicationPdfLink` representations with stable id, publication id, PDF id,
  and creation time.
- `POST /api/workspaces/{id}/publication-pdf-links` accepts a known
  `publicationId` and `pdfId`, creates at most one association for the pair, and
  returns the link representation.
- `DELETE /api/workspaces/{id}/publication-pdf-links/{linkId}` removes only the
  association and returns an empty successful response.
- `POST /api/workspaces/{id}/annotation-links` accepts one annotation draft and
  one current manuscript passage selector. It validates both before inserting
  the annotation and passage link in one SQLite transaction, returning both
  resources; stale input leaves neither row behind.
- `POST /api/workspaces/{id}/publication-intake/preview` returns bounded,
  fingerprinted DOI metadata without mutation.
- `POST /api/workspaces/{id}/publication-intake/accept` refetches reviewed
  metadata and atomically creates or reuses canonical publication state plus
  the explicit PDF link.

### Anti-Patterns

- Do not render the preview, PDF, and editor as three mandatory document-width
  panes.
- Do not remove or make the Preview tab closable.
- Do not remove, duplicate, or make the Library tab closable.
- Do not move, duplicate, or make the Writing assistant tab closable.
- Do not identify open tabs by mutable citation key, title, or filename.
- Do not persist ephemeral context navigation as collaborative workspace state.
- Do not reload a PDF from page one merely because another tab was viewed.
- Do not create a library record, citation, annotation, claim, or relationship
  as a side effect of opening or switching context.
- Do not expose project evidence controls or treat private PDF selection as a
  durable mutation while a private library PDF is active.
- Do not present project handoff as one action that silently links a reference,
  changes artifact rights, or shares more than the selected resource.
- Do not assume every publication has exactly one PDF.
- Do not infer a publication/PDF association from citation key, DOI, title,
  author, filename, or search similarity.
- Do not delete a publication, PDF, or annotation when an artifact link is
  removed.
- Do not navigate a stale manuscript anchor or silently recover it by quote or
  offset fallback.
- Do not make pointer interaction the only way to switch, pin, close, or act on
  a context.

## Contract

### Definition of Done

- [x] The right-hand preview becomes a tabbed context pane with a permanent
      Preview tab, permanent Library tab, permanent Writing assistant tab, and
      resource-keyed publication/PDF tabs.
- [x] Library browsing and management remain beside authoring without a modal
      covering the workspace.
- [x] Opening the same publication, PDF, or annotation twice focuses one
      existing resource tab instead of creating duplicates.
- [x] Preview scroll and each PDF's page, scroll, and focused annotation survive
      tab switches.
- [x] A PDF can be read and selected beside the live authoring editor without a
      modal covering either surface.
- [x] Resource tabs can be pinned, closed, and navigated entirely by keyboard.
- [x] Desktop users can resize Authoring and Context by pointer or keyboard,
      reset the split, keep all permanent tabs at one width, and retain a
      separate PDF reading proportion.
- [x] Citation and annotation navigation focus the appropriate publication,
      PDF evidence, or resolved manuscript passage.
- [x] A publication context lists all explicitly linked PDF artifacts, supports
      explicit link/unlink actions, and remains useful when none are linked.
- [x] Publication/PDF associations appear as typed `has-artifact` connections
      and support many-to-many resource pairs.
- [x] Add-to-library, cite, and connect-evidence commands are visibly distinct
      and have no implicit cross-effects.
- [x] Grounded model candidates open as resource-keyed Context tabs with
      original/replacement regions, provenance links, and explicit apply/reject
      actions.
- [x] Narrow layouts expose an explicit Authoring/Context switch and preserve
      the hidden surface's local state.
- [x] Refresh, copied URLs, and browser Back restore authorized file, view,
      context, and PDF-location selections without persisting transient drafts.
- [x] Browser coverage proves tab identity, reading-position restoration,
      keyboard behavior, mutation boundaries, and responsive switching.
- [x] An unlinked PDF can be identified by reviewed DOI metadata and connected
      to stable publication context without citing the manuscript.
- [x] An owner can open a private library PDF in a distinct private resource
      tab, restore its local page, and leave project state unchanged.
- [x] An owner can explicitly save a selected private PDF quotation, revisit
      its page, and keep that highlight outside project evidence state.
- [x] An owner can explicitly link a private PDF's reference, review rights,
      share or revoke its PDF snapshot, and independently share or revoke a
      saved highlight from the reader.
- [x] Standalone Library tabs and active PDF controls occupy the global header
      without reserving a second horizontal strip above the document.

### Regression Guardrails

- Preview, Library, and Writing assistant must remain present, unique, and
  non-closable.
- An open resource target must map to at most one tab by kind-qualified stable
  id.
- Switching, closing, or pinning tabs must not send Yjs updates or resource
  mutation requests.
- Following context must never replace Preview, Library, Writing assistant, or
  a pinned resource tab.
- Per-tab reading state must be scoped by resource identity and must not leak
  between PDFs.
- Context tabs must be reconciled on workspace changes and must not retain a
  representation that is absent from the newly authorized snapshot.
- Workspace query state must accept only bounded known values, omit defaults,
  preserve parameters owned by other features, and fall back to Preview or the
  entry file when a requested stable id is absent or unauthorized.
- Candidate tabs must be authorized by candidate id and must not persist their
  local open, pin, active, or scroll state into candidate provenance.
- PDF rendering remains single-active-page and uses the pinned matching PDF.js
  display and worker assets.
- PDF selections and highlights remain external to immutable PDF bytes.
- A rapid sequence of PDF opens must discard stale loading tasks before they
  can replace the active artifact, status, or reading position.
- Workspace authorization still applies to every publication and candidate
  representation, PDF stream, annotation mutation, relationship action, and
  candidate apply/reject action.
- Owner-library authorization applies independently to every private PDF tab
  and stream; a private artifact id never becomes workspace authorization.
- Publication/PDF links must reference existing resources in the same
  workspace, reject duplicate pairs, and never depend on metadata matching.
- Removing a publication/PDF link must leave both endpoint resources and all
  annotations unchanged.
- A narrow-layout surface switch must preserve editor selection, collaboration
  ownership, active context tab, and reading positions.
- User-provided publication and annotation metadata must render through text
  nodes rather than HTML insertion.
- Research search temporarily replaces the collection inventory and clearing
  the query restores it without changing durable resources.
- Atomic annotation/passage creation must validate the current manuscript
  revision and exact range before either resource is inserted.

### Scenarios

**Scenario: Writer compares prose with its rendered form**

- Given: Authoring and the Preview context are visible
- When: the researcher edits collaborative Markdown
- Then: the permanent Preview tab updates without losing its reading position
  merely because another context was previously viewed

**Scenario: Citation opens research context**

- Given: the manuscript references a known stable publication
- When: the researcher opens that citation
- Then: Kirjolab activates one publication tab and offers any related PDFs as
  explicit resource actions without changing the manuscript or library

**Scenario: Evidence remains in place while writing**

- Given: a PDF tab is open on a page with a focused annotation
- When: the researcher switches to Preview and then returns to the PDF
- Then: the same PDF tab restores its page, scroll position, and highlight

**Scenario: Publication exposes several local artifacts**

- Given: a publication has two explicit PDF associations
- When: the researcher opens its publication context
- Then: both artifacts are listed as `has-artifact` relationships and each can
  open one resource-keyed PDF tab

**Scenario: Publication has no local artifact**

- Given: a publication has no explicit PDF association
- When: the researcher opens it from a citation
- Then: Kirjolab shows its publication metadata and an unlinked state without
  guessing a PDF from a title, DOI, or filename

**Scenario: Visible source becomes evidence**

- Given: a PDF is visible beside the authoring editor
- When: the researcher selects source text and explicitly saves it
- Then: Kirjolab atomically creates an annotation for that PDF and page plus a
  durable link to the selected prose while preserving the authoring context

**Scenario: Navigation does not imply authorship**

- Given: a publication or PDF is open in the context pane
- When: the researcher switches, pins, or closes its tab
- Then: Kirjolab performs no library, citation, annotation, claim, or link
  mutation

**Scenario: Permanent tabs preserve the split**

- Given: the researcher has resized the Authoring and Context panes
- When: they switch among Preview, Library, and Writing assistant
- Then: both panes retain the same widths across the tab switch

**Scenario: Assistant drafts into review context**

- Given: the researcher selected manuscript text and grounding evidence
- When: they explicitly draft a revision from the Writing assistant tab
- Then: one candidate review tab opens while Writing assistant remains present
  and the manuscript remains unchanged until explicit application

**Scenario: Unlinked PDF becomes reviewed working memory**

- Given: an imported PDF has no publication association
- When: the researcher previews a DOI, reviews its key, and explicitly accepts
- Then: the publication and PDF link appear atomically, publication context
  opens, and canonical manuscript text is unchanged

**Scenario: Context collapses to one surface**

- Given: the viewport cannot keep both editor and context readable
- When: the researcher switches from Authoring to Context and back
- Then: only one primary surface is shown at a time and both surfaces retain
  their selections and reading state

**Scenario: Private library PDF remains private while highlighting**

- Given: an owner-private library record has an attached PDF
- When: the owner selects text, explicitly saves a private highlight, revisits
  its page, visits Library, and opens the PDF again
- Then: one `library-pdf:` tab retains private reading context without exposing
  project evidence controls or changing the project snapshot

**Scenario: Standalone PDF uses one header row**

- Given: an owner opens a private PDF from the standalone Library
- When: its resource tab and private-reader controls become active
- Then: Library, the PDF tab, and resource actions share the global header,
  page navigation appears only in the left rail, and the document begins
  immediately below the header

**Scenario: Closing a standalone PDF returns to Library**

- Given: an owner opened a private PDF from `/library`
- When: the owner closes its active resource tab
- Then: the permanent Library tab and panel are active at `/library`, not the
  neighboring Writing assistant destination

**Scenario: Private research enters a project explicitly**

- Given: a private PDF reference is not linked and its artifact is not marked
  shareable
- When: the owner links the reference, records shareable rights, shares the PDF,
  and separately shares one saved highlight
- Then: each state advances only after its own command, PDF and highlight shares
  can be revoked independently, and no citation is inserted into the manuscript
