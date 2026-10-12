-- Test-only committed vector used to confirm the idempotent seeder preserves embeddings.
-- Run only against the isolated collegesearch_m2_verify database, then always run the restore fixture.
begin;
do $$
declare
  active_release text;
  target_passage text;
  synthetic_embedding extensions.vector := ('[1,' || array_to_string(array_fill('0'::text, array[2047]), ',') || ']')::extensions.vector;
begin
  select release_id into active_release from public.current_college_knowledge_release();
  select passage_id into target_passage from public.college_passages
  where release_id = active_release order by passage_id limit 1;
  if active_release is null or target_passage is null or extensions.vector_dims(synthetic_embedding) <> 2048 then
    raise exception 'Synthetic embedding fixture could not select a current 2048D passage';
  end if;
  if exists (select 1 from public.college_knowledge_releases where release_id = active_release and embedding_model is not null) or
     exists (select 1 from public.college_passages where release_id = active_release and embedding is not null) then
    raise exception 'Synthetic embedding preservation fixture requires an unembedded seed';
  end if;
  update public.college_knowledge_releases set
    embedding_model = 'synthetic-seed-preservation-test',
    embedding_version = 'fixture-v1'
  where release_id = active_release;
  update public.college_passages set
    embedding = synthetic_embedding,
    embedding_model = 'synthetic-seed-preservation-test',
    embedding_version = 'fixture-v1',
    embedding_content_sha256 = content_sha256
  where passage_id = target_passage;
end;
$$;
commit;
