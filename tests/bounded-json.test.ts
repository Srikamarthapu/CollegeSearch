import assert from 'node:assert/strict';
import test from 'node:test';
import { readBoundedJson, JsonBodyError } from '../app/lib/bounded-json.ts';
const input = (body:string, length?:string) => new Request('https://example.test', {method:'POST',headers:{'content-type':'application/json',...(length?{'content-length':length}:{})},body});
test('JSON input accepts exact byte limit and rejects absent or misleading size headers', async()=>{
  assert.deepEqual(await readBoundedJson(input('{"é":1}'),8), {'é':1});
  for (const request of [input('{"é":1}'),input('{"é":1}','1')]) await assert.rejects(readBoundedJson(request,7), (error)=>error instanceof JsonBodyError && error.status===413);
});
test('JSON input rejects malformed data and non-JSON content types',async()=>{
  await assert.rejects(readBoundedJson(input('{'),100), (error)=>error instanceof JsonBodyError && error.status===400);
  await assert.rejects(readBoundedJson(new Request('https://example.test',{method:'POST',body:'{}'}),100),(error)=>error instanceof JsonBodyError && error.status===415);
});
