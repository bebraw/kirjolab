import type * as Y from "yjs";
import { resolveManuscriptAnchor } from "./manuscript-anchor";
import type { WorkspaceSnapshot } from "./workspace";

export function resolveWorkspaceSnapshotAnchors(document: Y.Doc, snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return {
    ...snapshot,
    links: snapshot.links.map((link) => ({
      ...link,
      resolution: resolveManuscriptAnchor(document, link.anchor),
    })),
    claimLinks: snapshot.claimLinks.map((link) => ({
      ...link,
      resolution: resolveManuscriptAnchor(document, link.anchor),
    })),
    comments: snapshot.comments.map((comment) => ({
      ...comment,
      resolution: resolveManuscriptAnchor(document, comment.anchor),
    })),
    candidates: snapshot.candidates.map((candidate) =>
      candidate.operation === "draft-claim"
        ? candidate
        : {
            ...candidate,
            target: {
              ...candidate.target,
              resolution: resolveManuscriptAnchor(document, candidate.target.anchor),
            },
          },
    ),
  };
}
