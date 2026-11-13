-- =============================================================================
-- Dynamic Food Clearing House Simulator (AIT-201)
-- Supabase Teardown / Reset Script — FOR DEVELOPMENT ONLY
-- Person 4 — Goal 9
-- =============================================================================
-- WARNING: This drops ALL project tables and their data permanently.
--          Use only in development. NEVER run on production.
--
-- Usage: Paste into Supabase SQL Editor and run to reset the schema,
--        then re-run schema.sql to rebuild from scratch.
-- =============================================================================

-- Drop view first (depends on batches)
DROP VIEW  IF EXISTS public.v_dashboard_summary;

-- Drop tables in reverse FK dependency order
DROP TABLE IF EXISTS public.cluster_results    CASCADE;
DROP TABLE IF EXISTS public.dispatch_log       CASCADE;
DROP TABLE IF EXISTS public.simulation_events  CASCADE;
DROP TABLE IF EXISTS public.receivers          CASCADE;
DROP TABLE IF EXISTS public.batches            CASCADE;

