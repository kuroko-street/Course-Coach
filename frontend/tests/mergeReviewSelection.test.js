import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewChoicesForStrategy} from '../src/mergeReviewSelection.js';

const conflicts = [
  {reviewer_id:2,reviews:[
    {review_id:15,course_id:16,created_at:'2026-09-20T10:00:00Z'},
    {review_id:16,course_id:18,created_at:'2026-09-21T10:00:00Z'},
  ]},
  {reviewer_id:3,reviews:[
    {review_id:20,course_id:18,created_at:'2026-09-22T10:00:00Z'},
    {review_id:21,course_id:19,created_at:'2026-09-22T10:00:00Z'},
  ]},
];

test('newest review uses creation time and breaks ties by review ID', () => {
  assert.deepEqual(reviewChoicesForStrategy(conflicts,'latest',16),[16,21]);
});

test('primary course wins when present; otherwise uses newest review', () => {
  assert.deepEqual(reviewChoicesForStrategy(conflicts,'primary',16),[15,21]);
});
