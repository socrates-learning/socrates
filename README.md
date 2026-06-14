# Pharm Mastery Alpha

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
3. Copy `.env.example` to `.env.local`.
4. Fill in your Supabase URL and anon key.
5. Run:

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Notes
This is the architecture foundation, not the final polished UI. The next step is wiring authentication and creator permissions.


## Flexible taxonomy upgrade

Run `supabase/002_flexible_taxonomy.sql` after `supabase/schema.sql`.

This adds user-editable category trees, nested category nodes, labels, and many-to-many concept placements so one concept can appear under multiple libraries/topics at the same time.
