-- Rollback-only release staging/publication rehearsal for the isolated M2 verify DB.
-- Requires M2 plus 20261004101430_m2_knowledge_release_staging.sql and a seeded current release.
begin;

select set_config('m2.original_release', release_id, true)
from public.current_college_knowledge_release();
select set_config('m2.stage_unit', unit_id::text, true)
from public.college_catalog
where release_id = current_setting('m2.original_release')
order by unit_id
limit 1;

do $$
declare
  publish_fn regprocedure := 'public.publish_college_knowledge_release(text,text,integer,integer,integer,integer,integer)'::regprocedure;
  fn_security_definer boolean;
  has_public_execute boolean;
begin
  select procedure.prosecdef,
    exists (
      select 1 from pg_catalog.aclexplode(coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) as acl
      where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    )
  into fn_security_definer, has_public_execute
  from pg_catalog.pg_proc as procedure
  where procedure.oid = publish_fn;
  if fn_security_definer or has_public_execute or
     has_function_privilege('anon', publish_fn, 'EXECUTE') or
     has_function_privilege('authenticated', publish_fn, 'EXECUTE') or
     not has_function_privilege('service_role', publish_fn, 'EXECUTE') then
    raise exception 'Publish RPC security or role grants are incorrect';
  end if;
  if not (select relrowsecurity from pg_catalog.pg_class where oid='public.college_catalog_release_records'::regclass) or
     not has_table_privilege('anon', 'public.college_catalog_release_records', 'select') or
     has_table_privilege('anon', 'public.college_catalog_release_records', 'insert,update,delete') or
     not has_table_privilege('service_role', 'public.college_catalog_release_records', 'select,insert,update,delete') then
    raise exception 'Catalog release snapshot table grants or RLS are incorrect';
  end if;
end;
$$;

-- Build a second, unpublished release from the current snapshot. Change one city consistently
-- in both the staged columns and record_json so publication can be observed after the switch.
do $$
declare
  old_release text := current_setting('m2.original_release');
  staged_release text := 'sha256:' || repeat('e', 64);
  staged_sha text := repeat('e', 64);
  target_unit bigint := current_setting('m2.stage_unit')::bigint;
begin
  insert into public.college_knowledge_releases (
    release_id, dataset_sha256, cohort_name, institution_count, source_accessed_on,
    federal_release_date, embedding_model, embedding_version, embedding_dimensions,
    release_metadata, is_current
  )
  select staged_release, staged_sha, release.cohort_name, release.institution_count,
    release.source_accessed_on, release.federal_release_date, release.embedding_model,
    release.embedding_version, release.embedding_dimensions,
    release.release_metadata || pg_catalog.jsonb_build_object('verificationFixture', true), false
  from public.college_knowledge_releases as release
  where release.release_id = old_release;

  insert into public.college_catalog_release_records (
    release_id, unit_id, slug, name, city, state, census_region, ownership_code,
    ownership_label, catalog_category, inclusion_reason, aliases, website, record_json
  )
  select staged_release, catalog.unit_id, catalog.slug, catalog.name,
    case when catalog.unit_id = target_unit then 'M2 Staging Fixture City' else catalog.city end,
    catalog.state, catalog.census_region, catalog.ownership_code, catalog.ownership_label,
    catalog.catalog_category, catalog.inclusion_reason, catalog.aliases, catalog.website,
    case when catalog.unit_id = target_unit then
      pg_catalog.jsonb_set(catalog.record_json, '{city}', pg_catalog.to_jsonb('M2 Staging Fixture City'::text), true)
    else catalog.record_json end
  from public.college_catalog as catalog
  where catalog.release_id = old_release;

  insert into public.college_sources (
    release_id, source_id, publisher, source_name, source_url, source_page, artifact_url,
    artifact_sha256, source_urls, reporting_year, cohort, finality, accessed_on, source_metadata
  )
  select staged_release, source.source_id, source.publisher, source.source_name, source.source_url,
    source.source_page, source.artifact_url, source.artifact_sha256, source.source_urls,
    source.reporting_year, source.cohort, source.finality, source.accessed_on, source.source_metadata
  from public.college_sources as source
  where source.release_id = old_release;

  insert into public.college_source_bindings (release_id, unit_id, source_id)
  select staged_release, binding.unit_id, binding.source_id
  from public.college_source_bindings as binding
  where binding.release_id = old_release;

  insert into public.college_facts (
    fact_id, release_id, unit_id, source_id, evidence_url, source_field, fact_key, metric_key,
    dimension_key, is_primary, value_numeric, value_boolean, value_text, unit, reporting_year,
    period_label, cohort, definition, status, finality, accessed_on, comparability_key
  )
  select pg_catalog.md5(staged_release || fact.fact_id) || pg_catalog.md5(fact.fact_id || staged_release),
    staged_release, fact.unit_id, fact.source_id, fact.evidence_url, fact.source_field, fact.fact_key,
    fact.metric_key, fact.dimension_key, fact.is_primary, fact.value_numeric, fact.value_boolean,
    fact.value_text, fact.unit, fact.reporting_year, fact.period_label, fact.cohort, fact.definition,
    fact.status, fact.finality, fact.accessed_on, fact.comparability_key
  from public.college_facts as fact
  where fact.release_id = old_release;

  insert into public.college_passages (
    passage_id, release_id, unit_id, source_id, source_url, source_field, field_locator,
    reporting_year, period_label, cohort, definition, title, content, content_sha256,
    embedding, embedding_model, embedding_version, embedding_content_sha256
  )
  select pg_catalog.md5(staged_release || passage.passage_id) || pg_catalog.md5(passage.passage_id || staged_release),
    staged_release, passage.unit_id, passage.source_id, passage.source_url, passage.source_field,
    passage.field_locator, passage.reporting_year, passage.period_label, passage.cohort,
    passage.definition, passage.title, passage.content, passage.content_sha256, passage.embedding,
    passage.embedding_model, passage.embedding_version, passage.embedding_content_sha256
  from public.college_passages as passage
  where passage.release_id = old_release;
end;
$$;

-- Anonymous clients can read only the old current snapshot and cannot publish the staged one.
set local role anon;
do $$
declare
  old_release text := current_setting('m2.original_release');
  staged_release text := 'sha256:' || repeat('e', 64);
begin
  if (select release_id from public.current_college_knowledge_release()) <> old_release or
     (select count(*) from public.college_catalog_release_records where release_id = old_release) <> 100 or
     (select count(*) from public.college_catalog_release_records where release_id = staged_release) <> 0 or
     (select count(*) from public.college_sources where release_id = staged_release) <> 0 or
     (select count(*) from public.college_passages where release_id = staged_release) <> 0 then
    raise exception 'Unpublished staging rows leaked or replaced the current release';
  end if;
  begin
    perform * from public.publish_college_knowledge_release(staged_release, repeat('e', 64), 100, 29, 144, 4464, 1252);
    raise exception 'Anonymous caller unexpectedly published a knowledge release';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

-- A failed count check and an inconsistent record must leave the original release current.
set local role service_role;
do $$
declare
  staged_release text := 'sha256:' || repeat('e', 64);
  did_reject boolean;
  actual_institutions integer;
  actual_sources integer;
  actual_bindings integer;
  actual_facts integer;
  actual_passages integer;
begin
  select count(*) into actual_institutions from public.college_catalog_release_records where release_id = staged_release;
  select count(*) into actual_sources from public.college_sources where release_id = staged_release;
  select count(*) into actual_bindings from public.college_source_bindings where release_id = staged_release;
  select count(*) into actual_facts from public.college_facts where release_id = staged_release;
  select count(*) into actual_passages from public.college_passages where release_id = staged_release;

  did_reject := false;
  begin
    perform * from public.publish_college_knowledge_release(
      staged_release, repeat('e', 64), actual_institutions, actual_sources - 1,
      actual_bindings, actual_facts, actual_passages
    );
  exception when sqlstate '22023' then did_reject := true;
  end;
  if not did_reject or (select release_id from public.current_college_knowledge_release()) <> current_setting('m2.original_release') then
    raise exception 'Publish RPC accepted a count mismatch or changed current release';
  end if;

  update public.college_catalog_release_records
  set record_json = pg_catalog.jsonb_set(record_json, '{name}', pg_catalog.to_jsonb('Inconsistent Fixture Name'::text), true)
  where release_id = staged_release and unit_id = current_setting('m2.stage_unit')::bigint;
  did_reject := false;
  begin
    perform * from public.publish_college_knowledge_release(
      staged_release, repeat('e', 64), actual_institutions, actual_sources,
      actual_bindings, actual_facts, actual_passages
    );
  exception when sqlstate '22023' then did_reject := true;
  end;
  if not did_reject or (select release_id from public.current_college_knowledge_release()) <> current_setting('m2.original_release') then
    raise exception 'Publish RPC accepted an inconsistent staged identity or changed current release';
  end if;
end;
$$;

-- Repair the deliberate corruption and publish the complete staged snapshot once.
do $$
declare
  staged_release text := 'sha256:' || repeat('e', 64);
  actual_institutions integer;
  actual_sources integer;
  actual_bindings integer;
  actual_facts integer;
  actual_passages integer;
  published record;
begin
  update public.college_catalog_release_records
  set record_json = pg_catalog.jsonb_set(record_json, '{name}', pg_catalog.to_jsonb(name), true)
  where release_id = staged_release and unit_id = current_setting('m2.stage_unit')::bigint;
  select count(*) into actual_institutions from public.college_catalog_release_records where release_id = staged_release;
  select count(*) into actual_sources from public.college_sources where release_id = staged_release;
  select count(*) into actual_bindings from public.college_source_bindings where release_id = staged_release;
  select count(*) into actual_facts from public.college_facts where release_id = staged_release;
  select count(*) into actual_passages from public.college_passages where release_id = staged_release;
  select * into published from public.publish_college_knowledge_release(
    staged_release, repeat('e', 64), actual_institutions, actual_sources,
    actual_bindings, actual_facts, actual_passages
  );
  if published.release_id <> staged_release or published.institution_count <> 100 or published.dataset_sha256 <> repeat('e', 64) then
    raise exception 'Publish RPC did not return the staged release metadata';
  end if;
end;
$$;
reset role;

-- The switch exposes only the complete new snapshot and preserves saved-college foreign keys.
set local role anon;
do $$
declare
  old_release text := current_setting('m2.original_release');
  staged_release text := 'sha256:' || repeat('e', 64);
  target_unit bigint := current_setting('m2.stage_unit')::bigint;
  result_count integer;
  result_row record;
begin
  if (select release_id from public.current_college_knowledge_release()) <> staged_release or
     (select count(*) from public.college_catalog_release_records) <> 100 or
     (select count(*) from public.college_catalog_release_records where release_id = old_release) <> 0 or
     (select count(*) from public.college_catalog) <> 100 or
     (select count(*) from public.college_sources) <> 29 or
     (select count(*) from public.college_source_bindings) <> 144 or
     (select count(*) from public.college_facts) <> 4464 or
     (select count(*) from public.college_passages) <> 1252 or
     (select city from public.college_catalog where unit_id = target_unit) <> 'M2 Staging Fixture City' then
    raise exception 'Published release is incomplete, mixed, or did not update the catalog snapshot';
  end if;
  select count(*) into result_count from public.filter_college_facts('{}'::jsonb, null, 100, 0, null, null, null, null, staged_release);
  if result_count <> 100 then raise exception 'Fact RPC did not return the newly published catalog'; end if;

  begin
    perform * from public.filter_college_facts('{}'::jsonb, null, 1, 0, null, null, null, null, old_release);
    raise exception 'Fact RPC accepted a stale release ID';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform * from public.hybrid_search_college_passages('', null::extensions.vector, null, null, 1, null, old_release);
    raise exception 'Hybrid RPC accepted a stale release ID';
  exception when sqlstate '22023' then null;
  end;
  select * into result_row from public.hybrid_search_college_passages(
    'university', null::extensions.vector, null, null, 5, array[target_unit]::bigint[], staged_release
  ) limit 1;
  if result_row.release_id <> staged_release or result_row.unit_id <> target_unit or result_row.source_url not like 'https://%' then
    raise exception 'Hybrid RPC did not return the new snapshot with source provenance';
  end if;
end;
$$;
reset role;

do $$
begin
  if (select count(*) from public.saved_colleges) <> 3 or exists (
    select 1 from public.saved_colleges as saved
    left join public.college_catalog as catalog using (unit_id)
    where catalog.unit_id is null
  ) then
    raise exception 'Release publication changed or orphaned legacy saved colleges';
  end if;
end;
$$;

select 'PASS: unpublished release stayed hidden; invalid release stayed unpublished; complete publication switched snapshots atomically; stale RPC reads rejected; saved rows preserved';

rollback;
