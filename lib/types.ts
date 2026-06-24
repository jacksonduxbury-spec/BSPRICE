export type MetalType = 'STG' | '9YG' | '9WG' | '18YG' | '18WG' | 'PLT'
export type StoneType = 'lab-diamond' | 'sapphire' | 'natural'
export type Currency = 'AUD' | 'USD'
export type QuoteMode = 'retail' | 'wholesale'

export interface MetalLine {
  id: string
  metalType: MetalType
  grams: number
}

export interface StoneLine {
  id: string
  stoneType: StoneType
  wholesaleCost: number
}

export interface AdditionalItem {
  id: string
  label: string
  price: number
}

export interface QuoteMetalVariant {
  id: string
  name: string
  metalLines: MetalLine[]
}

export interface QuoteLineItem {
  id: string
  name: string
  price: number
  qty: number
}

export interface Quote {
  id: string
  name: string
  clientName: string
  metalLines: MetalLine[]
  metalVariants?: QuoteMetalVariant[]
  stoneLines: StoneLine[]
  additionalItems: AdditionalItem[]
  labour: number
  packaging: number
  mode: QuoteMode
  retailGP: number
  wholesalePrice: number
  currency: Currency
  createdAt: string
  updatedAt: string
  lineItems?: QuoteLineItem[]
}

export interface MetalPrices {
  STG: number
  '9YG': number
  '9WG': number
  '18YG': number
  '18WG': number
  PLT: number
}

export type ProductCategory = 'ring' | 'earrings' | 'necklace' | 'bracelet' | 'pendant' | 'bangle' | 'sapphire' | 'other'

export interface Product {
  id: string
  sku: string
  name: string
  category: ProductCategory
  description: string
  sizes?: string
  metalLines: MetalLine[]
  metalVariants?: QuoteMetalVariant[]
  stoneLines: StoneLine[]
  labour: number
  packaging: number
  notes: string
  createdAt: string
  updatedAt: string
}

export interface WaxMultipliers {
  STG: number
  '9YG': number   // shared with 9WG
  '18YG': number  // shared with 18WG
  PLT: number
}

export interface AppSettings {
  metalPrices: MetalPrices
  stoneGP: Record<StoneType, number>   // 0-1 decimal (e.g. 0.65 = 65% GP)
  waxMultipliers: WaxMultipliers
  usdRate: number
  metalPriceSource: 'manual' | 'sheet'
  googleSheetUrl: string
  lastFetched?: string
  metalPricesUpdatedAt?: string
}
