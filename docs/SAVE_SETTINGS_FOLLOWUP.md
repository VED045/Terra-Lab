# Save, settings and Supabase follow-up

The reported `Invalid UUID` save error came from early Phase 1 text project IDs. Legacy v1 IDs are now migrated deterministically when opening, listing or saving projects. Network geometry and settings are preserved. Invalid individual records cannot block other saves and are retained; unreadable storage indexes are backed up before recovery.

The command-bar settings button now opens a real Workspace settings dialog on desktop and mobile. Simulation controls are shared with the inspector. The separate properties button also opens/closes the desktop inspector or mobile drawer, and the inspector settings icon selects simulation controls.

Supabase project `rkhtwvsryzldikzfwrbj` is configured using the supplied public URL and publishable key in ignored `apps/web/.env.local`. The key is not committed. Legacy anon-key configurations remain supported.

Read-only live checks: `/auth/v1/settings` returned 200; email registration is enabled and email confirmation is required. `/rest/v1/projects` returned 404/PGRST205: `public.projects` is not present. Cloud save/read and Storage validation remain pending the database migration and an authenticated user session.

Apply `supabase/migrations/202610200001_projects.sql` in the Terra-Lab project's Supabase SQL Editor. An identical setup script is provided in the chat outputs. No database password, service-role key or secret key is needed. Then register/sign in through TerraLab and test a cloud save.

Verification: 61 unit tests pass, strict TypeScript passes, and the production build passes. New UI regression coverage was added to Playwright but was not executed in this follow-up because access to the existing in-app browser tab was blocked by browser policy. Earlier Phase 1 browser results are historical, not proof of this change's UI verification.

Refresh the application after the update. If the running server has not reloaded the new environment, restart `npm run dev` and refresh. Do not clear browser storage; legacy projects are migrated in place.
