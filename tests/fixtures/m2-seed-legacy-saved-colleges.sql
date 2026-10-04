-- Test fixture for the isolated M2 database clone only.
-- Seeds existing-account sessions and saves before the additive catalog migration.
\set ON_ERROR_STOP on

BEGIN;

INSERT INTO auth.users(id)
VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.sessions(id, user_id)
VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002')
ON CONFLICT (id) DO NOTHING;

SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","session_id":"20000000-0000-4000-8000-000000000001","is_anonymous":false}',
  true
);
INSERT INTO public.saved_colleges(user_id, unit_id)
VALUES
  ('10000000-0000-4000-8000-000000000001', 110635),
  ('10000000-0000-4000-8000-000000000001', 110644)
ON CONFLICT (user_id, unit_id) DO NOTHING;

SELECT set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000002","session_id":"20000000-0000-4000-8000-000000000002","is_anonymous":false}',
  true
);
INSERT INTO public.saved_colleges(user_id, unit_id)
VALUES ('10000000-0000-4000-8000-000000000002', 110671)
ON CONFLICT (user_id, unit_id) DO NOTHING;
RESET ROLE;

COMMIT;

DO $$
BEGIN
  IF (SELECT count(*) FROM auth.users WHERE id IN (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002'
  )) <> 2 THEN
    RAISE EXCEPTION 'M2 legacy seed did not preserve both synthetic accounts';
  END IF;
  IF (SELECT count(*) FROM auth.sessions WHERE id IN (
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002'
  )) <> 2 THEN
    RAISE EXCEPTION 'M2 legacy seed did not preserve both synthetic sessions';
  END IF;
  IF (SELECT count(*) FROM public.saved_colleges WHERE user_id IN (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002'
  )) <> 3 THEN
    RAISE EXCEPTION 'M2 legacy seed did not create the three expected saved-college rows';
  END IF;
END $$;

SELECT 'PASS: seeded two existing synthetic accounts, two sessions, and three legacy saved-college rows before M2 migration' AS result;
