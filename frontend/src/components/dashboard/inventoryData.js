export function parseDateToDays(expiryStr) {
  if (!expiryStr) return 7
  const parsed = Date.parse(expiryStr)
  if (!isNaN(parsed)) {
    const expDate = new Date(parsed)
    const baseYear = expDate.getFullYear()
    const now = new Date()
    const refDate = (baseYear === 2026) ? new Date('2026-10-30') : now
    const diffMs = expDate - refDate
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
  }
  return 7
}

export function computeDteAndRisk(expiryStr) {
  const days = parseDateToDays(expiryStr)
  const dte = days === 1 ? '1 day' : `${days} days`
  let risk = 'Low Risk'
  let riskType = 'low'
  if (days <= 2) {
    risk = 'High Risk'
    riskType = 'high'
  } else if (days <= 5) {
    risk = 'Med Risk'
    riskType = 'med'
  }
  return { dte, dteNum: days, risk, riskType }
}

export const INITIAL_BATCHES = [
  {
    id: 'B-1047',
    product: 'Organic Spinach',
    category: 'Vegetables',
    costPrice: 'RM 6.50/kg',
    sellPrice: 'RM 8.00/kg',
    qty: '12 kg',
    dateIn: 'Oct 28, 2026',
    expiryDate: 'Oct 31, 2026',
    dte: '1 day',
    dteNum: 1,
    risk: 'High Risk',
    riskType: 'high',
    image: 'https://images.unsplash.com/photo-1576045057995-568f588f82fb?w=160&auto=format&fit=crop&q=80',
    recommended: 'Dynamic Markdown'
  },
  {
    id: 'B-1048',
    product: 'Fresh Milk',
    category: 'Dairy',
    costPrice: 'RM 7.20/pack',
    sellPrice: 'RM 8.90/pack',
    qty: '24 pack',
    dateIn: 'Oct 27, 2026',
    expiryDate: 'Nov 02, 2026',
    dte: '4 days',
    dteNum: 4,
    risk: 'Med Risk',
    riskType: 'med',
    image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=160&auto=format&fit=crop&q=80',
    recommended: 'Dynamic Markdown'
  },
  {
    id: 'B-1049',
    product: 'Cherry Tomato',
    category: 'Vegetables',
    costPrice: 'RM 9.80/kg',
    sellPrice: 'RM 12.00/kg',
    qty: '15 kg',
    dateIn: 'Oct 26, 2026',
    expiryDate: 'Nov 05, 2026',
    dte: '7 days',
    dteNum: 7,
    risk: 'Low Risk',
    riskType: 'low',
    image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=160&auto=format&fit=crop&q=80',
    recommended: 'Normal Sale'
  },
  {
    id: 'B-1050',
    product: 'Brown Eggs',
    category: 'Dairy',
    costPrice: 'RM 12.50/pack',
    sellPrice: 'RM 15.00/pack',
    qty: '30 pack',
    dateIn: 'Oct 26, 2026',
    expiryDate: 'Nov 06, 2026',
    dte: '8 days',
    dteNum: 8,
    risk: 'Low Risk',
    riskType: 'low',
    image: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=160&auto=format&fit=crop&q=80',
    recommended: 'Normal Sale'
  },
  {
    id: 'B-1051',
    product: 'Green Lettuce',
    category: 'Vegetables',
    costPrice: 'RM 5.20/kg',
    sellPrice: 'RM 6.50/kg',
    qty: '20 kg',
    dateIn: 'Oct 25, 2026',
    expiryDate: 'Nov 08, 2026',
    dte: '10 days',
    dteNum: 10,
    risk: 'Low Risk',
    riskType: 'low',
    image: 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?w=160&auto=format&fit=crop&q=80',
    recommended: 'Normal Sale'
  },
  {
    id: 'LOT-4821',
    product: 'Butterhead Lettuce',
    category: 'Vegetables',
    costPrice: 'RM 5.50/kg',
    sellPrice: 'RM 7.20/kg',
    qty: '120 kg',
    dateIn: 'Oct 26, 2026',
    expiryDate: 'Nov 04, 2026',
    dte: '4 days',
    dteNum: 4,
    risk: 'Med Risk',
    riskType: 'med',
    image: 'https://images.unsplash.com/photo-1622206151226-18ca2c9ab4a1?w=160&auto=format&fit=crop&q=80',
    recommended: 'Dynamic Markdown'
  },
  {
    id: 'LOT-3109',
    product: 'Cavendish Bananas',
    category: 'Fruits',
    costPrice: 'RM 3.80/kg',
    sellPrice: 'RM 5.50/kg',
    qty: '140 kg',
    dateIn: 'Oct 25, 2026',
    expiryDate: 'Nov 01, 2026',
    dte: '2 days',
    dteNum: 2,
    risk: 'High Risk',
    riskType: 'high',
    image: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=160&auto=format&fit=crop&q=80',
    recommended: 'Dynamic Markdown'
  },
  {
    id: 'LOT-3902',
    product: 'Pasteurized Fresh Milk',
    category: 'Dairy',
    costPrice: 'RM 6.80/pack',
    sellPrice: 'RM 8.50/pack',
    qty: '80 pack',
    dateIn: 'Oct 27, 2026',
    expiryDate: 'Nov 01, 2026',
    dte: '1 day',
    dteNum: 1,
    risk: 'High Risk',
    riskType: 'high',
    image: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=160&auto=format&fit=crop&q=80',
    recommended: 'Donate to Food Bank'
  },
  {
    id: 'LOT-5188',
    product: 'Roma Vine Tomatoes',
    category: 'Vegetables',
    costPrice: 'RM 6.50/kg',
    sellPrice: 'RM 8.00/kg',
    qty: '45 kg',
    dateIn: 'Oct 28, 2026',
    expiryDate: 'Nov 06, 2026',
    dte: '7 days',
    dteNum: 7,
    risk: 'Low Risk',
    riskType: 'low',
    image: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=160&auto=format&fit=crop&q=80',
    recommended: 'Normal Sale'
  },
  {
    id: 'LOT-2041',
    product: 'Sourdough Country Loaf',
    category: 'Bakery',
    costPrice: 'RM 9.00/pack',
    sellPrice: 'RM 12.00/pack',
    qty: '50 pack',
    dateIn: 'Oct 28, 2026',
    expiryDate: 'Nov 03, 2026',
    dte: '3 days',
    dteNum: 3,
    risk: 'Med Risk',
    riskType: 'med',
    image: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?w=160&auto=format&fit=crop&q=80',
    recommended: 'Dynamic Markdown'
  },
  {
    id: 'LOT-1984',
    product: 'Butter Croissants',
    category: 'Bakery',
    costPrice: 'RM 8.00/pack',
    sellPrice: 'RM 10.50/pack',
    qty: '35 pack',
    dateIn: 'Oct 28, 2026',
    expiryDate: 'Oct 31, 2026',
    dte: '1 day',
    dteNum: 1,
    risk: 'High Risk',
    riskType: 'high',
    image: 'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=160&auto=format&fit=crop&q=80',
    recommended: 'Donate to Food Bank'
  }
]
