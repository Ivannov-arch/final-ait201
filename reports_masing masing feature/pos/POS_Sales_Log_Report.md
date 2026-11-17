# FreshGuard — POS Sales Log Module
## Data, Methodology, Results and Discussion

> **Scope:** the cashier-facing sales log and stock deduction (Person 6 front-end / Person 4 data layer). **No ML model is trained or used here.** This module records realised sales and deducts stock; it does not affect model training.

---

## 1. Data and Methodology

### 1.1 Data Source

| Store | Path | Content |
|---|---|---|
| Transaction log | `data/processed/transactions.json` | 19 sale records, local JSON master |
| Event ledger | `data/processed/simulation_events.csv` | 2,644 events (audit trail) |
| Inventory master | `data/processed/inventory_master.json` | 58 live batches, stock source of truth |

### 1.2 Method — event-sourced transaction recording

**Transaction schema** (as stored): `id, time, date, batchId, product, category, image, unitPrice, unit, qty, discount, discountAmt, subtotal, total, payMethod, cashier, status`.

**ID generation.** `getNextTxnId()` derives the next identifier from the current date plus the highest existing suffix (`TXN-1027`, `TXN-1026`, …), which is collision-free across server reloads and keeps identifiers sortable by time.

**Stock deduction.** A sale writes to three places in one operation:
1. `transactions.json` — the new transaction is upserted by `id`.
2. `inventory_master.json` — the referenced batch's `quantity` is reduced; a batch reaching 0 is **deleted** from the master (automatic dead-stock removal).
3. `simulation_events` (Supabase) — a `markdown`-type event records `batch_id`, quantity, store, payment method and cashier for audit.

**Double-subtraction guard.** The UI reduces the batch quantity once on the client and the server re-reads the authoritative quantity from the master before writing, so a repeated click cannot deduct twice.

### 1.3 API surface

| Endpoint | Method | Behaviour |
|---|---|---|
| `/api/transactions` | GET | read the full log from `transactions.json` |
| `/api/transactions` | POST | create sale → deduct stock → sync event |
| `/api/transactions/:id` | PATCH | update status / details |
| `/api/transactions/:id` | DELETE | remove a record |

All four are served by the Vite middleware (`frontend/vite.config.js`), so the cashier UI runs without a Python terminal. The same data is mirrored to Supabase `simulation_events` with the Service Role Key.

### 1.4 Workflow

```
Cashier selects batch + qty + payment method
        │
        ▼
 POST /api/transactions
        │
        ├─► transactions.json        (upsert by id)
        ├─► inventory_master.json    (quantity − qty; delete if 0)
        └─► Supabase simulation_events (audit record)
        │
        ▼
 Sales Log page refresh  ──► unit filter, status filter, search,
                                revenue / qty / paid-count footer
```

---

## 2. Results and Discussion

### 2.1 Logged activity

| Metric | Value |
|---|---|
| Transactions recorded | 19 |
| Status | 19 paid (100 %) |
| Units sold | 197 |
| Gross revenue | RM 4,928.02 |
| Transactions carrying a discount | 5 |
| Payment methods | Cash 10 · Card 4 · QR / e-Wallet 4 · eWallet 1 |

### 2.2 Event ledger composition (2,644 events)

| Event type | Count | Share |
|---|---:|---:|
| `received` | 990 | 37.4 % |
| `active_fefo` | 990 | 37.4 % |
| `markdown` | 332 | 12.6 % |
| `dispatched` | 289 | 10.9 % |
| `wasted` | 43 | 1.6 % |

The ledger shows the full operational lifecycle of a lot: receipt (`received`), FEFO activation (`active_fefo`), price reduction (`markdown`), physical transfer to a food bank (`dispatched`), and final write-off (`wasted`). The 990 `received` + 990 `active_fefo` pairs correspond exactly to the 990 lots in `lots_base.csv`, confirming the event chain is complete for every intake record. The 43 `wasted` events against 289 `dispatched` events show that dispatch recovers **87 %** of terminal-waste lots — the module's own operating record supports the waste-prevention thesis.

### 2.3 Findings

1. **Every sale is traceable to a lot and a cashier.** The `batchId` link makes FEFO consumption auditable after the fact, which is what makes the FEFO prioritisation defensible rather than aspirational.
2. **Stock never goes negative.** Deducting against the authoritative master (not the client's optimistic copy) plus automatic deletion at zero keeps the inventory table consistent with reality.
3. **Payment mix is captured for reconciliation.** Cash, card and e-wallet are all distinguished in the event metadata, so a store can reconcile its drawer against the rescued-food ledger.
4. **Discounted sales are a minority (5 of 19)**, consistent with the rule engine's design: markdown is the exception for lots with 1–3 days of cover, not the default.

### 2.4 Limitations

| Limitation | Status |
|---|---|
| Transaction log is small (19 records) — demo-scale dataset, not a production history | Open — grows with usage |
| Markdown applied at the POS is recorded as a `markdown` event type; there is no distinct `sale` event type in the ledger, so sale-vs-markdown volume must be separated by event source rather than by type | Open — would benefit from a dedicated `sold` event type |
| No offline write queue: the UI requires the local JSON master to be writable | Open — acceptable for the single-store demo deployment |

---

## 3. Reproduction

```powershell
curl http://localhost:5173/api/transactions
curl -X POST http://localhost:5173/api/transactions -H "Content-Type: application/json" \
  -d '{"id":"TXN-TEST","batchId":"LOT-1000","product":"Test","qty":1,"unitPrice":5,"total":5,"payMethod":"Cash","casher":"Test","status":"paid"}'
curl -X DELETE http://localhost:5173/api/transactions/TXN-TEST
```

**Artifacts:** `frontend/src/components/dashboard/SalesLogPage.jsx` · `frontend/vite.config.js` (`/api/transactions`) · `data/processed/transactions.json` · `data/processed/simulation_events.csv`
