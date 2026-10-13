'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { ClientCatalogue, ClientItem } from '@/lib/client-catalogue'

// ─── Client view options (set from staff Settings) ───────────────────────────

export interface ClientOptions {
  showListPrices: boolean   // include Price List pieces and metals that are not on the site
}

export const DEFAULT_CLIENT_OPTIONS: ClientOptions = { showListPrices: false }

export function loadClientOptions(): ClientOptions {
  try {
    const raw = localStorage.getItem('bs-client-opts')
    return raw ? { ...DEFAULT_CLIENT_OPTIONS, ...JSON.parse(raw) } : DEFAULT_CLIENT_OPTIONS
  } catch { return DEFAULT_CLIENT_OPTIONS }
}

export function saveClientOptions(o: ClientOptions) {
  localStorage.setItem('bs-client-opts', JSON.stringify(o))
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CACHE_KEY = 'bs-client-catalogue'
const HOLD_MS = 900

function aud(n: number) {
  return 'A$' + Math.round(n).toLocaleString('en-AU')
}

function visibleItems(cat: ClientCatalogue, opts: ClientOptions): ClientItem[] {
  if (opts.showListPrices) return cat.items
  return cat.items
    .filter(i => i.listed)
    .map(i => {
      const metals = i.metals.filter(m => m.source === 'site')
      return { ...i, metals, from: Math.min(...metals.flatMap(m => m.prices.map(p => p.price))) }
    })
}

// ─── Detail ──────────────────────────────────────────────────────────────────

function Detail({ item, onClose }: { item: ClientItem; onClose: () => void }) {
  const [shot, setShot] = useState(0)
  const images = item.images.slice(0, 5)
  const hasList = item.metals.some(m => m.source === 'list')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="cv-detail" role="dialog" aria-label={item.name}>
      <button className="cv-close" onClick={onClose}>Close</button>
      <div className="cv-detail-grid">
        <div className={`cv-detail-img ${images.length ? '' : 'empty'}`}>
          {images.length ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="main" src={images[shot]} alt={item.name} />
              {images.length > 1 && (
                <div className="cv-thumbs">
                  {images.map((src, i) => (
                    <button key={src} className={`cv-thumb ${i === shot ? 'active' : ''}`} onClick={() => setShot(i)} aria-label={`Image ${i + 1}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/monogram-ivory.svg" alt="" style={{ width: 64, height: 64, opacity: 0.35 }} />
          )}
        </div>

        <div className="cv-detail-body">
          <div className="cv-label">{item.category}</div>
          <h1 className="cv-title" style={{ marginTop: 10 }}>{item.name}</h1>
          <div className="cv-rule" />

          <table className="cv-table">
            <thead>
              <tr>
                <th className="cv-label">Material</th>
                <th className="cv-label" style={{ paddingLeft: 12 }}>Size</th>
                <th className="cv-label">A$ inc GST</th>
              </tr>
            </thead>
            <tbody>
              {item.metals.flatMap(m =>
                m.prices.map((p, i) => (
                  <tr key={m.label + p.size + i}>
                    <td>
                      {i === 0 ? (m.label || 'As shown') : ''}
                      {i === 0 && m.source === 'list' && <span style={{ color: 'var(--muted)' }}> *</span>}
                    </td>
                    <td className="size">{p.size || m.sizes}</td>
                    <td className="price">{aud(p.price)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {hasList && <p className="cv-note">* Made to order. Price confirmed at the time of order.</p>}
          <p className="cv-note" style={hasList ? { marginTop: 6 } : undefined}>
            Lifetime servicing accompanies every creation.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Client view ─────────────────────────────────────────────────────────────

export default function ClientView({ options, onExit }: { options: ClientOptions; onExit: () => void }) {
  const [cat, setCat] = useState<ClientCatalogue | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('ALL')
  const [open, setOpen] = useState<ClientItem | null>(null)
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Show the last catalogue straight away, then refresh it
    try {
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) setCat(JSON.parse(cached))
    } catch {}
    fetch('/api/catalogue')
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .then((c: ClientCatalogue) => {
        setCat(c)
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch {}
      })
      .catch(() => setFailed(true))
  }, [])

  const items = useMemo(() => (cat ? visibleItems(cat, options) : []), [cat, options])
  const categories = useMemo(() => {
    const present = new Set(items.map(i => i.category))
    return (cat?.categories ?? []).filter(c => present.has(c))
  }, [cat, items])

  const results = useMemo(() => {
    const words = query.toUpperCase().split(/\s+/).filter(Boolean)
    return items.filter(i => {
      if (category !== 'ALL' && i.category !== category) return false
      if (words.length === 0) return true
      const hay = `${i.name} ${i.category} ${i.metals.map(m => m.label).join(' ')}`.toUpperCase()
      return words.every(w => hay.includes(w))
    })
  }, [items, query, category])

  // Staff exit: press and hold the monogram
  function startHold() {
    cancelHold()
    hold.current = setTimeout(onExit, HOLD_MS)
  }
  function cancelHold() {
    if (hold.current) clearTimeout(hold.current)
    hold.current = null
  }

  return (
    <div className="cv">
      <header className="cv-head cv-pad">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="cv-mark" src="/monogram-ivory.svg" alt="" draggable={false}
            onPointerDown={startHold} onPointerUp={cancelHold} onPointerLeave={cancelHold} onPointerCancel={cancelHold}
            onContextMenu={e => e.preventDefault()}
          />
          <span className="cv-running">Brohn Smith</span>
          <span className="cv-label" style={{ marginLeft: 'auto' }}>
            {cat ? `${results.length} ${results.length === 1 ? 'piece' : 'pieces'}` : ''}
          </span>
        </div>

        <input
          className="cv-search" style={{ marginTop: 22 }}
          type="search" inputMode="search" enterKeyHint="search"
          autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false}
          placeholder="Search the collection" aria-label="Search the collection"
          value={query} onChange={e => setQuery(e.target.value)}
        />

        <div className="cv-cats">
          {['ALL', ...categories].map(c => (
            <button key={c} className={`cv-cat ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)}>
              {c === 'HIGH' ? 'High Jewellery' : c}
            </button>
          ))}
        </div>
      </header>

      <main className="cv-pad">
        {!cat && !failed && <p className="cv-label" style={{ paddingTop: 40 }}>Loading the collection</p>}
        {!cat && failed && <p className="cv-label" style={{ paddingTop: 40 }}>The collection could not be loaded. Check the connection and reopen.</p>}
        {cat && results.length === 0 && <p className="cv-label" style={{ paddingTop: 40 }}>Nothing matches that search.</p>}

        <div className="cv-grid">
          {results.map(i => (
            <button key={i.id} className="cv-tile" onClick={() => setOpen(i)}>
              <div className={`cv-frame ${i.image ? '' : 'empty'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={i.image ?? '/monogram-ivory.svg'} alt="" loading="lazy" />
              </div>
              <div className="cv-name">{i.name}</div>
              <div className="cv-from">
                {i.metals.length === 1 && i.metals[0].prices.length === 1 ? aud(i.from) : `From ${aud(i.from)}`}
              </div>
            </button>
          ))}
        </div>
      </main>

      {open && <Detail key={open.id} item={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
