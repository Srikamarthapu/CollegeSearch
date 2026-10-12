-- Adviser search first narrows passages to a bounded release and candidate set.
-- Keep that lookup proportional to the requested campuses as the corpus grows.
create index college_passages_release_unit_idx
  on public.college_passages (release_id, unit_id);
