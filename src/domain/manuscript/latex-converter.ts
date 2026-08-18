import { adaptLatexProjectToSeed } from "../project/latex-project-adapter";
import { convertLatexProject } from "../../lib/paper-import/latex-conversion";
import type { LatexArchiveInspection } from "./latex-import";

export { LatexConversionError, type LatexConversionSelection } from "../../lib/paper-import/latex-renderer";

import type { LatexConversionSelection } from "../../lib/paper-import/latex-renderer";

export function convertLatexInspection(inspection: LatexArchiveInspection, selection: LatexConversionSelection) {
  return adaptLatexProjectToSeed(convertLatexProject(inspection, selection));
}
