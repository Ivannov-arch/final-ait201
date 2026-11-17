# FreshGuard — Dynamic Markdown & Clearance Rule Engine
## Data, Methodology, Results and Discussion

> **Scope:** the business-rule decision layer (Person 4). **No ML model is trained or used here** — this module consumes the outputs of the forecasting and spoilage models and applies deterministic business policy. It does not affect model training in any way.

---

## 1. Data and Methodology

### 1.1 Data Source

| Input | Path | Role |
|---|---|---|
| Lot master | `data/processed/lots_base.csv` (990 lots × 13 cols) | inventory subject to clearance |
| Routed output | `data/processed/lots_routed.csv` (990 lots × 20 cols) | engine output with decisions |
| Event ledger | `data/processed/simulation_events.csv` (2,644 events) | audit trail of every action |

Lot-level inputs consumed by the engine: `days_to_expiry`, `quantity`, `unit_price_myr`, `store_id`, and the 3-day demand forecast (`demand_forecast_3d` when present, otherwise a caller-supplied fallback).

### 1.2 Method — deterministic decision tree

`src/engine/rule_engine.py` exposes `assign_route(...)` (single lot) and `evaluate_lot_dataframe(df)` (bulk, FEFO-sorted per store).

**Policy constants**

| Constant | Value | Meaning |
|---|---:|---|
| `DONATION_QUOTA_CAP` | 0.30 | max 30 % of a store's surplus volume may be donated |
| `MARKDOWN_AGGRESSIVE` | 0.50 | discount used when the donation cap is already filled |
| `DONATION_CHANNEL` | `closed_ngo` | donations never surface on retail shelves |
| `MARKDOWN_TIERS` | DTE 3 → 15 %, DTE 2 → 25 %, DTE 1 → 40 % | tiered clearance schedule |

**Decision tree**

```
DTE ≤ 1 ──► donation quota open? ──yes──► Donation (channel closed_ngo, value 0)
                    │
                   no
                    ▼
        Dynamic Markdown 50 %  (moral_hazard_flag = true)

1 < DTE ≤ 3 ─────────────────────────► Dynamic Markdown (15 % / 25 % by tier)

DTE > 3 ──► surplus (qty > demand)? ──yes──► Dynamic Markdown 15 % (early clearance)
                    │
                   no
                    ▼
                                        Normal Sale (full price)
```

**Anti-moral-hazard mechanism.** The 30 % cap is enforced *cumulatively per store*: `evaluate_lot_dataframe` sorts lots by ascending DTE (nearest expiry gets quota priority), computes each store's total surplus volume, and accumulates donated volume as it walks the lots. A lot that would breach the cap is redirected to 50 % markdown with `moral_hazard_flag = true`, protecting retail revenue while guaranteeing donated stock reaches a food bank rather than being discounted away on the shelf.

### 1.3 Deployment — dual implementation with contract parity

The same policy is implemented twice, deliberately:

| Implementation | File | Consumers |
|---|---|---|
| Python (canonical) | `src/engine/rule_engine.py` | `backend/routers/recommend.py`, batch evaluation scripts |
| Node port (Vite BFF) | `frontend/vite.config.js` → `POST /api/recommend` | browser runtime (`npm run dev`, no Python terminal needed) |

Both use identical constants and the same tree, so the browser and the API return the same decision for the same lot. The Node port is annotated `source: "rule-engine-v1"`.

### 1.4 Workflow

```
lots_base.csv (990 lots)
        │
        ▼
 evaluate_lot_dataframe()  ── sort by DTE asc (FEFO quota priority)
        │                    ── group by store, compute surplus volume
        ▼
 assign_route() per lot     ── cumulative donation tracker per store
        │
        ▼
 lots_routed.csv  ── recommended_route, discount_percent, discounted_price_myr,
        │              expected_value_myr, channel, moral_hazard_flag, reason
        ▼
 Frontend action modal → Supabase sync (batches.discount_percent,
                             recommended_route, expected_value_myr) + simulation_events
```

---

## 2. Results and Discussion

### 2.1 Routing outcome on the full lot base (990 lots)

| Route | Lots | Share | Mean discount | Channel |
|---|---:|---:|---:|---|
| Normal Sale | 741 | 74.8 % | 0 % | retail |
| Dynamic Markdown | 166 | 16.8 % | 20 % | retail |
| Donation | 83 | 8.4 % | 100 % (value surrendered) | closed_ngo |
| **Total** | **990** | 100 % | | |

**Realised expected value across the routed base: RM 1,312,200.96.**

**Interpretation.** Roughly three-quarters of inventory has enough shelf life and sufficient demand to sell at full price — the engine's job is to protect that revenue, not to discount it. The 16.8 % markdown tier absorbs lots with 1–3 days of cover or a surplus/velocity imbalance, at an average 20 % discount (the blend of the 15 %, 25 % and 40 % tiers). The 8.4 % donation tier is deliberately the smallest group: those are lots that would be written off anyway, so surrendering their value costs nothing and saves the food.

### 2.2 Anti-moral-hazard behaviour

**Zero `moral_hazard_flag` events** were raised across all 990 lots — the 83 donations (8.4 %) stayed within the 30 % quota in this dataset. The cap's redirect path (50 % markdown) is therefore implemented and reachable but not triggered here. It fires when donation demand exceeds 30 % of a store's surplus volume, which occurs when many critical lots expire simultaneously — the case the mechanism exists for.

### 2.3 Scenario verification of the policy

| Scenario | Route | Discount | Moral hazard | Reason code |
|---|---|---:|---|---|
| DTE 1, quota open | Donation | 100 % | false | imminent expiry, closed NGO transfer |
| DTE 1, quota full | Dynamic Markdown | 50 % | **true** | quota filled, revenue protected |
| DTE 2 | Dynamic Markdown | 25 % | false | tiered markdown |
| DTE 3 | Dynamic Markdown | 15 % | false | tiered markdown |
| DTE 5, surplus | Dynamic Markdown | 15 % | false | early clearance to rebalance velocity |
| DTE 5, demand healthy | Normal Sale | 0 % | false | full-price sale |

Every decision carries a human-readable `reason` string that is rendered in the UI decision modal, so the operator can see the rationale rather than an unexplained discount.

### 2.4 Findings

1. **The engine is a value-protection layer, not a discount layer.** Its largest output group (74.8 %) is "do nothing" — which is the correct commercial behaviour when expiry and demand are healthy.
2. **Donation is deliberately rationed to 8.4 % of lots.** A system that donated every expiring lot would inflate its "food rescued" metric while destroying revenue and creating moral hazard; the 30 % cap keeps donation meaningful.
3. **Tiered markdown (15/25/40 %) aligns discount depth with urgency.** A single flat markdown rate would either over-discount fresh lots or under-discount critical ones.
4. **The policy is auditable end-to-end.** Every decision produces a route, a discount, an expected value, a channel and a written reason, and it is written to both the local JSON master and the Supabase `batches` table alongside a `simulation_events` audit record.

### 2.5 Limitations

| Limitation | Status |
|---|---|
| DOSM PriceCatcher commodity prices are present in `data/processed/11_pricecatcher_cleaned.csv` but **not consumed** by `assign_route` — markdown tiers are fixed percentages, not commodity-price-derived | Open — the data pipeline exists, the pricing rule does not |
| Discount tiers are fixed constants, not calibrated against sell-through history | Open |
| The rule engine reads the 3-day demand forecast but the forecast is advisory-grade (2017 origin) — a margin decision taken on it inherits that caveat | Documented; auto-PO remains locked |
| Dual Python/Node implementation must be kept in sync manually | Mitigated by identical constants and the `rule-engine-v1` source tag |

---

## 3. Reproduction

```powershell
python src/engine/evaluate_inventory.py --input data/processed/lots_base.csv \
                                         --output data/processed/lots_routed.csv
curl -X POST http://localhost:5173/api/recommend -H "Content-Type: application/json" \
  -d '{"days_to_expiry":2,"quantity":50,"unit_price_myr":20.47,"demand_forecast_3d":30}'
```

**Artifacts:** `src/engine/rule_engine.py` · `src/engine/evaluate_inventory.py` · `data/processed/lots_base.csv` · `data/processed/lots_routed.csv` · `frontend/vite.config.js` (`POST /api/recommend`) · `backend/routers/recommend.py`
