-- Keep a complete catalog snapshot for every unpublished knowledge release.
-- Public rows remain on the previously published snapshot until the final RPC.

create table public.college_catalog_release_records (
  release_id text not null references public.college_knowledge_releases (release_id)
    on delete cascade,
  unit_id bigint not null references public.college_catalog (unit_id)
    on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  city text not null,
  state text not null check (state ~ '^[A-Z]{2}$'),
  census_region text not null
    check (census_region in ('Northeast', 'Midwest', 'South', 'West')),
  ownership_code smallint not null check (ownership_code in (1, 2)),
  ownership_label text not null check (ownership_label in ('Public', 'Private nonprofit')),
  catalog_category text not null check (catalog_category in (
    'existing-curated', 'csu-campus', 'major-public', 'regional-public', 'private-nonprofit'
  )),
  inclusion_reason text not null check (length(btrim(inclusion_reason)) > 0),
  aliases text[] not null default '{}',
  website text not null,
  record_json jsonb not null,
  primary key (release_id, unit_id),
  unique (release_id, slug),
  constraint college_catalog_release_owner_label_code check (
    (ownership_code = 1 and ownership_label = 'Public') or
    (ownership_code = 2 and ownership_label = 'Private nonprofit')
  )
);

alter table public.college_catalog_release_records enable row level security;

create policy college_catalog_release_records_read_current
  on public.college_catalog_release_records for select to anon, authenticated
  using (
    exists (
      select 1 from public.college_knowledge_releases as release
      where release.release_id = college_catalog_release_records.release_id
        and release.is_current and release.published_at is not null
    )
  );

revoke all privileges on table public.college_catalog_release_records
  from public, anon, authenticated, service_role;
grant select on table public.college_catalog_release_records to anon, authenticated;
grant select, insert, update, delete on table public.college_catalog_release_records to service_role;

-- Service-role callers stage data using the REST table API, verify staged records,
-- and invoke this function once to publish the complete release atomically.
create function public.publish_college_knowledge_release(
  p_release_id text,
  p_dataset_sha256 text,
  p_expected_institution_count integer,
  p_expected_source_count integer,
  p_expected_binding_count integer,
  p_expected_fact_count integer,
  p_expected_passage_count integer
)
returns table (
  release_id text,
  institution_count integer,
  published_at timestamptz,
  dataset_sha256 text
)
language plpgsql security invoker
set search_path = ''
as $$
declare
  release_row public.college_knowledge_releases%rowtype;
  actual_count bigint;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('college-search-knowledge-seed'));
  if p_release_id is null or p_release_id !~ '^sha256:[a-f0-9]{64}$' or
     p_dataset_sha256 is null or p_dataset_sha256 !~ '^[a-f0-9]{64}$' or
     p_release_id <> ('sha256:' || p_dataset_sha256) then
    raise exception 'release ID and dataset SHA-256 must match' using errcode = '22023';
  end if;
  if p_expected_institution_count is null or p_expected_institution_count < 100 or
     p_expected_source_count is null or p_expected_source_count < 1 or
     p_expected_binding_count is null or p_expected_binding_count < p_expected_institution_count or
     p_expected_fact_count is null or p_expected_fact_count < 1 or
     p_expected_passage_count is null or p_expected_passage_count < p_expected_institution_count then
    raise exception 'expected release counts are outside the supported bounds' using errcode = '22023';
  end if;

  select release.* into release_row
  from public.college_knowledge_releases as release
  where release.release_id = p_release_id
  for update;
  if not found or release_row.dataset_sha256 <> p_dataset_sha256 or
     release_row.institution_count <> p_expected_institution_count then
    raise exception 'staged release metadata does not match the requested release' using errcode = '22023';
  end if;

  select count(*) into actual_count
  from public.college_catalog_release_records as entry
  where entry.release_id = p_release_id;
  if actual_count <> p_expected_institution_count then
    raise exception 'catalog snapshot count mismatch: expected %, found %',
      p_expected_institution_count, actual_count using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.college_catalog_release_records as entry
    left join public.college_catalog as base_row using (unit_id)
    where entry.release_id = p_release_id
      and (
        base_row.unit_id is null or base_row.slug <> entry.slug or
        entry.record_json ->> 'unitId' is distinct from entry.unit_id::text or
        entry.record_json ->> 'slug' is distinct from entry.slug or
        entry.record_json ->> 'name' is distinct from entry.name or
        entry.record_json ->> 'city' is distinct from entry.city or
        entry.record_json ->> 'state' is distinct from entry.state or
        entry.record_json ->> 'region' is distinct from entry.census_region or
        entry.record_json ->> 'ownership' is distinct from entry.ownership_label or
        entry.record_json ->> 'catalogCategory' is distinct from entry.catalog_category or
        entry.record_json ->> 'inclusionReason' is distinct from entry.inclusion_reason or
        entry.record_json ->> 'website' is distinct from entry.website or
        entry.record_json -> 'aliases' is distinct from pg_catalog.to_jsonb(entry.aliases)
      )
  ) then
    raise exception 'catalog snapshot contains a missing identity, changed slug, or inconsistent full record'
      using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.college_catalog as base_row
    where not exists (
      select 1 from public.college_catalog_release_records as entry
      where entry.release_id = p_release_id and entry.unit_id = base_row.unit_id
    )
  ) then
    raise exception 'catalog snapshot omits a stable catalog identity'
      using errcode = '22023';
  end if;

  select count(*) into actual_count
  from public.college_sources as source
  where source.release_id = p_release_id;
  if actual_count <> p_expected_source_count then
    raise exception 'source count mismatch: expected %, found %',
      p_expected_source_count, actual_count using errcode = '22023';
  end if;
  select count(*) into actual_count
  from public.college_source_bindings as binding
  where binding.release_id = p_release_id;
  if actual_count <> p_expected_binding_count then
    raise exception 'source binding count mismatch: expected %, found %',
      p_expected_binding_count, actual_count using errcode = '22023';
  end if;
  select count(*) into actual_count
  from public.college_facts as fact
  where fact.release_id = p_release_id;
  if actual_count <> p_expected_fact_count then
    raise exception 'fact count mismatch: expected %, found %',
      p_expected_fact_count, actual_count using errcode = '22023';
  end if;
  select count(*) into actual_count
  from public.college_passages as passage
  where passage.release_id = p_release_id;
  if actual_count <> p_expected_passage_count then
    raise exception 'passage count mismatch: expected %, found %',
      p_expected_passage_count, actual_count using errcode = '22023';
  end if;

  update public.college_catalog as catalog set
    slug = entry.slug,
    name = entry.name,
    city = entry.city,
    state = entry.state,
    census_region = entry.census_region,
    ownership_code = entry.ownership_code,
    ownership_label = entry.ownership_label,
    catalog_category = entry.catalog_category,
    inclusion_reason = entry.inclusion_reason,
    aliases = entry.aliases,
    website = entry.website,
    release_id = p_release_id,
    record_json = entry.record_json,
    updated_at = now()
  from public.college_catalog_release_records as entry
  where entry.release_id = p_release_id and entry.unit_id = catalog.unit_id;

  update public.college_knowledge_releases as prior_release
  set is_current = false
  where prior_release.is_current and prior_release.release_id <> p_release_id;
  update public.college_knowledge_releases as next_release
  set is_current = true, published_at = coalesce(next_release.published_at, now())
  where next_release.release_id = p_release_id;

  return query
  select release.release_id, release.institution_count, release.published_at, release.dataset_sha256
  from public.college_knowledge_releases as release
  where release.release_id = p_release_id;
end;
$$;

revoke all on function public.publish_college_knowledge_release(text, text, integer, integer, integer, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.publish_college_knowledge_release(text, text, integer, integer, integer, integer, integer)
  to service_role;
