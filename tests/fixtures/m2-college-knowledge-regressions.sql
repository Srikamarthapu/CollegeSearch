-- Run with psql after the M2 migration and transactional seed on the isolated verification DB.
-- These assertions exercise the published RPCs and the original saved rows without mutating users.
do $$
declare
  active_release text;
  matches integer;
  evidence jsonb;
  wrong_source text;
begin
  select release.release_id into active_release
  from public.current_college_knowledge_release() as release;
  if active_release is null then
    raise exception 'current knowledge release is missing';
  end if;

  if (select count(*) from public.saved_colleges) <> 3 then
    raise exception 'M2 changed the three pre-existing saved-college fixture rows';
  end if;
  if exists (
    select 1 from public.saved_colleges as saved
    left join public.college_catalog as catalog using (unit_id)
    where catalog.unit_id is null
  ) then
    raise exception 'a saved UNITID no longer resolves to a catalog identity';
  end if;
  if (select count(*) from public.college_catalog where release_id = active_release) <> 100 then
    raise exception 'active catalog count is not 100';
  end if;
  if (select count(*) from public.college_passages where release_id = active_release) <> 1252 then
    raise exception 'active passage count is not 1252';
  end if;

  select result.facts into evidence
  from public.filter_college_facts(
    p_filters => '{"tuitionOutOfState":{"min":0}}'::jsonb,
    p_residency_state => 'CA',
    p_limit => 100,
    p_unit_ids => array[223232]::bigint[],
    p_expected_release_id => active_release
  ) as result
  where result.unit_id = 223232;
  if evidence is null or not exists (
    select 1 from pg_catalog.jsonb_array_elements(evidence) as item(value)
    where item.value ->> 'metricKey' = 'tuitionOutOfState'
      and item.value ->> 'sourceField' = 'TUITIONFEE_OUT'
      and item.value ->> 'comparabilityKey' = 'tuition-fees.out-of-state'
  ) then
    raise exception 'private federal TUITIONFEE_OUT evidence was filtered out';
  end if;

  select count(*) into matches
  from public.filter_college_facts(
    p_filters => '{"averageNetPrice":{"min":0}}'::jsonb,
    p_residency_state => 'CA',
    p_limit => 100,
    p_unit_ids => array[104151]::bigint[],
    p_expected_release_id => active_release
  );
  if matches <> 0 then
    raise exception 'out-of-state public NPT4_PUB evidence was treated as resident net price';
  end if;

  select count(*) into matches
  from public.filter_college_facts(
    p_filters => '{"tuitionInState":{"min":0}}'::jsonb,
    p_residency_state => 'NC',
    p_limit => 100,
    p_unit_ids => array[197869]::bigint[],
    p_expected_release_id => active_release
  );
  if matches <> 0 then
    raise exception 'public federal in-district TUITIONFEE_IN was treated as resident tuition';
  end if;

  select count(*) into matches
  from public.filter_college_facts(
    p_filters => '{"tuitionInState":{"min":0}}'::jsonb,
    p_residency_state => 'AZ',
    p_limit => 100,
    p_unit_ids => array[104151]::bigint[],
    p_expected_release_id => active_release
  );
  if matches <> 1 then
    raise exception 'reviewed Arizona resident tuition evidence was not eligible';
  end if;

  select count(*) into matches
  from public.filter_college_facts(
    p_filters => '{}'::jsonb,
    p_residency_state => null,
    p_limit => 100,
    p_unit_ids => array[104151]::bigint[],
    p_major_keys => array['11']::text[],
    p_expected_release_id => active_release
  );
  if matches <> 1 then
    raise exception 'broad bachelor field candidate filter failed';
  end if;

  select result.source_id into wrong_source
  from public.college_sources as result
  where result.release_id = active_release
    and result.source_id = 'caltech-financial-aid-costs-2026-27';
  if wrong_source is null then
    raise exception 'fixture source for cross-institution FK test is missing';
  end if;
  begin
    insert into public.college_facts (
      fact_id, release_id, unit_id, source_id, evidence_url, source_field, fact_key,
      metric_key, is_primary, value_numeric, unit, reporting_year, period_label,
      cohort, definition, status, finality, accessed_on, comparability_key
    ) values (
      pg_catalog.repeat('f', 64), active_release, 121345, wrong_source,
      'https://www.finaid.caltech.edu/Costs', 'fixture', 'fixture-cross-institution',
      'fixture', true, 1, 'count', 2026, 'fixture', 'fixture', 'fixture',
      'reported', 'snapshot', date '2026-10-04', 'fixture'
    );
    raise exception 'cross-institution source fact unexpectedly inserted';
  exception
    when foreign_key_violation then
      null;
  end;
end;
$$;

set local role anon;
do $$
begin
  if (select count(*) from public.college_catalog) <> 100 then
    raise exception 'anon role cannot read the published catalog';
  end if;
  if (select count(*) from public.college_passages) <> 1252 then
    raise exception 'anon role cannot read published passages';
  end if;
end;
$$;
reset role;

