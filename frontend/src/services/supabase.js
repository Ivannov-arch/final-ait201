import { createClient } from '@supabase/supabase-js'

// Safe environment loading without hardcoded production fallback (BUG-DB-03 fix)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// ── Map Supabase row → Frontend Batch Object (BUG-INV-01 fix: standard LOT-XXXX format)
export function supabaseRowToBatch(r) {
  const rawId = r.lot_id || r.batch_id || `LOT-${r.product_id ? String(r.product_id).replace(/\D/g, '') : '1000'}`
  let canonicalId = String(rawId)
  const canMatch = canonicalId.match(/^CAN-(\d+)$/i)
  if (canMatch) {
    const num = parseInt(canMatch[1], 10)
    canonicalId = num >= 2000 ? `LOT-${num - 1000}` : `LOT-${num}`
  }
  const qty   = Number(r.quantity) || 0
  const price = parseFloat(r.unit_price_myr) || 0
  const cost  = parseFloat(r.cost_price_myr) || price * 0.70
  const dte   = Number(r.days_to_expiry) || 0

  let riskType = 'low', risk = 'Low Risk'
  if (dte <= 2)      { riskType = 'high'; risk = 'High Risk' }
  else if (dte <= 5) { riskType = 'med';  risk = 'Moderate Risk' }

  return {
    id:                canonicalId,
    lot_id:            canonicalId,
    batch_id:          canonicalId,
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
    supplier:          r.supplier_name || 'Direct Procurement',
    warehouseLocation: r.warehouse_location || 'Aisle 1',
    storeId:           r.store_id || 'MY-KL-001',
    recommended:       r.recommended_route || (riskType === 'high' ? 'Donate to Food Bank'
                     : riskType === 'med'  ? 'Dynamic Markdown'
                     :                       'Normal Sale')
  }
}
