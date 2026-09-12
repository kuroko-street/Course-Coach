import test from 'node:test';
import assert from 'node:assert/strict';
import {readFilters,patchQuery,emptyFilters,filterQuery,catalogReturnPath,dashboardState} from './catalogQuery.js';

test('empty filters have scalars and independent multi-select arrays',()=>{
  assert.deepEqual(readFilters(new URLSearchParams()),emptyFilters());
  const a=emptyFilters(),b=emptyFilters();a.tag_ids.push('1');assert.deepEqual(b.tag_ids,[]);
});
test('multi-select filters round trip without comma joining or losing Thai query',()=>{
  const p=new URLSearchParams('search=คอม&page=3');
  const updated=patchQuery(p,{instructor_ids:['1','2'],tag_ids:['3','4'],faculty_id:'1'});
  assert.deepEqual(readFilters(updated).instructor_ids,['1','2']);
  assert.deepEqual(readFilters(updated).tag_ids,['3','4']);
  assert.equal(updated.get('search'),'คอม');assert.equal(updated.has('page'),false);
  assert.equal(p.get('page'),'3');
});
test('changing a faculty can clear its dependent department without losing search',()=>{
  const p=patchQuery(new URLSearchParams('search=Com&faculty_id=1&department_id=2'),{faculty_id:'3',department_id:''});
  assert.equal(p.get('faculty_id'),'3');assert.equal(p.has('department_id'),false);assert.equal(p.get('search'),'Com');
});
test('clearing filters preserves the chosen dashboard mode and query',()=>{
  const p=patchQuery(new URLSearchParams('tab=aspects&aspect=teaching&min_reviews=10&faculty_id=1&tag_ids=2&search=lab'),emptyFilters());
  assert.equal(p.get('tab'),'aspects');assert.equal(p.get('min_reviews'),'10');assert.equal(p.get('search'),'lab');
  assert.deepEqual(readFilters(p),emptyFilters());
});
test('pagination can update without discarding current filters',()=>{
  const p=patchQuery(new URLSearchParams('faculty_id=1&page=2'),{page:3},false);
  assert.equal(p.get('page'),'3');assert.equal(p.get('faculty_id'),'1');
});
test('API filter query includes only catalog fields, skips missing values',()=>{
  const p=new URLSearchParams(filterQuery({faculty_id:1,semester:'summer',tag_ids:[2,3],tab:'likes',search:'foo'}));
  assert.equal(p.get('faculty_id'),'1');assert.equal(p.get('semester'),'summer');
  assert.deepEqual(p.getAll('tag_ids'),['2','3']);assert.equal(p.has('tab'),false);assert.equal(p.has('department_id'),false);
});
test('course back links preserve catalog URLs but reject external or unrelated locations',()=>{
  for(const value of ['/','/?search=Com&tag_ids=1','/dashboard','/dashboard?tab=aspects&aspect=exam'])assert.equal(catalogReturnPath(value),value);
  for(const value of [null,{},'//example.com','https://example.com','/login','/course/1','/dashboard/evil','/dashboard#x'])assert.equal(catalogReturnPath(value),'/');
});
test('dashboard uses safe defaults and clamps invalid numeric input',()=>{
  assert.deepEqual(dashboardState(new URLSearchParams()),{tab:'reviews',aspect:'satisfaction',min:0});
  assert.deepEqual(dashboardState(new URLSearchParams('tab=aspects&aspect=exam&min_reviews=3.9')),{tab:'aspects',aspect:'exam',min:3});
  for(const [raw,expected] of [['-2',0],['NaN',0],['Infinity',0],['9999999',1000000]])assert.equal(dashboardState(new URLSearchParams({min_reviews:raw})).min,expected);
  assert.deepEqual(dashboardState(new URLSearchParams('tab=bad&aspect=bad')),{tab:'reviews',aspect:'satisfaction',min:0});
});
