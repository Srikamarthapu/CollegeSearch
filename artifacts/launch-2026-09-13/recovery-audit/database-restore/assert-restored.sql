-- All UUIDs below are generated synthetic fixture identities in the disposable restored database.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"7a6c88f9-b848-40eb-8618-215d428edd37","session_id":"78845f95-4132-4f66-be3f-a06bcc68b1f2","role":"authenticated","is_anonymous":false}',true) IS NOT NULL AS fixture_claims_set;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.account_session_active() IS DISTINCT FROM true THEN RAISE EXCEPTION 'A active session not restored'; END IF;
 IF (SELECT array_agg(unit_id order by unit_id) FROM public.saved_colleges) IS DISTINCT FROM ARRAY[110635,110653]::bigint[] THEN RAISE EXCEPTION 'A ownership read failed'; END IF;
 INSERT INTO public.saved_colleges(user_id,unit_id) VALUES ('7a6c88f9-b848-40eb-8618-215d428edd37',110644);
 IF (SELECT count(*) FROM public.saved_colleges)<>3 THEN RAISE EXCEPTION 'A own insert failed'; END IF;
 DELETE FROM public.saved_colleges WHERE user_id='7a6c88f9-b848-40eb-8618-215d428edd37' AND unit_id=110644;
 IF (SELECT count(*) FROM public.saved_colleges)<>2 THEN RAISE EXCEPTION 'A own delete failed'; END IF;
 BEGIN
  INSERT INTO public.saved_colleges(user_id,unit_id) VALUES ('bacd5728-da2c-493a-9295-deae7938c7fb',110662);
  RAISE EXCEPTION 'cross-owner insert unexpectedly succeeded';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 DELETE FROM public.saved_colleges WHERE user_id='bacd5728-da2c-493a-9295-deae7938c7fb';
 IF FOUND THEN RAISE EXCEPTION 'cross-owner delete returned a row'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN IF (SELECT count(*) FROM public.saved_colleges WHERE user_id='bacd5728-da2c-493a-9295-deae7938c7fb')<>1 THEN RAISE EXCEPTION 'B row changed'; END IF; END $$;
SELECT jsonb_build_object('case','owner_a_read_write_and_cross_owner_denial','status','passed');
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"bacd5728-da2c-493a-9295-deae7938c7fb","session_id":"b3c886fe-0f93-4c38-a0e6-3a17ecaec5b2","role":"authenticated","is_anonymous":false}',true) IS NOT NULL;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF (SELECT array_agg(unit_id order by unit_id) FROM public.saved_colleges) IS DISTINCT FROM ARRAY[110644]::bigint[] THEN RAISE EXCEPTION 'B ownership read failed'; END IF;
END $$;
RESET ROLE;
SELECT jsonb_build_object('case','owner_b_isolation','status','passed');
ROLLBACK;
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"7a6c88f9-b848-40eb-8618-215d428edd37","session_id":"78845f95-4132-4f66-be3f-a06bcc68b1f2","role":"authenticated","is_anonymous":true}',true) IS NOT NULL;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.account_session_active() IS DISTINCT FROM false THEN RAISE EXCEPTION 'anonymous identity accepted active session'; END IF;
 IF (SELECT count(*) FROM public.saved_colleges)<>0 THEN RAISE EXCEPTION 'anonymous identity read data'; END IF;
 BEGIN
  INSERT INTO public.saved_colleges(user_id,unit_id) VALUES ('7a6c88f9-b848-40eb-8618-215d428edd37',110644);
  RAISE EXCEPTION 'anonymous identity wrote data';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT jsonb_build_object('case','anonymous_jwt_claim_denied','status','passed');
ROLLBACK;
BEGIN;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN
  PERFORM 1 FROM public.saved_colleges;
  RAISE EXCEPTION 'anon table grant unexpectedly present';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.account_session_active();
  RAISE EXCEPTION 'anon RPC grant unexpectedly present';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT jsonb_build_object('case','anon_role_table_and_rpc_denied','status','passed');
ROLLBACK;
-- Revoke only A's restored synthetic session; rows must survive this operation.
DELETE FROM auth.sessions WHERE id='78845f95-4132-4f66-be3f-a06bcc68b1f2' AND user_id='7a6c88f9-b848-40eb-8618-215d428edd37';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.saved_colleges WHERE user_id='7a6c88f9-b848-40eb-8618-215d428edd37')<>2 THEN RAISE EXCEPTION 'session revoke deleted saved rows'; END IF;
END $$;
BEGIN;
SELECT set_config('request.jwt.claims','{"sub":"7a6c88f9-b848-40eb-8618-215d428edd37","session_id":"78845f95-4132-4f66-be3f-a06bcc68b1f2","role":"authenticated","is_anonymous":false}',true) IS NOT NULL;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF public.account_session_active() IS DISTINCT FROM false THEN RAISE EXCEPTION 'revoked session still active'; END IF;
 IF (SELECT count(*) FROM public.saved_colleges)<>0 THEN RAISE EXCEPTION 'revoked session reads rows'; END IF;
 DELETE FROM public.saved_colleges WHERE user_id='7a6c88f9-b848-40eb-8618-215d428edd37';
 IF FOUND THEN RAISE EXCEPTION 'revoked session removed a row'; END IF;
 BEGIN
  INSERT INTO public.saved_colleges(user_id,unit_id) VALUES ('7a6c88f9-b848-40eb-8618-215d428edd37',110644);
  RAISE EXCEPTION 'revoked session inserted a row';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT jsonb_build_object('case','restored_session_revocation_denies_read_write','status','passed');
ROLLBACK;
-- Reconcile the exact user deleted after checkpoint, before any target Auth service exists.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id='a465c0c8-1d6f-458f-8373-75c3a8ad3c3f') THEN RAISE EXCEPTION 'checkpoint did not reproduce deleted-user risk'; END IF;
END $$;
DELETE FROM auth.users WHERE id='a465c0c8-1d6f-458f-8373-75c3a8ad3c3f';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM auth.users WHERE id='a465c0c8-1d6f-458f-8373-75c3a8ad3c3f') OR EXISTS(SELECT 1 FROM auth.sessions WHERE user_id='a465c0c8-1d6f-458f-8373-75c3a8ad3c3f') OR EXISTS(SELECT 1 FROM public.saved_colleges WHERE user_id='a465c0c8-1d6f-458f-8373-75c3a8ad3c3f') THEN RAISE EXCEPTION 'deletion reconciliation did not cascade'; END IF;
 IF (SELECT count(*) FROM auth.users)<>2 OR (SELECT count(*) FROM public.saved_colleges)<>3 THEN RAISE EXCEPTION 'reconciliation affected unrelated synthetic users'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id='b3c886fe-0f93-4c38-a0e6-3a17ecaec5b2') THEN RAISE EXCEPTION 'B session was altered'; END IF;
END $$;
SELECT jsonb_build_object('case','post_checkpoint_deletion_reconciled_exactly','status','passed');
SELECT jsonb_build_object('case','final_counts','users',(select count(*) from auth.users),'sessions',(select count(*) from auth.sessions),'savedRows',(select count(*) from public.saved_colleges));
