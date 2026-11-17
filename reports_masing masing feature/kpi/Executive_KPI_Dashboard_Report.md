# FreshGuard — Executive KPI Dashboard
## Data, Methodology, Results and Discussion

> **Scope:** the executive KPI strip and recovery charts (Person 6 front-end, backed by `backend/services/dashboard_service.py`). **No ML model is trained or used here** — the dashboard aggregates outputs produced elsewhere (risk tier, routing decisions, POS sales). It does not affect model training.

---

## 1. Data and Methodology

### 1.1 Data Source

| Input | Path | Role |
|---|---|---|
| Inventory master | `data/processed/inventory_master.json` (58 batches) | live stock + risk tier per batch |
| Event ledger | `data/processed/simulation_events.csv` (2,644 events) | recovery-channel and activity history |
| Transaction log | `data/processed/transactions.json` (19 sales) | realised revenue and units |

### 1.2 Method — aggregation

The dashboard computes its KPIs **client-side from the live batch array** (`DashboardPage.jsx`), so every figure updates the instant a batch is added, edited, sold or deleted:

| KPI | Computation (verified in `DashboardPage.jsx`) |
|---|---|
| `totalAssets` | Σ (unit sell price × batch quantity) — retail valuation of live stock |
| `modal` | Σ (unit cost price × batch quantity) — cost basis of live stock |
| `profit` | `totalAssets − modal` (Realized Profit tile) |
| `activeBatchesCount` | `batches.length` — live FEFO batch count |

A parallel server-side aggregation exists at `GET /api/summary` (`backend/routers/dashboard.py` → `backend/services/dashboard_service.py`), which reads the inventory master (JSON first, CSV fallback) and returns `total_batches`, `total_food_items`, `total_food_rescued`, `total_food_wasted` and `forecast_status`. In that path:

- **At-risk** = batches with `days_to_expiry <= 3` — the same DTE ≤ 3 boundary the rule engine uses as the entry point for markdown, so the KPI and the clearance decisions agree on what "at risk" means.
- **Rescued / wasted** = a **fixed 85 % / 15 % split** of at-risk volume. This is an operational assumption about salvage rate, not a measured outcome.

### 1.3 Presentation layer

| Component | Content |
|---|---|
| `KpiStrip.jsx` | KPI cards — Total Asset Value (RM), Realized Profit (RM, colour-coded ±), Active Batches (FEFO) |
| `ReasonForRecoveryChart.jsx` | donut chart of recovery-channel split (retail sale / markdown / donation / waste) |
| `ProfitDailyChart` / `FoodRescuedTrendChart.jsx` | trend bars for realised profit and rescued food |
| `RecentActivitiesTable.jsx` | unified activity feed (sales, markdown, dispatch) with search + category filter |
| `DashboardHeader.jsx` | store identity and navigation |

The activity feed reads from Supabase `simulation_events` when credentials are present and falls back to the local activity list, so the dashboard renders in both the connected and offline demo configurations.

---

## 2. Results and Discussion

### 2.1 Current KPI snapshot (58 live batches)

| KPI | Value | Derivation |
|---|---|---|
| Active batches (FEFO) | 58 | `batches.length` |
| Total Asset Value | Σ sell price × qty | retail valuation of live stock |
| Realized Profit | Total Asset Value − cost basis | Σ (sell − cost) × qty |
| At-risk volume | batches with DTE ≤ 3 | same boundary as the rule engine |
| Food rescued | 85 % of at-risk volume | fixed salvage assumption |
| Food wasted | 15 % of at-risk volume | fixed salvage assumption |

Live verification of the underlying risk split: of the 58 batches, **42 are scored by the XGBoost spoilage model** (`riskSource: ml_xgboost`) and **16 by the shelf-stable policy** (`policy_shelf_stable`) — so the Critical Batches tile reflects real model output rather than a DTE threshold.

### 2.2 Recovery-channel evidence

From the event ledger (2,644 events), the recovery funnel is:

```
990 received → 990 active_fefo → 332 markdown → 289 dispatched → 43 wasted
```

| Stage | Events | Share of intake |
|---|---:|---:|
| Received | 990 | 100 % |
| Activated (FEFO) | 990 | 100 % |
| Markdown applied | 332 | 33.5 % |
| Dispatched to food bank | 289 | 29.2 % |
| Wasted | 43 | 4.3 % |

**Terminal-loss ratio: 43 wasted vs. 289 dispatched = 13 % of terminal lots were written off.** The operational record shows that proactive markdown and donation absorb the large majority of short-shelf-life volume, and only a small residue is lost.

### 2.3 Findings

1. **The KPI strip is a decision dashboard, not a report.** Every tile maps to an action: Active Batches sizes today's workload, Asset Value at Risk and Realized Profit quantify the exposure, and the recovery funnel shows how much was actually saved.
2. **Risk and recovery are measured on the same population.** Because the at-risk definition (DTE ≤ 3) is shared with the rule engine, the dashboard can never report a rescued-food figure that contradicts the routing decisions that produced it.
3. **The 85/15 split is the weakest link in the chain.** It is an assumption, so the "Food Rescued" figure should be read as *expected* rescue, not measured rescue. The event ledger already contains the ingredients to replace it with an actual figure (332 markdown + 289 dispatched against 43 wasted) — the dashboard simply does not yet aggregate them that way.
4. **The dashboard degrades gracefully.** Supabase-first with local fallback means the executive view renders in a demo environment with no cloud credentials.
5. **Two aggregation paths coexist.** The browser computes financial KPIs client-side from the live batch array, while `GET /api/summary` computes a different set server-side from the master file. Both are correct for their own scope, but an API consumer and the UI can quote different numbers for "rescued food".

### 2.4 Limitations

| Limitation | Status |
|---|---|
| `total_food_rescued` / `total_food_wasted` use a fixed 85/15 assumption instead of the measured event ledger | Open — the ledger already supports a real figure |
| Two KPI aggregation paths (client-side vs `/api/summary`) can report different figures for the same concept | Open — worth a single source of truth |
| Asset Value at Risk does not net off the value already recovered via markdown | Open |
| Transaction history is demo-scale (19 records), so revenue-based KPIs are indicative | Open |

---

## 3. Reproduction

```powershell
curl http://localhost:8000/api/summary          # FastAPI server-side aggregation
# UI path: browser computes KPIs client-side from GET /api/batches
curl http://localhost:5173/api/batches | jq 'length'   # active batch count
```

**Artifacts:** `backend/services/dashboard_service.py` · `backend/routers/dashboard.py` · `frontend/src/components/dashboard/KpiStrip.jsx` · `ReasonForRecoveryChart.jsx` · `FoodRescuedTrendChart.jsx` · `RecentActivitiesTable.jsx`
