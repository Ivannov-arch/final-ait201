import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

const DATA_DIR    = path.resolve(__dirname, '../data/processed')
const MASTER_JSON = path.join(DATA_DIR, 'inventory_master.json')
const TXNS_JSON   = path.join(DATA_DIR, 'transactions.json')

// ── JSON Helpers ──────────────────────────────────────────────────────────────
function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (_) {
    return []
  }
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
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

// ── Map inventory_master.json row → Frontend Batch Object ──────────────────────
function rowToBatch(r) {
  const qty   = Number(r.quantity) || 0
  const price = parseFloat(r.unit_price_myr) || 0
  const cost  = parseFloat(r.cost_price_myr) || price * 0.70
  const dte   = Number(r.days_to_expiry) || 0

  let riskType = 'low', risk = 'Low Risk'
  if (dte <= 2)      { riskType = 'high'; risk = 'High Risk' }
  else if (dte <= 5) { riskType = 'med';  risk = 'Moderate Risk' }

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
    dteNum:            dte,
    dte:               dte === 1 ? '1 day' : `${dte} days`,
    risk,
    riskType,
    reorderLevel:      Number(r.reorder_level) || 15,
    reorderQuantity:   Number(r.reorder_quantity) || 20,
    turnoverRatio:     r.turnover_ratio,
    supplier:          r.supplier_name,
    warehouseLocation: r.warehouse_location,
    storeId:           r.store_id,
    recommended:       riskType === 'high' ? 'Donate to Food Bank'
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

// ── Common API handler for both dev and preview servers ────────────────────────
function createApiMiddleware() {
  return async (req, res, next) => {
    const url = req.url || ''

    // ── GET /api/batches → READ directly from inventory_master.json ────────────
    if (url === '/api/batches' && req.method === 'GET') {
      const records = readJson(MASTER_JSON)
      // Only return items with stock > 0
      const activeBatches = records
        .filter(r => Number(r.quantity) > 0 && r.status !== 'Deleted')
        .map(rowToBatch)
      sendJson(res, 200, activeBatches)
      return
    }

    // ── POST /api/batches → ADD / CREATE directly in inventory_master.json ─────
    if (url === '/api/batches' && req.method === 'POST') {
      try {
        const batch   = await collectBody(req)
        const row     = batchToRow(batch)
        const records = readJson(MASTER_JSON)
        const idx     = records.findIndex(r => r.lot_id === row.lot_id)
        if (idx >= 0) records[idx] = row
        else          records.unshift(row)
        writeJson(MASTER_JSON, records)
        sendJson(res, 200, { status: 'saved', batch: rowToBatch(row) })
      } catch (e) {
        sendJson(res, 500, { error: e.message })
      }
      return
    }

    // ── PATCH /api/batches/:id → UPDATE quantity directly in inventory_master.json
    // If quantity <= 0 → directly DELETE from inventory_master.json ─────────────
    const patchMatch = url.match(/^\/api\/batches\/([^?/]+)$/)
    if (patchMatch && req.method === 'PATCH') {
      try {
        const lotId   = decodeURIComponent(patchMatch[1])
        const payload = await collectBody(req)
        const records = readJson(MASTER_JSON)
        const idx     = records.findIndex(r => r.lot_id === lotId)

        if (idx < 0) {
          sendJson(res, 404, { error: `Batch ${lotId} not found in inventory_master.json` })
          return
        }

        if (payload.quantity !== undefined) {
          records[idx].quantity = Number(payload.quantity)
        }
        if (payload.unit_price_myr !== undefined) {
          records[idx].unit_price_myr = String(payload.unit_price_myr)
        }
        if (payload.status !== undefined) {
          records[idx].status = payload.status
        }

        // Automatic removal when stock reaches 0
        if (Number(records[idx].quantity) <= 0) {
          records.splice(idx, 1)
          writeJson(MASTER_JSON, records)
          sendJson(res, 200, { status: 'deleted', lot_id: lotId, reason: 'stock_depleted' })
        } else {
          writeJson(MASTER_JSON, records)
          sendJson(res, 200, { status: 'updated', lot_id: lotId, quantity: records[idx].quantity })
        }
      } catch (e) {
        sendJson(res, 500, { error: e.message })
      }
      return
    }

    // ── DELETE /api/batches/:id → DELETE directly from inventory_master.json ───
    const delMatch = url.match(/^\/api\/batches\/([^?/]+)$/)
    if (delMatch && req.method === 'DELETE') {
      try {
        const lotId   = decodeURIComponent(delMatch[1])
        const records = readJson(MASTER_JSON)
        const before  = records.length
        const updated = records.filter(r => r.lot_id !== lotId)
        writeJson(MASTER_JSON, updated)
        sendJson(res, 200, { status: 'deleted', lot_id: lotId, removed: before - updated.length })
      } catch (e) {
        sendJson(res, 500, { error: e.message })
      }
      return
    }

    // ── POST /api/transactions → save directly to transactions.json ────────────
    if (url === '/api/transactions' && req.method === 'POST') {
      try {
        const txn     = await collectBody(req)
        const records = readJson(TXNS_JSON)
        if (!records.some(r => r.id === txn.id)) {
          records.unshift(txn)
        }
        writeJson(TXNS_JSON, records)
        sendJson(res, 200, { status: 'saved', id: txn.id })
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
