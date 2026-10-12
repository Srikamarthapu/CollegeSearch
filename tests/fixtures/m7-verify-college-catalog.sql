-- Read-only M7 verification against the isolated collegesearch_m2_verify database.
-- Execute with psql as supabase_admin. Catalog assertions run as anon; the saved-college
-- ownership check runs as two synthetic authenticated accounts; everything rolls back.
begin;
select pg_catalog.set_config(
  'm7.saved_rows_before',
  (select count(*)::text from public.saved_colleges),
  true
);
set local role anon;

do $m7$
declare
  active_release text;
  n integer;
  first_page bigint[];
  second_page bigint[];
  final_page bigint[];
  empty_page bigint[];
  missing_applicants_unit bigint;
  public_negative_unit bigint := 119137; -- Moorpark College, NPT4_PUB = -2296 in the pinned release.
  private_for_profit_unit bigint;
  public_other_state_unit bigint;
  in_district_tuition_unit bigint;
  public_out_of_state_tuition_unit bigint;
  private_for_profit_tuition_unit bigint;
  private_nonprofit_tuition_unit bigint;
  two_year_unit bigint;
  four_year_unit bigint;
  facts_json jsonb;
  selected_fact jsonb;
  result_row record;
  page_offset integer;
begin
  select release.release_id into active_release from public.current_college_knowledge_release() as release;
  if active_release is distinct from 'sha256:29f7d5e5b891020771ce191ae16d4da8250487a51682ba9763f01cb6ccb64563' then
    raise exception 'Unexpected current M7 release: %', active_release;
  end if;
  if (select count(*) from public.current_college_knowledge_release()) <> 1 or
     (select count(*) from public.college_catalog) <> 3912 or
     (select count(*) from public.college_facts) <> 173029 or
     (select count(*) from public.college_passages) <> 9070 then
    raise exception 'Anon did not see exactly the published M7 release and evidence corpus';
  end if;

  if (select count(*) from public.college_catalog where ownership_code=1) <> 1666 or
     (select count(*) from public.college_catalog where ownership_code=2) <> 1486 or
     (select count(*) from public.college_catalog where ownership_code=3) <> 760 or
     (select count(*) from public.college_catalog where record_json->>'institutionLevel'='Four-year') <> 2486 or
     (select count(*) from public.college_catalog where record_json->>'institutionLevel'='Two-year') <> 1426 or
     (select count(*) from public.college_catalog where (record_json->>'mainCampus')::boolean) <> 3430 or
     (select count(*) from public.college_catalog where not (record_json->>'mainCampus')::boolean) <> 482 or
     (select count(*) from public.college_catalog where census_region='U.S. territories') <> 81 then
    raise exception 'Anon catalog source categories do not match the independently audited roster';
  end if;
  if (select count(*) from public.college_facts where metric_key='majorAvailable' and value_boolean is true) <> 47175 or
     (select count(*) from public.college_facts where metric_key='averageNetPrice' and value_numeric < 0) <> 9 then
    raise exception 'Broad-field or negative average-net-price fact counts changed';
  end if;

  -- Full result pages are bounded, sorted deterministically, and offset only once.
  select pg_catalog.array_agg(page.unit_id order by page.college_name, page.unit_id)
    into first_page
  from public.filter_college_facts('{}'::jsonb, null, 25, 0, null, null, null, null, active_release) as page;
  select pg_catalog.array_agg(page.unit_id order by page.college_name, page.unit_id)
    into second_page
  from public.filter_college_facts('{}'::jsonb, null, 25, 25, null, null, null, null, active_release) as page;
  select pg_catalog.array_agg(page.unit_id order by page.college_name, page.unit_id)
    into final_page
  from public.filter_college_facts('{}'::jsonb, null, 25, 3910, null, null, null, null, active_release) as page;
  select pg_catalog.array_agg(page.unit_id order by page.college_name, page.unit_id)
    into empty_page
  from public.filter_college_facts('{}'::jsonb, null, 25, 3912, null, null, null, null, active_release) as page;
  if cardinality(first_page) <> 25 or cardinality(second_page) <> 25 or
     first_page && second_page or cardinality(final_page) <> 2 or cardinality(empty_page) <> 0 then
    raise exception 'Catalog RPC page boundaries overlap or return the wrong row count';
  end if;
  begin
    perform * from public.filter_college_facts('{}'::jsonb, null, 25, 10001, null, null, null, null, active_release);
    raise exception 'Out-of-range catalog page offset was accepted';
  exception when sqlstate '22023' then null;
  end;

  -- Ownership, state, and the final newly mapped PCIP family filter from SQL.
  for page_offset in 0..700 by 100 loop
    select count(*) into n
    from public.filter_college_facts('{}'::jsonb, null, 100, page_offset, null, null,
      array[3]::smallint[], null, active_release) as page;
    if (page_offset < 700 and n <> 100) or (page_offset = 700 and n <> 60) then
      raise exception 'For-profit ownership paging returned % rows at offset %', n, page_offset;
    end if;
  end loop;
  select count(*) into n
  from public.filter_college_facts('{}'::jsonb, null, 100, 800, null, null,
    array[3]::smallint[], null, active_release) as page;
  if n <> 0 then raise exception 'For-profit ownership page exceeded its 760-row cohort'; end if;

  select count(*) into n
  from public.filter_college_facts('{}'::jsonb, null, 100, 0, null, array['PR']::text[], null, null, active_release) as page
  where page.state <> 'PR';
  if n <> 0 then raise exception 'State filter returned a different jurisdiction'; end if;
  select count(*) into n
  from public.filter_college_facts('{}'::jsonb, null, 100, 0, null, array['PR']::text[], null, null, active_release) as page;
  if n = 0 then raise exception 'State filter did not return Puerto Rico institutions'; end if;

  select count(*) into n
  from public.filter_college_facts('{}'::jsonb, null, 100, 0, null, null, null, array['25']::text[], active_release) as page
  where not exists (
    select 1 from pg_catalog.jsonb_array_elements(page.facts) as evidence(fact)
    where evidence.fact->>'factKey'='majorAvailable:25' and evidence.fact->'value'='true'::jsonb
  );
  if n <> 0 then raise exception 'Library Science filter returned a college without the verified availability fact'; end if;
  select count(*) into n
  from public.filter_college_facts('{}'::jsonb, null, 100, 0, null, null, null, array['25']::text[], active_release) as page;
  if n <> 45 then raise exception 'Expected 45 Library Science candidates, found %', n; end if;

  -- Missing numeric fields are not treated as zero or included in exact filters.
  select catalog.unit_id into missing_applicants_unit
  from public.college_catalog as catalog
  where not exists (
    select 1 from public.college_facts as fact
    where fact.release_id=catalog.release_id and fact.unit_id=catalog.unit_id
      and fact.metric_key='applicants' and fact.is_primary
      and fact.status in ('reported','derived') and fact.value_numeric is not null
  )
  order by catalog.name, catalog.unit_id limit 1;
  if missing_applicants_unit is null then raise exception 'No missing-applicants test row found'; end if;
  select count(*) into n
  from public.filter_college_facts('{"applicants":{"min":0}}'::jsonb, null, 10, 0,
    array[missing_applicants_unit]::bigint[], null, null, null, active_release);
  if n <> 0 then raise exception 'Missing applicants were treated as a numeric zero'; end if;

  -- Preserve and filter legitimate negative average net price with the correct public cohort.
  select page.facts into facts_json
  from public.filter_college_facts('{"averageNetPrice":{"max":-2000}}'::jsonb, 'CA', 1, 0,
    array[public_negative_unit]::bigint[], null, null, null, active_release) as page;
  select evidence.fact into selected_fact
  from pg_catalog.jsonb_array_elements(facts_json) as evidence(fact)
  where evidence.fact->>'factKey'='averageNetPrice';
  if selected_fact is null or selected_fact->>'sourceField'<>'NPT4_PUB' or
     (selected_fact->>'value')::numeric <> -2296 or selected_fact->>'status'<>'reported' or
     selected_fact->>'cohort' is null or selected_fact->>'periodLabel' is null then
    raise exception 'Negative public average net price or its source cohort was lost';
  end if;

  select catalog.unit_id into private_for_profit_unit
  from public.college_catalog as catalog join public.college_facts as fact
    using (release_id, unit_id)
  where catalog.ownership_code=3 and fact.metric_key='averageNetPrice' and fact.source_field='NPT4_PRIV'
    and fact.is_primary and fact.status in ('reported','derived') and fact.value_numeric>=0
  order by catalog.name, catalog.unit_id limit 1;
  select page.facts into facts_json
  from public.filter_college_facts('{"averageNetPrice":{"min":0}}'::jsonb, null, 1, 0,
    array[private_for_profit_unit]::bigint[], null, null, null, active_release) as page;
  if not exists (
    select 1 from pg_catalog.jsonb_array_elements(facts_json) as evidence(fact)
    where evidence.fact->>'factKey'='averageNetPrice' and evidence.fact->>'sourceField'='NPT4_PRIV'
  ) then raise exception 'Private for-profit net-price evidence was filtered incorrectly'; end if;

  select catalog.unit_id into public_other_state_unit
  from public.college_catalog as catalog join public.college_facts as fact using (release_id, unit_id)
  where catalog.ownership_code=1 and catalog.state<>'CA' and fact.metric_key='averageNetPrice'
    and fact.source_field='NPT4_PUB' and fact.is_primary and fact.value_numeric is not null
  order by catalog.name, catalog.unit_id limit 1;
  select count(*) into n from public.filter_college_facts(
    '{"averageNetPrice":{"max":200000}}'::jsonb, 'CA', 1, 0,
    array[public_other_state_unit]::bigint[], null, null, null, active_release);
  if n <> 0 then raise exception 'Out-of-state public average net price passed a resident-price filter'; end if;

  -- Federal in-district tuition must not pass as resident tuition; comparable out-of-state/public
  -- and private tuition (including private federal TUITIONFEE_OUT) remain filterable.
  select catalog.unit_id into in_district_tuition_unit
  from public.college_catalog as catalog join public.college_facts as fact using (release_id, unit_id)
  where catalog.ownership_code=1 and fact.metric_key='tuitionInState' and fact.is_primary
    and fact.comparability_key='tuition-fees.in-district' and fact.value_numeric is not null
  order by catalog.name, catalog.unit_id limit 1;
  select count(*) into n from public.filter_college_facts(
    '{"tuitionInState":{"min":0}}'::jsonb,
    (select state from public.college_catalog where unit_id=in_district_tuition_unit), 1, 0,
    array[in_district_tuition_unit]::bigint[], null, null, null, active_release);
  if n <> 0 then raise exception 'In-district federal tuition was treated as resident tuition'; end if;

  select catalog.unit_id into public_out_of_state_tuition_unit
  from public.college_catalog as catalog join public.college_facts as fact using (release_id, unit_id)
  where catalog.ownership_code=1 and catalog.state<>'CA' and fact.metric_key='tuitionOutOfState'
    and fact.source_field='TUITIONFEE_OUT' and fact.comparability_key='tuition-fees.out-of-state'
    and fact.is_primary and fact.status in ('reported','derived') and fact.value_numeric is not null
  order by catalog.name, catalog.unit_id limit 1;
  select count(*) into n from public.filter_college_facts(
    '{"tuitionOutOfState":{"min":0}}'::jsonb, 'CA', 1, 0,
    array[public_out_of_state_tuition_unit]::bigint[], null, null, null, active_release);
  if n <> 1 then raise exception 'Comparable public out-of-state tuition did not filter'; end if;

  select catalog.unit_id into private_for_profit_tuition_unit
  from public.college_catalog as catalog join public.college_facts as fact using (release_id, unit_id)
  where catalog.ownership_code=3 and fact.metric_key='tuitionOutOfState' and fact.is_primary
    and fact.status in ('reported','derived') and fact.value_numeric is not null
    and (fact.comparability_key='tuition-fees.private' or
      (fact.source_field='TUITIONFEE_OUT' and fact.comparability_key='tuition-fees.out-of-state'))
  order by catalog.name, catalog.unit_id limit 1;
  select page.facts into facts_json from public.filter_college_facts(
    '{"tuitionOutOfState":{"min":0}}'::jsonb, null, 1, 0,
    array[private_for_profit_tuition_unit]::bigint[], null, null, null, active_release) as page;
  if not exists (
    select 1 from pg_catalog.jsonb_array_elements(facts_json) as evidence(fact)
    where evidence.fact->>'factKey'='tuitionOutOfState'
  ) then raise exception 'Private for-profit published tuition was excluded'; end if;

  select catalog.unit_id into private_nonprofit_tuition_unit
  from public.college_catalog as catalog join public.college_facts as fact using (release_id, unit_id)
  where catalog.ownership_code=2 and fact.metric_key='tuitionOutOfState' and fact.is_primary
    and fact.status in ('reported','derived') and fact.value_numeric is not null
    and (fact.comparability_key='tuition-fees.private' or
      (fact.source_field='TUITIONFEE_OUT' and fact.comparability_key='tuition-fees.out-of-state'))
  order by catalog.name, catalog.unit_id limit 1;
  select count(*) into n from public.filter_college_facts(
    '{"tuitionOutOfState":{"min":0}}'::jsonb, null, 1, 0,
    array[private_nonprofit_tuition_unit]::bigint[], null, null, null, active_release);
  if n <> 1 then raise exception 'Private nonprofit published tuition was excluded'; end if;

  -- The returned structured facts carry the correct, distinct Scorecard graduation cohorts.
  select catalog.unit_id into two_year_unit
  from public.college_catalog as catalog join public.college_facts as fact using (release_id, unit_id)
  where catalog.record_json->>'institutionLevel'='Two-year' and fact.metric_key='graduationRate'
    and fact.source_field='C150_L4' and fact.is_primary and fact.status in ('reported','derived')
  order by catalog.name, catalog.unit_id limit 1;
  select page.facts into facts_json from public.filter_college_facts(
    '{}'::jsonb, null, 1, 0, array[two_year_unit]::bigint[], null, null, null, active_release) as page;
  select evidence.fact into selected_fact from pg_catalog.jsonb_array_elements(facts_json) as evidence(fact)
    where evidence.fact->>'factKey'='graduationRate';
  if selected_fact->>'sourceField'<>'C150_L4' or selected_fact->>'periodLabel'<>'Fall 2021 entering cohort' or
     selected_fact->>'reportingYear'<>'2024' or selected_fact->>'cohort' not like 'Fall 2021 or academic-year 2021-2022%' or
     selected_fact->>'definition' not ilike '%150%' then
    raise exception 'Two-year graduation fact returned incorrect source or cohort metadata: %', selected_fact;
  end if;

  select catalog.unit_id into four_year_unit
  from public.college_catalog as catalog join public.college_facts as fact using (release_id, unit_id)
  where catalog.record_json->>'institutionLevel'='Four-year' and fact.metric_key='graduationRate'
    and fact.source_field='C150_4' and fact.is_primary and fact.status in ('reported','derived')
  order by catalog.name, catalog.unit_id limit 1;
  select page.facts into facts_json from public.filter_college_facts(
    '{}'::jsonb, null, 1, 0, array[four_year_unit]::bigint[], null, null, null, active_release) as page;
  select evidence.fact into selected_fact from pg_catalog.jsonb_array_elements(facts_json) as evidence(fact)
    where evidence.fact->>'factKey'='graduationRate';
  if selected_fact->>'sourceField'<>'C150_4' or selected_fact->>'periodLabel'<>'Fall 2018 entering cohort' or
     selected_fact->>'reportingYear'<>'2024' or selected_fact->>'cohort' not like 'Fall 2018 or academic-year 2018-2019%' or
     selected_fact->>'definition' not ilike '%150%' then
    raise exception 'Four-year graduation fact returned incorrect source or cohort metadata: %', selected_fact;
  end if;
end;
$m7$;

-- A new federal catalog UNITID is saveable by its authenticated owner, remains
-- hidden from a second account, and is rolled back with the fixture.
reset role;
set local role authenticated;
select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","is_anonymous":false}',
  true
);
do $m7_saved_owner$
begin
  if not exists (
    select 1 from public.college_catalog
    where unit_id = 180203 and release_id = (select release_id from public.current_college_knowledge_release())
  ) then
    raise exception 'The newly added Aaniiih Nakoda College UNITID is absent from the current catalog';
  end if;
  if exists (select 1 from public.saved_colleges where unit_id = 180203) then
    raise exception 'The new UNITID unexpectedly exists in the synthetic saved-college baseline';
  end if;

  insert into public.saved_colleges(user_id, unit_id)
  values ('10000000-0000-4000-8000-000000000001', 180203);

  if not exists (select 1 from public.saved_colleges where unit_id = 180203) then
    raise exception 'Authenticated owner could not read back a newly added catalog UNITID';
  end if;
end;
$m7_saved_owner$;

select pg_catalog.set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","is_anonymous":false}',
  true
);
do $m7_saved_isolation$
begin
  if exists (select 1 from public.saved_colleges where unit_id = 180203) then
    raise exception 'A second authenticated account can see another user’s newly saved college';
  end if;
end;
$m7_saved_isolation$;

reset role;
do $m7_saved_count$
begin
  if (select count(*) from public.saved_colleges) <> current_setting('m7.saved_rows_before')::integer + 1 then
    raise exception 'The authenticated save did not add exactly one row during this rollback-only fixture';
  end if;
end;
$m7_saved_count$;

rollback;
