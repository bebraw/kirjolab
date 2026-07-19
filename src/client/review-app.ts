import { bindReviewStudyPlanning } from "./review-study";

const reviewId = document.body.dataset.reviewId;
if (!reviewId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(reviewId)) {
  throw new Error("Invalid review identity");
}

bindReviewStudyPlanning(`/api/reviews/${reviewId}`);
