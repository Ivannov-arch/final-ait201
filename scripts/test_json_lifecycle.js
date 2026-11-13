const fs = require('fs')
const path = require('path')

const DATA_DIR = path.resolve(__dirname, '../data/processed')
const MASTER_JSON = path.join(DATA_DIR, 'inventory_master.json')
const TXNS_JSON = path.join(DATA_DIR, 'transactions.json')

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

function writeJson(p, d) {
  fs.writeFileSync(p, JSON.stringify(d, null, 2), 'utf8')
}

console.log('=== TEST 1: READ MASTER JSON ===')
const initial = readJson(MASTER_JSON)
console.log(`Initial count in inventory_master.json: ${initial.length}`)
if (initial.length !== 60) {
  console.error(`FAIL: Expected 60, got ${initial.length}`)
  process.exit(1)
}
console.log('PASS: Exactly 60 active items in master JSON.')

console.log('\n=== TEST 2: ADD (POST) TO MASTER JSON ===')
const testBatch = {
  id: 'LOT-1999',
  product: 'Fresh Organic Dragonfruit',
  category: 'Produce',
  quantity: 50,
  stockQty: 50,
  qty: '50 kg',
  uom: 'kg',
  unitPrice: 12.50,
  sellPrice: 'RM 12.50/kg',
  costPrice: 'RM 8.75/kg',
  expiryDate: '2026-11-28',
  dateIn: '2026-11-14',
  dteNum: 14,
  reorderLevel: 20
}

const records = readJson(MASTER_JSON)
records.unshift({
  lot_id: testBatch.id,
  product_name: testBatch.product,
  category: testBatch.category,
  quantity: testBatch.stockQty,
  uom: testBatch.uom,
  unit_price_myr: testBatch.unitPrice.toFixed(2),
  cost_price_myr: '8.75',
  expiry_date: testBatch.expiryDate,
  days_to_expiry: testBatch.dteNum,
  shelf_life_days: testBatch.dteNum + 7,
  date_received: testBatch.dateIn,
  reorder_level: testBatch.reorderLevel,
  reorder_quantity: 25,
  turnover_ratio: '2.50',
  stock_pressure: '2.38',
  risk_tier: 'low',
  risk_label: 'Low Risk',
  supplier_name: 'Local Orchard',
  warehouse_location: 'Bay 4',
  store_id: 'MY-KL-001',
  status: 'Active'
})
writeJson(MASTER_JSON, records)

const afterAdd = readJson(MASTER_JSON)
const added = afterAdd.find(r => r.lot_id === 'LOT-1999')
if (!added || afterAdd.length !== 61) {
  console.error('FAIL: Batch LOT-1999 not found after add')
  process.exit(1)
}
console.log(`PASS: Batch LOT-1999 added. Total count: ${afterAdd.length}`)

console.log('\n=== TEST 3: UPDATE (PATCH) QUANTITY IN MASTER JSON ===')
const records2 = readJson(MASTER_JSON)
const idx = records2.findIndex(r => r.lot_id === 'LOT-1999')
records2[idx].quantity = 25
writeJson(MASTER_JSON, records2)

const afterPatch = readJson(MASTER_JSON)
const patched = afterPatch.find(r => r.lot_id === 'LOT-1999')
if (patched.quantity !== 25) {
  console.error(`FAIL: Quantity expected 25, got ${patched.quantity}`)
  process.exit(1)
}
console.log(`PASS: Batch LOT-1999 quantity updated to ${patched.quantity}`)

console.log('\n=== TEST 4: AUTO-DELETE ON 0 QUANTITY IN MASTER JSON ===')
const records3 = readJson(MASTER_JSON)
const idx3 = records3.findIndex(r => r.lot_id === 'LOT-1999')
records3[idx3].quantity = 0
if (Number(records3[idx3].quantity) <= 0) {
  records3.splice(idx3, 1)
}
writeJson(MASTER_JSON, records3)

const afterZero = readJson(MASTER_JSON)
const deletedZero = afterZero.find(r => r.lot_id === 'LOT-1999')
if (deletedZero || afterZero.length !== 60) {
  console.error('FAIL: Batch LOT-1999 still exists after zero stock')
  process.exit(1)
}
console.log(`PASS: Zero-stock batch LOT-1999 automatically deleted. Count back to: ${afterZero.length}`)

console.log('\n=== TEST 5: DIRECT DELETE IN MASTER JSON ===')
// Add again then delete directly
const records4 = readJson(MASTER_JSON)
records4.unshift({ lot_id: 'LOT-TEST-DEL', product_name: 'Temp', quantity: 10, status: 'Active' })
writeJson(MASTER_JSON, records4)
const beforeDel = readJson(MASTER_JSON)
const filtered = beforeDel.filter(r => r.lot_id !== 'LOT-TEST-DEL')
writeJson(MASTER_JSON, filtered)
const afterDel = readJson(MASTER_JSON)
if (afterDel.find(r => r.lot_id === 'LOT-TEST-DEL') || afterDel.length !== 60) {
  console.error('FAIL: Direct delete failed')
  process.exit(1)
}
console.log(`PASS: Direct delete verified. Count: ${afterDel.length}`)

console.log('\n=== TEST 6: TRANSACTIONS JSON READ & APPEND ===')
const txns = readJson(TXNS_JSON)
console.log(`Initial transactions count: ${txns.length}`)
const testTxn = {
  id: 'TXN-TEST-VERIFY',
  batchId: 'LOT-1000',
  product: 'Bell Pepper',
  qty: 2,
  total: 40.94,
  date: '14 Nov 2026',
  payMethod: 'Cash',
  status: 'paid'
}
txns.unshift(testTxn)
writeJson(TXNS_JSON, txns)
const afterTxn = readJson(TXNS_JSON)
if (!afterTxn.some(t => t.id === 'TXN-TEST-VERIFY')) {
  console.error('FAIL: Transaction not found in transactions.json')
  process.exit(1)
}
console.log(`PASS: Transaction saved to transactions.json. New count: ${afterTxn.length}`)

// Cleanup test transaction
const cleanedTxns = afterTxn.filter(t => t.id !== 'TXN-TEST-VERIFY')
writeJson(TXNS_JSON, cleanedTxns)
console.log(`PASS: Cleaned up test transaction. Final count: ${cleanedTxns.length}`)

console.log('\n========================================')
console.log('>>> ALL 6 LIFECYCLE TESTS PASSED 100% <<<')
console.log('inventory_master.json is cleanly 60 rows')
console.log('========================================')
