#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function publicationPlan(environment, marker, datasetSha256) {
  const requested = environment.COLLEGESEARCH_PUBLISH_RELEASE;
  if (!requested) return null; // Ordinary builds never publish database records.
  if (requested !== marker.releaseId || requested !== `sha256:${datasetSha256}`) throw new Error('The explicitly requested catalog release does not match this build.');
  if (environment.VERCEL !== '1' || environment.VERCEL_ENV !== 'production') throw new Error('Catalog publication is restricted to a production Vercel build.');
  if (environment.VERCEL_PROJECT_ID !== 'prj_CvOS9GYT7epRW3Ku4fJ7gdMLg1P3') throw new Error('Catalog publication requires the exact Vercel project ID.');
  const project = 'ptdbmseeooboqbpyvcgw';
  const url = environment.SUPABASE_URL ?? environment.NEXT_PUBLIC_SUPABASE_URL;
  if (url !== `https://${project}.supabase.co` && url !== `https://${project}.supabase.co/`) throw new Error('Catalog publication targets the wrong Supabase project.');
  const key = environment.SUPABASE_SECRET_KEY ?? environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.includes('REDACTED') || (!key.startsWith('sb_secret_') && key.split('.').length !== 3)) throw new Error('Catalog publication requires the server-only Supabase credential.');
  return { project, releaseId: requested };
}
async function run(script, args) {
  const child = spawn(process.execPath, [resolve(root, script), ...args], { cwd: root, env: process.env, stdio: 'inherit' });
  const code = await new Promise((resolveRun, reject) => { child.once('error', reject); child.once('exit', resolveRun); });
  if (code !== 0) throw new Error(`Build step failed: ${script} (exit ${code}).`);
}
async function main() {
  let plan = null;
  if (process.env.COLLEGESEARCH_PUBLISH_RELEASE) {
    const bytes = await readFile(resolve(root, 'data/colleges.json'));
    const marker = JSON.parse(await readFile(resolve(root, 'data/college-knowledge-release.json'), 'utf8'));
    plan = publicationPlan(process.env, marker, createHash('sha256').update(bytes).digest('hex'));
  }
  await run('node_modules/next/dist/bin/next', ['build']);
  // Publish only after the application builds. The seeder verifies all staged
  // immutable rows before its atomic RPC switches the current release.
  if (plan) await run('scripts/seed-college-knowledge.mjs', ['--hosted-project', plan.project]);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
