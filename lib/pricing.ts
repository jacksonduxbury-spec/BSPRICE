import type { MetalLine, StoneLine, AdditionalItem, Quote, QuoteLineItem, MetalPrices, StoneType, MetalType, AppSettings, WaxMultipliers } from './types'
export type { StoneType, MetalType, WaxMultipliers, AdditionalItem }

export const STONE_GP: Record<StoneType, number> = {
  'lab-diamond': 0.85,
  'sapphire': 0.65,
  'natural': 0.30,
}

export const STONE_LABELS: Record<StoneType, string> = {
  'lab-diamond': 'Lab Diamond (85% GP)',
  'sapphire': 'Australian Sapphire (65% GP)',
  'natural': 'Natural Diamond (30% GP)',
}

export const STONE_LABELS_CLIENT: Record<StoneType, string> = {
  'lab-diamond': 'Lab Diamond',
  'sapphire': 'Australian Sapphire',
  'natural': 'Natural Diamond',
}

export const METAL_LABELS: Record<MetalType, string> = {
  STG: 'Sterling Silver',
  '9YG': '9ct Yellow Gold',
  '9WG': '9ct White Gold',
  '18YG': '18ct Yellow Gold',
  '18WG': '18ct White Gold',
  PLT: 'Platinum',
}

export const DEFAULT_METAL_PRICES: MetalPrices = {
  STG: 1.10,
  '9YG': 28.50,
  '9WG': 28.50,
  '18YG': 57.00,
  '18WG': 57.00,
  PLT: 50.00,
}

export const DEFAULT_WAX_MULTIPLIERS: WaxMultipliers = {
  STG: 10.3,
  '9YG': 11.4,   // same for 9WG
  '18YG': 15.7,  // same for 18WG
  PLT: 21.06,
}

// Cross-metal density conversion ratios
export const CROSS_METAL: Record<string, Record<string, number>> = {
  STG:   { STG: 1,       '9YG': 1.10680, '18YG': 1.52427, PLT: 2.04481 },
  '9YG': { STG: 0.90351, '9YG': 1,       '18YG': 1.37719, PLT: 1.84738 },
  '18YG':{ STG: 0.65605, '9YG': 0.72611, '18YG': 1,       PLT: 1.34224 },
  PLT:   { STG: 0.48904, '9YG': 0.54131, '18YG': 0.74503, PLT: 1       },
}

export const DEFAULT_SETTINGS: AppSettings = {
  metalPrices: DEFAULT_METAL_PRICES,
  stoneGP: { ...STONE_GP },
  waxMultipliers: { ...DEFAULT_WAX_MULTIPLIERS },
  usdRate: 0.72,
  metalPriceSource: 'manual',
  googleSheetUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS-ydIer9iNAZJPZPeHsr6iJxoFeTUVNPDchplrZpDKFaJ64SwvOhHy5FyCHylOA1NnSOY2FVffb7lE/pub?output=csv',
}

export function calcMetalCost(lines: MetalLine[], prices: MetalPrices): number {
  return lines.reduce((sum, line) => sum + (line.grams || 0) * prices[line.metalType], 0)
}

export function calcStoneRetail(line: StoneLine, gpMap?: Record<StoneType, number>): number {
  const gp = gpMap ? (gpMap[line.stoneType] ?? STONE_GP[line.stoneType]) : STONE_GP[line.stoneType]
  return (line.wholesaleCost || 0) / (1 - gp)
}

export function calcAdditionalCost(items: AdditionalItem[]): number {
  return (items || []).reduce((sum, i) => sum + (i.price || 0), 0)
}

export function calcTotalCost(quote: Quote, prices: MetalPrices): number {
  const metalCost = calcMetalCost(quote.metalLines, prices)
  const stoneCost = quote.stoneLines.reduce((sum, s) => sum + (s.wholesaleCost || 0), 0)
  const additionalCost = calcAdditionalCost(quote.additionalItems)
  return metalCost + stoneCost + additionalCost + (quote.labour || 0) + (quote.packaging || 0)
}

export function calcRetailPrice(quote: Quote, prices: MetalPrices, gpMap?: Record<StoneType, number>): number {
  const metalCost = calcMetalCost(quote.metalLines, prices)
  const stoneRetailTotal = quote.stoneLines.reduce((sum, s) => sum + calcStoneRetail(s, gpMap), 0)
  const additionalTotal = calcAdditionalCost(quote.additionalItems)
  const baseCost = metalCost + (quote.labour || 0) + (quote.packaging || 0)
  const gp = quote.retailGP / 100
  return baseCost / (1 - gp) + stoneRetailTotal + additionalTotal
}

export function calcEffectiveGP(quote: Quote, prices: MetalPrices): number {
  if (!quote.wholesalePrice || quote.wholesalePrice <= 0) return 0
  const totalCost = calcTotalCost(quote, prices)
  return ((quote.wholesalePrice - totalCost) / quote.wholesalePrice) * 100
}

export function convertCurrency(amount: number, rate: number): number {
  return amount * rate
}

export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function newQuote(): Quote {
  return {
    id: crypto.randomUUID(),
    name: 'New Quote',
    clientName: '',
    metalLines: [],
    stoneLines: [],
    additionalItems: [],
    labour: 0,
    packaging: 0,
    mode: 'retail',
    retailGP: 70,
    wholesalePrice: 0,
    currency: 'AUD',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function calcLiPrice(li: QuoteLineItem, quote: Quote, prices: MetalPrices, gpMap?: Record<StoneType, number>): number {
  return calcRetailPrice(
    { metalLines: li.metalLines, stoneLines: li.stoneLines, labour: li.labour, packaging: li.packaging, retailGP: quote.retailGP, additionalItems: [], mode: 'retail' as const, id: '', name: '', clientName: '', wholesalePrice: 0, currency: quote.currency, createdAt: '', updatedAt: '' },
    prices,
    gpMap
  ) * (li.qty || 1)
}

export function generateTextExport(quote: Quote, prices: MetalPrices, settings: AppSettings): string {
  const rate = quote.currency === 'USD' ? settings.usdRate : 1
  const fmt = (n: number) => formatPrice(n * rate, quote.currency)
  const lineItems = quote.lineItems || []

  const lines: string[] = [
    'BROHN SMITH JEWELLERY',
    '─────────────────────────────',
    `Quote: ${quote.name}`,
    `Date: ${new Date(quote.createdAt).toLocaleDateString('en-AU')}`,
    `Mode: ${quote.mode === 'retail' ? 'Retail' : 'Wholesale'}`,
    '',
  ]

  if (lineItems.length > 0) {
    lines.push('── PRODUCTS ──')
    for (const li of lineItems) {
      const unitP = calcRetailPrice(
        { metalLines: li.metalLines, stoneLines: li.stoneLines, labour: li.labour, packaging: li.packaging, retailGP: quote.retailGP, additionalItems: [], mode: 'retail' as const, id: '', name: '', clientName: '', wholesalePrice: 0, currency: quote.currency, createdAt: '', updatedAt: '' },
        prices, settings.stoneGP
      )
      lines.push(`  ${li.name}${li.qty > 1 ? ` ×${li.qty}` : ''}: ${fmt(unitP * (li.qty || 1))}`)
      for (const m of li.metalLines) {
        const cost = (m.grams || 0) * prices[m.metalType]
        lines.push(`    └ ${METAL_LABELS[m.metalType]}: ${m.grams}g = ${fmt(cost)}`)
      }
      for (const s of li.stoneLines) {
        const retail = calcStoneRetail(s, settings.stoneGP)
        const gpPct = ((settings.stoneGP?.[s.stoneType] ?? STONE_GP[s.stoneType]) * 100).toFixed(0)
        lines.push(`    └ ${STONE_LABELS[s.stoneType]}: WS ${fmt(s.wholesaleCost)} → ${fmt(retail)} (${gpPct}% GP)`)
      }
      if (li.labour > 0) lines.push(`    └ Labour: ${fmt(li.labour * (li.qty || 1))}`)
      if (li.packaging > 0) lines.push(`    └ Packaging: ${fmt(li.packaging * (li.qty || 1))}`)
    }
  } else {
    lines.push('── METALS ──')
    for (const m of quote.metalLines) {
      const cost = (m.grams || 0) * prices[m.metalType]
      lines.push(`  ${METAL_LABELS[m.metalType]}: ${m.grams}g × ${fmt(prices[m.metalType])}/g = ${fmt(cost)}`)
    }
    if (quote.stoneLines.length) {
      lines.push('')
      lines.push('── STONES ──')
      for (const s of quote.stoneLines) {
        const retail = calcStoneRetail(s, settings.stoneGP)
        const gpPct = ((settings.stoneGP?.[s.stoneType] ?? STONE_GP[s.stoneType]) * 100).toFixed(0)
        lines.push(`  ${STONE_LABELS[s.stoneType]}: WS ${fmt(s.wholesaleCost)} → Retail ${fmt(retail)} (${gpPct}% GP)`)
      }
    }
    if (quote.labour > 0) lines.push(`  Labour: ${fmt(quote.labour)}`)
    if (quote.packaging > 0) lines.push(`  Packaging: ${fmt(quote.packaging)}`)
  }

  if (quote.additionalItems?.length) {
    lines.push('')
    lines.push('── ADDITIONAL ITEMS ──')
    for (const item of quote.additionalItems) {
      lines.push(`  ${item.label}: ${fmt(item.price)}`)
    }
  }

  const additionalCost = calcAdditionalCost(quote.additionalItems)
  lines.push('')
  lines.push('── SUMMARY ──')
  if (additionalCost > 0) lines.push(`  Additional items: ${fmt(additionalCost)}`)

  if (quote.mode === 'retail') {
    const retail = calcRetailPrice(quote, prices, settings.stoneGP)
    lines.push(`  GP%: ${quote.retailGP}%`)
    lines.push(`  ► RETAIL PRICE: ${fmt(retail)}`)
  } else if (quote.wholesalePrice > 0) {
    const gp = calcEffectiveGP(quote, prices)
    lines.push(`  ► WHOLESALE PRICE: ${fmt(quote.wholesalePrice)}`)
    lines.push(`  Effective GP: ${gp.toFixed(1)}%`)
  } else {
    lines.push(`  ► WHOLESALE PRICE: (not set)`)
  }

  lines.push('')
  lines.push('─────────────────────────────')
  lines.push('brohnsmith.com')

  return lines.join('\n')
}

export function generateClientTextExport(quote: Quote, prices: MetalPrices, settings: AppSettings): string {
  const rate = quote.currency === 'USD' ? settings.usdRate : 1
  const fmt = (n: number) => formatPrice(n * rate, quote.currency)
  const lineItems = quote.lineItems || []

  const finalPrice = quote.mode === 'retail'
    ? calcRetailPrice(quote, prices, settings.stoneGP)
    : quote.wholesalePrice

  const lines: string[] = [
    'BROHN SMITH JEWELLERY',
    '─────────────────────────────',
  ]

  if (quote.clientName) lines.push(`For: ${quote.clientName}`)
  lines.push(`Date: ${new Date(quote.createdAt).toLocaleDateString('en-AU')}`)
  lines.push('')

  if (lineItems.length > 0) {
    for (const li of lineItems) {
      const unitP = calcRetailPrice(
        { metalLines: li.metalLines, stoneLines: li.stoneLines, labour: li.labour, packaging: li.packaging, retailGP: quote.retailGP, additionalItems: [], mode: 'retail' as const, id: '', name: '', clientName: '', wholesalePrice: 0, currency: quote.currency, createdAt: '', updatedAt: '' },
        prices, settings.stoneGP
      )
      lines.push(`  ${li.name}${li.qty > 1 ? ` ×${li.qty}` : ''}`)
      lines.push(`  ${fmt(unitP * (li.qty || 1))}`)
      lines.push('')
    }
  } else {
    if (quote.metalLines.length) {
      for (const m of quote.metalLines) {
        lines.push(`  ${METAL_LABELS[m.metalType]}`)
      }
    }
    if (quote.stoneLines.length) {
      for (const s of quote.stoneLines) {
        lines.push(`  ${STONE_LABELS_CLIENT[s.stoneType]}`)
      }
    }
    lines.push('')
    if (finalPrice > 0) {
      lines.push(`  PRICE: ${fmt(finalPrice)}`)
    } else {
      lines.push(`  PRICE: (to be confirmed)`)
    }
    lines.push('')
  }

  if (quote.additionalItems?.length) {
    for (const item of quote.additionalItems) {
      lines.push(`  ${item.label}: ${fmt(item.price)}`)
    }
    lines.push('')
  }

  if (lineItems.length > 0) {
    lines.push(`  TOTAL: ${fmt(finalPrice)}`)
    lines.push('')
  }

  lines.push('─────────────────────────────')
  lines.push('All prices AUD ex GST unless otherwise stated')
  lines.push('brohnsmith.com')

  return lines.join('\n')
}
