import test from 'node:test';
import assert from 'node:assert/strict';
import {isCourseUnavailable} from './courseAvailability.js';

test('missing course errors trigger the unavailable flow',async()=>{
  for(const message of ['Course id 17 not found.','ไม่พบรายวิชา','ไม่พบรายวิชาที่เปิดเผย']){
    assert.equal(await isCourseUnavailable(17,{status:404,message},()=>{throw Error('unneeded lookup');}),true);
  }
});

test('a missing review does not redirect while its course is still available',async()=>{
  assert.equal(await isCourseUnavailable(17,{status:404,message:'Review not found.'},async()=>({course_id:17})),false);
  assert.equal(await isCourseUnavailable(17,{status:409,message:'conflict'},async()=>{throw Error('unneeded lookup');}),false);
});

test('an ambiguous 404 redirects when the course was merged or removed',async()=>{
  assert.equal(await isCourseUnavailable(17,{status:404,message:'Review not found.'},async()=>({course_id:16,redirected_from:17})),true);
  assert.equal(await isCourseUnavailable(17,{status:404,message:'Review not found.'},async()=>{throw Object.assign(Error('missing'),{status:404});}),true);
});
