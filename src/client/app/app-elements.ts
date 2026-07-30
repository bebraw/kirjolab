import { ApplicationVersionControl } from "./application-version-control";
import { AppToast } from "./app-toast";
import { AssistantResultPanel } from "../assistant/assistant-result-panel";
import { AssistantGenerationPresenter } from "../assistant/assistant-generation-presenter";
import { AssistantTaskPanel } from "../assistant/assistant-task-panel";
import { AssistantWorkflowStatus } from "../assistant/assistant-workflow-status";
import { AuthoringModeTabs } from "../workspace/authoring-mode-tabs";
import { CandidateListPanel } from "../assistant/candidate-list-panel";
import { CandidateReviewPanel } from "../assistant/candidate-review-panel";
import { ClaimListPanel } from "../assistant/claim-list-panel";
import { CollaboratorSelectionList } from "../collaboration/collaborator-selection-list";
import { ConnectionStatus } from "../collaboration/connection-status";
import { ContextTabStrip } from "../context/context-tab-strip";
import { ContextResourcePresenter } from "../context/context-resource-presenter";
import { EditorInsertMenu } from "../editor/editor-insert-menu";
import { EditorIndentationControl } from "../editor/editor-indentation-control";
import { EditorStatus } from "../editor/editor-status";
import { GitHubImportPanel } from "../integrations/github/github-import-panel";
import { GitHubSyncMenu } from "../integrations/github/github-sync-menu";
import { LatexImportPanel } from "../integrations/latex/latex-import-panel";
import { LibraryPdfAnnotationToolbar } from "../library/library-pdf-annotation-toolbar";
import { LibraryPdfInspector } from "../library/library-pdf-inspector";
import { LibraryPdfMarkupLayer } from "../library/library-pdf-markup-layer";
import { ManuscriptMapPanel } from "../project/manuscript-map-panel";
import { ModelProviderSettings } from "../assistant/model-provider-settings";
import { PreviewContextStatus } from "../preview/preview-presentation";
import { PreviewSyncControls } from "../preview/preview-sync-controls";
import { ProjectAnnotationForm } from "../project/project-annotation-form";
import { ProjectEvidencePanel } from "../assistant/project-evidence-panel";
import { ProjectExportDialog } from "../project/project-export-dialog";
import { ProjectFileActions } from "../project/project-file-actions";
import { ProjectFileDialog } from "../project/project-file-dialog";
import { ProjectHistoryDialog } from "../project/project-history-dialog";
import { ProjectHistoryTrigger } from "../project/project-history-trigger";
import { ProjectImageUploadControl } from "../project/project-image-upload-control";
import { ProjectMapWorkspace } from "../project/project-map-workspace";
import { ProjectStartingPointBrowser } from "../project/project-starting-point-browser";
import { ProjectTemplateSaveDialog } from "../project/project-template-save-dialog";
import { ProjectTreePanel } from "../project/project-tree-panel";
import { PublicationContextPanel } from "../publication/publication-context-panel";
import { PublicationListPanel } from "../publication/publication-list-panel";
import { ReferenceLibraryWorkspace } from "../library/reference-library-workspace";
import { ResearchDiarySummary } from "../context/research-diary-summary";
import { SourceCitationControl } from "../citation/source-citation-control";
import { SourceCompletion } from "../editor/source-completion";
import { ThemePreferenceControl } from "../platform/theme";
import { VimModeControl } from "../editor/vim-mode-control";
import { WebSnapshotComparisonPanel } from "../library/web-source-panels";
import { WorkspaceCatalogPanel } from "../workspace/workspace-catalog-panel";
import { WorkspaceLayoutControl } from "../workspace/workspace-layout-control";
import { WorkspaceRailTabs } from "../workspace/workspace-rail-tabs";
import { WorkspaceSettingsPanel } from "../workspace/workspace-settings-panel";
import { WorkspaceSharingPanel } from "../workspace/workspace-sharing-panel";
import { WorkspaceSurfaceSwitcher } from "../workspace/workspace-surface-switcher";
import { WorkspaceSwitcher } from "../workspace/workspace-switcher";
import { WritingWorkflowPanel } from "../editor/writing-workflow-panel";
import { WorkspacePreview } from "../preview/workspace-preview";

export function collectAppElements(requireElement = requiredAppElement) {
  return {
    modelProviderSettings: requireElement("model-provider-settings", ModelProviderSettings),
    applicationVersion: requireElement("application-version-control", ApplicationVersionControl),
    citationCompletionScope: requireElement("citation-completion-scope", HTMLSelectElement),
    collaboratorSelections: requireElement("collaborator-selections", CollaboratorSelectionList),
    workspaceSwitcher: requireElement("workspace-switcher-control", WorkspaceSwitcher),
    workspaceLayout: requireElement("workspace-layout-control", WorkspaceLayoutControl),
    manageWorkspaces: requireElement("manage-workspaces", HTMLButtonElement),
    workspaceSettings: requireElement("workspace-settings", HTMLButtonElement),
    workspaceSettingsPanel: requireElement("workspace-settings-panel", WorkspaceSettingsPanel),
    workspaceCatalogPanel: requireElement("workspace-catalog-panel", WorkspaceCatalogPanel),
    newWorkspace: requireElement("new-workspace", HTMLButtonElement),
    newWorkspaceStartingPoints: requireElement("project-starting-point-browser", ProjectStartingPointBrowser),
    latexImportPanel: requireElement("latex-import-panel", LatexImportPanel),
    gitHubImportPanel: requireElement("github-import-panel", GitHubImportPanel),
    gitHubSyncMenu: requireElement("github-sync-control", GitHubSyncMenu),
    saveTemplateDialog: requireElement("project-template-save-dialog", ProjectTemplateSaveDialog),
    shareWorkspace: requireElement("share-workspace", HTMLButtonElement),
    workspaceSharingPanel: requireElement("workspace-sharing-panel", WorkspaceSharingPanel),
    referenceLibraryWorkspace: requireElement("reference-library-workspace", ReferenceLibraryWorkspace),
    webSnapshotComparison: requireElement("web-snapshot-comparison", WebSnapshotComparisonPanel),
    workspaceRailTabs: requireElement("workspace-rail-tabs", WorkspaceRailTabs),
    manuscriptMapPanel: requireElement("manuscript-map-panel", ManuscriptMapPanel),
    researchDiaryPanel: requireElement("research-diary-panel", ResearchDiarySummary),
    researchQuestionPanel: requireElement("research-question-panel", WritingWorkflowPanel),
    reviewerResponsePanel: requireElement("reviewer-response-panel", WritingWorkflowPanel),
    projectFileRailActions: requireElement("project-file-rail-actions", ProjectFileActions),
    projectImageUpload: requireElement("project-image-upload-control", ProjectImageUploadControl),
    projectTreePanel: requireElement("project-tree-panel", ProjectTreePanel),
    projectFileMenuActions: requireElement("project-file-menu-actions", ProjectFileActions),
    projectFileDialog: requireElement("project-file-dialog-panel", ProjectFileDialog),
    projectHistoryTrigger: requireElement("project-history-trigger", ProjectHistoryTrigger),
    exportDialog: requireElement("export-dialog-control", ProjectExportDialog),
    projectHistoryDialog: requireElement("project-history-dialog-control", ProjectHistoryDialog),
    source: requireElement("source-editor", HTMLTextAreaElement),
    sourceHighlight: requireElement("source-editor-highlight", HTMLElement),
    sourceEditorShell: requireElement("source-editor-shell", HTMLElement),
    sourceCompletion: requireElement("source-completion", SourceCompletion),
    authoringModeTabs: requireElement("authoring-mode-tabs", AuthoringModeTabs),
    projectMap: requireElement("project-map", ProjectMapWorkspace),
    vimModeControl: requireElement("vim-mode-control", VimModeControl),
    editorIndentationControl: requireElement("editor-indentation-control", EditorIndentationControl),
    editorInsertMenu: requireElement("editor-insert-menu-component", EditorInsertMenu),
    bibliography: requireElement("bibliography-editor", HTMLTextAreaElement),
    workspaceSurfaces: requireElement("workspace-surfaces", HTMLElement),
    previewSyncControls: requireElement("preview-sync-controls", PreviewSyncControls),
    workspaceSurfaceSwitcher: requireElement("workspace-surface-switcher", WorkspaceSurfaceSwitcher),
    sourceCitationControl: requireElement("source-citation-control", SourceCitationControl),
    contextTabStrip: requireElement("context-tab-strip", ContextTabStrip),
    contextResourcePresenter: requireElement("context-resource-presenter", ContextResourcePresenter),
    assistantGenerationPresenter: requireElement("assistant-generation-presenter", AssistantGenerationPresenter),
    previewContextControls: requireElement("preview-context-controls", PreviewContextStatus),
    workspacePreview: requireElement("workspace-preview", WorkspacePreview),
    publicationContextPanel: requireElement("publication-context-panel", PublicationContextPanel),
    candidateReviewPanel: requireElement("candidate-review-panel", CandidateReviewPanel),
    connectionStatus: requireElement("connection-status-panel", ConnectionStatus),
    editorStatus: requireElement("editor-status", EditorStatus),
    projectEvidencePanel: requireElement("project-evidence-panel", ProjectEvidencePanel),
    publicationListPanel: requireElement("publication-list-panel", PublicationListPanel),
    claimListPanel: requireElement("claim-list-panel", ClaimListPanel),
    projectAnnotationForm: requireElement("project-annotation-form", ProjectAnnotationForm),
    libraryPdfInspector: requireElement("library-pdf-inspector", LibraryPdfInspector),
    libraryPdfAnnotationToolbar: requireElement("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar),
    paperMarkups: requireElement("paper-markups", LibraryPdfMarkupLayer),
    paperReader: requireElement("paper-reader", HTMLElement),
    assistantTaskPanel: requireElement("assistant-task-panel", AssistantTaskPanel),
    assistantInteractiveResult: requireElement("assistant-interactive-result", AssistantResultPanel),
    assistantWorkflowStatus: requireElement("assistant-workflow-status", AssistantWorkflowStatus),
    candidateListPanel: requireElement("candidate-list-panel", CandidateListPanel),
    toast: requireElement("toast", AppToast),
    themePreference: requireElement("theme-preference-control", ThemePreferenceControl),
  };
}

export function requiredAppElement<T extends Element>(id: string, type: { new (): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Missing interface element: ${id}`);
  return element;
}
