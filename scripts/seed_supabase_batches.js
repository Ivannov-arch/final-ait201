const fs = require('fs');
const path = require('path');

function getEnvKey(key) {
  if (process.env[key]) return process.env[key];
  try {
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      const match = fs.readFileSync(envPath, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
      if (match) return match[1].trim();
    }
  } catch (_) {}
  try {
    const feEnv = path.resolve(__dirname, '../frontend/.env');
    if (fs.existsSync(feEnv)) {
      const match = fs.readFileSync(feEnv, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
      if (match) return match[1].trim();
    }
  } catch (_) {}
  return '';
}

const SUPABASE_URL = getEnvKey('VITE_SUPABASE_URL');
const SECRET_KEY   = getEnvKey('SUPABASE_SERVICE_ROLE_KEY');

const MASTER_PATH = path.join(__dirname, '../data/processed/inventory_master.json');
const batches = JSON.parse(fs.readFileSync(MASTER_PATH, 'utf8'));

// Filter out test/dummy lots like LOT-1843
const cleanBatches = batches.filter(b => b.lot_id !== 'LOT-1843' && !b.product_name.includes('ioo'));

function parseDate(dStr, fallbackDays = 7) {
  if (!dStr) {
    const d = new Date(); d.setDate(d.getDate() + fallbackDays);
    return d.toISOString().slice(0, 10);
  }
  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return dStr;
  const parsed = new Date(dStr);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const d = new Date(); d.setDate(d.getDate() + fallbackDays);
  return d.toISOString().slice(0, 10);
}

const payload = cleanBatches.map(b => {
  const dte = Number(b.days_to_expiry) || 5;
  const qty = Number(b.quantity) || 0;
  const price = parseFloat(b.unit_price_myr) || 5.0;

  let riskLabel = 'LOW';
  if (dte <= 2) riskLabel = 'HIGH';
  else if (dte <= 5) riskLabel = 'MODERATE';

  return {
    batch_id: b.lot_id,
    product_id: b.product_id || ('PRD-' + String(b.lot_id).replace(/\D/g, '')),
    product_name: b.product_name,
    category: b.category || 'Produce',
    quantity: qty,
    uom: b.uom || 'units',
    expiry_date: parseDate(b.expiry_date, dte),
    date_received: parseDate(b.date_received, -7),
    shelf_life_days: Number(b.shelf_life_days) || (dte + 7),
    days_to_expiry: dte,
    turnover_ratio: parseFloat(b.turnover_ratio) || 1.5,
    stock_pressure: parseFloat(b.stock_pressure) || 1.0,
    reorder_level: Number(b.reorder_level) || 15,
    unit_price_myr: price,
    store_id: b.store_id || 'MY-KL-001',
    risk_label: riskLabel,
    recommended_route: dte <= 1 ? 'Donation' : dte <= 3 ? 'Dynamic Markdown' : 'Normal Sale'
  };
});

async function upload() {
  console.log(`Starting upload of ${payload.length} batches to Supabase...`);
  const endpoint = `${SUPABASE_URL}/rest/v1/batches`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'apikey': SECRET_KEY,
      'Authorization': `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify(payload)
  });

  if (res.ok || res.status === 201 || res.status === 204) {
    console.log(`✅ SUCCESS! All ${payload.length} batches uploaded/synced to Supabase.`);
  } else {
    const text = await res.text();
    console.error(`❌ FAILED (${res.status}):`, text);
  }
}

upload();
