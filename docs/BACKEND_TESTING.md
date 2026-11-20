# Testing the sync without a Supabase account

`scripts/sync-e2e.ts` runs the real sync engine against a throwaway Postgres + PostgREST in Docker, using
the real `supabase/schema.sql`. Each run plays one device (A, B, or a stranger). Not covered: photo upload
(storage), live updates (realtime) and the email sign-in itself.

```bash
# 1. Database with minimal stand-ins for Supabase's auth and storage schemas
docker run -d --name epc-pg -e POSTGRES_PASSWORD=pw -p 54329:5432 postgres:16
docker exec -i epc-pg psql -U postgres -q < scripts/e2e/supabase-stubs.sql
docker exec -i epc-pg psql -U postgres -q -v ON_ERROR_STOP=1 < supabase/schema.sql
docker exec -i epc-pg psql -U postgres -q <<'EOF'
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif((coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb) ->> 'sub', '')::uuid $$;
create role authenticator login password 'pw' noinherit;
grant anon, authenticated to authenticator;
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001','a@x.com'),
  ('bbbbbbbb-0000-0000-0000-000000000002','b@x.com'),('cccccccc-0000-0000-0000-000000000003','c@x.com');
EOF

# 2. REST API (PostgREST) plus a tiny proxy that maps /rest/v1/... like Supabase does
docker run -d --name epc-rest --link epc-pg -p 54330:3000 \
  -e PGRST_DB_URI="postgres://authenticator:pw@epc-pg:5432/postgres" -e PGRST_DB_SCHEMAS=public \
  -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="super-secret-jwt-token-with-at-least-32-characters-long" postgrest/postgrest
node scripts/e2e/rest-proxy.mjs &

# 3. Play the devices in order
A=aaaaaaaa-0000-0000-0000-000000000001; B=bbbbbbbb-0000-0000-0000-000000000002; C=cccccccc-0000-0000-0000-000000000003
scripts/e2e/run-step.sh A1 $A a@x.com   # creates a project, invites B
scripts/e2e/run-step.sh B1 $B b@x.com   # joins, adds a payment
scripts/e2e/run-step.sh A2 $A a@x.com   # fresh device: sees B's payment, edits, deletes
scripts/e2e/run-step.sh B2 $B b@x.com   # sees A's edits
scripts/e2e/run-step.sh X  $C c@x.com   # stranger: sees nothing
```

Expected: B sees A's project after joining, A sees B's payment on a fresh device, edits and deletes reach B,
and the stranger sees nothing.
