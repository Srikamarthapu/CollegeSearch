-- Broaden only public college evidence. Private account and saved-college policies are unchanged.

-- Source: June 2026 Scorecard; includes distinct branch UNITIDs, two-year colleges and U.S. territories.

alter table public.college_catalog drop constraint college_catalog_census_region_check;
alter table public.college_catalog add constraint college_catalog_census_region_check check (census_region in ('Northeast', 'Midwest', 'South', 'West', 'U.S. territories'));

alter table public.college_catalog drop constraint college_catalog_ownership_code_check;
alter table public.college_catalog add constraint college_catalog_ownership_code_check check (ownership_code in (1, 2, 3));

alter table public.college_catalog drop constraint college_catalog_ownership_label_check;
alter table public.college_catalog add constraint college_catalog_ownership_label_check check (ownership_label in ('Public', 'Private nonprofit', 'Private for-profit'));

alter table public.college_catalog drop constraint college_catalog_catalog_category_check;
alter table public.college_catalog add constraint college_catalog_catalog_category_check check (catalog_category in ('existing-curated', 'csu-campus', 'major-public', 'regional-public', 'private-nonprofit', 'federal-public', 'federal-nonprofit', 'federal-for-profit'));

alter table public.college_catalog drop constraint college_catalog_ownership_label_code;
alter table public.college_catalog add constraint college_catalog_ownership_label_code check ((ownership_code = 1 and ownership_label = 'Public') or (ownership_code = 2 and ownership_label = 'Private nonprofit') or (ownership_code = 3 and ownership_label = 'Private for-profit'));

alter table public.college_catalog_release_records drop constraint college_catalog_release_records_census_region_check;
alter table public.college_catalog_release_records add constraint college_catalog_release_records_census_region_check check (census_region in ('Northeast', 'Midwest', 'South', 'West', 'U.S. territories'));

alter table public.college_catalog_release_records drop constraint college_catalog_release_records_ownership_code_check;
alter table public.college_catalog_release_records add constraint college_catalog_release_records_ownership_code_check check (ownership_code in (1, 2, 3));

alter table public.college_catalog_release_records drop constraint college_catalog_release_records_ownership_label_check;
alter table public.college_catalog_release_records add constraint college_catalog_release_records_ownership_label_check check (ownership_label in ('Public', 'Private nonprofit', 'Private for-profit'));

alter table public.college_catalog_release_records drop constraint college_catalog_release_records_catalog_category_check;
alter table public.college_catalog_release_records add constraint college_catalog_release_records_catalog_category_check check (catalog_category in ('existing-curated', 'csu-campus', 'major-public', 'regional-public', 'private-nonprofit', 'federal-public', 'federal-nonprofit', 'federal-for-profit'));

alter table public.college_catalog_release_records drop constraint college_catalog_release_owner_label_code;
alter table public.college_catalog_release_records add constraint college_catalog_release_owner_label_code check ((ownership_code = 1 and ownership_label = 'Public') or (ownership_code = 2 and ownership_label = 'Private nonprofit') or (ownership_code = 3 and ownership_label = 'Private for-profit'));

-- Federal average net price can be negative when cohort grant aid exceeds attendance costs.

alter table public.college_facts drop constraint college_facts_value_shape;

alter table public.college_facts add constraint college_facts_value_shape check (
    (
      status in ('suppressed', 'unavailable') and value_numeric is null and
      value_boolean is null and value_text is null
    ) or (
      status in ('reported', 'derived', 'stale') and (
        (value_numeric is not null and value_boolean is null and value_text is null and
          ((unit = 'ratio' and value_numeric between 0 and 1) or
           (unit = 'usd' and (value_numeric >= 0 or metric_key = 'averageNetPrice')) or
           (unit = 'count' and value_numeric >= 0 and value_numeric = trunc(value_numeric)))) or
        (value_numeric is null and value_boolean is not null and value_text is null and unit = 'boolean') or
        (value_numeric is null and value_boolean is null and value_text is not null and unit = 'category')
      )
    )
  );

create or replace function public.filter_college_facts(
  p_filters jsonb default '{}'::jsonb,
  p_residency_state text default null,
  p_limit integer default 25,
  p_offset integer default 0,
  p_unit_ids bigint[] default null,
  p_states text[] default null,
  p_ownerships smallint[] default null,
  p_major_keys text[] default null,
  p_expected_release_id text default null
)
returns table (
  release_id text,
  unit_id bigint,
  college_slug text,
  college_name text,
  state text,
  census_region text,
  ownership_code smallint,
  catalog_category text,
  inclusion_reason text,
  record_json jsonb,
  facts jsonb
)
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  active_release_id text;
  filter_entry record;
  filter_min numeric;
  filter_max numeric;
  allowed_metrics constant text[] := array[
    'admitRate', 'applicants', 'admits', 'enrollees', 'yieldRate',
    'undergraduateEnrollment', 'averageNetPrice', 'graduationRate',
    'medianEarnings', 'tuitionInState', 'tuitionOutOfState'
  ];
begin
  if p_expected_release_id is null then
    raise exception 'expected knowledge release is required' using errcode = '22023';
  end if;
  select release.release_id into active_release_id
  from public.college_knowledge_releases as release
  where release.is_current and release.published_at is not null
  limit 1;
  if active_release_id is null or active_release_id <> p_expected_release_id then
    raise exception 'knowledge release does not match the requested snapshot' using errcode = '22023';
  end if;
  if p_filters is null or pg_catalog.jsonb_typeof(p_filters) <> 'object' then
    raise exception 'numeric filters must be a bounded JSON object' using errcode = '22023';
  end if;
  if (select count(*) from pg_catalog.jsonb_object_keys(p_filters)) > cardinality(allowed_metrics) then
    raise exception 'numeric filter contains too many metrics' using errcode = '22023';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 or p_offset > 10000 then
    raise exception 'limit or offset is outside the allowed range' using errcode = '22023';
  end if;
  if p_residency_state is not null and p_residency_state !~ '^[A-Z]{2}$' then
    raise exception 'residency state must be a two-letter state code' using errcode = '22023';
  end if;
  if (p_unit_ids is not null and cardinality(p_unit_ids) > 100) or
     (p_states is not null and cardinality(p_states) > 56) or
     (p_ownerships is not null and cardinality(p_ownerships) > 3) or
     (p_major_keys is not null and cardinality(p_major_keys) > 20) then
    raise exception 'candidate filters exceed their bounds' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_ownerships, '{}'::smallint[])) as x(value) where x.value not in (1, 2, 3)) or
     exists (select 1 from unnest(coalesce(p_states, '{}'::text[])) as x(value) where x.value !~ '^[A-Z]{2}$') or
     exists (select 1 from unnest(coalesce(p_major_keys, '{}'::text[])) as x(value) where x.value !~ '^[0-9]{2}$') then
    raise exception 'candidate filter contains an invalid ownership, state, or CIP key' using errcode = '22023';
  end if;

  for filter_entry in select key, value from pg_catalog.jsonb_each(p_filters) loop
    if not (filter_entry.key = any (allowed_metrics)) or
       pg_catalog.jsonb_typeof(filter_entry.value) <> 'object' or
       not (filter_entry.value ? 'min' or filter_entry.value ? 'max') or
       (filter_entry.value - 'min' - 'max') <> '{}'::jsonb or
       (filter_entry.value ? 'min' and pg_catalog.jsonb_typeof(filter_entry.value -> 'min') <> 'number') or
       (filter_entry.value ? 'max' and pg_catalog.jsonb_typeof(filter_entry.value -> 'max') <> 'number') then
      raise exception 'invalid numeric bound for metric %', filter_entry.key using errcode = '22023';
    end if;
    filter_min := case when filter_entry.value ? 'min' then (filter_entry.value ->> 'min')::numeric else null end;
    filter_max := case when filter_entry.value ? 'max' then (filter_entry.value ->> 'max')::numeric else null end;
    if filter_min is not null and filter_max is not null and filter_min > filter_max then
      raise exception 'minimum exceeds maximum for metric %', filter_entry.key using errcode = '22023';
    end if;
  end loop;

  return query
  with catalog_candidates as materialized (
    select catalog.*
    from public.college_catalog as catalog
    where catalog.release_id = active_release_id
      and (p_unit_ids is null or catalog.unit_id = any (p_unit_ids))
      and (p_states is null or catalog.state = any (p_states))
      and (p_ownerships is null or catalog.ownership_code = any (p_ownerships))
      and (
        p_major_keys is null or exists (
          select 1 from public.college_facts as major
          where major.release_id = active_release_id and major.unit_id = catalog.unit_id
            and major.metric_key = 'majorAvailable'
            and major.dimension_key = any (p_major_keys)
            and major.value_boolean is true and major.is_primary
            and major.status in ('reported', 'derived')
        )
      )
      and not exists (
        select 1 from pg_catalog.jsonb_each(p_filters) as requested(metric_key, bounds)
        where not exists (
          select 1 from public.college_facts as fact
          where fact.release_id = active_release_id and fact.unit_id = catalog.unit_id
            and fact.metric_key = requested.metric_key and fact.is_primary
            and fact.status in ('reported', 'derived') and fact.value_numeric is not null
            and (not (requested.bounds ? 'min') or fact.value_numeric >= (requested.bounds ->> 'min')::numeric)
            and (not (requested.bounds ? 'max') or fact.value_numeric <= (requested.bounds ->> 'max')::numeric)
            and (
              requested.metric_key <> 'averageNetPrice' or
              (catalog.ownership_code = 1 and p_residency_state = catalog.state and fact.source_field = 'NPT4_PUB') or
              (catalog.ownership_code in (2, 3) and fact.source_field = 'NPT4_PRIV')
            )
            and (
              requested.metric_key <> 'tuitionInState' or
              (catalog.ownership_code = 1 and p_residency_state = catalog.state
                and fact.comparability_key = 'tuition-fees.in-state')
            )
            and (
              requested.metric_key <> 'tuitionOutOfState' or
              (catalog.ownership_code = 1 and p_residency_state is not null
                and p_residency_state <> catalog.state
                and fact.comparability_key = 'tuition-fees.out-of-state') or
              (catalog.ownership_code in (2, 3) and (
                fact.comparability_key = 'tuition-fees.private' or
                (fact.source_field = 'TUITIONFEE_OUT' and fact.comparability_key = 'tuition-fees.out-of-state')
              ))
            )
        )
      )
    -- Bound before assembling complete evidence, including requests with no
    -- explicit UNITIDs. Apply pagination exactly once.
    order by catalog.name, catalog.unit_id
    limit p_limit offset p_offset
  ), evidence_json as (
    select fact.unit_id,
      pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'factId', fact.fact_id,
        'factKey', fact.fact_key,
        'metricKey', fact.metric_key,
        'dimensionKey', fact.dimension_key,
        'isPrimary', fact.is_primary,
        'value', coalesce(to_jsonb(fact.value_numeric), to_jsonb(fact.value_boolean), to_jsonb(fact.value_text)),
        'unit', fact.unit,
        'reportingYear', fact.reporting_year,
        'periodLabel', fact.period_label,
        'cohort', fact.cohort,
        'definition', fact.definition,
        'status', fact.status,
        'finality', fact.finality,
        'accessedOn', fact.accessed_on,
        'comparabilityKey', fact.comparability_key,
        'sourceId', fact.source_id,
        'publisher', source.publisher,
        'sourceName', source.source_name,
        'sourceUrl', fact.evidence_url,
        'sourceField', fact.source_field
      ) order by fact.metric_key, fact.dimension_key nulls first, fact.fact_id) as facts
    from public.college_facts as fact
    join public.college_sources as source
      on source.release_id = fact.release_id and source.source_id = fact.source_id
    join catalog_candidates as candidate on candidate.unit_id = fact.unit_id
    where fact.release_id = active_release_id and fact.is_primary
      and fact.status in ('reported', 'derived')
    group by fact.unit_id
  )
  select active_release_id, candidate.unit_id, candidate.slug, candidate.name,
    candidate.state, candidate.census_region, candidate.ownership_code,
    candidate.catalog_category, candidate.inclusion_reason, candidate.record_json,
    coalesce(evidence_json.facts, '[]'::jsonb)
  from catalog_candidates as candidate
  left join evidence_json using (unit_id)
  order by candidate.name, candidate.unit_id;
end;
$$;
