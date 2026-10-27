function newestReview(reviews) {
  return reviews.reduce((newest, review) => {
    if (!newest) return review;
    const dateDifference = Date.parse(review.created_at) - Date.parse(newest.created_at);
    return dateDifference > 0 || (dateDifference === 0 && review.review_id > newest.review_id) ? review : newest;
  }, null);
}

export function reviewChoicesForStrategy(conflicts, strategy, primaryCourseId) {
  return conflicts.map(conflict => {
    const primaryReview = newestReview(conflict.reviews.filter(review => review.course_id === primaryCourseId));
    const selected = strategy === 'primary' && primaryReview ? primaryReview : newestReview(conflict.reviews);
    return selected.review_id;
  });
}
