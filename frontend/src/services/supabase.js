import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://sccsbjlmpxjligwckqpp.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Xpgq-ETg1SUq37N9Qtq-mQ_UEiEO2c-'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ── Map Supabase row → Frontend Batch Object ──────────────────────────────────
export function supabaseRowToBatch(r) {
  const qty   = Number(r.quantity) || 0
  const price = parseFloat(r.unit_price_myr) || 0
  const cost  = parseFloat(r.cost_price_myr) || price * 0.70
  const dte   = Number(r.days_to_expiry) || 0

  let riskType = 'low', risk = 'Low Risk'
  if (dte <= 2)      { riskType = 'high'; risk = 'High Risk' }
  else if (dte <= 5) { riskType = 'med';  risk = 'Moderate Risk' }

  return {
    id:                r.batch_id || r.lot_id,
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
    recommended:       riskType === 'high' ? 'Donate to Food Bank'
                     : riskType === 'med'  ? 'Dynamic Markdown'
                     :                       'Normal Sale'
  }
}
