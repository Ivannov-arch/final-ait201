/* Verifikasi pra-deploy: fitur Forecast (jalur A). */
const BASE = 'http://localhost:5173';
let ok = 0, fail = 0;
const Test = (name, cond, info) => {
  if (cond) { ok++; console.log('PASS  ' + name + (info ? ' (' + info + ')' : '')); }
  else { fail++; console.log('FAIL  ' + name + (info ? ' (' + info + ')' : '')); }
};
const get = async p => (await fetch(BASE + p)).json();

(async () => {
  // 5. Multi-store
  for (const s of [1, 7, 54]) {
    const f = await get(`/api/forecast/products?store_nbr=${s}&limit=200`);
    Test(`store_nbr=${s} OK`, f.status === 'success');
  }

  // 6. limit dipatuhi
  const f10 = await get('/api/forecast/products?store_nbr=1&limit=10');
  Test('limit=10 dipatuhi', f10.total_products <= 10, `total=${f10.total_products}`);

  // 7. Sumber forecast: known -> historical_static, unknown -> heuristic
  const fAll = await get('/api/forecast/products?store_nbr=1&limit=200');
  const prods = Object.values(fAll.products);
  const known = prods.filter(p => p.mlFamilyKnown === true);
  const unknown = prods.filter(p => p.mlFamilyKnown === false);
  Test('produk dgn family dikenal: source=historical_static', known.every(p => p.forecast_source === 'historical_static'), `known=${known.length}`);
  Test('produk dgn family tak dikenal: source=heuristic (jujur)', unknown.length === 0 || unknown.every(p => p.forecast_source === 'heuristic'), `unknown=${unknown.length}`);

  // 8. Halaman FEFO pakai limit=200 — tahan
  Test('limit=200 tahan (dipakai halaman FEFO)', fAll.status === 'success', `total=${fAll.total_products}`);

  // 9. Spesifikasi sumber data: 14 family x 54 store x horizon 1-3
  const raw = require(require('path').join(__dirname, 'data', 'processed', 'three_day_forecast.json'));
  const fams = new Set(raw.map(r => r.family)).size;
  const stores = new Set(raw.map(r => r.store_nbr)).size;
  const badHorizon = raw.filter(r => r.horizon < 1 || r.horizon > 3).length;
  Test('sumber data: 14 family', fams === 14, `family=${fams}`);
  Test('sumber data: 54 store', stores === 54, `store=${stores}`);
  Test('sumber data: horizon selalu 1-3', badHorizon === 0);
  Test('sumber data: tidak ada demand negatif/null', raw.every(r => Number.isFinite(parseFloat(r.predicted_demand)) && parseFloat(r.predicted_demand) >= 0));

  // 10. Konsistensi stock trajectory per produk (math check mendalam)
  let mathOk = true;
  for (const p of prods) {
    let cur = p.currentStock;
    for (const pt of p.points) {
      const expect = Math.max(0, cur - pt.demand);
      if (pt.stockRemaining !== expect) { mathOk = false; break; }
      cur = pt.stockRemaining;
    }
    if (!mathOk) break;
  }
  Test('trajektori stok konsisten (rem = stok - demand)', mathOk);

  console.log(`\nTOTAL: ${ok} pass, ${fail} fail`);
  process.exit(fail > 0 ? 1 : 0);
})();
