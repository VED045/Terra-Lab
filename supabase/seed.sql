-- Safe seed: no fake users, password credentials, public research, or anonymous access.
-- Four deterministic starter networks are seeded client-side by packages/shared/src/templates.ts.
-- Create real users through Auth, then save those templates using save_research_project.
select 'TerraLab seed ready: create an authenticated project from a starter network' as status;
