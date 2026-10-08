-- Manual verification for the isolated collegesearch_m2_verify database only.
-- Recreate it from the saved legacy dump, seed m2-seed-legacy-saved-colleges.sql,
-- apply the M2 migration, and run scripts/seed-college-knowledge.mjs first.
begin;

do $$
declare
  active_release text;
  fn record;
  relation_name text;
begin
  select release_id into active_release from public.current_college_knowledge_release();
  if active_release is null then raise exception 'Current published release is missing'; end if;
  if (select count(*) from public.college_catalog where release_id=active_release)<>100 or
     (select count(*) from public.college_sources where release_id=active_release)<>29 or
     (select count(*) from public.college_source_bindings where release_id=active_release)<>144 or
     (select count(*) from public.college_facts where release_id=active_release)<>4464 or
     (select count(*) from public.college_passages where release_id=active_release)<>1252 then
    raise exception 'Current release counts differ from the compiled 100-college seed';
  end if;
  if (select count(*) from public.college_knowledge_releases where is_current and published_at is not null)<>1 then
    raise exception 'There is not exactly one published current release';
  end if;
  if (select count(*) from public.saved_colleges)<>3 or exists(
      select 1 from public.saved_colleges s left join public.college_catalog c using(unit_id) where c.unit_id is null) then
    raise exception 'Legacy saved-college records were not preserved';
  end if;
  if (select count(*) from public.college_passages where release_id=active_release and embedding is null)<>1252 then
    raise exception 'Unexpected provider embeddings in the public release';
  end if;
  if (select format_type(a.atttypid,a.atttypmod) from pg_attribute a
      where a.attrelid='public.college_passages'::regclass and a.attname='embedding')<>'vector(2048)' then
    raise exception 'Passage embeddings are not constrained to 2048 dimensions';
  end if;
  if exists(select 1 from pg_index i join pg_class idx on idx.oid=i.indexrelid
      join pg_am am on am.oid=idx.relam where i.indrelid='public.college_passages'::regclass
      and am.amname in ('hnsw','ivfflat')) then raise exception 'Exact-scan passage table unexpectedly has a vector index'; end if;
  if exists(select 1 from public.college_facts f where not exists(
      select 1 from public.college_source_bindings b where b.release_id=f.release_id
        and b.unit_id=f.unit_id and b.source_id=f.source_id)) or
     exists(select 1 from public.college_passages p where not exists(
      select 1 from public.college_source_bindings b where b.release_id=p.release_id
        and b.unit_id=p.unit_id and b.source_id=p.source_id)) then
    raise exception 'Fact or passage is not bound to its exact institution and source';
  end if;
  if exists(
    select 1 from public.college_facts f join public.college_sources s using(release_id,source_id)
    where not (f.evidence_url in (s.source_url,s.source_page,s.artifact_url) or
      f.evidence_url=any(s.source_urls) or
      s.source_metadata->'sourceHashes' @> jsonb_build_array(jsonb_build_object('sourceUrl',f.evidence_url)))
  ) or exists(
    select 1 from public.college_passages p join public.college_sources s using(release_id,source_id)
    where not (p.source_url in (s.source_url,s.source_page,s.artifact_url) or
      p.source_url=any(s.source_urls) or
      s.source_metadata->'sourceHashes' @> jsonb_build_array(jsonb_build_object('sourceUrl',p.source_url)))
  ) then raise exception 'Evidence URL is absent from the registered source record'; end if;

  foreach relation_name in array array[
    'college_knowledge_releases','college_catalog','college_sources',
    'college_source_bindings','college_facts','college_passages'
  ] loop
    if not (select relrowsecurity from pg_class where oid=format('public.%I',relation_name)::regclass) then
      raise exception 'RLS disabled on public.%',relation_name;
    end if;
    if not has_table_privilege('anon',format('public.%I',relation_name),'select') or
       not has_table_privilege('authenticated',format('public.%I',relation_name),'select') then
      raise exception 'Published reads are not granted for public.%',relation_name;
    end if;
    if has_table_privilege('anon',format('public.%I',relation_name),'insert,update,delete') or
       has_table_privilege('authenticated',format('public.%I',relation_name),'insert,update,delete') then
      raise exception 'Client role has write privileges on public.%',relation_name;
    end if;
    if not has_table_privilege('service_role',format('public.%I',relation_name),'select,insert,update,delete') then
      raise exception 'Service role lacks seed/write privileges for public.%',relation_name;
    end if;
  end loop;

  for fn in
    select p.oid::regprocedure as signature,p.prosecdef,
      coalesce(p.proacl,acldefault('f',p.proowner)) as acl
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in (
      'current_college_knowledge_release','hybrid_search_college_passages','filter_college_facts'
    )
  loop
    if fn.prosecdef then raise exception 'Public read RPC % is not SECURITY INVOKER',fn.signature; end if;
    if exists(select 1 from aclexplode(fn.acl) a where a.grantee=0 and a.privilege_type='EXECUTE') or
       not has_function_privilege('anon',fn.signature,'EXECUTE') or
       not has_function_privilege('authenticated',fn.signature,'EXECUTE') then
      raise exception 'Unexpected read RPC execute grants for %',fn.signature;
    end if;
  end loop;
end;
$$;

set local role anon;
do $$
declare
  active_release text;
  fact_value numeric;
  fact_unit bigint;
  rows_found integer;
  result record;
  relation_name text;
  query_vector extensions.vector;
  short_vector extensions.vector := '[1,0]'::extensions.vector;
  first_passage text;
  identity_passage text;
  release_sha text;
begin
  select release_id,dataset_sha256 into active_release,release_sha
    from public.current_college_knowledge_release();
  perform set_config('m2.active_release',active_release,true);
  if active_release is null or active_release <> 'sha256:'||release_sha then raise exception 'Release SHA is inconsistent'; end if;
  if (select count(*) from public.college_catalog)<>100 or (select count(*) from public.college_passages)<>1252 then
    raise exception 'Anon cannot read only the published 100-institution release';
  end if;
  select count(*) into rows_found from public.filter_college_facts('{}'::jsonb,null,100,0,null,null,null,null,active_release);
  if rows_found<>100 then raise exception 'Unfiltered fact RPC returned % catalog rows',rows_found; end if;

  select unit_id,value_numeric into fact_unit,fact_value from public.college_facts
    where release_id=active_release and metric_key='admitRate' and is_primary
      and status in ('reported','derived') and value_numeric is not null limit 1;
  select count(*) into rows_found from public.filter_college_facts(
    jsonb_build_object('admitRate',jsonb_build_object('min',fact_value,'max',fact_value)),
    null,100,0,array[fact_unit]::bigint[],null,null,null,active_release
  );
  if rows_found<>1 then raise exception 'Exact numeric filter did not return the known matching institution'; end if;

  select * into result from public.hybrid_search_college_passages(
    'California State University Bakersfield',null::extensions.vector,null,null,5,
    array[110486]::bigint[],active_release
  ) limit 1;
  if result.unit_id<>110486 or result.lexical_rank is null or result.source_url not like 'https://%' or
     result.publisher is null or result.source_field is null then raise exception 'Lexical search lost institution/source provenance'; end if;
  if result.source_id not in (select source_id from public.college_source_bindings
      where release_id=active_release and unit_id=110486) then raise exception 'Search passage source is not bound to returned UNITID'; end if;

  foreach relation_name in array array[
    'college_knowledge_releases','college_catalog','college_sources',
    'college_source_bindings','college_facts','college_passages'
  ] loop
    begin
      execute format('insert into public.%I default values',relation_name);
      raise exception 'Anon unexpectedly wrote public.%',relation_name;
    exception when insufficient_privilege then null; end;
  end loop;
  begin
    perform * from public.saved_colleges;
    raise exception 'Anon unexpectedly read saved colleges';
  exception when insufficient_privilege then null; end;

  query_vector := ('[1,'||array_to_string(array_fill('0'::text,array[2047]),',')||']')::extensions.vector;
  if extensions.vector_dims(query_vector)<>2048 then raise exception 'Synthetic query vector dimension is wrong'; end if;
  begin
    select * into result from public.hybrid_search_college_passages('',short_vector,'synthetic-model','synthetic-v1',2,
      array[110486]::bigint[],active_release) limit 1;
    raise exception 'Short query vector was accepted';
  exception when sqlstate '22023' then null; end;
  begin
    select * into result from public.hybrid_search_college_passages('',query_vector,'wrong-model','synthetic-v1',2,
      array[110486]::bigint[],active_release) limit 1;
    raise exception 'Mismatched model was accepted';
  exception when sqlstate '22023' then null; end;
  begin
    select * into result from public.hybrid_search_college_passages('',query_vector,'synthetic-model','wrong-version',2,
      array[110486]::bigint[],active_release) limit 1;
    raise exception 'Mismatched model version was accepted';
  exception when sqlstate '22023' then null; end;
end;
$$;
reset role;

-- Create synthetic embeddings only inside this rollback-only test. They establish SQL vector math, not provider quality.
do $$
declare
  active_release text;
  identity_id text;
  major_id text;
  bad_source text;
  vector_identity extensions.vector;
  vector_major extensions.vector;
  replacement_hash text;
begin
  select release_id into active_release from public.current_college_knowledge_release();
  select passage_id into identity_id from public.college_passages
    where release_id=active_release and unit_id=110486 and source_field like 'UNITID,%' limit 1;
  select passage_id into major_id from public.college_passages
    where release_id=active_release and unit_id=110486 and source_field like 'PCIP%' order by passage_id limit 1;
  if identity_id is null or major_id is null then raise exception 'Synthetic vector fixtures are missing'; end if;
  vector_identity := ('[1,'||array_to_string(array_fill('0'::text,array[2047]),',')||']')::extensions.vector;
  vector_major := ('[0,1,'||array_to_string(array_fill('0'::text,array[2046]),',')||']')::extensions.vector;
  update public.college_knowledge_releases set embedding_model='synthetic-model',embedding_version='synthetic-v1'
    where release_id=active_release;
  update public.college_passages set embedding=vector_identity,embedding_model='synthetic-model',
    embedding_version='synthetic-v1',embedding_content_sha256=content_sha256 where passage_id=identity_id;
  update public.college_passages set embedding=vector_major,embedding_model='synthetic-model',
    embedding_version='synthetic-v1',embedding_content_sha256=content_sha256 where passage_id=major_id;

  if extensions.vector_dims(vector_identity)<>2048 or vector_identity OPERATOR(extensions.<=>) vector_major <> 1 then
    raise exception 'Synthetic vector dimension or cosine-distance arithmetic is wrong';
  end if;
  begin
    update public.college_passages set embedding_content_sha256=repeat('0',64)
      where passage_id=identity_id and content_sha256<>repeat('0',64);
    if not found then raise exception 'Fixture could not exercise embedding hash constraint'; end if;
    raise exception 'Embedding content-hash mismatch was accepted';
  exception when check_violation then null; end;
  begin
    update public.college_passages set embedding_version=null where passage_id=major_id;
    raise exception 'Partial embedding metadata was accepted';
  exception when check_violation then null; end;
  begin
    update public.college_passages set embedding='[1,0]'::extensions.vector where passage_id=identity_id;
    raise exception 'Wrong stored vector dimensions were accepted';
  exception when data_exception then null; end;

  select source_id into bad_source from public.college_sources s
    where s.release_id=active_release and not exists(select 1 from public.college_source_bindings b
      where b.release_id=s.release_id and b.unit_id=110486 and b.source_id=s.source_id) limit 1;
  if bad_source is null then raise exception 'No unbound source fixture exists'; end if;
  begin
    update public.college_passages set source_id=bad_source where passage_id=identity_id;
    raise exception 'Passage crossed an institution/source binding';
  exception when foreign_key_violation then null; end;
end;
$$;

set local role anon;
do $$
declare
  active_release text;
  result record;
  n integer;
begin
  select release_id into active_release from public.current_college_knowledge_release();
  select * into result from public.hybrid_search_college_passages(
    '',('[1,'||array_to_string(array_fill('0'::text,array[2047]),',')||']')::extensions.vector,
    'synthetic-model','synthetic-v1',2,array[110486]::bigint[],active_release
  ) order by semantic_rank limit 1;
  if result.unit_id<>110486 or result.source_field not like 'UNITID,%' or result.semantic_rank<>1 or
     result.lexical_rank is not null then raise exception 'Synthetic semantic ranking/provenance failed'; end if;
  select count(*) into n from public.hybrid_search_college_passages(
    '',('[1,'||array_to_string(array_fill('0'::text,array[2047]),',')||']')::extensions.vector,
    'synthetic-model','synthetic-v1',2,array[110486]::bigint[],active_release
  );
  if n<>2 then raise exception 'Synthetic semantic scan returned % passages, expected 2',n; end if;
end;
$$;
reset role;

-- The old saves remain readable, new reviewed UNITIDs are saveable, and unknown/cross-user IDs fail.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","is_anonymous":false}',true);
do $$
begin
  if not public.account_session_active() or (select count(*) from public.saved_colleges)<>2 then
    raise exception 'First owner did not retain both original saves';
  end if;
  insert into public.saved_colleges(user_id,unit_id) values ('10000000-0000-4000-8000-000000000001',110486);
  if (select count(*) from public.saved_colleges)<>3 then raise exception 'New reviewed catalog ID cannot be saved'; end if;
  begin
    insert into public.saved_colleges(user_id,unit_id) values ('10000000-0000-4000-8000-000000000002',110538);
    raise exception 'Cross-user save was accepted';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.saved_colleges(user_id,unit_id) values ('10000000-0000-4000-8000-000000000001',999999);
    raise exception 'Unknown catalog ID was accepted';
  exception when foreign_key_violation then null; end;
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","is_anonymous":false}',true);
do $$
begin
  if not public.account_session_active() or (select count(*) from public.saved_colleges)<>1 then
    raise exception 'Second owner did not retain only its original save';
  end if;
  delete from public.saved_colleges where user_id='10000000-0000-4000-8000-000000000001' and unit_id=110486;
  if found then raise exception 'Cross-user saved college was deleted'; end if;
end;
$$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000099","is_anonymous":false}',true);
do $$
begin
  if public.account_session_active() or (select count(*) from public.saved_colleges)<>0 then
    raise exception 'Revoked session can still read saved colleges';
  end if;
  begin
    insert into public.saved_colleges(user_id,unit_id) values ('10000000-0000-4000-8000-000000000001',110538);
    raise exception 'Revoked session can insert a saved college';
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;

-- A release hidden as unpublished is unavailable through both tables and RPCs.
set local role supabase_admin;
update public.college_knowledge_releases set is_current=false,published_at=null where is_current;
reset role;
set local role anon;
do $$
declare old_release text:=current_setting('m2.active_release'); r record;
begin
  if exists(select 1 from public.current_college_knowledge_release()) or
     exists(select 1 from public.college_catalog) or exists(select 1 from public.college_facts) or
     exists(select 1 from public.college_passages) then raise exception 'Unpublished release leaked to anon'; end if;
  begin
    select * into r from public.filter_college_facts('{}'::jsonb,null,10,0,null,null,null,null,old_release);
    raise exception 'Unpublished facts RPC returned results';
  exception when sqlstate '22023' then null; end;
  begin
    select * into r from public.hybrid_search_college_passages('college',null::extensions.vector,null,null,3,null,old_release);
    raise exception 'Unpublished search RPC returned results';
  exception when sqlstate '22023' then null; end;
end;
$$;
reset role;

rollback;
select 'PASS: M2 grants, published reads, source binding, exact filters, synthetic vector guards/ranking, legacy RLS, and rollback checks' as result;
