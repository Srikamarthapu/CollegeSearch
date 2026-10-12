-- Cleanup after tests/fixtures/m2-install-synthetic-embedding.sql.
begin;
do $$
declare
  active_release text;
begin
  select release_id into active_release from public.current_college_knowledge_release();
  update public.college_passages set
    embedding = null,
    embedding_model = null,
    embedding_version = null,
    embedding_content_sha256 = null
  where release_id = active_release and embedding_model = 'synthetic-seed-preservation-test';
  update public.college_knowledge_releases set embedding_model = null, embedding_version = null
  where release_id = active_release and embedding_model = 'synthetic-seed-preservation-test';
  if (select count(*) from public.college_passages where release_id = active_release and embedding is not null) <> 0 or
     (select count(*) from public.college_knowledge_releases where release_id = active_release and embedding_model is not null) <> 0 then
    raise exception 'Synthetic embedding cleanup did not restore the unembedded seed';
  end if;
end;
$$;
commit;

select 'PASS: restored the isolated verify database to an unembedded seeded release';
