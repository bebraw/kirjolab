export function focusFirstModelEvidence(root: ParentNode): boolean {
  const control = root.querySelector<HTMLInputElement>("[data-model-evidence-key]");
  if (!control) return false;
  control.closest("details")?.setAttribute("open", "");
  control.scrollIntoView({ behavior: "smooth", block: "center" });
  control.focus({ preventScroll: true });
  return true;
}
