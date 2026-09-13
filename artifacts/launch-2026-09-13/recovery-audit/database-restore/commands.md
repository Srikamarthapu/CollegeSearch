# Commands executed for this isolated rehearsal

This records the completed run `CSRestoregsg4rkw2`. All its Docker resources and credential/dump files have now been removed. Use a newly generated directory/project ID and regenerate the synthetic fixture/assertion UUIDs for any future rehearsal; this is an execution record, not a command to reconnect to an old database.

The temporary config and copied migrations remain under `supabase/`. The final config kept global public signup disabled, enabled the email/password provider for admin-created confirmed users, and disabled local SMTP. The first setup used a disabled email provider, causing a password-login rejection; only that newly created temporary stack was stopped with the same exact project ID and recreated before the final fixture.

```sh
node /Users/kamarthapusri/.npm/_npx/6f1b058a4d9555af/node_modules/supabase/dist/supabase.js start \
  --workdir /tmp/collegesearch-restore-gsg4rkw2 \
  --exclude realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

# Output was redirected into a private file, never printed.
node /Users/kamarthapusri/.npm/_npx/6f1b058a4d9555af/node_modules/supabase/dist/supabase.js status \
  --workdir /tmp/collegesearch-restore-gsg4rkw2 --output json \
  > /tmp/collegesearch-restore-gsg4rkw2/local-status.json

# Helper asserts exactly http://127.0.0.1:56321 before any API call.
node /tmp/collegesearch-restore-gsg4rkw2/seed-fixture.mjs

docker exec -i supabase_db_CSRestoregsg4rkw2 psql -X -q -A -t \
  -v ON_ERROR_STOP=1 -U supabase_admin -d postgres \
  < /tmp/collegesearch-restore-gsg4rkw2/schema-manifest.sql \
  > /tmp/collegesearch-restore-gsg4rkw2/source-schema-manifest.json

docker exec supabase_db_CSRestoregsg4rkw2 pg_dump -U supabase_admin -d postgres \
  --format=custom --schema=auth --schema=public --schema=private --schema=supabase_migrations \
  > /tmp/collegesearch-restore-gsg4rkw2/checkpoint.dump

node /tmp/collegesearch-restore-gsg4rkw2/seed-fixture.mjs delete-sentinel

docker exec supabase_db_CSRestoregsg4rkw2 createdb -U supabase_admin \
  --template=template0 college_restore_target

docker exec -i supabase_db_CSRestoregsg4rkw2 pg_restore -U supabase_admin \
  --dbname=college_restore_target --single-transaction --exit-on-error --clean --if-exists \
  < /tmp/collegesearch-restore-gsg4rkw2/checkpoint.dump

docker exec -i supabase_db_CSRestoregsg4rkw2 psql -X -q -A -t \
  -v ON_ERROR_STOP=1 -U supabase_admin -d college_restore_target \
  < /tmp/collegesearch-restore-gsg4rkw2/schema-manifest.sql \
  > /tmp/collegesearch-restore-gsg4rkw2/target-schema-manifest.json

# Exact manifest equivalence and expected grants/policies were asserted in Python.
# This file uses only UUIDs created in this run's fixture.
docker exec -i supabase_db_CSRestoregsg4rkw2 psql -X -q -A -t \
  -v ON_ERROR_STOP=1 -U supabase_admin -d college_restore_target \
  < /tmp/collegesearch-restore-gsg4rkw2/assert-restored.sql \
  > /tmp/collegesearch-restore-gsg4rkw2/assertions.log

node /Users/kamarthapusri/.npm/_npx/6f1b058a4d9555af/node_modules/supabase/dist/supabase.js stop \
  --project-id CSRestoregsg4rkw2 --workdir /tmp/collegesearch-restore-gsg4rkw2 --no-backup
```

Before and after inventories used `docker ps -a --format '{{.ID}}\t{{.Names}}'`, `docker volume ls --format '{{.Name}}'` and `docker network ls --format '{{.ID}}\t{{.Name}}'`. Exact original container/network identities and all volume names remained present. There are no remaining run-named resources. Only known private files inside this run directory were unlinked after checks; no global prune or `stop --all` was used.
