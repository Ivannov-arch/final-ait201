import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'

const DATA_DIR       = path.resolve(__dirname, '../data/processed')
const MASTER_JSON    = path.join(DATA_DIR, 'inventory_master.json')
const TXNS_JSON      = path.join(DATA_DIR, 'transactions.json')
const FORECAST_JSON  = path.join(DATA_DIR, 'three_day_forecast.json')
const SHARED_MAP_JSON = path.resolve(__dirname, '../shared/category_map.json')

// ── JSON Helpers ──────────────────────────────────────────────────────────────
function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (_) {
    return []
  }
}

function writeJson(p, data) {
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true })
  } catch (_) {}
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
}

// ── Match batch IDs flexibly across CAN-XXXX and LOT-XXXX (BUG-INV-01 fix) ──
function matchBatchId(recId, searchId) {
  if (!recId || !searchId) return false
  const r = String(recId).trim().toUpperCase()
  const s = String(searchId).trim().toUpperCase()
  if (r === s) return true
  const nr = r.replace(/\D/g, '')
  const ns = s.replace(/\D/g, '')
  return Boolean(nr && ns && nr === ns)
}

function collectBody(req) {
  return new Promise((resolve, reject) => {
    let b = ''
    req.on('data', c => { b += c })
    req.on('end', () => {
      try { resolve(JSON.parse(b)) }
      catch (e) { reject(e) }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

// ── Calendar feature derivation (ISSUE-06 fix) ───────────────────────────────
// Training convention (7_perishable_goods_cleaned.csv): day_of_week follows
// pandas .dt.dayofweek → Monday=0 … Sunday=6, is_weekend=1 only on Sat/Sun,
// month = 1–12. Features are derived from date_received so the model sees the
// same calendar features at inference time as it did during training.
function parseLotDate(v) {
  if (!v) return null
  const s = String(v).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const d = new Date(s) // handles "Oct 30, 2026" style too
  return isNaN(d.getTime()) ? null : d
}

function calendarFeatures(v) {
  const d = parseLotDate(v) || new Date()
  const dow = (d.getDay() + 6) % 7 // JS Sun=0 → pandas Mon=0
  return { day_of_week: dow, is_weekend: dow >= 5 ? 1 : 0, month: d.getMonth() + 1 }
}

// ── Map inventory_master.json row → model lot dict (XGBoost spoilage schema) ───
function rowToSpoilageLot(r) {
  const dte = Number(r.days_to_expiry) || 0
  const stockPressure = parseFloat(r.stock_pressure)
  return {
    days_until_expiry: dte,
    shelf_life_days: Number(r.shelf_life_days) || (dte + 7),
    initial_quantity: Number(r.quantity) || 0,
    base_price: parseFloat(r.unit_price_myr) || 10.0,
    daily_demand: Number(r.daily_demand) || Math.max(1, (Number(r.reorder_quantity) || 10) / 7),
    stock_pressure: Number.isFinite(stockPressure) ? stockPressure : undefined,
    ...calendarFeatures(r.date_received || r.dateIn),
    is_promoted: Number(r.is_promoted ?? r.isPromoted) ? 1 : 0,
    category: r.category || r.canonical_category || 'Unknown'
  }
}

const RISK_TIER_MAP  = { HIGH: 'high', MODERATE: 'med', LOW: 'low' }
const RISK_LABEL_MAP = { HIGH: 'High Risk', MODERATE: 'Moderate Risk', LOW: 'Low Risk' }

// ── ML Spoilage Bridge client (persistent Python process, model loads once) ────
// Spawns `src/ml/spoilage_bridge.py`, which keeps the XGBoost model in memory
// and answers line-delimited JSON requests. Falls back to the DTE heuristic in
// rowToBatch whenever the process cannot start or times out.
let _spoilageProc = null
let _spoilageReady = null
let _spoilagePending = null
let _spoilageChain = Promise.resolve()
const SPOILAGE_ROOT = path.resolve(__dirname, '..')

function startSpoilageProc() {
  if (_spoilageProc) return _spoilageReady
  if (_spoilageReady) return _spoilageReady
  _spoilageReady = new Promise(resolve => {
    const candidates = [process.env.FRESHGUARD_PYTHON, 'python', 'python3'].filter(Boolean)
    let settled = false
    const settle = v => { if (!settled) { settled = true; resolve(v) } }
    let started = false
    for (const py of candidates) {
      try {
        const proc = spawn(py, ['-u', path.join(SPOILAGE_ROOT, 'src', 'ml', 'spoilage_bridge.py')],
          { cwd: SPOILAGE_ROOT, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true })
        started = true
        let buf = ''
        proc.stdout.on('data', d => {
          buf += String(d)
          let nl
          while ((nl = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, nl).trim()
            buf = buf.slice(nl + 1)
            if (!line) continue
            try {
              const msg = JSON.parse(line)
              if (msg.event === 'ready') { settle(proc); continue }
              if (_spoilagePending) {
                const p = _spoilagePending
                _spoilagePending = null
                p(msg.ok ? msg.results : null)
              }
            } catch (_) {}
          }
        })
        proc.stderr.on('data', d => {
          const s = String(d).trim()
          if (s) console.warn('[ML Spoilage]', s.split('\n')[0].slice(0, 160))
        })
        proc.on('exit', () => {
          if (_spoilageProc === proc) { _spoilageProc = null; _spoilageReady = null }
          settle(null)
          if (_spoilagePending) { const p = _spoilagePending; _spoilagePending = null; p(null) }
        })
        _spoilageProc = proc
        break
      } catch (_) { /* try next python candidate */ }
    }
    if (!started) settle(null)
    setTimeout(() => { if (!settled) { settled = true; resolve(null) } }, 30000)
  })
  return _spoilageReady
}

function predictSpoilageBatch(lots) {
  if (!Array.isArray(lots) || lots.length === 0) return Promise.resolve(null)
  const task = async () => {
    let proc = await startSpoilageProc()
    if (!proc || proc.exitCode !== null || !proc.stdin.writable) {
      _spoilageProc = null
      _spoilageReady = null
      proc = await startSpoilageProc()
      if (!proc || proc.exitCode !== null || !proc.stdin.writable) return null
    }
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        try { proc.kill() } catch (_) {}
        if (_spoilagePending) { const p = _spoilagePending; _spoilagePending = null; p(null) }
        resolve(null)
      }, 30000)
      _spoilagePending = results => { clearTimeout(timer); resolve(results) }
      try { proc.stdin.write(JSON.stringify({ lots }) + '\n') }
      catch (_) { clearTimeout(timer); resolve(null) }
    })
  }
  // Single in-flight request: the bridge answers one message at a time.
  _spoilageChain = _spoilageChain.then(task, task)
  return _spoilageChain
}

// ── Map inventory_master.json row → Frontend Batch Object ──────────────────────
function rowToBatch(r, pred = null) {
  const qty   = Number(r.quantity) || 0
  const price = parseFloat(r.unit_price_myr) || 0
  const cost  = parseFloat(r.cost_price_myr) || price * 0.70

  // Calculate DTE dynamically from expiry_date if available
  let dte = Number(r.days_to_expiry)
  if (r.expiry_date) {
    const exp = new Date(r.expiry_date)
    if (!isNaN(exp.getTime())) {
      const now = new Date()
      const dExp = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate())
      const dNow = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      dte = Math.round((dExp - dNow) / (1000 * 60 * 60 * 24))
    }
  }
  if (isNaN(dte)) dte = 0

  // Risk priority: Expired status → ML/policy prediction (XGBoost + Tier2, or shelf-stable
  // policy) when available → DTE heuristic fallback.
  let riskType = 'low', risk = 'Low Risk', riskSource = 'dte_heuristic'
  let isExpired = false
  let dteStr = `${dte} days`

  if (dte < 0) {
    isExpired = true
    riskType = 'expired'
    risk = 'Expired'
    const abs = Math.abs(dte)
    dteStr = abs === 1 ? 'Expired (1d ago)' : `Expired (${abs}d ago)`
  } else if (dte === 0) {
    riskType = 'high'
    risk = 'Critical Risk'
    dteStr = 'Expires Today (0d)'
  } else if (pred && pred.label) {
    riskType   = RISK_TIER_MAP[pred.label] || 'low'
    risk       = RISK_LABEL_MAP[pred.label] || 'Low Risk'
    riskSource = pred.source || 'ml_xgboost'
    dteStr     = dte === 1 ? '1 day' : `${dte} days`
  } else if (dte <= 2) {
    riskType = 'high'
    risk = 'High Risk'
    dteStr = dte === 1 ? '1 day' : `${dte} days`
  } else if (dte <= 5) {
    riskType = 'med'
    risk = 'Moderate Risk'
    dteStr = `${dte} days`
  } else {
    dteStr = `${dte} days`
  }

  return {
    id:                r.lot_id,
    product:           r.product_name,
    category:          r.category,
    stockQty:          qty,
    qty:               `${qty} ${r.uom || 'units'}`,
    uom:               r.uom || 'units',
    sellPrice:         `RM ${price.toFixed(2)}/${r.uom || 'unit'}`,
    costPrice:         `RM ${cost.toFixed(2)}/${r.uom || 'unit'}`,
    unitPrice:         price,
    expiryDate:        r.expiry_date,
    dateIn:            r.date_received,
    isPromoted:        Number(r.is_promoted) ? 1 : 0,
    dteNum:            dte,
    dte:               dteStr,
    risk,
    riskType,
    isExpired,
    riskScore:         pred ? (pred.score ?? null) : (r.risk_score !== undefined ? Number(r.risk_score) || null : null),
    riskSource,
    reorderLevel:      Number(r.reorder_level) || 15,
    reorderQuantity:   Number(r.reorder_quantity) || 20,
    turnoverRatio:     r.turnover_ratio,
    supplier:          r.supplier_name,
    warehouseLocation: r.warehouse_location,
    storeId:           r.store_id,
    recommended:       isExpired ? 'Disposal / Waste'
                     : riskType === 'high' ? 'Donate to Food Bank'
                     : riskType === 'med'  ? 'Dynamic Markdown'
                     :                       'Normal Sale'
  }
}

// ── Map Frontend Batch Object → inventory_master.json row ──────────────────────
function batchToRow(b) {
  const parseNum = s => { const m = String(s || '').match(/[\d.]+/); return m ? parseFloat(m[0]) : 0 }
  const qty      = b.stockQty !== undefined ? Number(b.stockQty) : parseNum(b.qty)
  const price    = parseNum(b.sellPrice || b.unitPrice || '8.50')
  const cost     = parseNum(b.costPrice) || price * 0.70
  const rl       = Number(b.reorderLevel) || 15
  const dte      = Number(b.dteNum) || 7
  const riskMap  = { high: 'High Risk', med: 'Moderate Risk', low: 'Low Risk' }
  const stripUnit = s => String(s || '').replace(/[\d.\s]+/, '').trim() || 'units'

  return {
    lot_id:             b.id,
    product_name:       b.product,
    category:           b.category || 'General',
    quantity:           qty,
    uom:                b.uom || stripUnit(b.qty),
    unit_price_myr:     price.toFixed(2),
    cost_price_myr:     cost.toFixed(2),
    expiry_date:        b.expiryDate || new Date(Date.now() + dte * 86400000).toISOString().split('T')[0],
    days_to_expiry:     dte,
    shelf_life_days:    dte + 7,
    date_received:      b.dateIn || new Date().toISOString().split('T')[0],
    is_promoted:        Number(b.isPromoted ?? b.is_promoted) ? 1 : 0,
    reorder_level:      rl,
    reorder_quantity:   Math.max(rl, Math.round(qty * 0.8)),
    turnover_ratio:     String(b.turnoverRatio || '2.00'),
    stock_pressure:     rl > 0 ? (qty / (rl + 1)).toFixed(2) : '1.00',
    risk_tier:          b.riskType || 'low',
    risk_label:         riskMap[b.riskType] || 'Low Risk',
    supplier_name:      b.supplier || 'Direct Procurement',
    warehouse_location: b.warehouseLocation || 'Aisle 1',
    store_id:           'MY-KL-001',
    status:             'Active'
  }
}

// ── Supabase Cloud Sync Helper ──────────────────────────────────────────────
function getEnvKey(key) {
  if (process.env[key]) return process.env[key]
  for (const envPath of [path.resolve(__dirname, '.env'), path.resolve(__dirname, '../.env')]) {
    try {
      if (fs.existsSync(envPath)) {
        const match = fs.readFileSync(envPath, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'))
        if (match) return match[1].trim()
      }
    } catch (_) {}
  }
  return ''
}

const SUPABASE_URL = getEnvKey('VITE_SUPABASE_URL')
const SUPABASE_KEY = getEnvKey('SUPABASE_SERVICE_ROLE_KEY')

function parseDateIso(dStr, fallbackDays = 7) {
  if (!dStr) {
    const d = new Date(); d.setDate(d.getDate() + fallbackDays)
    return d.toISOString().slice(0, 10)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return dStr
  const parsed = new Date(dStr)
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  const d = new Date(); d.setDate(d.getDate() + fallbackDays)
  return d.toISOString().slice(0, 10)
}

function rowToSupabase(r) {
  const dte = Number(r.days_to_expiry) || 5
  const qty = Number(r.quantity) || 0
  const price = parseFloat(r.unit_price_myr) || 5.0
  let riskLabel = 'LOW'
  let route = 'Normal Sale'
  let discountPct = 0
  let channel = 'retail'

  if (dte <= 1) {
    riskLabel = 'HIGH'
    route = 'Donation'
    channel = 'closed_ngo'
    discountPct = 0
  } else if (dte <= 3) {
    riskLabel = 'MODERATE'
    route = 'Dynamic Markdown'
    channel = 'retail'
    discountPct = dte <= 2 ? 0.35 : 0.20
  }

  const discountedPrice = discountPct > 0 ? parseFloat((price * (1 - discountPct)).toFixed(2)) : price
  const expectedValue = parseFloat((qty * (route === 'Donation' ? 0 : discountedPrice)).toFixed(2))
  const rawId = r.lot_id || r.batch_id || 'LOT-1000'
  let batchId = String(rawId)
  const canMatch = batchId.match(/^CAN-(\d+)$/i)
  if (canMatch) {
    const num = parseInt(canMatch[1], 10)
    batchId = num >= 2000 ? `LOT-${num - 1000}` : `LOT-${num}`
  }

  return {
    batch_id: batchId,
    product_id: r.product_id || ('PRD-' + String(batchId || '1000').replace(/\D/g, '')),
    product_name: r.product_name || 'Fresh Produce',
    category: r.category || 'Produce',
    canonical_category: r.canonical_category || r.category || 'Produce',
    quantity: qty,
    uom: r.uom || 'units',
    expiry_date: parseDateIso(r.expiry_date, dte),
    date_received: parseDateIso(r.date_received, -7),
    shelf_life_days: Number(r.shelf_life_days) || (dte + 7),
    days_to_expiry: dte,
    turnover_ratio: parseFloat(r.turnover_ratio) || 1.5,
    stock_pressure: parseFloat(r.stock_pressure) || 1.0,
    reorder_level: Number(r.reorder_level) || 15,
    unit_price_myr: price,
    store_id: r.store_id || 'MY-KL-001',
    risk_label: r.risk_label || riskLabel,
    recommended_route: r.recommended_route || route,
    discount_percent: r.discount_percent !== undefined ? parseFloat(r.discount_percent) : discountPct,
    discounted_price_myr: r.discounted_price_myr !== undefined ? parseFloat(r.discounted_price_myr) : discountedPrice,
    expected_value_myr: r.expected_value_myr !== undefined ? parseFloat(r.expected_value_myr) : expectedValue,
    channel: r.channel || channel,
    moral_hazard_flag: Boolean(r.moral_hazard_flag || false),
    updated_at: new Date().toISOString()
  }
}

async function syncToSupabase(action, payload) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return
  try {
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json'
    }
    if (action === 'UPSERT') {
      await fetch(`${SUPABASE_URL}/rest/v1/batches`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([payload])
      })
    } else if (action === 'DELETE') {
      const lotId = String(payload)
      const cleanId = lotId.replace(/\D/g, '')
      const filter = cleanId ? `in.(${encodeURIComponent(lotId)},CAN-${cleanId},LOT-${cleanId})` : `eq.${encodeURIComponent(lotId)}`
      await fetch(`${SUPABASE_URL}/rest/v1/batches?batch_id=${filter}`, {
        method: 'DELETE',
        headers
      })
    } else if (action === 'PATCH') {
      const { batch_id, ...updates } = payload
      const cleanId = String(batch_id).replace(/\D/g, '')
      const filter = cleanId ? `in.(${encodeURIComponent(batch_id)},CAN-${cleanId},LOT-${cleanId})` : `eq.${encodeURIComponent(batch_id)}`
      await fetch(`${SUPABASE_URL}/rest/v1/batches?batch_id=${filter}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updates)
      })
    }
  } catch (err) {
    console.warn('[Vite API] Supabase sync notice:', err.message)
  }
}

// ── Common API handler for both dev and preview servers ────────────────────────
function createApiMiddleware() {
  return async (req, res, next) => {
    const url = req.url || ''

    // ── GET /api/batches → READ directly from inventory_master.json ────────────
    // Risk scored by Person 1's XGBoost spoilage model (via Python bridge):
    // perishable categories go through ML + Tier2, Grains & Pulses / Oils & Fats
    // get the shelf-stable policy (LOW 95%). DTE heuristic only as fallback.
    if (url === '/api/batches' && req.method === 'GET') {
      const records = readJson(MASTER_JSON)
      // Only return items with stock > 0
      const activeBatches = records
        .filter(r => Number(r.quantity) > 0 && r.status !== 'Deleted')
      let preds = null
      try { preds = await predictSpoilageBatch(activeBatches.map(rowToSpoilageLot)) } catch (_) {}
      const batches = activeBatches.map((r, i) => rowToBatch(r, preds ? preds[i] : null))
      sendJson(res, 200, batches)
      return
    }

    // ── POST /api/batches → ADD / CREATE in local JSON + SYNC to Supabase Cloud ─
    // Risk tier/label come from Person 1's XGBoost model (or shelf-stable policy
    // for dry goods), not from the client-submitted value.
    if (url === '/api/batches' && req.method === 'POST') {
      try {
        const batch   = await collectBody(req)
        const row     = batchToRow(batch)
        let pred = null
        try {
          const preds = await predictSpoilageBatch([rowToSpoilageLot(row)])
          pred = preds ? preds[0] : null
        } catch (_) {}
        if (pred && pred.label) {
          row.risk_tier  = RISK_TIER_MAP[pred.label] || 'low'
          row.risk_label = RISK_LABEL_MAP[pred.label] || 'Low Risk'
        }
        const records = readJson(MASTER_JSON)
        const idx     = records.findIndex(r => matchBatchId(r.lot_id, row.lot_id))
        if (idx >= 0) records[idx] = { ...records[idx], ...row }
        else          records.unshift(row)
        writeJson(MASTER_JSON, records)
        // Background sync to Supabase Cloud (BUG-INV-02: full row schema)
        syncToSupabase('UPSERT', rowToSupabase(row))
        sendJson(res, 200, { status: 'saved', batch: rowToBatch(records[idx >= 0 ? idx : 0], pred) })
      } catch (e) {
        sendJson(res, 500, { error: e.message })
      }
      return
    }

    // ── POST /api/spoilage/predict → Live ML preview for forms (Add & Edit batch) ─
    if (url === '/api/spoilage/predict' && req.method === 'POST') {
      try {
        const body = await collectBody(req)
        const row = batchToRow(body)
        const spoilageLot = rowToSpoilageLot(row)

        const expStr = body.expiryDate || body.expiry_date
        const inStr = body.dateIn || body.date_received
        const exp = parseLotDate(expStr)
        const inDate = parseLotDate(inStr)
        const now = new Date()
        const dNow = new Date(now.getFullYear(), now.getMonth(), now.getDate())

        if (exp) {
          const dExp = new Date(exp.getFullYear(), exp.getMonth(), exp.getDate())
          const dIn = inDate ? new Date(inDate.getFullYear(), inDate.getMonth(), inDate.getDate()) : dNow

          // If incoming batch has future date_in, DTE upon receipt is (dExp - dIn)
          const dteFromNow = Math.max(0, Math.round((dExp - dNow) / 86400000))
          const dteFromIn  = Math.max(0, Math.round((dExp - dIn) / 86400000))
          spoilageLot.days_until_expiry = (dIn > dNow) ? dteFromIn : dteFromNow
          spoilageLot.shelf_life_days   = Math.max(1, Math.round((dExp - dIn) / 86400000))

          const cal = calendarFeatures(inDate || now)
          spoilageLot.day_of_week = cal.day_of_week
          spoilageLot.is_weekend  = cal.is_weekend
          spoilageLot.month       = cal.month
        }

        const qty = parseFloat(body.stockQty ?? body.quantity) || 0
        const rl = parseFloat(body.reorderLevel ?? body.reorder_level) || 15
        const rq = Math.max(rl, Math.round(qty * 0.8))
        const price = parseFloat(body.unitPrice ?? body.unit_price_myr ?? body.sellPrice) || 5.0
        spoilageLot.initial_quantity = qty
        spoilageLot.base_price = price
        spoilageLot.stock_pressure = rl > 0 ? Number((qty / (rl + 1)).toFixed(2)) : 1.0
        spoilageLot.daily_demand = Math.max(1.0, rq / 7)
        spoilageLot.is_promoted = Number(body.isPromoted ?? body.is_promoted) ? 1 : 0
        if (body.category) spoilageLot.category = body.category

        let pred = null
        try {
          const preds = await predictSpoilageBatch([spoilageLot])
          pred = preds ? preds[0] : null
        } catch (_) {}

        const dte = spoilageLot.days_until_expiry
        const riskTier = pred?.label ? (RISK_TIER_MAP[pred.label] || 'low') : (dte <= 2 ? 'high' : dte <= 5 ? 'med' : 'low')
        const riskLabel = pred?.label ? (RISK_LABEL_MAP[pred.label] || 'Low Risk') : (dte <= 2 ? 'High Risk' : dte <= 5 ? 'Moderate Risk' : 'Low Risk')
        const score = pred?.score ?? null

        sendJson(res, 200, {
          ok: true,
          dte: dte === 1 ? '1 day' : `${dte} days`,
          dteNum: dte,
          shelf_life_days: spoilageLot.shelf_life_days,
          risk: riskLabel,
          riskType: riskTier,
          score,
          raw_label: pred?.raw_label,
          probabilities: pred?.probabilities,
          source: pred ? 'ml_xgboost' : 'heuristic_dte'
        })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: e.message })
      }
      return
    }

    // ── PATCH /api/batches/:id → UPDATE in local JSON + Supabase Cloud ──────────
    // Supports editing all fields and synchronizing to Supabase (BUG-INV-05 & BUG-INV-01)
    // If quantity <= 0 → directly DELETE from local JSON + Supabase Cloud ────────
    const patchMatch = url.match(/^\/api\/batches\/([^?/]+)$/)
    if (patchMatch && req.method === 'PATCH') {
      try {
        const lotId   = decodeURIComponent(patchMatch[1])
        const payload = await collectBody(req)
        const records = readJson(MASTER_JSON)
        const idx     = records.findIndex(r => matchBatchId(r.lot_id, lotId))

        if (idx < 0) {
          sendJson(res, 404, { error: `Batch ${lotId} not found in inventory_master.json` })
          return
        }

        if (payload.quantity !== undefined) {
          records[idx].quantity = Number(payload.quantity)
        }
        if (payload.unit_price_myr !== undefined || payload.unitPrice !== undefined || payload.sellPrice !== undefined) {
          const p = payload.unit_price_myr ?? payload.unitPrice ?? payload.sellPrice
          const m = String(p).match(/[\d.]+/)
          records[idx].unit_price_myr = m ? parseFloat(m[0]).toFixed(2) : String(p)
        }
        if (payload.expiry_date !== undefined || payload.expiryDate !== undefined) {
          records[idx].expiry_date = payload.expiry_date ?? payload.expiryDate
        }
        if (payload.days_to_expiry !== undefined || payload.dteNum !== undefined) {
          records[idx].days_to_expiry = Number(payload.days_to_expiry ?? payload.dteNum)
        }
        if (payload.reorder_level !== undefined || payload.reorderLevel !== undefined) {
          records[idx].reorder_level = Number(payload.reorder_level ?? payload.reorderLevel)
        }
        if (payload.turnover_ratio !== undefined || payload.turnoverRatio !== undefined) {
          records[idx].turnover_ratio = String(payload.turnover_ratio ?? payload.turnoverRatio)
        }
        if (payload.product_name !== undefined || payload.product !== undefined) {
          records[idx].product_name = payload.product_name ?? payload.product
        }
        if (payload.category !== undefined) {
          records[idx].category = payload.category
        }
        if (payload.status !== undefined) {
          records[idx].status = payload.status
        }
        if (payload.is_promoted !== undefined || payload.isPromoted !== undefined) {
          records[idx].is_promoted = Number(payload.is_promoted ?? payload.isPromoted) ? 1 : 0
        }

        // Recompute ML risk after edits (days_to_expiry / category may have changed)
        let patchPred = null
        if (Number(records[idx].quantity) > 0) {
          try {
            const preds = await predictSpoilageBatch([rowToSpoilageLot(records[idx])])
            patchPred = preds ? preds[0] : null
            if (patchPred && patchPred.label) {
              records[idx].risk_tier  = RISK_TIER_MAP[patchPred.label] || 'low'
              records[idx].risk_label = RISK_LABEL_MAP[patchPred.label] || 'Low Risk'
            }
          } catch (_) {}
        }

        const canonicalLotId = records[idx].lot_id || lotId

        // Automatic removal when stock reaches 0
        if (Number(records[idx].quantity) <= 0) {
          records.splice(idx, 1)
          writeJson(MASTER_JSON, records)
          syncToSupabase('DELETE', canonicalLotId)
          sendJson(res, 200, { status: 'deleted', lot_id: canonicalLotId, reason: 'stock_depleted' })
        } else {
          writeJson(MASTER_JSON, records)
          const updates = {
            batch_id: canonicalLotId,
            quantity: Number(records[idx].quantity),
            updated_at: new Date().toISOString()
          }
          if (records[idx].unit_price_myr) {
            updates.unit_price_myr = parseFloat(records[idx].unit_price_myr)
          }
          if (records[idx].expiry_date) {
            updates.expiry_date = parseDateIso(records[idx].expiry_date)
          }
          if (records[idx].days_to_expiry !== undefined) {
            updates.days_to_expiry = Number(records[idx].days_to_expiry)
          }
          if (records[idx].reorder_level !== undefined) {
            updates.reorder_level = Number(records[idx].reorder_level)
          }
          if (records[idx].turnover_ratio !== undefined) {
            updates.turnover_ratio = parseFloat(records[idx].turnover_ratio)
          }
          if (records[idx].product_name) {
            updates.product_name = records[idx].product_name
          }
          if (records[idx].category) {
            updates.category = records[idx].category
            updates.canonical_category = records[idx].category
          }
          syncToSupabase('PATCH', updates)
          sendJson(res, 200, { status: 'updated', lot_id: canonicalLotId, batch: rowToBatch(records[idx], patchPred) })
        }
      } catch (e) {
        sendJson(res, 500, { error: e.message })
      }
      return
    }

    // ── DELETE /api/batches/:id → DELETE from local JSON + Supabase Cloud ───────
    const delMatch = url.match(/^\/api\/batches\/([^?/]+)$/)
    if (delMatch && req.method === 'DELETE') {
      try {
        const lotId   = decodeURIComponent(delMatch[1])
        const records = readJson(MASTER_JSON)
        const before  = records.length
        const updated = records.filter(r => !matchBatchId(r.lot_id, lotId))
        writeJson(MASTER_JSON, updated)
        syncToSupabase('DELETE', lotId)
        sendJson(res, 200, { status: 'deleted', lot_id: lotId, removed: before - updated.length })
      } catch (e) {
        sendJson(res, 500, { error: e.message })
      }
      return
    }

    // ── POST /api/transactions → save directly to transactions.json + Supabase ─
    if (url === '/api/transactions' && req.method === 'POST') {
      try {
        const txn     = await collectBody(req)
        const records = readJson(TXNS_JSON)
        const idx = records.findIndex(r => r.id === txn.id)
        if (idx >= 0) {
          records[idx] = txn
        } else {
          records.unshift(txn)
        }
        writeJson(TXNS_JSON, records)

        // Sync event to Supabase Cloud simulation_events (BUG-SALES-01 fix: valid enum 'markdown')
        if (SUPABASE_URL && SUPABASE_KEY && txn.batchId && txn.batchId !== 'UNKNOWN') {
          fetch(`${SUPABASE_URL}/rest/v1/simulation_events`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates'
            },
            body: JSON.stringify([{
              event_id: `EVT-${txn.id}`,
              batch_id: txn.batchId,
              store_id: 'MY-KL-001',
              event_type: 'markdown',
              timestamp: new Date().toISOString(),
              quantity: Number(txn.qty) || 1,
              metadata: {
                action: 'pos_sale',
                txn_id: txn.id,
                product: txn.product,
                unit_price: txn.unitPrice,
                total: txn.total,
                pay_method: txn.payMethod,
                discount: txn.discount,
                cashier: txn.cashier || 'Cashier'
              }
            }])
          }).catch(err => console.warn('[Supabase Sync] simulation_events notice:', err.message))
        }

        sendJson(res, 200, { status: 'saved', id: txn.id })
      } catch (e) {
        sendJson(res, 500, { error: e.message })
      }
      return
    }

    // ── PATCH /api/transactions/:id → update status / details ───────────────────
    const txnPatchMatch = url.match(/^\/api\/transactions\/([^?/]+)$/)
    if (txnPatchMatch && req.method === 'PATCH') {
      try {
        const txnId   = decodeURIComponent(txnPatchMatch[1])
        const payload = await collectBody(req)
        const records = readJson(TXNS_JSON)
        const idx     = records.findIndex(r => r.id === txnId)
        if (idx >= 0) {
          records[idx] = { ...records[idx], ...payload }
          writeJson(TXNS_JSON, records)
          sendJson(res, 200, { status: 'updated', id: txnId })
        } else {
          sendJson(res, 404, { error: `Transaction ${txnId} not found` })
        }
      } catch (e) {
        sendJson(res, 500, { error: e.message })
      }
      return
    }

    // ── DELETE /api/transactions/:id → delete transaction ──────────────────────
    const txnDelMatch = url.match(/^\/api\/transactions\/([^?/]+)$/)
    if (txnDelMatch && req.method === 'DELETE') {
      try {
        const txnId   = decodeURIComponent(txnDelMatch[1])
        const records = readJson(TXNS_JSON)
        const filtered = records.filter(r => r.id !== txnId)
        writeJson(TXNS_JSON, filtered)
        sendJson(res, 200, { status: 'deleted', id: txnId })
      } catch (e) {
        sendJson(res, 500, { error: e.message })
      }
      return
    }

    // ── POST /api/dispatch → log to Supabase dispatch_log & simulation_events ──
    if (url === '/api/dispatch' && req.method === 'POST') {
      try {
        const payload = await collectBody(req)
        const dispatchId = payload.dispatch_id || `DSP-${Date.now().toString(36).toUpperCase()}`
        const record = {
          dispatch_id: dispatchId,
          batch_id: payload.batch_id,
          receiver_id: payload.receiver_id || 'REC-01',
          store_id: 'MY-KL-001',
          distance_km: parseFloat(payload.distance_km) || 5.0,
          eta_hours: parseFloat(((payload.eta_minutes || 15) / 60).toFixed(2)),
          status: 'dispatched',
          created_at: new Date().toISOString()
        }

        // Sync to Supabase Cloud dispatch_log
        if (SUPABASE_URL && SUPABASE_KEY) {
          fetch(`${SUPABASE_URL}/rest/v1/dispatch_log`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates'
            },
            body: JSON.stringify([record])
          }).catch(err => console.warn('[Supabase Sync] dispatch_log notice:', err.message))

          // Also record simulation_events 'dispatched'
          fetch(`${SUPABASE_URL}/rest/v1/simulation_events`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'resolution=merge-duplicates'
            },
            body: JSON.stringify([{
              event_id: `EVT-${dispatchId}`,
              batch_id: payload.batch_id,
              store_id: 'MY-KL-001',
              event_type: 'dispatched',
              timestamp: new Date().toISOString(),
              quantity: Number(payload.quantity) || 10,
              metadata: {
                receiver_id: payload.receiver_id,
                receiver_name: payload.receiver_name,
                distance_km: payload.distance_km,
                eta_minutes: payload.eta_minutes
              }
            }])
          }).catch(err => console.warn('[Supabase Sync] simulation_events dispatch notice:', err.message))
        }

        sendJson(res, 200, { status: 'dispatched', record })
      } catch (e) {
        sendJson(res, 500, { error: e.message })
      }
      return
    }

    // ── GET /api/transactions → read directly from transactions.json ───────────
    if (url === '/api/transactions' && req.method === 'GET') {
      sendJson(res, 200, readJson(TXNS_JSON))
      return
    }

    // ── GET /api/forecast/products → ML forecast from three_day_forecast.json ──
    // Ports forecast_service.py disaggregation logic to Node.js
    // Source: src/forecasting/forecast_service.py (Person 2)
    if (url.startsWith('/api/forecast/products') && req.method === 'GET') {
      try {
        const params   = new URL(url, 'http://localhost').searchParams
        const storeNbr = parseInt(params.get('store_nbr') || '1', 10)
        const limit    = parseInt(params.get('limit') || '100', 10)

        const forecasts = readJson(FORECAST_JSON)
        
        // Connect to Supabase Cloud live batches if credentials exist (BUG-FC-07 & BUG-FC-01 fix)
        let batches = []
        let dataSource = 'Local Master + LightGBM ML'
        if (SUPABASE_URL && SUPABASE_KEY) {
          try {
            const sResp = await fetch(`${SUPABASE_URL}/rest/v1/batches?select=*&quantity=gt.0`, {
              headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`
              }
            })
            if (sResp.ok) {
              const sData = await sResp.json()
              if (Array.isArray(sData) && sData.length > 0) {
                batches = sData.map(b => ({
                  ...b,
                  lot_id: b.batch_id || b.lot_id,
                  product_name: b.product_name,
                  quantity: Number(b.quantity),
                  days_to_expiry: Number(b.days_to_expiry) || 5,
                  unit_price_myr: b.unit_price_myr || 6.0,
                  uom: b.uom || 'units',
                  category: b.category || b.canonical_category || 'Produce'
                }))
                dataSource = 'Supabase Cloud + LightGBM ML'
              }
            }
          } catch (_) {}
        }
        if (batches.length === 0) {
          batches = readJson(MASTER_JSON).filter(r => Number(r.quantity) > 0)
        }

        // Category → ML family map (loaded from shared/category_map.json)
        const sharedData = readJson(SHARED_MAP_JSON)
        const CATEGORY_MAP = (sharedData && sharedData.category_to_family) || {
          'Produce': 'PRODUCE', 'Fruits & Vegetables': 'PRODUCE',
          'Dairy': 'DAIRY', 'Bakery': 'BREAD/BAKERY',
          'Beverages': 'BEVERAGES', 'Seafood': 'SEAFOOD',
          'Meat': 'MEATS', 'Meats': 'MEATS', 'Poultry': 'POULTRY',
          'Eggs': 'EGGS', 'Frozen Foods': 'FROZEN FOODS',
          'Deli': 'DELI', 'Prepared Food': 'PREPARED FOODS',
          'Liquor, Wine, Beer': 'LIQUOR,WINE,BEER',
          'Grains & Pulses': 'GROCERY I', 'Oils & Fats': 'GROCERY I',
          'Grocery': 'GROCERY I'
        }
        const FAMILY_DEFAULT_UNITS = (sharedData && sharedData.family_default_units) || {
          'PRODUCE': 'kg', 'BREAD/BAKERY': 'pack', 'DAIRY': 'pack',
          'DELI': 'kg', 'EGGS': 'pack', 'FROZEN FOODS': 'pack',
          'GROCERY I': 'pack', 'GROCERY II': 'pack', 'LIQUOR,WINE,BEER': 'bottle',
          'MEATS': 'kg', 'POULTRY': 'kg', 'PREPARED FOODS': 'pack',
          'SEAFOOD': 'kg', 'BEVERAGES': 'bottle'
        }

        const resolveFamily = (cat) => {
          const c = String(cat || '').trim()
          if (CATEGORY_MAP[c]) return { family: CATEGORY_MAP[c], isKnown: true }
          for (const [k, v] of Object.entries(CATEGORY_MAP)) {
            if (k.toLowerCase() === c.toLowerCase()) return { family: v, isKnown: true }
          }
          return { family: 'GROCERY I', isKnown: false }
        }

        // Build family → {1,2,3} demand lookup for the given store
        const lookup = {}
        for (const f of forecasts) {
          if (f.store_nbr === storeNbr) {
            if (!lookup[f.family]) lookup[f.family] = {}
            lookup[f.family][f.horizon] = parseFloat(f.predicted_demand)
          }
        }

        // Group batches by product
        const byProduct = {}
        for (const r of batches) {
          const p = r.product_name; if (!p) continue
          if (!byProduct[p]) byProduct[p] = []
          byProduct[p].push(r)
        }

        // Sort by total stock desc, take limit
        const topProducts = Object.entries(byProduct)
          .map(([name, rows]) => ({ name, rows, totalQty: rows.reduce((s, r) => s + Number(r.quantity), 0) }))
          .sort((a, b) => b.totalQty - a.totalQty)
          .slice(0, limit)

        const products = {}
        for (const { name, rows } of topProducts) {
          const category = rows[0].category || 'Produce'
          const { family: mlFamily, isKnown: isKnownFamily } = resolveFamily(category)
          const actualUom = rows[0].uom && String(rows[0].uom).trim()
          const unit = actualUom || FAMILY_DEFAULT_UNITS[mlFamily] || 'units'
          const totalQty = rows.reduce((s, r) => s + Number(r.quantity), 0)
          const minDte   = Math.min(...rows.map(r => Number(r.days_to_expiry) || 7))
          const price    = parseFloat(rows[0].unit_price_myr) || 6.0

          // Disaggregation: weight = product stock / category total stock
          const catTotal = batches
            .filter(r => r.category === category)
            .reduce((s, r) => s + Number(r.quantity), 0)
          const weight = catTotal > 0 ? totalQty / catTotal : 1

          // Get ML family forecast for this store; fallback if family missing
          const hasFamilyForecast = Boolean(lookup[mlFamily])
          const famFc = lookup[mlFamily] || { 1: 50.0, 2: 45.0, 3: 40.0 }

          // Generate projections with disaggregated demand
          const labels = ['Horizon +1', 'Horizon +2', 'Horizon +3']
          const targetDates = ['2017-08-16', '2017-08-17', '2017-08-18']
          let cur = totalQty, totalDemand = 0
          const points = [1, 2, 3].map((h, i) => {
            const rawDem = (famFc[h] || 45.0) * weight
            const dem    = Math.max(1, Math.round(rawDem))
            totalDemand += dem
            const rem     = Math.max(0, cur - dem)
            const deficit = dem > cur ? dem - cur : 0
            cur = rem
            return {
              horizon: h,
              label: labels[i],
              date: `Day +${h}`,
              historical_target_date: targetDates[i],
              demand: dem,
              stockRemaining: rem,
              stockDeficit: deficit,
              status: rem === 0 ? 'Stockout' : rem < 15 ? 'Low' : 'Adequate'
            }
          })

          const surplusQty   = Math.max(0, totalQty - totalDemand)
          const reorderNeeded = cur === 0 && totalDemand > totalQty
          let recommendedAction, actionReason
          if (surplusQty > 0 && minDte <= 1) {
            recommendedAction = 'Donate to Food Bank'
            actionReason = `Advisory: Surplus of ${surplusQty} ${unit} with critical shelf life (DTE ${minDte}d). Route to local food bank to prevent waste.`
          } else if (surplusQty > 0 && minDte <= 3) {
            recommendedAction = 'Dynamic Markdown'
            actionReason = `Advisory: Surplus of ${surplusQty} ${unit} nearing expiry (DTE ${minDte}d). Apply markdown.`
          } else {
            recommendedAction = 'Normal Sale'
            actionReason = `Advisory: Stock velocity balanced. DTE ${minDte}d is safe for standard pricing.`
          }

          products[name] = {
            status: 'success',
            product: name,
            category,
            unit,
            unitPrice: price,
            currentStock: totalQty,
            daysToExpiry: minDte,
            totalDemand,
            surplusQty,
            reorderNeeded,
            reorderQty: reorderNeeded ? Math.max(0, totalDemand - totalQty) : 0,
            recommendedAction,
            actionReason,
            mlFamily,
            mlFamilyKnown: isKnownFamily,
            mlWeight: parseFloat(weight.toFixed(4)),
            forecast_origin_date: '2017-08-15',
            forecast_source: (isKnownFamily && hasFamilyForecast) ? 'historical_static' : 'heuristic',
            forecast_method: (isKnownFamily && hasFamilyForecast) ? 'lightgbm' : null,
            forecast_granularity: 'family_level_disaggregated',
            forecast_disaggregation_method: 'stock_share',
            disaggregation_method: 'stock_share',
            sku_level_validated: false,
            reorder_auto_po_allowed: false,
            forecast_validation_status: 'not_validated',
            generated_at: new Date().toISOString(),
            points
          }
        }

        sendJson(res, 200, {
          status: 'success',
          store_nbr: storeNbr,
          inventory_source: dataSource,
          forecast_origin_date: '2017-08-15',
          forecast_source: 'historical_static',
          forecast_method: 'lightgbm',
          forecast_granularity: 'family_level_disaggregated',
          forecast_disaggregation_method: 'stock_share',
          disaggregation_method: 'stock_share',
          sku_level_validated: false,
          reorder_auto_po_allowed: false,
          forecast_validation_status: 'not_validated',
          generated_at: new Date().toISOString(),
          forecast_warning: 'Historical Kaggle dataset ending 2017-08-15. Disaggregated from family-level forecast by stock share. Advisory only — not validated for automated PO or business commitment.',
          total_products: Object.keys(products).length,
          products
        })
      } catch (e) {
        sendJson(res, 500, { error: e.message })
      }
      return
    }

    // ── POST /api/recommend → Person 4 Rule Engine (assign_route logic) ─────
    // Implements: Dynamic Markdown + Anti-Moral-Hazard (30% donation cap)
    // Source: src/engine/rule_engine.py by Person 4 — ported to Node.js
    if (url === '/api/recommend' && req.method === 'POST') {
      try {
        const body = await collectBody(req)
        const rawDte = parseInt(body.days_to_expiry)
        const dte    = isNaN(rawDte) ? 0 : rawDte
        const qty    = Math.max(parseFloat(body.quantity)     || 0, 0)
        const price  = Math.max(parseFloat(body.unit_price_myr) || 0, 0)
        const demand = Math.max(parseFloat(body.demand_forecast_3d) || 0, 0)
        const totalSurplus   = Math.max(parseFloat(body.total_surplus_volume)    || 0, 0)
        const donatedSoFar   = Math.max(parseFloat(body.cumulative_donated_volume) || 0, 0)

        // ── Person 4 Rule Engine constants ──────────────────────────────────
        const DONATION_QUOTA_CAP = 0.30   // max 30% of total surplus can be donated
        const MARKDOWN_AGGRESSIVE = 0.50  // applied when donation quota is full
        const MARKDOWN_TIERS = { 3: 0.15, 2: 0.25, 1: 0.40 }  // DTE → discount

        const isSurplus = qty > demand

        let route, discount, channel, moralHazard, reason

        // ── Retail Decision Tree (FEFO Priority) ───────────────────────────
        // 0. Already Expired (DTE < 0) — Prohibit retail markdown, route to disposal
        if (dte < 0) {
          route = 'Disposal'; discount = 0.0; channel = 'waste_compost'; moralHazard = false
          reason = `Product expired (${Math.abs(dte)}d ago). Food safety regulations strictly prohibit retail markdown or sale. Route to licensed bio-waste/compost.`

        // 1. Critical Expiry (DTE <= 1) — Spoilage imminent; prioritize donation
        } else if (dte <= 1) {
          const quotaOk = totalSurplus <= 0 || (donatedSoFar + qty) <= totalSurplus * DONATION_QUOTA_CAP
          if (quotaOk) {
            route = 'Donation'; discount = 1.0; channel = 'closed_ngo'; moralHazard = false
            reason = `DTE=${dte}d (critical expiry). Route to closed NGO/food bank before complete spoilage.`
          } else {
            route = 'Dynamic Markdown'; discount = MARKDOWN_AGGRESSIVE; channel = 'retail'; moralHazard = true
            reason = `DTE=${dte}d critical, but 30% donation quota reached. Redirected to 50% aggressive clearance markdown.`
          }

        // 2. Approaching Expiry (1 < DTE <= 3) — Moderate risk; tiered markdown
        } else if (dte <= 3) {
          discount = MARKDOWN_TIERS[dte] || 0.15
          route = 'Dynamic Markdown'; channel = 'retail'; moralHazard = false
          reason = `DTE=${dte}d surplus lot. Tiered markdown: ${(discount * 100).toFixed(0)}% off → RM ${(price * (1 - discount)).toFixed(2)}/unit.`

        // 3. Safe Shelf Life (DTE > 3)
        } else {
          if (isSurplus) {
            discount = 0.15
            route = 'Dynamic Markdown'; channel = 'retail'; moralHazard = false
            reason = `DTE=${dte}d with surplus volume (qty=${qty} > 3d demand=${demand.toFixed(0)}). 15% markdown recommended to balance velocity.`
          } else {
            route = 'Normal Sale'; discount = 0.0; channel = 'retail'; moralHazard = false
            reason = `DTE=${dte}d, demand healthy. Full-price sale at RM ${price.toFixed(2)}.`
          }
        }

        // Tiered markdown preview for the UI (shows what markdown gives even if donation is recommended)
        const markdownTierFraction = dte <= 1 ? (moralHazard ? 0.50 : 0.40) : (MARKDOWN_TIERS[dte] || 0.15)
        const markdownPrice = parseFloat((price * (1 - markdownTierFraction)).toFixed(2))
        const markdownValue = parseFloat((markdownPrice * qty).toFixed(2))

        sendJson(res, 200, {
          recommended_route:    route,
          discount_percent:     parseFloat((markdownTierFraction * 100).toFixed(1)),
          discount_fraction:    markdownTierFraction,
          discounted_price_myr: markdownPrice,
          expected_value_myr:   markdownValue,
          channel,
          moral_hazard_flag:    moralHazard,
          reason,
          source: 'rule-engine-v1'
        })
      } catch (e) {
        sendJson(res, 500, { error: e.message })
      }
      return
    }

    next()
  }
}

// ── Vite Plugin for 100% JSON-backed database ──────────────────────────────────
function localApiPlugin() {
  const middleware = createApiMiddleware()
  return {
    name: 'local-api-json',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    }
  }
}

export default defineConfig({
  plugins: [react(), localApiPlugin()],
})
