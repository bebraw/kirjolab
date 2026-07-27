import { ApplicationVersionControl } from "./application-version-control";
import { AppToast } from "./app-toast";
import { AssistantResultPanel } from "./assistant-result-panel";
import { AssistantTaskPanel } from "./assistant-task-panel";
import { AssistantWorkflowStatus } from "./assistant-workflow-status";
import { AuthoringModeTabs } from "./authoring-mode-tabs";
import { CandidateListPanel } from "./candidate-list-panel";
import { CandidateReviewPanel } from "./candidate-review-panel";
import { CitationNetworkWorkspace } from "./citation-network-workspace";
import { ClaimDialog } from "./claim-dialog";
import { ClaimListPanel } from "./claim-list-panel";
import { CollaboratorSelectionList } from "./collaborator-selection-list";
import { ConnectionStatus } from "./connection-status";
import { ContextTabStrip } from "./context-tab-strip";
import { ContextResourcePresenter } from "./context-resource-presenter";
import { EditorInsertMenu } from "./editor-insert-menu";
import { EditorStatus } from "./editor-status";
import { GitHubImportPanel } from "./github-import-panel";
import { GitHubSyncMenu } from "./github-sync-menu";
import { LatexImportPanel } from "./latex-import-panel";
import { LibraryDiscoveryResults } from "./library-discovery-results";
import { LibraryDiscoverySearch } from "./library-discovery-search";
import { LibraryPdfAnnotationToolbar } from "./library-pdf-annotation-toolbar";
import { LibraryPdfInspector } from "./library-pdf-inspector";
import { LibraryPdfMarkupLayer } from "./library-pdf-markup-layer";
import { LibraryPdfUploadControl } from "./library-pdf-upload-control";
import { LibraryPdfUploadStatus } from "./library-pdf-upload-status";
import { LibraryReferenceList } from "./library-reference-list";
import { LibraryReferenceImportControl } from "./library-reference-import-control";
import { LibraryToolsMenu } from "./library-tools-menu";
import { ManuscriptCommentList } from "./manuscript-comment-list";
import { ManuscriptMapPanel } from "./manuscript-map-panel";
import { ModelProviderSettings } from "./model-provider-settings";
import { PreviewContextStatus } from "./preview-presentation";
import { PreviewSyncControls } from "./preview-sync-controls";
import { ProjectAnnotationForm } from "./project-annotation-form";
import { ProjectEvidencePanel } from "./project-evidence-panel";
import { ProjectExportDialog } from "./project-export-dialog";
import { ProjectFileActions } from "./project-file-actions";
import { ProjectFileDialog } from "./project-file-dialog";
import { ProjectHistoryDialog } from "./project-history-dialog";
import { ProjectHistoryTrigger } from "./project-history-trigger";
import { ProjectImageUploadControl } from "./project-image-upload-control";
import { ProjectMapWorkspace } from "./project-map-workspace";
import { ProjectStartingPointBrowser } from "./project-starting-point-browser";
import { ProjectTemplateSaveDialog } from "./project-template-save-dialog";
import { ProjectTreePanel } from "./project-tree-panel";
import { PublicationContextPanel } from "./publication-context-panel";
import { PublicationIntakePanel } from "./publication-intake-panel";
import { PublicationListPanel } from "./publication-list-panel";
import { ReferenceLibraryFilterPanel } from "./reference-library-filters";
import { ResearchDiarySummary } from "./research-diary-summary";
import { SourceCitationControl } from "./source-citation-control";
import { SourceCompletion } from "./source-completion";
import { UnidentifiedPdfList } from "./unidentified-pdf-list";
import { VimModeControl } from "./vim-mode-control";
import { WebSnapshotComparisonPanel, WebSourceCapture } from "./web-source-panels";
import { WorkspaceCatalogPanel } from "./workspace-catalog-panel";
import { WorkspaceLayoutControl } from "./workspace-layout-control";
import { WorkspaceRailTabs } from "./workspace-rail-tabs";
import { WorkspaceSettingsPanel } from "./workspace-settings-panel";
import { WorkspaceSharingPanel } from "./workspace-sharing-panel";
import { WorkspaceSurfaceSwitcher } from "./workspace-surface-switcher";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { WritingWorkflowPanel } from "./writing-workflow-panel";
import { WorkspacePreview } from "./workspace-preview";

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
    referenceLibraryList: requireElement("reference-library-list", LibraryReferenceList),
    libraryDiscoverySearch: requireElement("library-discovery-search", LibraryDiscoverySearch),
    libraryDiscoveryResults: requireElement("library-discovery-results", LibraryDiscoveryResults),
    libraryReferenceImport: requireElement("library-reference-import-control", LibraryReferenceImportControl),
    libraryToolsMenu: requireElement("library-tools-menu", LibraryToolsMenu),
    libraryPdfUploadControl: requireElement("library-pdf-upload-control", LibraryPdfUploadControl),
    libraryPdfUploadStatus: requireElement("library-pdf-upload-status", LibraryPdfUploadStatus),
    referenceLibraryFilters: requireElement("reference-library-filters", ReferenceLibraryFilterPanel),
    citationNetwork: requireElement("citation-network", CitationNetworkWorkspace),
    webSourceCapture: requireElement("web-source-capture", WebSourceCapture),
    webSnapshotComparison: requireElement("web-snapshot-comparison", WebSnapshotComparisonPanel),
    unidentifiedPdfList: requireElement("unidentified-pdf-list-panel", UnidentifiedPdfList),
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
    editorInsertMenu: requireElement("editor-insert-menu-component", EditorInsertMenu),
    bibliography: requireElement("bibliography-editor", HTMLTextAreaElement),
    manuscriptCommentListPanel: requireElement("manuscript-comment-list-panel", ManuscriptCommentList),
    workspaceSurfaces: requireElement("workspace-surfaces", HTMLElement),
    previewSyncControls: requireElement("preview-sync-controls", PreviewSyncControls),
    workspaceSurfaceSwitcher: requireElement("workspace-surface-switcher", WorkspaceSurfaceSwitcher),
    sourceCitationControl: requireElement("source-citation-control", SourceCitationControl),
    contextTabStrip: requireElement("context-tab-strip", ContextTabStrip),
    contextResourcePresenter: requireElement("context-resource-presenter", ContextResourcePresenter),
    previewContextControls: requireElement("preview-context-controls", PreviewContextStatus),
    workspacePreview: requireElement("workspace-preview", WorkspacePreview),
    publicationContextPanel: requireElement("publication-context-panel", PublicationContextPanel),
    candidateReviewPanel: requireElement("candidate-review-panel", CandidateReviewPanel),
    connectionStatus: requireElement("connection-status-panel", ConnectionStatus),
    editorStatus: requireElement("editor-status", EditorStatus),
    projectEvidencePanel: requireElement("project-evidence-panel", ProjectEvidencePanel),
    publicationListPanel: requireElement("publication-list-panel", PublicationListPanel),
    claimListPanel: requireElement("claim-list-panel", ClaimListPanel),
    claimDialog: requireElement("claim-dialog-panel", ClaimDialog),
    projectAnnotationForm: requireElement("project-annotation-form", ProjectAnnotationForm),
    libraryPdfInspector: requireElement("library-pdf-inspector", LibraryPdfInspector),
    libraryPdfAnnotationToolbar: requireElement("library-pdf-annotation-toolbar", LibraryPdfAnnotationToolbar),
    paperMarkups: requireElement("paper-markups", LibraryPdfMarkupLayer),
    paperReader: requireElement("paper-reader", HTMLElement),
    publicationIntakePanel: requireElement("publication-intake-panel", PublicationIntakePanel),
    assistantTaskPanel: requireElement("assistant-task-panel", AssistantTaskPanel),
    assistantInteractiveResult: requireElement("assistant-interactive-result", AssistantResultPanel),
    assistantWorkflowStatus: requireElement("assistant-workflow-status", AssistantWorkflowStatus),
    candidateListPanel: requireElement("candidate-list-panel", CandidateListPanel),
    toast: requireElement("toast", AppToast),
    themePreference: requireElement("theme-preference", HTMLSelectElement),
  };
}

export function requiredAppElement<T extends Element>(id: string, type: { new (): T }): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`Missing interface element: ${id}`);
  return element;
}
