-- Read-only assertion after rerunning scripts/seed-college-knowledge.mjs in the isolated verify DB.
do $$
declare
  active_release text;
  preserved integer;
begin
  select release_id into active_release from public.current_college_knowledge_release();
  select count(*) into preserved from public.college_passages
  where release_id = active_release
    and embedding is not null
    and embedding_model = 'synthetic-seed-preservation-test'
    and embedding_version = 'fixture-v1'
    and embedding_content_sha256 = content_sha256
    and extensions.vector_dims(embedding) = 2048
    and embedding::text like '[1,%';
  if preserved <> 1 then
    raise exception 'The seeder failed to preserve the committed synthetic vector and its provenance';
  end if;
  if (select count(*) from public.college_passages where release_id = active_release and embedding is not null) <> 1 then
    raise exception 'Synthetic embedding fixture affected more than one passage';
  end if;
end;
$$;

select 'PASS: idempotent seeding preserved the existing 2,048D embedding, model/version, and matching content hash';
