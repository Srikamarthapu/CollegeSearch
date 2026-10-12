import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { csvRecords, readScorecardArchive } from '../scripts/lib/scorecard-archive.mjs';
const archive = (text, extra = {}) => zipSync({ 'Most-Recent-Cohorts-Institution.csv': strToU8(text), ...extra });
const read = (bytes, fields = ['UNITID', 'INSTNM']) => readScorecardArchive(bytes, createHash('sha256').update(bytes).digest('hex'), fields);
test('federal CSV preserves commas, escaped quotes, CRLF and embedded newlines', () => {
  assert.deepEqual([...csvRecords('UNITID,INSTNM\r\n1,"A, B"\r\n2,"C ""D""\nE"\r\n')], [['UNITID','INSTNM'],['1','A, B'],['2','C "D"\nE']]);
});
test('malformed or ambiguous federal artifacts fail closed', () => {
  for (const source of ['UNITID,INSTNM\n1,"A', 'UNITID,INSTNM\n1,A"B', 'UNITID,INSTNM\n1,"A"oops']) assert.throws(() => read(archive(source)), /quoted|quote/);
  for (const source of ['', 'UNITID,INSTNM,INSTNM\n1,A,A', 'UNITID,INSTNM\n1,A,extra', 'UNITID,INSTNM\n1,A\n1,B', 'UNITID,INSTNM\nNaN,A']) assert.throws(() => read(archive(source)));
  assert.throws(() => read(archive('UNITID,INSTNM\n1,A', {'copy/Most-Recent-Cohorts-Institution.csv': strToU8('UNITID,INSTNM\n1,A')})), /Ambiguous/);
  assert.throws(() => readScorecardArchive(archive('UNITID,INSTNM\n1,A'), '0'.repeat(64), ['UNITID']), /hash/);
});
test('federal artifact requires the selected source fields and unique UNITIDs', () => {
  assert.deepEqual(read(archive('UNITID,INSTNM\n1,A')).rows, [{UNITID:'1',INSTNM:'A'}]);
  assert.throws(() => read(archive('UNITID,INSTNM\n1,A'), ['UNITID','MISSING']), /lacks MISSING/);
});
