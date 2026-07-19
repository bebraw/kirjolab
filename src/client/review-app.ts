import { bindReviewStudyPlanning } from "./review-study";

const workspaceId = document.body.dataset.workspaceId;
if (!workspaceId || !/^[a-z0-9-]{1,64}$/iu.test(workspaceId)) throw new Error("Invalid linked project identity");

bindReviewStudyPlanning(`/api/workspaces/${workspaceId}`);
