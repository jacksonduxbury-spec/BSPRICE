import { NextResponse } from 'next/server'
import priceList from '@/lib/pricelist.json'
import { buildCatalogue, type ShopifyProduct, type PriceListRow } from '@/lib/client-catalogue'

export const dynamic = 'force-dynamic'

const STORE = 'https://brohnsmith.com'

async function fetchShopify(): Promise<ShopifyProduct[] | null> {
  try {
    const all: ShopifyProduct[] = []
    for (let page = 1; page <= 10; page++) {
      const res = await fetch(`${STORE}/products.json?limit=250&page=${page}`, {
        next: { revalidate: 600 },
        signal: AbortSignal.timeout(12000),
      })
      if (!res.ok) return all.length ? all : null
      const { products } = (await res.json()) as { products: ShopifyProduct[] }
      all.push(...products)
      if (products.length < 250) break
    }
    return all
  } catch {
    return null
  }
}

export async function GET() {
  const shopify = await fetchShopify()
  const list = priceList as { pulledAt: string; rows: PriceListRow[]; gems: { code: string; description: string; colour: string; cut: string; carat: number | null; retailIncGst: number | null }[] }
  return NextResponse.json(buildCatalogue(shopify, list))
}
