# Socrates

Real app foundation for the concept-network learning platform.

## What this includes
- Next.js app structure
- Supabase database schema
- Concept pages
- Creator Studio starter
- Concept relationships
- Learning objects
- Mastery and review attempts tables

## Setup
1. Create a Supabase project.
2. Open Supabase SQL Editor and run `supabase/schema.sql`.
3. Run `supabase/002_flexible_taxonomy.sql`.
4. Run `supabase/003_mvp_schema_stabilization.sql`.
5. Copy `.env.example` to `.env.local`.
6. Fill in your Supabase URL and anon key.
7. Run:

```bash
npm install
npm run dev
```

Open http://localhost:3000

After the first administrator logs in, bootstrap that account once in the
Supabase SQL Editor:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from auth.users where email = 'admin@example.com'
on conflict (user_id) do update set role = excluded.role, updated_at = now();
```

Replace `admin@example.com` with the administrator's email. Subsequent role
changes can be made through the app. New users default to `learner`; approved
domain configuration is intentionally deferred beyond MVP stabilization.

## Notes
This is the architecture foundation, not the final polished UI. The next step is wiring authentication and creator permissions.


## Flexible taxonomy upgrade

Run `supabase/002_flexible_taxonomy.sql` after `supabase/schema.sql`, then run
`supabase/003_mvp_schema_stabilization.sql`.

This adds user-editable category trees, nested category nodes, labels, and many-to-many concept placements so one concept can appear under multiple libraries/topics at the same time.
