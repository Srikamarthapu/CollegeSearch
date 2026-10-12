-- CollegeSearch M2: immutable, source-linked public college knowledge.
-- The identity seed below runs before the legacy saved UNITID check is replaced.

create schema if not exists extensions;
create extension if not exists vector with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create table public.college_knowledge_releases (
  release_id text primary key
    check (release_id ~ '^sha256:[a-f0-9]{64}$'),
  dataset_sha256 text not null
    check (dataset_sha256 ~ '^[a-f0-9]{64}$'),
  cohort_name text not null,
  institution_count integer not null check (institution_count >= 100),
  source_accessed_on date not null,
  federal_release_date date not null,
  embedding_model text,
  embedding_version text,
  embedding_dimensions integer not null default 2048
    check (embedding_dimensions = 2048),
  release_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  is_current boolean not null default false,
  constraint college_knowledge_embedding_release_metadata check (
    (embedding_model is null) = (embedding_version is null)
  ),
  constraint college_knowledge_current_is_published check (
    not is_current or published_at is not null
  )
);

create unique index college_knowledge_one_current_release
  on public.college_knowledge_releases (is_current)
  where is_current;

create table public.college_catalog (
  unit_id bigint primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  city text not null,
  state text not null check (state ~ '^[A-Z]{2}$'),
  census_region text not null
    check (census_region in ('Northeast', 'Midwest', 'South', 'West')),
  ownership_code smallint not null check (ownership_code in (1, 2)),
  ownership_label text not null
    check (ownership_label in ('Public', 'Private nonprofit')),
  catalog_category text not null check (catalog_category in (
    'existing-curated', 'csu-campus', 'major-public', 'regional-public', 'private-nonprofit'
  )),
  inclusion_reason text not null check (length(btrim(inclusion_reason)) > 0),
  aliases text[] not null default '{}',
  website text not null,
  release_id text references public.college_knowledge_releases (release_id)
    on delete restrict,
  record_json jsonb not null,
  updated_at timestamptz not null default now(),
  constraint college_catalog_ownership_label_code check (
    (ownership_code = 1 and ownership_label = 'Public') or
    (ownership_code = 2 and ownership_label = 'Private nonprofit')
  ),
  constraint college_catalog_release_unit_unique unique (release_id, unit_id)
);

create table public.college_sources (
  release_id text not null references public.college_knowledge_releases (release_id)
    on delete cascade,
  source_id text not null,
  publisher text not null,
  source_name text not null,
  source_url text not null check (source_url ~ '^https://[^[:space:]]+$'),
  source_page text check (source_page is null or source_page ~ '^https://[^[:space:]]+$'),
  artifact_url text check (artifact_url is null or artifact_url ~ '^https://[^[:space:]]+$'),
  artifact_sha256 text,
  source_urls text[] not null default '{}',
  reporting_year smallint,
  cohort text,
  finality text check (finality is null or finality in ('snapshot', 'provisional', 'finalized')),
  accessed_on date not null,
  source_metadata jsonb not null,
  primary key (release_id, source_id),
  constraint college_sources_sha256 check (
    artifact_sha256 is null or artifact_sha256 ~ '^[a-fA-F0-9]{64}$'
  )
);

create table public.college_source_bindings (
  release_id text not null,
  unit_id bigint not null references public.college_catalog (unit_id) on delete restrict,
  source_id text not null,
  primary key (release_id, unit_id, source_id),
  foreign key (release_id, source_id)
    references public.college_sources (release_id, source_id) on delete cascade
);

create table public.college_facts (
  fact_id text primary key check (fact_id ~ '^[a-f0-9]{64}$'),
  release_id text not null,
  unit_id bigint not null,
  source_id text not null,
  evidence_url text not null check (evidence_url ~ '^https://[^[:space:]]+$'),
  source_field text not null check (length(btrim(source_field)) > 0),
  fact_key text not null,
  metric_key text not null,
  dimension_key text,
  is_primary boolean not null,
  value_numeric numeric,
  value_boolean boolean,
  value_text text,
  unit text not null check (unit in ('ratio', 'usd', 'count', 'boolean', 'category')),
  reporting_year smallint,
  period_label text not null,
  cohort text not null,
  definition text not null,
  status text not null check (status in ('reported', 'derived', 'suppressed', 'unavailable', 'stale')),
  finality text not null check (finality in ('snapshot', 'provisional', 'finalized')),
  accessed_on date not null,
  comparability_key text not null,
  unique (release_id, unit_id, fact_key, is_primary),
  foreign key (release_id, unit_id, source_id)
    references public.college_source_bindings (release_id, unit_id, source_id)
    on delete cascade,
  constraint college_facts_value_shape check (
    (
      status in ('suppressed', 'unavailable') and value_numeric is null and
      value_boolean is null and value_text is null
    ) or (
      status in ('reported', 'derived', 'stale') and (
        (value_numeric is not null and value_boolean is null and value_text is null and
          ((unit = 'ratio' and value_numeric between 0 and 1) or
           (unit = 'usd' and value_numeric >= 0) or
           (unit = 'count' and value_numeric >= 0 and value_numeric = trunc(value_numeric)))) or
        (value_numeric is null and value_boolean is not null and value_text is null and unit = 'boolean') or
        (value_numeric is null and value_boolean is null and value_text is not null and unit = 'category')
      )
    )
  )
);

create index college_facts_current_filter_idx
  on public.college_facts (release_id, metric_key, unit_id, is_primary, value_numeric)
  where status in ('reported', 'derived') and value_numeric is not null;
create index college_facts_major_filter_idx
  on public.college_facts (release_id, unit_id, dimension_key, metric_key)
  where status in ('reported', 'derived') and value_boolean is true;

create table public.college_passages (
  passage_id text primary key check (passage_id ~ '^[a-f0-9]{64}$'),
  release_id text not null,
  unit_id bigint not null,
  source_id text not null,
  source_url text not null check (source_url ~ '^https://[^[:space:]]+$'),
  source_field text not null check (length(btrim(source_field)) > 0),
  field_locator text not null check (length(btrim(field_locator)) > 0),
  reporting_year smallint,
  period_label text not null,
  cohort text not null,
  definition text not null,
  title text not null,
  content text not null check (length(btrim(content)) > 0),
  content_sha256 text not null check (content_sha256 ~ '^[a-f0-9]{64}$'),
  search_vector tsvector generated always as (
    pg_catalog.to_tsvector('english'::pg_catalog.regconfig, coalesce(title, '') || ' ' || coalesce(content, ''))
  ) stored,
  embedding extensions.vector(2048),
  embedding_model text,
  embedding_version text,
  embedding_content_sha256 text,
  created_at timestamptz not null default now(),
  foreign key (release_id, unit_id, source_id)
    references public.college_source_bindings (release_id, unit_id, source_id)
    on delete cascade,
  constraint college_passage_embedding_metadata check (
    (embedding is null and embedding_model is null and embedding_version is null and
      embedding_content_sha256 is null) or
    (embedding is not null and embedding_model is not null and
      length(btrim(embedding_model)) > 0 and embedding_version is not null and
      length(btrim(embedding_version)) > 0 and embedding_content_sha256 = content_sha256)
  ),
  constraint college_passage_embedding_hash check (
    embedding_content_sha256 is null or embedding_content_sha256 ~ '^[a-f0-9]{64}$'
  )
);

create index college_passages_search_vector_idx
  on public.college_passages using gin (search_vector);
-- vector(2048) is intentionally exact-scan only; pgvector's indexed vector limit is 2000 dimensions.

-- These 100 reviewed identities are inserted before the old saved-ID check becomes a foreign key.
-- The transactional seeder fills each identity's complete record_json and publishes the release.
insert into public.college_catalog (
  unit_id, slug, name, city, state, census_region, ownership_code, ownership_label,
  catalog_category, inclusion_reason, aliases, website, release_id, record_json
)
select
  seed.unit_id, seed.slug, seed.name, seed.city, seed.state, seed.census_region,
  seed.ownership_code, seed.ownership_label, seed.catalog_category, seed.inclusion_reason,
  seed.aliases, seed.website, null, seed.record_json
from jsonb_to_recordset('[{"unit_id":197869,"slug":"appalachian-state-university","name":"Appalachian State University","city":"Boone","state":"NC","census_region":"South","ownership_code":1,"ownership_label":"Public","catalog_category":"regional-public","inclusion_reason":"Adds a regional public option in NC to broaden location and campus-choice coverage.","aliases":[],"website":"https://www.appstate.edu/","record_json":{"unitId":197869,"slug":"appalachian-state-university","name":"Appalachian State University","city":"Boone","state":"NC","region":"South","ownership":"Public","aliases":[],"catalogCategory":"regional-public","inclusionReason":"Adds a regional public option in NC to broaden location and campus-choice coverage."}},{"unit_id":104151,"slug":"arizona-state-university-campus-immersion","name":"Arizona State University Campus Immersion","city":"Tempe","state":"AZ","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in AZ.","aliases":["ASU","Arizona State"],"website":"https://www.asu.edu/","record_json":{"unitId":104151,"slug":"arizona-state-university-campus-immersion","name":"Arizona State University Campus Immersion","city":"Tempe","state":"AZ","region":"West","ownership":"Public","aliases":["ASU","Arizona State"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in AZ."}},{"unit_id":223232,"slug":"baylor-university","name":"Baylor University","city":"Waco","state":"TX","census_region":"South","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"private-nonprofit","inclusion_reason":"Adds a private nonprofit option in TX to broaden institution-type and regional choices.","aliases":[],"website":"https://www.baylor.edu/","record_json":{"unitId":223232,"slug":"baylor-university","name":"Baylor University","city":"Waco","state":"TX","region":"South","ownership":"Private nonprofit","aliases":[],"catalogCategory":"private-nonprofit","inclusionReason":"Adds a private nonprofit option in TX to broaden institution-type and regional choices."}},{"unit_id":142115,"slug":"boise-state-university","name":"Boise State University","city":"Boise","state":"ID","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"regional-public","inclusion_reason":"Adds a regional public option in ID to broaden location and campus-choice coverage.","aliases":["Boise State"],"website":"https://www.boisestate.edu/","record_json":{"unitId":142115,"slug":"boise-state-university","name":"Boise State University","city":"Boise","state":"ID","region":"West","ownership":"Public","aliases":["Boise State"],"catalogCategory":"regional-public","inclusionReason":"Adds a regional public option in ID to broaden location and campus-choice coverage."}},{"unit_id":110404,"slug":"california-institute-of-technology","name":"California Institute of Technology","city":"Pasadena","state":"CA","census_region":"West","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CA.","aliases":["Caltech","California Institute of Technology"],"website":"https://www.caltech.edu/","record_json":{"unitId":110404,"slug":"california-institute-of-technology","name":"California Institute of Technology","city":"Pasadena","state":"CA","region":"West","ownership":"Private nonprofit","aliases":["Caltech","California Institute of Technology"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CA."}},{"unit_id":110422,"slug":"california-polytechnic-state-university-san-luis-obispo","name":"California Polytechnic State University-San Luis Obispo","city":"San Luis Obispo","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["Cal Poly","Cal Poly SLO"],"website":"https://calpoly.edu/","record_json":{"unitId":110422,"slug":"california-polytechnic-state-university-san-luis-obispo","name":"California Polytechnic State University-San Luis Obispo","city":"San Luis Obispo","state":"CA","region":"West","ownership":"Public","aliases":["Cal Poly","Cal Poly SLO"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":115755,"slug":"california-state-polytechnic-university-humboldt","name":"California State Polytechnic University-Humboldt","city":"Arcata","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"csu-campus","inclusion_reason":"Adds the Arcata, California CSU campus to widen campus and location choices across the CSU system.","aliases":["Cal Poly Humboldt"],"website":"https://www.humboldt.edu/","record_json":{"unitId":115755,"slug":"california-state-polytechnic-university-humboldt","name":"California State Polytechnic University-Humboldt","city":"Arcata","state":"CA","region":"West","ownership":"Public","aliases":["Cal Poly Humboldt"],"catalogCategory":"csu-campus","inclusionReason":"Adds the Arcata, California CSU campus to widen campus and location choices across the CSU system."}},{"unit_id":110529,"slug":"california-state-polytechnic-university-pomona","name":"California State Polytechnic University-Pomona","city":"Pomona","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["Cal Poly Pomona","CPP"],"website":"https://www.cpp.edu/","record_json":{"unitId":110529,"slug":"california-state-polytechnic-university-pomona","name":"California State Polytechnic University-Pomona","city":"Pomona","state":"CA","region":"West","ownership":"Public","aliases":["Cal Poly Pomona","CPP"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":110486,"slug":"california-state-university-bakersfield","name":"California State University-Bakersfield","city":"Bakersfield","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"csu-campus","inclusion_reason":"Adds the Bakersfield, California CSU campus to widen campus and location choices across the CSU system.","aliases":["CSU Bakersfield"],"website":"https://www.csub.edu/","record_json":{"unitId":110486,"slug":"california-state-university-bakersfield","name":"California State University-Bakersfield","city":"Bakersfield","state":"CA","region":"West","ownership":"Public","aliases":["CSU Bakersfield"],"catalogCategory":"csu-campus","inclusionReason":"Adds the Bakersfield, California CSU campus to widen campus and location choices across the CSU system."}},{"unit_id":441937,"slug":"california-state-university-channel-islands","name":"California State University-Channel Islands","city":"Camarillo","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"csu-campus","inclusion_reason":"Adds the Camarillo, California CSU campus to widen campus and location choices across the CSU system.","aliases":["CSU Channel Islands"],"website":"https://www.csuci.edu/","record_json":{"unitId":441937,"slug":"california-state-university-channel-islands","name":"California State University-Channel Islands","city":"Camarillo","state":"CA","region":"West","ownership":"Public","aliases":["CSU Channel Islands"],"catalogCategory":"csu-campus","inclusionReason":"Adds the Camarillo, California CSU campus to widen campus and location choices across the CSU system."}},{"unit_id":110538,"slug":"california-state-university-chico","name":"California State University-Chico","city":"Chico","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"csu-campus","inclusion_reason":"Adds the Chico, California CSU campus to widen campus and location choices across the CSU system.","aliases":[],"website":"https://www.csuchico.edu/","record_json":{"unitId":110538,"slug":"california-state-university-chico","name":"California State University-Chico","city":"Chico","state":"CA","region":"West","ownership":"Public","aliases":[],"catalogCategory":"csu-campus","inclusionReason":"Adds the Chico, California CSU campus to widen campus and location choices across the CSU system."}},{"unit_id":110547,"slug":"california-state-university-dominguez-hills","name":"California State University-Dominguez Hills","city":"Carson","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"csu-campus","inclusion_reason":"Adds the Carson, California CSU campus to widen campus and location choices across the CSU system.","aliases":["CSUDH"],"website":"https://www.csudh.edu/","record_json":{"unitId":110547,"slug":"california-state-university-dominguez-hills","name":"California State University-Dominguez Hills","city":"Carson","state":"CA","region":"West","ownership":"Public","aliases":["CSUDH"],"catalogCategory":"csu-campus","inclusionReason":"Adds the Carson, California CSU campus to widen campus and location choices across the CSU system."}},{"unit_id":110574,"slug":"california-state-university-east-bay","name":"California State University-East Bay","city":"Hayward","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"csu-campus","inclusion_reason":"Adds the Hayward, California CSU campus to widen campus and location choices across the CSU system.","aliases":["Cal State East Bay"],"website":"https://www.csueastbay.edu/","record_json":{"unitId":110574,"slug":"california-state-university-east-bay","name":"California State University-East Bay","city":"Hayward","state":"CA","region":"West","ownership":"Public","aliases":["Cal State East Bay"],"catalogCategory":"csu-campus","inclusionReason":"Adds the Hayward, California CSU campus to widen campus and location choices across the CSU system."}},{"unit_id":110556,"slug":"california-state-university-fresno","name":"California State University-Fresno","city":"Fresno","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["Fresno State","CSU Fresno"],"website":"https://www.fresnostate.edu/","record_json":{"unitId":110556,"slug":"california-state-university-fresno","name":"California State University-Fresno","city":"Fresno","state":"CA","region":"West","ownership":"Public","aliases":["Fresno State","CSU Fresno"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":110565,"slug":"california-state-university-fullerton","name":"California State University-Fullerton","city":"Fullerton","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["Cal State Fullerton","CSUF"],"website":"https://www.fullerton.edu/","record_json":{"unitId":110565,"slug":"california-state-university-fullerton","name":"California State University-Fullerton","city":"Fullerton","state":"CA","region":"West","ownership":"Public","aliases":["Cal State Fullerton","CSUF"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":110583,"slug":"california-state-university-long-beach","name":"California State University-Long Beach","city":"Long Beach","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["Cal State Long Beach","CSULB","Long Beach State"],"website":"https://www.csulb.edu/","record_json":{"unitId":110583,"slug":"california-state-university-long-beach","name":"California State University-Long Beach","city":"Long Beach","state":"CA","region":"West","ownership":"Public","aliases":["Cal State Long Beach","CSULB","Long Beach State"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":110592,"slug":"california-state-university-los-angeles","name":"California State University-Los Angeles","city":"Los Angeles","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["Cal State LA","CSULA"],"website":"https://www.calstatela.edu/","record_json":{"unitId":110592,"slug":"california-state-university-los-angeles","name":"California State University-Los Angeles","city":"Los Angeles","state":"CA","region":"West","ownership":"Public","aliases":["Cal State LA","CSULA"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":409698,"slug":"california-state-university-monterey-bay","name":"California State University-Monterey Bay","city":"Seaside","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"csu-campus","inclusion_reason":"Adds the Seaside, California CSU campus to widen campus and location choices across the CSU system.","aliases":["CSUMB"],"website":"https://csumb.edu/","record_json":{"unitId":409698,"slug":"california-state-university-monterey-bay","name":"California State University-Monterey Bay","city":"Seaside","state":"CA","region":"West","ownership":"Public","aliases":["CSUMB"],"catalogCategory":"csu-campus","inclusionReason":"Adds the Seaside, California CSU campus to widen campus and location choices across the CSU system."}},{"unit_id":110608,"slug":"california-state-university-northridge","name":"California State University-Northridge","city":"Northridge","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["Cal State Northridge","CSUN"],"website":"https://www.csun.edu/","record_json":{"unitId":110608,"slug":"california-state-university-northridge","name":"California State University-Northridge","city":"Northridge","state":"CA","region":"West","ownership":"Public","aliases":["Cal State Northridge","CSUN"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":110617,"slug":"california-state-university-sacramento","name":"California State University-Sacramento","city":"Sacramento","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["Sac State","Sacramento State"],"website":"https://www.csus.edu/","record_json":{"unitId":110617,"slug":"california-state-university-sacramento","name":"California State University-Sacramento","city":"Sacramento","state":"CA","region":"West","ownership":"Public","aliases":["Sac State","Sacramento State"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":110510,"slug":"california-state-university-san-bernardino","name":"California State University-San Bernardino","city":"San Bernardino","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"csu-campus","inclusion_reason":"Adds the San Bernardino, California CSU campus to widen campus and location choices across the CSU system.","aliases":["Cal State San Bernardino"],"website":"https://www.csusb.edu/","record_json":{"unitId":110510,"slug":"california-state-university-san-bernardino","name":"California State University-San Bernardino","city":"San Bernardino","state":"CA","region":"West","ownership":"Public","aliases":["Cal State San Bernardino"],"catalogCategory":"csu-campus","inclusionReason":"Adds the San Bernardino, California CSU campus to widen campus and location choices across the CSU system."}},{"unit_id":366711,"slug":"california-state-university-san-marcos","name":"California State University-San Marcos","city":"San Marcos","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"csu-campus","inclusion_reason":"Adds the San Marcos, California CSU campus to widen campus and location choices across the CSU system.","aliases":[],"website":"https://www.csusm.edu/","record_json":{"unitId":366711,"slug":"california-state-university-san-marcos","name":"California State University-San Marcos","city":"San Marcos","state":"CA","region":"West","ownership":"Public","aliases":[],"catalogCategory":"csu-campus","inclusionReason":"Adds the San Marcos, California CSU campus to widen campus and location choices across the CSU system."}},{"unit_id":110495,"slug":"california-state-university-stanislaus","name":"California State University-Stanislaus","city":"Turlock","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"csu-campus","inclusion_reason":"Adds the Turlock, California CSU campus to widen campus and location choices across the CSU system.","aliases":["Stanislaus State"],"website":"https://www.csustan.edu/","record_json":{"unitId":110495,"slug":"california-state-university-stanislaus","name":"California State University-Stanislaus","city":"Turlock","state":"CA","region":"West","ownership":"Public","aliases":["Stanislaus State"],"catalogCategory":"csu-campus","inclusionReason":"Adds the Turlock, California CSU campus to widen campus and location choices across the CSU system."}},{"unit_id":111948,"slug":"chapman-university","name":"Chapman University","city":"Orange","state":"CA","census_region":"West","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CA.","aliases":["Chapman"],"website":"https://www.chapman.edu/","record_json":{"unitId":111948,"slug":"chapman-university","name":"Chapman University","city":"Orange","state":"CA","region":"West","ownership":"Private nonprofit","aliases":["Chapman"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CA."}},{"unit_id":190150,"slug":"columbia-university-in-the-city-of-new-york","name":"Columbia University in the City of New York","city":"New York","state":"NY","census_region":"Northeast","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in NY.","aliases":["Columbia"],"website":"https://www.columbia.edu/","record_json":{"unitId":190150,"slug":"columbia-university-in-the-city-of-new-york","name":"Columbia University in the City of New York","city":"New York","state":"NY","region":"Northeast","ownership":"Private nonprofit","aliases":["Columbia"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in NY."}},{"unit_id":144740,"slug":"depaul-university","name":"DePaul University","city":"Chicago","state":"IL","census_region":"Midwest","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"private-nonprofit","inclusion_reason":"Adds a private nonprofit option in IL to broaden institution-type and regional choices.","aliases":[],"website":"https://www.depaul.edu/","record_json":{"unitId":144740,"slug":"depaul-university","name":"DePaul University","city":"Chicago","state":"IL","region":"Midwest","ownership":"Private nonprofit","aliases":[],"catalogCategory":"private-nonprofit","inclusionReason":"Adds a private nonprofit option in IL to broaden institution-type and regional choices."}},{"unit_id":212054,"slug":"drexel-university","name":"Drexel University","city":"Philadelphia","state":"PA","census_region":"Northeast","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"private-nonprofit","inclusion_reason":"Adds a private nonprofit option in PA to broaden institution-type and regional choices.","aliases":["Drexel"],"website":"https://drexel.edu/","record_json":{"unitId":212054,"slug":"drexel-university","name":"Drexel University","city":"Philadelphia","state":"PA","region":"Northeast","ownership":"Private nonprofit","aliases":["Drexel"],"catalogCategory":"private-nonprofit","inclusionReason":"Adds a private nonprofit option in PA to broaden institution-type and regional choices."}},{"unit_id":198419,"slug":"duke-university","name":"Duke University","city":"Durham","state":"NC","census_region":"South","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in NC.","aliases":["Duke"],"website":"https://www.duke.edu/","record_json":{"unitId":198419,"slug":"duke-university","name":"Duke University","city":"Durham","state":"NC","region":"South","ownership":"Private nonprofit","aliases":["Duke"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in NC."}},{"unit_id":134097,"slug":"florida-state-university","name":"Florida State University","city":"Tallahassee","state":"FL","census_region":"South","ownership_code":1,"ownership_label":"Public","catalog_category":"major-public","inclusion_reason":"Adds a major public university in FL to broaden regional coverage and public-campus comparisons.","aliases":["Florida State","FSU"],"website":"https://www.fsu.edu/","record_json":{"unitId":134097,"slug":"florida-state-university","name":"Florida State University","city":"Tallahassee","state":"FL","region":"South","ownership":"Public","aliases":["Florida State","FSU"],"catalogCategory":"major-public","inclusionReason":"Adds a major public university in FL to broaden regional coverage and public-campus comparisons."}},{"unit_id":139755,"slug":"georgia-institute-of-technology-main-campus","name":"Georgia Institute of Technology-Main Campus","city":"Atlanta","state":"GA","census_region":"South","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in GA.","aliases":["Georgia Tech","GT"],"website":"https://www.gatech.edu/","record_json":{"unitId":139755,"slug":"georgia-institute-of-technology-main-campus","name":"Georgia Institute of Technology-Main Campus","city":"Atlanta","state":"GA","region":"South","ownership":"Public","aliases":["Georgia Tech","GT"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in GA."}},{"unit_id":235316,"slug":"gonzaga-university","name":"Gonzaga University","city":"Spokane","state":"WA","census_region":"West","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"private-nonprofit","inclusion_reason":"Adds a private nonprofit option in WA to broaden institution-type and regional choices.","aliases":[],"website":"https://www.gonzaga.edu/","record_json":{"unitId":235316,"slug":"gonzaga-university","name":"Gonzaga University","city":"Spokane","state":"WA","region":"West","ownership":"Private nonprofit","aliases":[],"catalogCategory":"private-nonprofit","inclusionReason":"Adds a private nonprofit option in WA to broaden institution-type and regional choices."}},{"unit_id":166027,"slug":"harvard-university","name":"Harvard University","city":"Cambridge","state":"MA","census_region":"Northeast","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in MA.","aliases":["Harvard"],"website":"https://www.harvard.edu/","record_json":{"unitId":166027,"slug":"harvard-university","name":"Harvard University","city":"Cambridge","state":"MA","region":"Northeast","ownership":"Private nonprofit","aliases":["Harvard"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in MA."}},{"unit_id":131520,"slug":"howard-university","name":"Howard University","city":"Washington","state":"DC","census_region":"South","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"private-nonprofit","inclusion_reason":"Adds a private nonprofit option in DC to broaden institution-type and regional choices.","aliases":[],"website":"https://www.howard.edu/","record_json":{"unitId":131520,"slug":"howard-university","name":"Howard University","city":"Washington","state":"DC","region":"South","ownership":"Private nonprofit","aliases":[],"catalogCategory":"private-nonprofit","inclusionReason":"Adds a private nonprofit option in DC to broaden institution-type and regional choices."}},{"unit_id":155399,"slug":"kansas-state-university","name":"Kansas State University","city":"Manhattan","state":"KS","census_region":"Midwest","ownership_code":1,"ownership_label":"Public","catalog_category":"major-public","inclusion_reason":"Adds a major public university in KS to broaden regional coverage and public-campus comparisons.","aliases":["K-State"],"website":"https://www.k-state.edu/","record_json":{"unitId":155399,"slug":"kansas-state-university","name":"Kansas State University","city":"Manhattan","state":"KS","region":"Midwest","ownership":"Public","aliases":["K-State"],"catalogCategory":"major-public","inclusionReason":"Adds a major public university in KS to broaden regional coverage and public-campus comparisons."}},{"unit_id":117946,"slug":"loyola-marymount-university","name":"Loyola Marymount University","city":"Los Angeles","state":"CA","census_region":"West","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CA.","aliases":["LMU","Loyola Marymount"],"website":"https://www.lmu.edu/","record_json":{"unitId":117946,"slug":"loyola-marymount-university","name":"Loyola Marymount University","city":"Los Angeles","state":"CA","region":"West","ownership":"Private nonprofit","aliases":["LMU","Loyola Marymount"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CA."}},{"unit_id":146719,"slug":"loyola-university-chicago","name":"Loyola University Chicago","city":"Chicago","state":"IL","census_region":"Midwest","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"private-nonprofit","inclusion_reason":"Adds a private nonprofit option in IL to broaden institution-type and regional choices.","aliases":[],"website":"https://www.luc.edu/","record_json":{"unitId":146719,"slug":"loyola-university-chicago","name":"Loyola University Chicago","city":"Chicago","state":"IL","region":"Midwest","ownership":"Private nonprofit","aliases":[],"catalogCategory":"private-nonprofit","inclusionReason":"Adds a private nonprofit option in IL to broaden institution-type and regional choices."}},{"unit_id":239105,"slug":"marquette-university","name":"Marquette University","city":"Milwaukee","state":"WI","census_region":"Midwest","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"private-nonprofit","inclusion_reason":"Adds a private nonprofit option in WI to broaden institution-type and regional choices.","aliases":[],"website":"https://www.marquette.edu/","record_json":{"unitId":239105,"slug":"marquette-university","name":"Marquette University","city":"Milwaukee","state":"WI","region":"Midwest","ownership":"Private nonprofit","aliases":[],"catalogCategory":"private-nonprofit","inclusionReason":"Adds a private nonprofit option in WI to broaden institution-type and regional choices."}},{"unit_id":166683,"slug":"massachusetts-institute-of-technology","name":"Massachusetts Institute of Technology","city":"Cambridge","state":"MA","census_region":"Northeast","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in MA.","aliases":["MIT","Massachusetts Institute of Technology"],"website":"https://web.mit.edu/","record_json":{"unitId":166683,"slug":"massachusetts-institute-of-technology","name":"Massachusetts Institute of Technology","city":"Cambridge","state":"MA","region":"Northeast","ownership":"Private nonprofit","aliases":["MIT","Massachusetts Institute of Technology"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in MA."}},{"unit_id":185590,"slug":"montclair-state-university","name":"Montclair State University","city":"Montclair","state":"NJ","census_region":"Northeast","ownership_code":1,"ownership_label":"Public","catalog_category":"regional-public","inclusion_reason":"Adds a regional public option in NJ to broaden location and campus-choice coverage.","aliases":[],"website":"https://www.montclair.edu/","record_json":{"unitId":185590,"slug":"montclair-state-university","name":"Montclair State University","city":"Montclair","state":"NJ","region":"Northeast","ownership":"Public","aliases":[],"catalogCategory":"regional-public","inclusionReason":"Adds a regional public option in NJ to broaden location and campus-choice coverage."}},{"unit_id":193900,"slug":"new-york-university","name":"New York University","city":"New York","state":"NY","census_region":"Northeast","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in NY.","aliases":["NYU","New York University"],"website":"https://www.nyu.edu/","record_json":{"unitId":193900,"slug":"new-york-university","name":"New York University","city":"New York","state":"NY","region":"Northeast","ownership":"Private nonprofit","aliases":["NYU","New York University"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in NY."}},{"unit_id":147703,"slug":"northern-illinois-university","name":"Northern Illinois University","city":"Dekalb","state":"IL","census_region":"Midwest","ownership_code":1,"ownership_label":"Public","catalog_category":"regional-public","inclusion_reason":"Adds a regional public option in IL to broaden location and campus-choice coverage.","aliases":[],"website":"https://www.niu.edu/","record_json":{"unitId":147703,"slug":"northern-illinois-university","name":"Northern Illinois University","city":"Dekalb","state":"IL","region":"Midwest","ownership":"Public","aliases":[],"catalogCategory":"regional-public","inclusionReason":"Adds a regional public option in IL to broaden location and campus-choice coverage."}},{"unit_id":147767,"slug":"northwestern-university","name":"Northwestern University","city":"Evanston","state":"IL","census_region":"Midwest","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in IL.","aliases":["Northwestern"],"website":"https://www.northwestern.edu/","record_json":{"unitId":147767,"slug":"northwestern-university","name":"Northwestern University","city":"Evanston","state":"IL","region":"Midwest","ownership":"Private nonprofit","aliases":["Northwestern"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in IL."}},{"unit_id":204796,"slug":"ohio-state-university-main-campus","name":"Ohio State University-Main Campus","city":"Columbus","state":"OH","census_region":"Midwest","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in OH.","aliases":["Ohio State","OSU"],"website":"https://www.osu.edu/","record_json":{"unitId":204796,"slug":"ohio-state-university-main-campus","name":"Ohio State University-Main Campus","city":"Columbus","state":"OH","region":"Midwest","ownership":"Public","aliases":["Ohio State","OSU"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in OH."}},{"unit_id":232982,"slug":"old-dominion-university","name":"Old Dominion University","city":"Norfolk","state":"VA","census_region":"South","ownership_code":1,"ownership_label":"Public","catalog_category":"regional-public","inclusion_reason":"Adds a regional public option in VA to broaden location and campus-choice coverage.","aliases":["ODU","Old Dominion"],"website":"https://www.odu.edu/","record_json":{"unitId":232982,"slug":"old-dominion-university","name":"Old Dominion University","city":"Norfolk","state":"VA","region":"South","ownership":"Public","aliases":["ODU","Old Dominion"],"catalogCategory":"regional-public","inclusionReason":"Adds a regional public option in VA to broaden location and campus-choice coverage."}},{"unit_id":209542,"slug":"oregon-state-university","name":"Oregon State University","city":"Corvallis","state":"OR","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in OR.","aliases":["Oregon State","OSU"],"website":"https://oregonstate.edu/","record_json":{"unitId":209542,"slug":"oregon-state-university","name":"Oregon State University","city":"Corvallis","state":"OR","region":"West","ownership":"Public","aliases":["Oregon State","OSU"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in OR."}},{"unit_id":214777,"slug":"pennsylvania-state-university-main-campus","name":"Pennsylvania State University-Main Campus","city":"University Park","state":"PA","census_region":"Northeast","ownership_code":1,"ownership_label":"Public","catalog_category":"major-public","inclusion_reason":"Adds a major public university in PA to broaden regional coverage and public-campus comparisons.","aliases":["Penn State"],"website":"https://psu.edu/","record_json":{"unitId":214777,"slug":"pennsylvania-state-university-main-campus","name":"Pennsylvania State University-Main Campus","city":"University Park","state":"PA","region":"Northeast","ownership":"Public","aliases":["Penn State"],"catalogCategory":"major-public","inclusionReason":"Adds a major public university in PA to broaden regional coverage and public-campus comparisons."}},{"unit_id":121345,"slug":"pomona-college","name":"Pomona College","city":"Claremont","state":"CA","census_region":"West","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CA.","aliases":["Pomona"],"website":"https://www.pomona.edu/","record_json":{"unitId":121345,"slug":"pomona-college","name":"Pomona College","city":"Claremont","state":"CA","region":"West","ownership":"Private nonprofit","aliases":["Pomona"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CA."}},{"unit_id":186131,"slug":"princeton-university","name":"Princeton University","city":"Princeton","state":"NJ","census_region":"Northeast","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in NJ.","aliases":["Princeton"],"website":"https://www.princeton.edu/","record_json":{"unitId":186131,"slug":"princeton-university","name":"Princeton University","city":"Princeton","state":"NJ","region":"Northeast","ownership":"Private nonprofit","aliases":["Princeton"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in NJ."}},{"unit_id":243780,"slug":"purdue-university-main-campus","name":"Purdue University-Main Campus","city":"West Lafayette","state":"IN","census_region":"Midwest","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in IN.","aliases":["Purdue"],"website":"https://www.purdue.edu/","record_json":{"unitId":243780,"slug":"purdue-university-main-campus","name":"Purdue University-Main Campus","city":"West Lafayette","state":"IN","region":"Midwest","ownership":"Public","aliases":["Purdue"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in IN."}},{"unit_id":186380,"slug":"rutgers-university-new-brunswick","name":"Rutgers University-New Brunswick","city":"New Brunswick","state":"NJ","census_region":"Northeast","ownership_code":1,"ownership_label":"Public","catalog_category":"major-public","inclusion_reason":"Adds a major public university in NJ to broaden regional coverage and public-campus comparisons.","aliases":["Rutgers-New Brunswick","Rutgers"],"website":"https://newbrunswick.rutgers.edu/","record_json":{"unitId":186380,"slug":"rutgers-university-new-brunswick","name":"Rutgers University-New Brunswick","city":"New Brunswick","state":"NJ","region":"Northeast","ownership":"Public","aliases":["Rutgers-New Brunswick","Rutgers"],"catalogCategory":"major-public","inclusionReason":"Adds a major public university in NJ to broaden regional coverage and public-campus comparisons."}},{"unit_id":122409,"slug":"san-diego-state-university","name":"San Diego State University","city":"San Diego","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["San Diego State","SDSU"],"website":"https://www.sdsu.edu/","record_json":{"unitId":122409,"slug":"san-diego-state-university","name":"San Diego State University","city":"San Diego","state":"CA","region":"West","ownership":"Public","aliases":["San Diego State","SDSU"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":122597,"slug":"san-francisco-state-university","name":"San Francisco State University","city":"San Francisco","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"csu-campus","inclusion_reason":"Adds the San Francisco, California CSU campus to widen campus and location choices across the CSU system.","aliases":[],"website":"https://www.sfsu.edu/","record_json":{"unitId":122597,"slug":"san-francisco-state-university","name":"San Francisco State University","city":"San Francisco","state":"CA","region":"West","ownership":"Public","aliases":[],"catalogCategory":"csu-campus","inclusionReason":"Adds the San Francisco, California CSU campus to widen campus and location choices across the CSU system."}},{"unit_id":122755,"slug":"san-jose-state-university","name":"San Jose State University","city":"San Jose","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["San Jose State","SJSU"],"website":"https://www.sjsu.edu/","record_json":{"unitId":122755,"slug":"san-jose-state-university","name":"San Jose State University","city":"San Jose","state":"CA","region":"West","ownership":"Public","aliases":["San Jose State","SJSU"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":122931,"slug":"santa-clara-university","name":"Santa Clara University","city":"Santa Clara","state":"CA","census_region":"West","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CA.","aliases":["Santa Clara","SCU"],"website":"https://www.scu.edu/","record_json":{"unitId":122931,"slug":"santa-clara-university","name":"Santa Clara University","city":"Santa Clara","state":"CA","region":"West","ownership":"Private nonprofit","aliases":["Santa Clara","SCU"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CA."}},{"unit_id":123572,"slug":"sonoma-state-university","name":"Sonoma State University","city":"Rohnert Park","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"csu-campus","inclusion_reason":"Adds the Rohnert Park, California CSU campus to widen campus and location choices across the CSU system.","aliases":[],"website":"https://sonoma.edu/","record_json":{"unitId":123572,"slug":"sonoma-state-university","name":"Sonoma State University","city":"Rohnert Park","state":"CA","region":"West","ownership":"Public","aliases":[],"catalogCategory":"csu-campus","inclusionReason":"Adds the Rohnert Park, California CSU campus to widen campus and location choices across the CSU system."}},{"unit_id":243744,"slug":"stanford-university","name":"Stanford University","city":"Stanford","state":"CA","census_region":"West","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CA.","aliases":["Stanford"],"website":"https://www.stanford.edu/","record_json":{"unitId":243744,"slug":"stanford-university","name":"Stanford University","city":"Stanford","state":"CA","region":"West","ownership":"Private nonprofit","aliases":["Stanford"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CA."}},{"unit_id":196413,"slug":"syracuse-university","name":"Syracuse University","city":"Syracuse","state":"NY","census_region":"Northeast","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"private-nonprofit","inclusion_reason":"Adds a private nonprofit option in NY to broaden institution-type and regional choices.","aliases":[],"website":"https://www.syracuse.edu/","record_json":{"unitId":196413,"slug":"syracuse-university","name":"Syracuse University","city":"Syracuse","state":"NY","region":"Northeast","ownership":"Private nonprofit","aliases":[],"catalogCategory":"private-nonprofit","inclusionReason":"Adds a private nonprofit option in NY to broaden institution-type and regional choices."}},{"unit_id":216339,"slug":"temple-university","name":"Temple University","city":"Philadelphia","state":"PA","census_region":"Northeast","ownership_code":1,"ownership_label":"Public","catalog_category":"regional-public","inclusion_reason":"Adds a regional public option in PA to broaden location and campus-choice coverage.","aliases":["Temple"],"website":"https://www.temple.edu/","record_json":{"unitId":216339,"slug":"temple-university","name":"Temple University","city":"Philadelphia","state":"PA","region":"Northeast","ownership":"Public","aliases":["Temple"],"catalogCategory":"regional-public","inclusionReason":"Adds a regional public option in PA to broaden location and campus-choice coverage."}},{"unit_id":228723,"slug":"texas-aandm-university-college-station","name":"Texas A&M University-College Station","city":"College Station","state":"TX","census_region":"South","ownership_code":1,"ownership_label":"Public","catalog_category":"major-public","inclusion_reason":"Adds a major public university in TX to broaden regional coverage and public-campus comparisons.","aliases":["Texas A&M University"],"website":"https://www.tamu.edu/","record_json":{"unitId":228723,"slug":"texas-aandm-university-college-station","name":"Texas A&M University-College Station","city":"College Station","state":"TX","region":"South","ownership":"Public","aliases":["Texas A&M University"],"catalogCategory":"major-public","inclusionReason":"Adds a major public university in TX to broaden regional coverage and public-campus comparisons."}},{"unit_id":228459,"slug":"texas-state-university","name":"Texas State University","city":"San Marcos","state":"TX","census_region":"South","ownership_code":1,"ownership_label":"Public","catalog_category":"regional-public","inclusion_reason":"Adds a regional public option in TX to broaden location and campus-choice coverage.","aliases":["TxSt","TxState"],"website":"https://www.txst.edu/","record_json":{"unitId":228459,"slug":"texas-state-university","name":"Texas State University","city":"San Marcos","state":"TX","region":"South","ownership":"Public","aliases":["TxSt","TxState"],"catalogCategory":"regional-public","inclusionReason":"Adds a regional public option in TX to broaden location and campus-choice coverage."}},{"unit_id":221759,"slug":"the-university-of-tennessee-knoxville","name":"The University of Tennessee-Knoxville","city":"Knoxville","state":"TN","census_region":"South","ownership_code":1,"ownership_label":"Public","catalog_category":"major-public","inclusion_reason":"Adds a major public university in TN to broaden regional coverage and public-campus comparisons.","aliases":[],"website":"https://www.utk.edu/","record_json":{"unitId":221759,"slug":"the-university-of-tennessee-knoxville","name":"The University of Tennessee-Knoxville","city":"Knoxville","state":"TN","region":"South","ownership":"Public","aliases":[],"catalogCategory":"major-public","inclusionReason":"Adds a major public university in TN to broaden regional coverage and public-campus comparisons."}},{"unit_id":228778,"slug":"the-university-of-texas-at-austin","name":"The University of Texas at Austin","city":"Austin","state":"TX","census_region":"South","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in TX.","aliases":["UT Austin","Texas"],"website":"https://www.utexas.edu/","record_json":{"unitId":228778,"slug":"the-university-of-texas-at-austin","name":"The University of Texas at Austin","city":"Austin","state":"TX","region":"South","ownership":"Public","aliases":["UT Austin","Texas"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in TX."}},{"unit_id":160755,"slug":"tulane-university-of-louisiana","name":"Tulane University of Louisiana","city":"New Orleans","state":"LA","census_region":"South","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"private-nonprofit","inclusion_reason":"Adds a private nonprofit option in LA to broaden institution-type and regional choices.","aliases":["Tulane University"],"website":"https://tulane.edu/","record_json":{"unitId":160755,"slug":"tulane-university-of-louisiana","name":"Tulane University of Louisiana","city":"New Orleans","state":"LA","region":"South","ownership":"Private nonprofit","aliases":["Tulane University"],"catalogCategory":"private-nonprofit","inclusionReason":"Adds a private nonprofit option in LA to broaden institution-type and regional choices."}},{"unit_id":196088,"slug":"university-at-buffalo","name":"University at Buffalo","city":"Buffalo","state":"NY","census_region":"Northeast","ownership_code":1,"ownership_label":"Public","catalog_category":"major-public","inclusion_reason":"Adds a major public university in NY to broaden regional coverage and public-campus comparisons.","aliases":["UB","SUNY Buffalo"],"website":"https://www.buffalo.edu/","record_json":{"unitId":196088,"slug":"university-at-buffalo","name":"University at Buffalo","city":"Buffalo","state":"NY","region":"Northeast","ownership":"Public","aliases":["UB","SUNY Buffalo"],"catalogCategory":"major-public","inclusionReason":"Adds a major public university in NY to broaden regional coverage and public-campus comparisons."}},{"unit_id":200800,"slug":"university-of-akron-main-campus","name":"University of Akron Main Campus","city":"Akron","state":"OH","census_region":"Midwest","ownership_code":1,"ownership_label":"Public","catalog_category":"regional-public","inclusion_reason":"Adds a regional public option in OH to broaden location and campus-choice coverage.","aliases":[],"website":"https://www.uakron.edu/","record_json":{"unitId":200800,"slug":"university-of-akron-main-campus","name":"University of Akron Main Campus","city":"Akron","state":"OH","region":"Midwest","ownership":"Public","aliases":[],"catalogCategory":"regional-public","inclusionReason":"Adds a regional public option in OH to broaden location and campus-choice coverage."}},{"unit_id":104179,"slug":"university-of-arizona","name":"University of Arizona","city":"Tucson","state":"AZ","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in AZ.","aliases":[],"website":"https://www.arizona.edu/","record_json":{"unitId":104179,"slug":"university-of-arizona","name":"University of Arizona","city":"Tucson","state":"AZ","region":"West","ownership":"Public","aliases":[],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in AZ."}},{"unit_id":110635,"slug":"university-of-california-berkeley","name":"University of California-Berkeley","city":"Berkeley","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["UC Berkeley","Berkeley","Cal"],"website":"https://www.berkeley.edu/","record_json":{"unitId":110635,"slug":"university-of-california-berkeley","name":"University of California-Berkeley","city":"Berkeley","state":"CA","region":"West","ownership":"Public","aliases":["UC Berkeley","Berkeley","Cal"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":110644,"slug":"university-of-california-davis","name":"University of California-Davis","city":"Davis","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["UC Davis","UCD"],"website":"https://ucdavis.edu/","record_json":{"unitId":110644,"slug":"university-of-california-davis","name":"University of California-Davis","city":"Davis","state":"CA","region":"West","ownership":"Public","aliases":["UC Davis","UCD"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":110653,"slug":"university-of-california-irvine","name":"University of California-Irvine","city":"Irvine","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["UC Irvine","UCI"],"website":"https://www.uci.edu/","record_json":{"unitId":110653,"slug":"university-of-california-irvine","name":"University of California-Irvine","city":"Irvine","state":"CA","region":"West","ownership":"Public","aliases":["UC Irvine","UCI"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":110662,"slug":"university-of-california-los-angeles","name":"University of California-Los Angeles","city":"Los Angeles","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["UCLA","UC Los Angeles"],"website":"https://www.ucla.edu/","record_json":{"unitId":110662,"slug":"university-of-california-los-angeles","name":"University of California-Los Angeles","city":"Los Angeles","state":"CA","region":"West","ownership":"Public","aliases":["UCLA","UC Los Angeles"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":445188,"slug":"university-of-california-merced","name":"University of California-Merced","city":"Merced","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["UC Merced","UCM"],"website":"https://ucmerced.edu/","record_json":{"unitId":445188,"slug":"university-of-california-merced","name":"University of California-Merced","city":"Merced","state":"CA","region":"West","ownership":"Public","aliases":["UC Merced","UCM"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":110671,"slug":"university-of-california-riverside","name":"University of California-Riverside","city":"Riverside","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["UC Riverside","UCR"],"website":"https://www.ucr.edu/","record_json":{"unitId":110671,"slug":"university-of-california-riverside","name":"University of California-Riverside","city":"Riverside","state":"CA","region":"West","ownership":"Public","aliases":["UC Riverside","UCR"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":110680,"slug":"university-of-california-san-diego","name":"University of California-San Diego","city":"La Jolla","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["UC San Diego","UCSD"],"website":"https://www.ucsd.edu/","record_json":{"unitId":110680,"slug":"university-of-california-san-diego","name":"University of California-San Diego","city":"La Jolla","state":"CA","region":"West","ownership":"Public","aliases":["UC San Diego","UCSD"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":110705,"slug":"university-of-california-santa-barbara","name":"University of California-Santa Barbara","city":"Santa Barbara","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["UC Santa Barbara","UCSB"],"website":"https://www.ucsb.edu/","record_json":{"unitId":110705,"slug":"university-of-california-santa-barbara","name":"University of California-Santa Barbara","city":"Santa Barbara","state":"CA","region":"West","ownership":"Public","aliases":["UC Santa Barbara","UCSB"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":110714,"slug":"university-of-california-santa-cruz","name":"University of California-Santa Cruz","city":"Santa Cruz","state":"CA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA.","aliases":["UC Santa Cruz","UCSC"],"website":"https://www.ucsc.edu/","record_json":{"unitId":110714,"slug":"university-of-california-santa-cruz","name":"University of California-Santa Cruz","city":"Santa Cruz","state":"CA","region":"West","ownership":"Public","aliases":["UC Santa Cruz","UCSC"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in CA."}},{"unit_id":129020,"slug":"university-of-connecticut","name":"University of Connecticut","city":"Storrs","state":"CT","census_region":"Northeast","ownership_code":1,"ownership_label":"Public","catalog_category":"major-public","inclusion_reason":"Adds a major public university in CT to broaden regional coverage and public-campus comparisons.","aliases":[],"website":"https://uconn.edu/","record_json":{"unitId":129020,"slug":"university-of-connecticut","name":"University of Connecticut","city":"Storrs","state":"CT","region":"Northeast","ownership":"Public","aliases":[],"catalogCategory":"major-public","inclusionReason":"Adds a major public university in CT to broaden regional coverage and public-campus comparisons."}},{"unit_id":134130,"slug":"university-of-florida","name":"University of Florida","city":"Gainesville","state":"FL","census_region":"South","ownership_code":1,"ownership_label":"Public","catalog_category":"major-public","inclusion_reason":"Adds a major public university in FL to broaden regional coverage and public-campus comparisons.","aliases":[],"website":"https://www.ufl.edu/","record_json":{"unitId":134130,"slug":"university-of-florida","name":"University of Florida","city":"Gainesville","state":"FL","region":"South","ownership":"Public","aliases":[],"catalogCategory":"major-public","inclusionReason":"Adds a major public university in FL to broaden regional coverage and public-campus comparisons."}},{"unit_id":139959,"slug":"university-of-georgia","name":"University of Georgia","city":"Athens","state":"GA","census_region":"South","ownership_code":1,"ownership_label":"Public","catalog_category":"major-public","inclusion_reason":"Adds a major public university in GA to broaden regional coverage and public-campus comparisons.","aliases":[],"website":"https://www.uga.edu/","record_json":{"unitId":139959,"slug":"university-of-georgia","name":"University of Georgia","city":"Athens","state":"GA","region":"South","ownership":"Public","aliases":[],"catalogCategory":"major-public","inclusionReason":"Adds a major public university in GA to broaden regional coverage and public-campus comparisons."}},{"unit_id":145637,"slug":"university-of-illinois-urbana-champaign","name":"University of Illinois Urbana-Champaign","city":"Champaign","state":"IL","census_region":"Midwest","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in IL.","aliases":["UIUC","Illinois"],"website":"https://www.illinois.edu/","record_json":{"unitId":145637,"slug":"university-of-illinois-urbana-champaign","name":"University of Illinois Urbana-Champaign","city":"Champaign","state":"IL","region":"Midwest","ownership":"Public","aliases":["UIUC","Illinois"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in IL."}},{"unit_id":153658,"slug":"university-of-iowa","name":"University of Iowa","city":"Iowa City","state":"IA","census_region":"Midwest","ownership_code":1,"ownership_label":"Public","catalog_category":"major-public","inclusion_reason":"Adds a major public university in IA to broaden regional coverage and public-campus comparisons.","aliases":["Iowa"],"website":"https://uiowa.edu/","record_json":{"unitId":153658,"slug":"university-of-iowa","name":"University of Iowa","city":"Iowa City","state":"IA","region":"Midwest","ownership":"Public","aliases":["Iowa"],"catalogCategory":"major-public","inclusionReason":"Adds a major public university in IA to broaden regional coverage and public-campus comparisons."}},{"unit_id":161253,"slug":"university-of-maine","name":"University of Maine","city":"Orono","state":"ME","census_region":"Northeast","ownership_code":1,"ownership_label":"Public","catalog_category":"regional-public","inclusion_reason":"Adds a regional public option in ME to broaden location and campus-choice coverage.","aliases":[],"website":"https://www.umaine.edu/","record_json":{"unitId":161253,"slug":"university-of-maine","name":"University of Maine","city":"Orono","state":"ME","region":"Northeast","ownership":"Public","aliases":[],"catalogCategory":"regional-public","inclusionReason":"Adds a regional public option in ME to broaden location and campus-choice coverage."}},{"unit_id":166629,"slug":"university-of-massachusetts-amherst","name":"University of Massachusetts-Amherst","city":"Amherst","state":"MA","census_region":"Northeast","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in MA.","aliases":["UMass Amherst","Massachusetts Amherst"],"website":"https://www.umass.edu/","record_json":{"unitId":166629,"slug":"university-of-massachusetts-amherst","name":"University of Massachusetts-Amherst","city":"Amherst","state":"MA","region":"Northeast","ownership":"Public","aliases":["UMass Amherst","Massachusetts Amherst"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in MA."}},{"unit_id":170976,"slug":"university-of-michigan-ann-arbor","name":"University of Michigan-Ann Arbor","city":"Ann Arbor","state":"MI","census_region":"Midwest","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in MI.","aliases":["Michigan","UMich"],"website":"https://umich.edu/","record_json":{"unitId":170976,"slug":"university-of-michigan-ann-arbor","name":"University of Michigan-Ann Arbor","city":"Ann Arbor","state":"MI","region":"Midwest","ownership":"Public","aliases":["Michigan","UMich"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in MI."}},{"unit_id":174066,"slug":"university-of-minnesota-twin-cities","name":"University of Minnesota-Twin Cities","city":"Minneapolis","state":"MN","census_region":"Midwest","ownership_code":1,"ownership_label":"Public","catalog_category":"major-public","inclusion_reason":"Adds a major public university in MN to broaden regional coverage and public-campus comparisons.","aliases":[],"website":"https://twin-cities.umn.edu/","record_json":{"unitId":174066,"slug":"university-of-minnesota-twin-cities","name":"University of Minnesota-Twin Cities","city":"Minneapolis","state":"MN","region":"Midwest","ownership":"Public","aliases":[],"catalogCategory":"major-public","inclusionReason":"Adds a major public university in MN to broaden regional coverage and public-campus comparisons."}},{"unit_id":178396,"slug":"university-of-missouri-columbia","name":"University of Missouri-Columbia","city":"Columbia","state":"MO","census_region":"Midwest","ownership_code":1,"ownership_label":"Public","catalog_category":"major-public","inclusion_reason":"Adds a major public university in MO to broaden regional coverage and public-campus comparisons.","aliases":[],"website":"https://missouri.edu/","record_json":{"unitId":178396,"slug":"university-of-missouri-columbia","name":"University of Missouri-Columbia","city":"Columbia","state":"MO","region":"Midwest","ownership":"Public","aliases":[],"catalogCategory":"major-public","inclusionReason":"Adds a major public university in MO to broaden regional coverage and public-campus comparisons."}},{"unit_id":199120,"slug":"university-of-north-carolina-at-chapel-hill","name":"University of North Carolina at Chapel Hill","city":"Chapel Hill","state":"NC","census_region":"South","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in NC.","aliases":["UNC","UNC Chapel Hill"],"website":"https://www.unc.edu/","record_json":{"unitId":199120,"slug":"university-of-north-carolina-at-chapel-hill","name":"University of North Carolina at Chapel Hill","city":"Chapel Hill","state":"NC","region":"South","ownership":"Public","aliases":["UNC","UNC Chapel Hill"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in NC."}},{"unit_id":227216,"slug":"university-of-north-texas","name":"University of North Texas","city":"Denton","state":"TX","census_region":"South","ownership_code":1,"ownership_label":"Public","catalog_category":"regional-public","inclusion_reason":"Adds a regional public option in TX to broaden location and campus-choice coverage.","aliases":["UNT","North Texas"],"website":"https://www.unt.edu/","record_json":{"unitId":227216,"slug":"university-of-north-texas","name":"University of North Texas","city":"Denton","state":"TX","region":"South","ownership":"Public","aliases":["UNT","North Texas"],"catalogCategory":"regional-public","inclusionReason":"Adds a regional public option in TX to broaden location and campus-choice coverage."}},{"unit_id":209551,"slug":"university-of-oregon","name":"University of Oregon","city":"Eugene","state":"OR","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"major-public","inclusion_reason":"Adds a major public university in OR to broaden regional coverage and public-campus comparisons.","aliases":["UO"],"website":"https://www.uoregon.edu/","record_json":{"unitId":209551,"slug":"university-of-oregon","name":"University of Oregon","city":"Eugene","state":"OR","region":"West","ownership":"Public","aliases":["UO"],"catalogCategory":"major-public","inclusionReason":"Adds a major public university in OR to broaden regional coverage and public-campus comparisons."}},{"unit_id":217484,"slug":"university-of-rhode-island","name":"University of Rhode Island","city":"Kingston","state":"RI","census_region":"Northeast","ownership_code":1,"ownership_label":"Public","catalog_category":"regional-public","inclusion_reason":"Adds a regional public option in RI to broaden location and campus-choice coverage.","aliases":["URI"],"website":"https://web.uri.edu/","record_json":{"unitId":217484,"slug":"university-of-rhode-island","name":"University of Rhode Island","city":"Kingston","state":"RI","region":"Northeast","ownership":"Public","aliases":["URI"],"catalogCategory":"regional-public","inclusionReason":"Adds a regional public option in RI to broaden location and campus-choice coverage."}},{"unit_id":122436,"slug":"university-of-san-diego","name":"University of San Diego","city":"San Diego","state":"CA","census_region":"West","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"private-nonprofit","inclusion_reason":"Adds a private nonprofit option in CA to broaden institution-type and regional choices.","aliases":["USD"],"website":"https://www.sandiego.edu/","record_json":{"unitId":122436,"slug":"university-of-san-diego","name":"University of San Diego","city":"San Diego","state":"CA","region":"West","ownership":"Private nonprofit","aliases":["USD"],"catalogCategory":"private-nonprofit","inclusionReason":"Adds a private nonprofit option in CA to broaden institution-type and regional choices."}},{"unit_id":122612,"slug":"university-of-san-francisco","name":"University of San Francisco","city":"San Francisco","state":"CA","census_region":"West","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CA.","aliases":["USF","University of San Francisco"],"website":"https://www.usfca.edu/","record_json":{"unitId":122612,"slug":"university-of-san-francisco","name":"University of San Francisco","city":"San Francisco","state":"CA","region":"West","ownership":"Private nonprofit","aliases":["USF","University of San Francisco"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CA."}},{"unit_id":123961,"slug":"university-of-southern-california","name":"University of Southern California","city":"Los Angeles","state":"CA","census_region":"West","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CA.","aliases":["USC","Southern California"],"website":"https://www.usc.edu/","record_json":{"unitId":123961,"slug":"university-of-southern-california","name":"University of Southern California","city":"Los Angeles","state":"CA","region":"West","ownership":"Private nonprofit","aliases":["USC","Southern California"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CA."}},{"unit_id":206084,"slug":"university-of-toledo","name":"University of Toledo","city":"Toledo","state":"OH","census_region":"Midwest","ownership_code":1,"ownership_label":"Public","catalog_category":"regional-public","inclusion_reason":"Adds a regional public option in OH to broaden location and campus-choice coverage.","aliases":[],"website":"https://www.utoledo.edu/","record_json":{"unitId":206084,"slug":"university-of-toledo","name":"University of Toledo","city":"Toledo","state":"OH","region":"Midwest","ownership":"Public","aliases":[],"catalogCategory":"regional-public","inclusionReason":"Adds a regional public option in OH to broaden location and campus-choice coverage."}},{"unit_id":230764,"slug":"university-of-utah","name":"University of Utah","city":"Salt Lake City","state":"UT","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"major-public","inclusion_reason":"Adds a major public university in UT to broaden regional coverage and public-campus comparisons.","aliases":["The U"],"website":"https://www.utah.edu/","record_json":{"unitId":230764,"slug":"university-of-utah","name":"University of Utah","city":"Salt Lake City","state":"UT","region":"West","ownership":"Public","aliases":["The U"],"catalogCategory":"major-public","inclusionReason":"Adds a major public university in UT to broaden regional coverage and public-campus comparisons."}},{"unit_id":234076,"slug":"university-of-virginia-main-campus","name":"University of Virginia-Main Campus","city":"Charlottesville","state":"VA","census_region":"South","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in VA.","aliases":["UVA","Virginia"],"website":"https://www.virginia.edu/","record_json":{"unitId":234076,"slug":"university-of-virginia-main-campus","name":"University of Virginia-Main Campus","city":"Charlottesville","state":"VA","region":"South","ownership":"Public","aliases":["UVA","Virginia"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in VA."}},{"unit_id":236948,"slug":"university-of-washington-seattle-campus","name":"University of Washington-Seattle Campus","city":"Seattle","state":"WA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in WA.","aliases":["UW","University of Washington"],"website":"https://www.washington.edu/","record_json":{"unitId":236948,"slug":"university-of-washington-seattle-campus","name":"University of Washington-Seattle Campus","city":"Seattle","state":"WA","region":"West","ownership":"Public","aliases":["UW","University of Washington"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in WA."}},{"unit_id":240444,"slug":"university-of-wisconsin-madison","name":"University of Wisconsin-Madison","city":"Madison","state":"WI","census_region":"Midwest","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in WI.","aliases":["Wisconsin","UW Madison"],"website":"https://www.wisc.edu/","record_json":{"unitId":240444,"slug":"university-of-wisconsin-madison","name":"University of Wisconsin-Madison","city":"Madison","state":"WI","region":"Midwest","ownership":"Public","aliases":["Wisconsin","UW Madison"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in WI."}},{"unit_id":240453,"slug":"university-of-wisconsin-milwaukee","name":"University of Wisconsin-Milwaukee","city":"Milwaukee","state":"WI","census_region":"Midwest","ownership_code":1,"ownership_label":"Public","catalog_category":"regional-public","inclusion_reason":"Adds a regional public option in WI to broaden location and campus-choice coverage.","aliases":["UWM"],"website":"https://uwm.edu/","record_json":{"unitId":240453,"slug":"university-of-wisconsin-milwaukee","name":"University of Wisconsin-Milwaukee","city":"Milwaukee","state":"WI","region":"Midwest","ownership":"Public","aliases":["UWM"],"catalogCategory":"regional-public","inclusionReason":"Adds a regional public option in WI to broaden location and campus-choice coverage."}},{"unit_id":236939,"slug":"washington-state-university","name":"Washington State University","city":"Pullman","state":"WA","census_region":"West","ownership_code":1,"ownership_label":"Public","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in WA.","aliases":["Washington State","WSU"],"website":"https://wsu.edu/","record_json":{"unitId":236939,"slug":"washington-state-university","name":"Washington State University","city":"Pullman","state":"WA","region":"West","ownership":"Public","aliases":["Washington State","WSU"],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing public option in WA."}},{"unit_id":130794,"slug":"yale-university","name":"Yale University","city":"New Haven","state":"CT","census_region":"Northeast","ownership_code":2,"ownership_label":"Private nonprofit","catalog_category":"existing-curated","inclusion_reason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CT.","aliases":[],"website":"https://www.yale.edu/","record_json":{"unitId":130794,"slug":"yale-university","name":"Yale University","city":"New Haven","state":"CT","region":"Northeast","ownership":"Private nonprofit","aliases":[],"catalogCategory":"existing-curated","inclusionReason":"Retained from the established catalog to preserve its UNITID, profile route, and saved-college identity; keeps an existing private nonprofit option in CT."}}]'::jsonb) as seed(
  unit_id bigint,
  slug text,
  name text,
  city text,
  state text,
  census_region text,
  ownership_code smallint,
  ownership_label text,
  catalog_category text,
  inclusion_reason text,
  aliases text[],
  website text,
  record_json jsonb
)
on conflict (unit_id) do nothing;

do $$
declare
  missing_count integer;
begin
  select count(*) into missing_count
  from public.saved_colleges as saved
  left join public.college_catalog as catalog using (unit_id)
  where catalog.unit_id is null;

  if missing_count > 0 then
    raise exception 'M2 refused to replace saved UNITID check: % saved rows lack a catalog identity', missing_count;
  end if;
end;
$$;

alter table public.saved_colleges
  drop constraint saved_colleges_unit_id_catalog;
alter table public.saved_colleges
  add constraint saved_colleges_unit_id_catalog
  foreign key (unit_id) references public.college_catalog (unit_id)
  on delete restrict;

alter table public.college_knowledge_releases enable row level security;
alter table public.college_catalog enable row level security;
alter table public.college_sources enable row level security;
alter table public.college_source_bindings enable row level security;
alter table public.college_facts enable row level security;
alter table public.college_passages enable row level security;

create policy college_knowledge_releases_read_current
  on public.college_knowledge_releases for select to anon, authenticated
  using (is_current and published_at is not null);
create policy college_catalog_read_current
  on public.college_catalog for select to anon, authenticated
  using (exists (
    select 1 from public.college_knowledge_releases as release
    where release.release_id = college_catalog.release_id
      and release.is_current and release.published_at is not null
  ));
create policy college_sources_read_current
  on public.college_sources for select to anon, authenticated
  using (exists (
    select 1 from public.college_knowledge_releases as release
    where release.release_id = college_sources.release_id
      and release.is_current and release.published_at is not null
  ));
create policy college_source_bindings_read_current
  on public.college_source_bindings for select to anon, authenticated
  using (exists (
    select 1 from public.college_knowledge_releases as release
    where release.release_id = college_source_bindings.release_id
      and release.is_current and release.published_at is not null
  ));
create policy college_facts_read_current
  on public.college_facts for select to anon, authenticated
  using (exists (
    select 1 from public.college_knowledge_releases as release
    where release.release_id = college_facts.release_id
      and release.is_current and release.published_at is not null
  ));
create policy college_passages_read_current
  on public.college_passages for select to anon, authenticated
  using (exists (
    select 1 from public.college_knowledge_releases as release
    where release.release_id = college_passages.release_id
      and release.is_current and release.published_at is not null
  ));

revoke all privileges on table public.college_knowledge_releases from public, anon, authenticated, service_role;
revoke all privileges on table public.college_catalog from public, anon, authenticated, service_role;
revoke all privileges on table public.college_sources from public, anon, authenticated, service_role;
revoke all privileges on table public.college_source_bindings from public, anon, authenticated, service_role;
revoke all privileges on table public.college_facts from public, anon, authenticated, service_role;
revoke all privileges on table public.college_passages from public, anon, authenticated, service_role;
grant select on table public.college_knowledge_releases, public.college_catalog,
  public.college_sources, public.college_source_bindings, public.college_facts,
  public.college_passages to anon, authenticated;
grant select, insert, update, delete on table public.college_knowledge_releases,
  public.college_catalog, public.college_sources, public.college_source_bindings,
  public.college_facts, public.college_passages to service_role;

create function public.current_college_knowledge_release()
returns table (
  release_id text,
  institution_count integer,
  published_at timestamptz,
  dataset_sha256 text,
  embedding_model text,
  embedding_version text
)
language sql stable security invoker
set search_path = ''
as $$
  select release.release_id, release.institution_count, release.published_at,
    release.dataset_sha256, release.embedding_model, release.embedding_version
  from public.college_knowledge_releases as release
  where release.is_current and release.published_at is not null
  limit 1;
$$;

create function public.hybrid_search_college_passages(
  p_query_text text,
  p_query_embedding extensions.vector default null,
  p_embedding_model text default null,
  p_embedding_version text default null,
  p_match_count integer default 8,
  p_unit_ids bigint[] default null,
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
  passage_id text,
  title text,
  content text,
  source_id text,
  publisher text,
  source_name text,
  source_url text,
  source_field text,
  field_locator text,
  reporting_year smallint,
  period_label text,
  cohort text,
  definition text,
  content_sha256 text,
  embedding_model text,
  embedding_version text,
  lexical_rank integer,
  semantic_rank integer,
  rrf_score numeric
)
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  active_release_id text;
  active_embedding_model text;
  active_embedding_version text;
  use_semantic boolean := false;
  safe_query text;
  safe_match_count integer;
begin
  if p_expected_release_id is null then
    raise exception 'expected knowledge release is required' using errcode = '22023';
  end if;
  select release.release_id, release.embedding_model, release.embedding_version
    into active_release_id, active_embedding_model, active_embedding_version
  from public.college_knowledge_releases as release
  where release.is_current and release.published_at is not null
  limit 1;
  if active_release_id is null or active_release_id <> p_expected_release_id then
    raise exception 'knowledge release does not match the requested snapshot' using errcode = '22023';
  end if;
  if p_query_embedding is not null then
    if p_embedding_model is null or p_embedding_version is null or
       extensions.vector_dims(p_query_embedding) <> 2048 then
      raise exception 'query embedding must include a model, version, and 2048 dimensions' using errcode = '22023';
    end if;
    if active_embedding_model is distinct from p_embedding_model or
       active_embedding_version is distinct from p_embedding_version then
      raise exception 'query embedding model/version does not match the active release' using errcode = '22023';
    end if;
    use_semantic := true;
  elsif p_embedding_model is not null or p_embedding_version is not null then
    raise exception 'embedding model/version requires a query embedding' using errcode = '22023';
  end if;
  if p_match_count is null or p_match_count < 1 or p_match_count > 20 then
    raise exception 'match count must be between 1 and 20' using errcode = '22023';
  end if;
  if p_unit_ids is not null and cardinality(p_unit_ids) > 100 then
    raise exception 'at most 100 UNITIDs may be requested' using errcode = '22023';
  end if;
  safe_query := left(coalesce(p_query_text, ''), 2000);
  if length(btrim(safe_query)) = 0 and p_query_embedding is null then
    raise exception 'query text or embedding is required' using errcode = '22023';
  end if;
  safe_match_count := p_match_count;

  return query
  with active_passages as materialized (
    select passage.release_id, passage.unit_id, catalog.slug as college_slug,
      catalog.name as college_name, catalog.state, catalog.census_region,
      catalog.ownership_code, passage.passage_id, passage.title, passage.content,
      passage.source_id, source.publisher, source.source_name, passage.source_url,
      passage.source_field, passage.field_locator, passage.reporting_year,
      passage.period_label, passage.cohort, passage.definition,
      passage.content_sha256, passage.embedding_model, passage.embedding_version,
      passage.search_vector, passage.embedding
    from public.college_passages as passage
    join public.college_catalog as catalog
      on catalog.unit_id = passage.unit_id and catalog.release_id = passage.release_id
    join public.college_sources as source
      on source.release_id = passage.release_id and source.source_id = passage.source_id
    where passage.release_id = active_release_id
      and (p_unit_ids is null or passage.unit_id = any (p_unit_ids))
  ), lexical as (
    select candidate.passage_id,
      row_number() over (order by pg_catalog.ts_rank_cd(
        candidate.search_vector,
        pg_catalog.websearch_to_tsquery('english'::pg_catalog.regconfig, safe_query)
      ) desc, candidate.passage_id)::integer as lexical_rank
    from active_passages as candidate
    where length(btrim(safe_query)) > 0
      and candidate.search_vector @@ pg_catalog.websearch_to_tsquery(
        'english'::pg_catalog.regconfig, safe_query
      )
    order by pg_catalog.ts_rank_cd(
      candidate.search_vector,
      pg_catalog.websearch_to_tsquery('english'::pg_catalog.regconfig, safe_query)
    ) desc, candidate.passage_id
    limit safe_match_count * 4
  ), semantic as (
    select candidate.passage_id,
      row_number() over (order by candidate.embedding OPERATOR(extensions.<=>) p_query_embedding,
        candidate.passage_id)::integer as semantic_rank
    from active_passages as candidate
    join public.college_passages as stored
      on stored.release_id = candidate.release_id and stored.passage_id = candidate.passage_id
    where use_semantic
      and stored.embedding is not null
      and stored.embedding_model = p_embedding_model
      and stored.embedding_version = p_embedding_version
      and stored.embedding_content_sha256 = stored.content_sha256
    order by candidate.embedding OPERATOR(extensions.<=>) p_query_embedding,
      candidate.passage_id
    limit safe_match_count * 4
  ), fused as (
    select ranked.passage_id,
      max(ranked.lexical_rank)::integer as lexical_rank,
      max(ranked.semantic_rank)::integer as semantic_rank,
      sum(1::numeric / (60 + ranked.rank_value)) as rrf_score
    from (
      select lexical.passage_id, lexical.lexical_rank, null::integer as semantic_rank,
        lexical.lexical_rank as rank_value
      from lexical
      union all
      select semantic.passage_id, null::integer, semantic.semantic_rank,
        semantic.semantic_rank
      from semantic
    ) as ranked
    group by ranked.passage_id
  )
  select active.release_id, active.unit_id, active.college_slug, active.college_name,
    active.state, active.census_region, active.ownership_code, active.passage_id,
    active.title, active.content, active.source_id, active.publisher, active.source_name,
    active.source_url, active.source_field, active.field_locator, active.reporting_year,
    active.period_label, active.cohort, active.definition, active.content_sha256,
    active.embedding_model, active.embedding_version, fused.lexical_rank,
    fused.semantic_rank, fused.rrf_score
  from fused
  join active_passages as active using (passage_id)
  order by fused.rrf_score desc, active.passage_id
  limit safe_match_count;
end;
$$;

create function public.filter_college_facts(
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
  if p_limit is null or p_limit < 1 or p_limit > 100 or p_offset is null or p_offset < 0 or p_offset > 1000 then
    raise exception 'limit or offset is outside the allowed range' using errcode = '22023';
  end if;
  if p_residency_state is not null and p_residency_state !~ '^[A-Z]{2}$' then
    raise exception 'residency state must be a two-letter state code' using errcode = '22023';
  end if;
  if (p_unit_ids is not null and cardinality(p_unit_ids) > 100) or
     (p_states is not null and cardinality(p_states) > 51) or
     (p_ownerships is not null and cardinality(p_ownerships) > 2) or
     (p_major_keys is not null and cardinality(p_major_keys) > 20) then
    raise exception 'candidate filters exceed their bounds' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(coalesce(p_ownerships, '{}'::smallint[])) as x(value) where x.value not in (1, 2)) or
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
              (catalog.ownership_code = 2 and fact.source_field = 'NPT4_PRIV')
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
              (catalog.ownership_code = 2 and (
                fact.comparability_key = 'tuition-fees.private' or
                (fact.source_field = 'TUITIONFEE_OUT' and fact.comparability_key = 'tuition-fees.out-of-state')
              ))
            )
        )
      )
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
  order by candidate.name, candidate.unit_id
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.current_college_knowledge_release() from public, anon, authenticated, service_role;
revoke all on function public.hybrid_search_college_passages(text, extensions.vector, text, text, integer, bigint[], text)
  from public, anon, authenticated, service_role;
revoke all on function public.filter_college_facts(jsonb, text, integer, integer, bigint[], text[], smallint[], text[], text)
  from public, anon, authenticated, service_role;
grant execute on function public.current_college_knowledge_release() to anon, authenticated, service_role;
grant execute on function public.hybrid_search_college_passages(text, extensions.vector, text, text, integer, bigint[], text)
  to anon, authenticated, service_role;
grant execute on function public.filter_college_facts(jsonb, text, integer, integer, bigint[], text[], smallint[], text[], text)
  to anon, authenticated, service_role;
