import test from 'node:test';
import assert from 'node:assert/strict';
import {formatThaiDateTime,parseServerDateTime} from './dateTime.js';

test('a database timestamp without an offset is interpreted as UTC',()=>{
  const timestamp='2026-10-27T06:27:28';
  assert.equal(parseServerDateTime(timestamp).toISOString(),'2026-10-27T06:27:28.000Z');
  assert.equal(formatThaiDateTime(timestamp),formatThaiDateTime(`${timestamp}Z`));
  assert.match(formatThaiDateTime(timestamp),/13:27:28/);
});

test('an explicit offset is preserved before displaying Bangkok time',()=>{
  assert.equal(parseServerDateTime('2026-10-27T13:27:28+07:00').toISOString(),'2026-10-27T06:27:28.000Z');
  assert.equal(formatThaiDateTime('2026-10-27T13:27:28+07:00'),formatThaiDateTime('2026-10-27T06:27:28Z'));
});
