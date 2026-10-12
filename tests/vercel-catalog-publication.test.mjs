import assert from 'node:assert/strict';
import test from 'node:test';
import { publicationPlan } from '../scripts/build-vercel.mjs';
const hash = 'a'.repeat(64), marker = {releaseId:`sha256:${hash}`};
const env = { COLLEGESEARCH_PUBLISH_RELEASE:marker.releaseId, VERCEL:'1', VERCEL_ENV:'production', VERCEL_PROJECT_ID:'prj_CvOS9GYT7epRW3Ku4fJ7gdMLg1P3', NEXT_PUBLIC_SUPABASE_URL:'https://ptdbmseeooboqbpyvcgw.supabase.co', SUPABASE_SECRET_KEY:'sb_secret_synthetic_test' };
test('ordinary builds never publish, even when hosted credentials exist', () => {
  assert.equal(publicationPlan({...env,COLLEGESEARCH_PUBLISH_RELEASE:undefined}, marker, hash),null);
});
test('only an explicit exact release in the intended production projects can publish', () => {
  assert.equal(publicationPlan(env,marker,hash).project,'ptdbmseeooboqbpyvcgw');
  for (const changes of [{VERCEL:'0'},{VERCEL_ENV:'preview'},{VERCEL_PROJECT_ID:'unrelated'},{VERCEL_PROJECT_ID:undefined}, {NEXT_PUBLIC_SUPABASE_URL:'https://unrelated.supabase.co'}, {SUPABASE_SECRET_KEY:'REDACTED'}, {COLLEGESEARCH_PUBLISH_RELEASE:'sha256:'+'b'.repeat(64)}]) assert.throws(()=>publicationPlan({...env,...changes},marker,hash));
  assert.throws(()=>publicationPlan(env,marker,'b'.repeat(64)));
});
