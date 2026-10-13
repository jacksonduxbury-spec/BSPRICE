// Customer-facing catalogue: live Shopify listings merged with the Price List sheet snapshot.
// Retail prices only. Weights and costs stay in the sheet.

export interface ClientPrice {
  size: string          // '' when one price covers every size
  price: number         // A$ inc GST
}

export interface ClientMetal {
  label: string         // '925 Silver', '9K Yellow', ...
  order: number
  prices: ClientPrice[]
  sizes: string         // size summary when a single price covers a range
  source: 'site' | 'list'
  image?: string
}

export interface ClientItem {
  id: string
  name: string
  category: string
  image: string | null
  images: string[]
  metals: ClientMetal[]
  from: number
  listed: boolean       // on brohnsmith.com
}

export interface ClientGem {
  code: string
  description: string
  colour: string
  cut: string
  carat: number | null
  price: number | null
}

export interface ClientCatalogue {
  items: ClientItem[]
  gems: ClientGem[]
  categories: string[]
  siteOk: boolean
  listPulledAt: string
  fetchedAt: string
}

export interface PriceListRow {
  product: string; category: string; metal: string; size: string; build: string
  rrp: number | null
}

// House order and wording for metals
const METALS: { code: string; label: string; match: RegExp }[] = [
  { code: 'STG',  label: '925 Silver',          match: /^(925|sterling) silver$/i },
  { code: 'OXI',  label: 'Oxidised 925 Silver', match: /^oxidised( 925 silver)?$/i },
  { code: '9YG',  label: '9K Yellow',           match: /^9k yellow( gold)?$/i },
  { code: '9WG',  label: '9K White',            match: /^9k white( gold)?$/i },
  { code: '14YG', label: '14K Yellow',          match: /^14k yellow( gold)?$/i },
  { code: '14WG', label: '14K White',           match: /^14k white( gold)?$/i },
  { code: '18YG', label: '18K Yellow',          match: /^18k yellow( gold)?$/i },
  { code: '18WG', label: '18K White',           match: /^18k white( gold)?$/i },
  { code: 'PLT',  label: 'Platinum',            match: /^platinum/i },
]
const OTHER_METAL_ORDER = METALS.length

function metalFromLabel(raw: string) {
  const i = METALS.findIndex(m => m.match.test(raw.trim()))
  return i >= 0 ? { ...METALS[i], order: i } : null
}
function metalFromCode(code: string) {
  const i = METALS.findIndex(m => m.code === code)
  return i >= 0 ? { ...METALS[i], order: i } : null
}

// Same tiers the staff tools use: <$200 nearest $5, $200–$1000 nearest $10, above nearest $25
export function roundRetail(n: number): number {
  if (n <= 0) return 0
  const step = n < 200 ? 5 : n < 1000 ? 10 : 25
  return Math.round(n / step) * step
}

// Sheet names that are spelled differently on the site
const ALIASES: Record<string, string> = {
  'LOHAR IN RUNES': 'LOHAR IN RUINS',
  'TANYA': 'TANJA',
  'BAD BOY PINKY': 'BADBOY',
  'CHIC HOLDER': 'CHIC',
  'ORINOCO S/S': 'ORINOCO',
}

export function nameKey(name: string): string {
  let k = name.toUpperCase().replace(/\./g, '').replace(/\s+/g, ' ').trim()
  k = k.replace(/^THE /, '').replace(/ RING$/, '')
  return ALIASES[k] ?? k
}

const SHEET_CATEGORY: Record<string, string> = {
  HAND: 'HAND', WRIST: 'WRIST', EAR: 'EAR', CHARM: 'CHARMS', CHAIN: 'CHAINS',
  OBJECT: 'OBJECTS', ENGAGEMENT: 'ENGAGEMENT', 'HIGH NECK': 'HIGH', 'HIGH HAND': 'HIGH',
}
// First matching tag wins
const TAG_CATEGORY: [string, string][] = [
  ['cat-engagement', 'ENGAGEMENT'], ['cat-wedding', 'WEDDING'], ['cat-high', 'HIGH'],
  ['cat-hand', 'HAND'], ['cat-ear', 'EAR'], ['cat-neck', 'NECK'], ['cat-wrist', 'WRIST'],
  ['cat-objects', 'OBJECTS'], ['cat-stacks', 'HAND'],
]
export const CATEGORY_ORDER = ['HAND', 'NECK', 'EAR', 'WRIST', 'CHARMS', 'CHAINS', 'OBJECTS', 'WEDDING', 'ENGAGEMENT', 'HIGH']

interface ShopifyVariant { option1: string | null; option2: string | null; option3: string | null; price: string; featured_image?: { src: string } | null }
export interface ShopifyProduct {
  id: number; title: string; handle: string; tags: string[]
  options: { name: string; position: number; values: string[] }[]
  variants: ShopifyVariant[]
  images: { src: string }[]
}

function img(src: string, w: number) {
  return src + (src.includes('?') ? '&' : '?') + 'width=' + w
}

function sizeSummary(sizes: string[]): string {
  const s = sizes.filter(Boolean)
  if (s.length === 0) return ''
  if (s.length <= 2) return s.join(', ')
  // Ring sizes are single letters in order; show as a range
  if (s.every(x => /^[A-Z]$/.test(x))) return `${s[0]}–${s[s.length - 1]}`
  return s.join(', ')
}

function fromShopify(p: ShopifyProduct): ClientItem {
  const matIdx = p.options.findIndex(o => /MATERIAL|FINISH/i.test(o.name))
  const groups = new Map<string, { sizes: Map<string, number>; image?: string }>()
  for (const v of p.variants) {
    const opts = [v.option1, v.option2, v.option3]
    const material = matIdx >= 0 ? (opts[matIdx] || '') : ''
    const size = opts.filter((o, i) => i !== matIdx && o && o !== 'Default Title').join(' / ')
    const g = groups.get(material) ?? { sizes: new Map(), image: undefined }
    g.sizes.set(size, parseFloat(v.price))
    if (!g.image && v.featured_image?.src) g.image = img(v.featured_image.src, 900)
    groups.set(material, g)
  }
  const metals: ClientMetal[] = []
  for (const [material, g] of Array.from(groups)) {
    const known = metalFromLabel(material)
    const entries = Array.from(g.sizes.entries())
    const distinct = new Set(entries.map(e => e[1]))
    metals.push({
      label: known?.label ?? material,
      order: known?.order ?? OTHER_METAL_ORDER,
      prices: distinct.size === 1
        ? [{ size: '', price: entries[0][1] }]
        : entries.map(([size, price]) => ({ size, price })),
      sizes: distinct.size === 1 ? sizeSummary(entries.map(e => e[0])) : '',
      source: 'site',
      image: g.image,
    })
  }
  metals.sort((a, b) => a.order - b.order)
  const tags = p.tags.map(t => t.toLowerCase())
  const category = TAG_CATEGORY.find(([t]) => tags.includes(t))?.[1] ?? 'OTHER'
  const images = p.images.map(i => img(i.src, 900))
  return {
    id: 's' + p.id, name: p.title.toUpperCase(), category,
    image: p.images[0] ? img(p.images[0].src, 600) : null, images,
    metals, from: Math.min(...metals.flatMap(m => m.prices.map(x => x.price))), listed: true,
  }
}

function sheetMetals(rows: PriceListRow[]): ClientMetal[] {
  const byMetal = new Map<string, PriceListRow[]>()
  for (const r of rows) {
    if (!r.rrp || r.rrp <= 0) continue
    byMetal.set(r.metal, [...(byMetal.get(r.metal) ?? []), r])
  }
  const out: ClientMetal[] = []
  for (const [code, rs] of Array.from(byMetal)) {
    const known = metalFromCode(code)
    const single = rs.length === 1
    out.push({
      label: known?.label ?? code,
      order: known?.order ?? OTHER_METAL_ORDER,
      prices: rs.map(r => ({ size: single ? '' : r.size, price: roundRetail(r.rrp as number) })),
      sizes: single ? rs[0].size.replace(/-/g, '–') : '',
      source: 'list',
    })
  }
  return out.sort((a, b) => a.order - b.order)
}

export function buildCatalogue(
  shopify: ShopifyProduct[] | null,
  list: { pulledAt: string; rows: PriceListRow[]; gems: { code: string; description: string; colour: string; cut: string; carat: number | null; retailIncGst: number | null }[] },
): ClientCatalogue {
  const items: ClientItem[] = (shopify ?? []).map(fromShopify)
  const byKey = new Map(items.map(i => [nameKey(i.name), i]))

  const sheetGroups = new Map<string, PriceListRow[]>()
  for (const r of list.rows) {
    const k = nameKey(r.product)
    sheetGroups.set(k, [...(sheetGroups.get(k) ?? []), r])
  }

  for (const [key, rows] of Array.from(sheetGroups)) {
    const metals = sheetMetals(rows)
    if (metals.length === 0) continue
    const site = byKey.get(key)
    if (site) {
      // The site price wins. The sheet only adds metals the site does not list.
      const have = new Set(site.metals.map(m => m.label))
      site.metals = [...site.metals, ...metals.filter(m => !have.has(m.label))].sort((a, b) => a.order - b.order)
    } else {
      items.push({
        id: 'l' + key, name: rows[0].product.toUpperCase(),
        category: SHEET_CATEGORY[rows[0].category] ?? 'OTHER',
        image: null, images: [], metals,
        from: Math.min(...metals.flatMap(m => m.prices.map(x => x.price))), listed: false,
      })
    }
  }

  items.sort((a, b) => Number(b.listed) - Number(a.listed) || a.name.localeCompare(b.name))
  const present = new Set(items.map(i => i.category))
  return {
    items,
    gems: list.gems.map(g => ({ code: g.code, description: g.description, colour: g.colour, cut: g.cut, carat: g.carat, price: g.retailIncGst })),
    categories: [...CATEGORY_ORDER.filter(c => present.has(c)), ...(present.has('OTHER') ? ['OTHER'] : [])],
    siteOk: shopify !== null,
    listPulledAt: list.pulledAt,
    fetchedAt: new Date().toISOString(),
  }
}
