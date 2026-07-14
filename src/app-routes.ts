export const exampleRoutes = [
  { path: "/", purpose: "Collaborative scholarly workspace" },
  { path: "/library", purpose: "Project-free private reference library" },
  { path: "/workspaces/:id", purpose: "Stable workspace resource" },
  { path: "/share/:token", purpose: "Read-only workspace link" },
  { path: "/edit/:token", purpose: "Editable workspace link" },
  { path: "/api/workspaces", purpose: "Workspace catalog" },
  { path: "/api/workspaces/demo", purpose: "Portable workspace resource" },
  { path: "/api/session", purpose: "Authenticated identity" },
  { path: "/api/health", purpose: "JSON health endpoint for tooling and smoke tests" },
];
