import type { Product } from './types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type CatMetal = 'STG' | '9YG' | '18YG'
export type CatProductType = 'standard' | 'charm' | 'chain' | 'earring'

export interface CatalogueRates {
  castSTG: number        // $/g cast sterling silver (ex GST)
  cast9YG: number        // $/g cast 9ct yellow gold
  cast18YG: number       // $/g cast 18ct yellow gold
  earringRate: number    // $/g handmade earrings
  margin: number         // 0–1 e.g. 0.70
  chainMargin: number    // 0–1 e.g. 0.50
  charmAddonSTG: number  // $/pc charm add-on for STG
  charmAddon9YG: number
  charmAddon18YG: number
}

export const DEFAULT_CAT_RATES: CatalogueRates = {
  castSTG: 5.15,
  cast9YG: 95.19,
  cast18YG: 185.73,
  earringRate: 145.00,
  margin: 0.70,
  chainMargin: 0.50,
  charmAddonSTG: 4.93,
  charmAddon9YG: 92.67,
  charmAddon18YG: 180.81,
}

export interface CatProductLine {
  type: 'product'
  id: string
  productId: string
  productName: string
  productType: CatProductType
  metal: CatMetal
  qty: number
  extraOverride?: number
}

export interface CatComponentLine {
  type: 'component'
  id: string
  name: string
  rawCost: number
  qty: number
  labour?: number
  packaging?: number
  useChainMargin?: boolean
}

export type CatLineItem = CatProductLine | CatComponentLine

export interface CatQuote {
  id: string
  number: string
  date: string
  customer: string
  notes: string
  lineItems: CatLineItem[]
  createdAt: string
  updatedAt: string
}

// ── Pricing ───────────────────────────────────────────────────────────────────

export function getCastRate(rates: CatalogueRates, metal: CatMetal, productType: CatProductType): number {
  if (productType === 'earring') return rates.earringRate
  if (metal === 'STG') return rates.castSTG
  if (metal === '9YG') return rates.cast9YG
  return rates.cast18YG
}

export function getCharmAddon(rates: CatalogueRates, metal: CatMetal): number {
  if (metal === 'STG') return rates.charmAddonSTG
  if (metal === '9YG') return rates.charmAddon9YG
  return rates.charmAddon18YG
}

export function getProductWeight(product: Product, metal: CatMetal): number {
  return product.metalLines
    .filter(l => l.metalType === (metal as string))
    .reduce((sum, l) => sum + (l.grams || 0), 0)
}

export function calcProductLineUnit(
  line: CatProductLine,
  product: Product,
  rates: CatalogueRates
): { exGST: number; incGST: number } | null {
  const weight = getProductWeight(product, line.metal)
  if (weight <= 0) return null
  const rate = getCastRate(rates, line.metal, line.productType)
  const addon = line.productType === 'charm' ? getCharmAddon(rates, line.metal) : 0
  const extra = line.extraOverride ?? product.packaging // products store extra in packaging for catalogue use? No — use 0 for now
  const metalCost = weight * rate + addon
  const totalCost = metalCost + (product.labour || 0) + (product.packaging || 0) + (line.extraOverride ?? 0)
  const margin = line.productType === 'chain' ? rates.chainMargin : rates.margin
  const exGST = totalCost / (1 - margin)
  return {
    exGST: Math.round(exGST * 100) / 100,
    incGST: Math.round(exGST * 1.1 * 100) / 100,
  }
}

export function calcComponentLineUnit(
  line: CatComponentLine,
  rates: CatalogueRates
): { exGST: number; incGST: number } {
  const totalCost = line.rawCost + (line.labour || 0) + (line.packaging || 0)
  const margin = line.useChainMargin ? rates.chainMargin : rates.margin
  const exGST = totalCost / (1 - margin)
  return {
    exGST: Math.round(exGST * 100) / 100,
    incGST: Math.round(exGST * 1.1 * 100) / 100,
  }
}

export interface LinePrice {
  unitIncGST: number | null
  lineIncGST: number | null
}

export function getLinePrice(
  line: CatLineItem,
  products: Product[],
  rates: CatalogueRates
): LinePrice {
  const qty = line.qty || 1
  if (line.type === 'product') {
    const product = products.find(p => p.id === line.productId)
    if (!product) return { unitIncGST: null, lineIncGST: null }
    const unit = calcProductLineUnit(line, product, rates)
    if (!unit) return { unitIncGST: null, lineIncGST: null }
    return {
      unitIncGST: unit.incGST,
      lineIncGST: Math.round(unit.incGST * qty * 100) / 100,
    }
  }
  const unit = calcComponentLineUnit(line, rates)
  return {
    unitIncGST: unit.incGST,
    lineIncGST: Math.round(unit.incGST * qty * 100) / 100,
  }
}

export function calcQuoteTotals(quote: CatQuote, products: Product[], rates: CatalogueRates) {
  let totalInc = 0
  for (const line of quote.lineItems) {
    const p = getLinePrice(line, products, rates)
    if (p.lineIncGST) totalInc += p.lineIncGST
  }
  totalInc = Math.round(totalInc * 100) / 100
  const subtotalEx = Math.round(totalInc / 1.1 * 100) / 100
  const gst = Math.round((totalInc - subtotalEx) * 100) / 100
  return { subtotalEx, gst, totalInc }
}

// ── Text export ───────────────────────────────────────────────────────────────

export function genCatQuoteText(quote: CatQuote, products: Product[], rates: CatalogueRates): string {
  const fmt = (n: number) => `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const lines: string[] = [
    `Quote #${quote.number}`,
    ...(quote.customer ? [`For: ${quote.customer}`] : []),
    `Date: ${new Date(quote.date).toLocaleDateString('en-AU')}`,
    ...(quote.notes ? ['', quote.notes] : []),
    '',
  ]
  for (const line of quote.lineItems) {
    const p = getLinePrice(line, products, rates)
    const name = line.type === 'product'
      ? `${line.productName} (${line.metal})`
      : line.name
    const qty = (line.qty || 1) > 1 ? ` ×${line.qty}` : ''
    const price = p.lineIncGST != null ? fmt(p.lineIncGST) : 'NO PRICE'
    lines.push(`${name}${qty} — ${price}`)
  }
  const t = calcQuoteTotals(quote, products, rates)
  lines.push('', `Total: ${fmt(t.totalInc)} inc GST (${fmt(t.subtotalEx)} ex)`)
  return lines.join('\n')
}

// ── Persistence ───────────────────────────────────────────────────────────────

export function loadCatRates(): CatalogueRates {
  try {
    const raw = localStorage.getItem('bs-cat-rates')
    return raw ? { ...DEFAULT_CAT_RATES, ...JSON.parse(raw) } : { ...DEFAULT_CAT_RATES }
  } catch { return { ...DEFAULT_CAT_RATES } }
}

export function saveCatRates(r: CatalogueRates) {
  localStorage.setItem('bs-cat-rates', JSON.stringify(r))
}

export function loadCatQuotes(): CatQuote[] {
  try {
    const raw = localStorage.getItem('bs-cat-quotes')
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveCatQuotesStore(quotes: CatQuote[]) {
  localStorage.setItem('bs-cat-quotes', JSON.stringify(quotes))
}

export function nextCatQuoteNumber(): string {
  const key = 'bs-cat-qno'
  const n = (parseInt(localStorage.getItem(key) || '0', 10)) + 1
  localStorage.setItem(key, String(n))
  const d = new Date()
  return `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${String(n).padStart(3, '0')}`
}

export function newCatQuote(number: string): CatQuote {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    number,
    date: now.slice(0, 10),
    customer: '',
    notes: '',
    lineItems: [],
    createdAt: now,
    updatedAt: now,
  }
}
