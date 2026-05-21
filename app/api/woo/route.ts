import { NextRequest, NextResponse } from 'next/server'

interface WooImage { src: string }
interface WooVariation {
  id: number
  sku: string
  attributes: { name: string; option: string }[]
  images: WooImage[]
}
interface WooProduct {
  id: number
  name: string
  sku: string
  type: string
  images: WooImage[]
}

export async function POST(req: NextRequest) {
  try {
    const { siteUrl, key, secret, page = 1 } = await req.json()
    if (!siteUrl || !key || !secret) {
      return NextResponse.json({ error: 'Missing siteUrl, key or secret' }, { status: 400 })
    }

    const base = siteUrl.replace(/\/$/, '')
    const auth = Buffer.from(`${key}:${secret}`).toString('base64')
    const headers = { Authorization: `Basic ${auth}`, 'User-Agent': 'BrohnPricing/1.0' }

    const res = await fetch(
      `${base}/wp-json/wc/v3/products?per_page=100&page=${page}&status=publish`,
      { headers, signal: AbortSignal.timeout(15000) }
    )

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `WooCommerce error ${res.status}: ${text.slice(0, 200)}` }, { status: res.status })
    }

    const products: WooProduct[] = await res.json()
    const total = parseInt(res.headers.get('X-WP-Total') || '0', 10)
    const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1', 10)

    // For variable products, fetch their variations in parallel
    const items = await Promise.all(products.map(async p => {
      let variations: { id: number; label: string; images: string[] }[] = []

      if (p.type === 'variable') {
        try {
          const vRes = await fetch(
            `${base}/wp-json/wc/v3/products/${p.id}/variations?per_page=50`,
            { headers, signal: AbortSignal.timeout(10000) }
          )
          if (vRes.ok) {
            const vData: WooVariation[] = await vRes.json()
            variations = vData
              .filter(v => v.images?.length)
              .map(v => ({
                id: v.id,
                sku: v.sku || '',
                label: v.attributes.map(a => a.option).join(' / ') || `Variation ${v.id}`,
                images: v.images.slice(0, 2).map(img => img.src),
              }))
          }
        } catch { /* skip if variations fail */ }
      }

      return {
        id: p.id,
        name: p.name,
        sku: p.sku || '',
        type: p.type,
        images: (p.images || []).slice(0, 2).map(img => img.src),
        variations,
      }
    }))

    return NextResponse.json({ items, total, totalPages, page })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
