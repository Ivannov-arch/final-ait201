-- =============================================================================
-- Dynamic Food Clearing House Simulator (AIT-201)
-- Supabase PostgreSQL Database Schema DDL
-- Person 4 — Business Logic & Cloud Database Specialist (Goal 9)
-- =============================================================================
-- INSTRUCTIONS (Supabase SQL Editor):
--   1. Open your Supabase project → SQL Editor → New Query
--   2. Paste this entire file and click Run
--   3. Verify in Table Editor: 5 tables + 1 view should appear
--
-- UPGRADE STRATEGY:
--   Upgrade-phase columns are created NOW with DEFAULT NULL.
--   This eliminates the need for ALTER TABLE migrations later.
-- =============================================================================

-- Enable UUID extension (safe to run even if already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 1. TABLE: batches
--    Primary store of all inventory lots (input from lots_base.csv / ETL pipeline).
--    Columns from rule_engine.py output are stored alongside raw lot metadata.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.batches (
    -- Identity
    batch_id            VARCHAR(32)     PRIMARY KEY,
    product_id          VARCHAR(32)     NOT NULL,
    product_name        VARCHAR(128),

    -- Classification
    category            VARCHAR(64)     NOT NULL,
    canonical_category  VARCHAR(64),                  -- from canonical_batch_table

    -- Stock Info
    quantity            NUMERIC(10, 2)  NOT NULL CHECK (quantity >= 0),
    uom                 VARCHAR(16)     DEFAULT 'unit',
    expiry_date         DATE            NOT NULL,
    date_received       DATE,
    shelf_life_days     INTEGER,
    days_to_expiry      INTEGER,
    turnover_ratio      NUMERIC(6, 2),
    stock_pressure      NUMERIC(6, 2),
    reorder_level       INTEGER,

    -- Pricing
    unit_price_myr      NUMERIC(8, 2)   NOT NULL CHECK (unit_price_myr >= 0),

    -- Location
    store_id            VARCHAR(32)     NOT NULL,

    -- ML Risk Label (Person 1 — spoilage_classifier.pkl)
    risk_label          VARCHAR(16)     DEFAULT 'LOW',  -- 'LOW', 'MODERATE', 'HIGH'

    -- Rule Engine Output (Person 4 — rule_engine.py)
    recommended_route       VARCHAR(32)     DEFAULT 'Normal Sale',
                                            -- 'Normal Sale', 'Dynamic Markdown', 'Donation'
    discount_percent        NUMERIC(5, 4)   DEFAULT 0.0000,
    discounted_price_myr    NUMERIC(8, 2),
    expected_value_myr      NUMERIC(12, 2),
    channel                 VARCHAR(32)     DEFAULT 'retail', -- 'retail' | 'closed_ngo'
    moral_hazard_flag       BOOLEAN         DEFAULT FALSE,

    -- Metadata
    created_at          TIMESTAMPTZ     DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     DEFAULT NOW(),

    -- -------------------------------------------------------------------------
    -- UPGRADE PHASE PLACEHOLDERS — created now as NULL; populated in Phase 2
    -- -------------------------------------------------------------------------
    waste_risk_score    NUMERIC(5, 4)   DEFAULT NULL,   -- Person 5: waste_risk_model.pkl (0.0–1.0)
    receiver_id         VARCHAR(64)     DEFAULT NULL,   -- Person 5: assigned food bank ID
    market_price_myr    NUMERIC(8, 2)   DEFAULT NULL,   -- Person 0: DOSM PriceCatcher lookup
    demand_forecast_3d  NUMERIC(10, 2)  DEFAULT NULL    -- Person 2: demand_forecast.pkl
);

-- Indexes for common dashboard query patterns
CREATE INDEX IF NOT EXISTS idx_batches_store_expiry
    ON public.batches(store_id, expiry_date ASC);
CREATE INDEX IF NOT EXISTS idx_batches_risk_route
    ON public.batches(risk_label, recommended_route);
CREATE INDEX IF NOT EXISTS idx_batches_dte
    ON public.batches(days_to_expiry ASC);


-- =============================================================================
-- 2. TABLE: simulation_events
--    Discrete-event simulator audit log produced by simulator_engine.py (Person 3).
--    FK to batches is DEFERRABLE so events can be loaded before batch upserts settle.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.simulation_events (
    event_id    VARCHAR(64)     PRIMARY KEY,
    batch_id    VARCHAR(32)     NOT NULL
                    REFERENCES public.batches(batch_id)
                    ON DELETE CASCADE
                    DEFERRABLE INITIALLY DEFERRED,
    store_id    VARCHAR(32)     NOT NULL,
    event_type  VARCHAR(32)     NOT NULL,
                -- 'received' | 'active_fefo' | 'markdown' | 'dispatched' | 'wasted'
    timestamp   TIMESTAMPTZ     NOT NULL,
    quantity    NUMERIC(10, 2)  NOT NULL CHECK (quantity >= 0),
    metadata    JSONB           DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sim_events_batch
    ON public.simulation_events(batch_id);
CREATE INDEX IF NOT EXISTS idx_sim_events_type_time
    ON public.simulation_events(event_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_sim_events_store_time
    ON public.simulation_events(store_id, timestamp DESC);


-- =============================================================================
-- 3. TABLE: receivers
--    Directory of food banks, NGOs, soup kitchens, and partner charities
--    in Lembah Klang (Kuala Lumpur & Selangor). Populated by Person 5.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.receivers (
    receiver_id         VARCHAR(64)     PRIMARY KEY,
    name                VARCHAR(128)    NOT NULL,
    type                VARCHAR(64)     DEFAULT 'food_bank',
                        -- 'food_bank' | 'soup_kitchen' | 'shelter' | 'ngo' | 'compost_facility'
    address             TEXT,
    lat                 NUMERIC(10, 7)  NOT NULL,
    lng                 NUMERIC(10, 7)  NOT NULL,

    -- Capacity Management
    capacity            NUMERIC(10, 2)  NOT NULL CHECK (capacity >= 0),
    current_occupancy   NUMERIC(10, 2)  DEFAULT 0.00,
    acceptance_rate     NUMERIC(5, 2)   DEFAULT 1.00 CHECK (acceptance_rate BETWEEN 0 AND 1),

    -- Food Category Filtering
    accepted_categories TEXT[]          DEFAULT ARRAY['Produce', 'Bakery', 'Pantry', 'Dairy'],

    -- Operational Status
    is_active           BOOLEAN         DEFAULT TRUE,
    created_at          TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receivers_active
    ON public.receivers(is_active);


-- =============================================================================
-- 4. TABLE: dispatch_log
--    Logistics audit trail: surplus lots dispatched to food banks.
--    Populated by Person 5's OSRM routing engine.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.dispatch_log (
    dispatch_id         VARCHAR(64)     PRIMARY KEY,
    batch_id            VARCHAR(32)     NOT NULL
                            REFERENCES public.batches(batch_id)
                            ON DELETE CASCADE,
    receiver_id         VARCHAR(64)     NOT NULL
                            REFERENCES public.receivers(receiver_id)
                            ON DELETE RESTRICT,
    store_id            VARCHAR(32)     NOT NULL,

    -- OSRM Route Data (Person 5)
    distance_km         NUMERIC(8, 2),
    eta_hours           NUMERIC(6, 2),
    pickup_time         TIMESTAMPTZ,
    geometry_geojson    JSONB           DEFAULT NULL,   -- Full OSRM polyline coordinates

    -- Status Lifecycle
    status              VARCHAR(32)     DEFAULT 'SCHEDULED',
                        -- 'SCHEDULED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED'

    created_at          TIMESTAMPTZ     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_status
    ON public.dispatch_log(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_batch
    ON public.dispatch_log(batch_id);


-- =============================================================================
-- 5. TABLE: cluster_results
--    K-Means store/product segmentation output (Goal 8 — Person 5 Stretch Goal).
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cluster_results (
    result_id       BIGSERIAL       PRIMARY KEY,
    entity_type     VARCHAR(32)     NOT NULL,   -- 'store' | 'product_category'
    entity_id       VARCHAR(64)     NOT NULL,
    cluster_label   VARCHAR(64)     NOT NULL,
    waste_rate      NUMERIC(6, 4),              -- fraction of stock wasted (0.0–1.0)
    velocity        NUMERIC(6, 2),              -- avg turnover speed
    run_date        DATE            DEFAULT CURRENT_DATE
);

CREATE INDEX IF NOT EXISTS idx_cluster_entity
    ON public.cluster_results(entity_type, entity_id);


-- =============================================================================
-- 6. VIEW: v_dashboard_summary
--    Aggregated executive KPI view — consumed by FastAPI /api/dashboard/summary
--    and directly by the React frontend dashboard (Person 6).
-- =============================================================================
CREATE OR REPLACE VIEW public.v_dashboard_summary AS
SELECT
    -- Volume KPIs
    COUNT(*)                                                        AS total_batches,
    COALESCE(SUM(quantity), 0)                                      AS total_inventory_qty,
    COALESCE(SUM(quantity * unit_price_myr), 0)                     AS total_inventory_value_myr,

    -- Risk KPIs
    COUNT(*) FILTER (WHERE days_to_expiry <= 2 OR risk_label = 'HIGH')
                                                                    AS critical_batches,
    COALESCE(SUM(quantity * unit_price_myr)
        FILTER (WHERE days_to_expiry <= 2), 0)                      AS at_risk_value_myr,

    -- Clearance Route Distribution
    COUNT(*) FILTER (WHERE recommended_route = 'Normal Sale')       AS normal_sale_batches,
    COUNT(*) FILTER (WHERE recommended_route = 'Dynamic Markdown')  AS markdown_batches,
    COUNT(*) FILTER (WHERE recommended_route = 'Donation')          AS donation_batches,

    -- Waste Prevention (salvaged kilograms)
    COALESCE(SUM(quantity)
        FILTER (WHERE recommended_route IN ('Dynamic Markdown', 'Donation')), 0)
                                                                    AS salvaged_kg,

    -- Revenue
    COALESCE(SUM(expected_value_myr), 0)                            AS total_expected_revenue_myr,

    -- Anti-Moral-Hazard Metrics
    COUNT(*) FILTER (WHERE moral_hazard_flag = TRUE)                AS moral_hazard_redirects

FROM public.batches;


-- =============================================================================
-- 7. ROW LEVEL SECURITY (RLS)
--    Public dashboard: SELECT only (anon role).
--    ETL scripts & Admin panel: full write access (service_role / authenticated).
-- =============================================================================

ALTER TABLE public.batches           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_log      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cluster_results   ENABLE ROW LEVEL SECURITY;

-- Public read-only (anon key — safe for frontend dashboard)
CREATE POLICY "anon_read_batches"
    ON public.batches FOR SELECT USING (true);
CREATE POLICY "anon_read_simulation_events"
    ON public.simulation_events FOR SELECT USING (true);
CREATE POLICY "anon_read_receivers"
    ON public.receivers FOR SELECT USING (true);
CREATE POLICY "anon_read_dispatch_log"
    ON public.dispatch_log FOR SELECT USING (true);
CREATE POLICY "anon_read_cluster_results"
    ON public.cluster_results FOR SELECT USING (true);

-- Full write access for authenticated users & service role (ETL / Admin)
CREATE POLICY "auth_write_batches"
    ON public.batches FOR ALL
    USING (auth.role() IN ('service_role', 'authenticated'));
CREATE POLICY "auth_write_simulation_events"
    ON public.simulation_events FOR ALL
    USING (auth.role() IN ('service_role', 'authenticated'));
CREATE POLICY "auth_write_receivers"
    ON public.receivers FOR ALL
    USING (auth.role() IN ('service_role', 'authenticated'));
CREATE POLICY "auth_write_dispatch_log"
    ON public.dispatch_log FOR ALL
    USING (auth.role() IN ('service_role', 'authenticated'));
CREATE POLICY "auth_write_cluster_results"
    ON public.cluster_results FOR ALL
    USING (auth.role() IN ('service_role', 'authenticated'));
