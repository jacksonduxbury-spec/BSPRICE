'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Plus, Trash2, ChevronDown, Copy, Download, FileText,
  Settings as SettingsIcon, PenLine, RefreshCw,
  CheckCircle, X, ChevronRight, BarChart3,
  Package, Search, Tag, Edit3, ArrowRight, Gem, Layers, Scale,
  ImagePlus, FileImage, Loader2, LayoutList
} from 'lucide-react'
import {
  type Quote, type MetalLine, type StoneLine, type AdditionalItem, type MetalType,
  type StoneType, type Currency, type AppSettings, type Product,
  type ProductCategory, type QuoteMetalVariant
} from '@/lib/types'
import {
  calcMetalCost, calcStoneRetail, calcAdditionalCost, calcTotalCost, calcRetailPrice,
  formatPrice, generateTextExport, generateClientTextExport, newQuote,
  DEFAULT_SETTINGS, STONE_GP, STONE_LABELS, STONE_LABELS_CLIENT, METAL_LABELS, DEFAULT_METAL_PRICES,
  DEFAULT_WAX_MULTIPLIERS, CROSS_METAL
} from '@/lib/pricing'

// ─── Persistence helpers ─────────────────────────────────────────────────────

function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS
  try {
    const s = localStorage.getItem('bs-settings')
    if (!s) return DEFAULT_SETTINGS
    const saved = JSON.parse(s)
    return {
      ...DEFAULT_SETTINGS,
      ...saved,
      // Deep-merge so new keys (stoneGP, waxMultipliers) fill in if missing
      stoneGP: { ...DEFAULT_SETTINGS.stoneGP, ...(saved.stoneGP ?? {}) },
      waxMultipliers: { ...DEFAULT_SETTINGS.waxMultipliers, ...(saved.waxMultipliers ?? {}) },
    }
  } catch { return DEFAULT_SETTINGS }
}

function saveSettings(s: AppSettings) {
  localStorage.setItem('bs-settings', JSON.stringify(s))
}


function loadProducts(): Product[] {
  if (typeof window === 'undefined') return []
  try {
    const p = localStorage.getItem('bs-products')
    return p ? JSON.parse(p) : []
  } catch { return [] }
}

function saveProducts(p: Product[]) {
  localStorage.setItem('bs-products', JSON.stringify(p))
}

function loadActiveQuote(): Quote {
  if (typeof window === 'undefined') return newQuote()
  try {
    const q = localStorage.getItem('bs-active')
    if (!q) return newQuote()
    const parsed = JSON.parse(q)
    // Back-fill additionalItems for quotes saved before this field existed
    if (!parsed.additionalItems) parsed.additionalItems = []
    return parsed
  } catch { return newQuote() }
}

function saveActiveQuote(q: Quote) {
  localStorage.setItem('bs-active', JSON.stringify({ ...q, updatedAt: new Date().toISOString() }))
}

// ─── Segmented control ───────────────────────────────────────────────────────

function SegControl<T extends string>({
  options, value, onChange, className = '', style
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div className={`seg-control ${className}`} style={style}>
      {options.map(o => (
        <button
          key={o.value}
          className={`seg-option ${value === o.value ? 'active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ─── iOS modal sheet ─────────────────────────────────────────────────────────

function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title?: string; children: React.ReactNode
}) {
  if (!open) return null
  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet-panel">
        <div className="sheet-handle" />
        {title && (
          <div className="flex items-center justify-between px-5 pt-3 pb-2">
            <h2 className="font-bold text-base">{title}</h2>
            <button className="press-feedback text-ios-blue font-semibold text-sm" onClick={onClose}>Done</button>
          </div>
        )}
        {children}
      </div>
    </>
  )
}

// ─── Number input ────────────────────────────────────────────────────────────

function NumInput({ value, onChange, placeholder, prefix, suffix, step = '0.01', className = '' }: {
  value: number | ''
  onChange: (v: number) => void
  placeholder?: string
  prefix?: string
  suffix?: string
  step?: string
  className?: string
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {prefix && <span className="text-ios-secondary text-sm">{prefix}</span>}
      <input
        className="ios-input text-right price-display min-w-0"
        type="number"
        inputMode="decimal"
        step={step}
        min="0"
        value={value === 0 ? '' : value}
        placeholder={placeholder ?? '0'}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
      />
      {suffix && <span className="text-ios-secondary text-sm">{suffix}</span>}
    </div>
  )
}

// ─── Metal line row ──────────────────────────────────────────────────────────

const METAL_TYPES: MetalType[] = ['STG', '9YG', '9WG', '18YG', '18WG', 'PLT']

function MetalLineRow({ line, prices, currency, rate, onUpdate, onDelete }: {
  line: MetalLine
  prices: AppSettings['metalPrices']
  currency: Currency
  rate: number
  onUpdate: (l: MetalLine) => void
  onDelete: () => void
}) {
  const cost = (line.grams || 0) * prices[line.metalType]
  const displayCost = currency === 'USD' ? cost * rate : cost

  return (
    <div className="ios-row row-sep animate-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        {/* Metal type dropdown */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: 'var(--ios-bg)', borderRadius: 8, padding: '4px 8px', flexShrink: 0 }}>
          <select
            className="ios-select font-semibold text-sm pr-3"
            value={line.metalType}
            onChange={e => onUpdate({ ...line, metalType: e.target.value as MetalType })}
          >
            {METAL_TYPES.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <ChevronDown size={11} className="absolute right-1.5 text-ios-secondary pointer-events-none" />
        </div>
        {/* Grams */}
        <input
          className="ios-input text-right price-display"
          style={{ width: 64, flexShrink: 0 }}
          type="number" inputMode="decimal" step="0.1" min="0"
          value={line.grams === 0 ? '' : line.grams}
          placeholder="0"
          onChange={e => onUpdate({ ...line, grams: parseFloat(e.target.value) || 0 })}
        />
        <span style={{ flexShrink: 0, color: 'var(--ios-secondary)', fontSize: 14 }}>g</span>
        {/* Cost pushed right */}
        <span className="text-sm font-semibold price-display live-price" style={{ marginLeft: 'auto', flexShrink: 0, minWidth: 64, textAlign: 'right' }}>
          {formatPrice(displayCost, currency)}
        </span>
      </div>

      <button className="press-feedback text-ios-red ml-1 shrink-0" onClick={onDelete}>
        <Trash2 size={16} />
      </button>
    </div>
  )
}

// ─── Stone line row ──────────────────────────────────────────────────────────

const STONE_TYPES: StoneType[] = ['lab-diamond', 'sapphire', 'natural']
const STONE_SHORT: Record<StoneType, string> = {
  'lab-diamond': 'Lab ◆',
  'sapphire': 'Aus. Sapph.',
  'natural': 'Nat. Diamond',
}

function StoneLineRow({ line, currency, rate, stoneGP, onUpdate, onDelete }: {
  line: StoneLine
  currency: Currency
  rate: number
  stoneGP: Record<StoneType, number>
  onUpdate: (l: StoneLine) => void
  onDelete: () => void
}) {
  const retail = calcStoneRetail(line, stoneGP)
  const displayRetail = currency === 'USD' ? retail * rate : retail
  const gp = stoneGP[line.stoneType] ?? STONE_GP[line.stoneType]

  return (
    <div className="ios-row row-sep animate-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        {/* Stone type */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', background: 'var(--ios-bg)', borderRadius: 8, padding: '4px 8px', flexShrink: 0 }}>
          <select
            className="ios-select font-semibold text-sm pr-3"
            value={line.stoneType}
            onChange={e => onUpdate({ ...line, stoneType: e.target.value as StoneType })}
          >
            {STONE_TYPES.map(t => (
              <option key={t} value={t}>{STONE_SHORT[t]}</option>
            ))}
          </select>
          <ChevronDown size={11} className="absolute right-1.5 text-ios-secondary pointer-events-none" />
        </div>

        {/* Wholesale cost */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
          <span className="text-ios-secondary text-sm" style={{ flexShrink: 0 }}>WS</span>
          <input
            className="ios-input text-right price-display"
            style={{ minWidth: 0, flex: 1 }}
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            value={line.wholesaleCost === 0 ? '' : line.wholesaleCost}
            placeholder="0"
            onChange={e => onUpdate({ ...line, wholesaleCost: parseFloat(e.target.value) || 0 })}
          />
        </div>

        {/* Retail value */}
        <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 72 }}>
          <div className="text-sm font-semibold price-display live-price">
            {formatPrice(displayRetail, currency)}
          </div>
          <div className="text-xs text-ios-secondary">{(gp * 100).toFixed(0)}% GP</div>
        </div>
      </div>

      <button className="press-feedback text-ios-red ml-1 shrink-0" onClick={onDelete}>
        <Trash2 size={16} />
      </button>
    </div>
  )
}

// ─── Additional item row ─────────────────────────────────────────────────────

function AdditionalItemRow({ item, currency, rate, onUpdate, onDelete }: {
  item: AdditionalItem
  currency: Currency
  rate: number
  onUpdate: (i: AdditionalItem) => void
  onDelete: () => void
}) {
  const displayPrice = currency === 'USD' ? item.price * rate : item.price

  return (
    <div className="ios-row row-sep animate-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        {/* Label */}
        <input
          className="ios-input text-sm"
          style={{ flex: 1, minWidth: 0 }}
          type="text"
          placeholder="Item description"
          value={item.label}
          onChange={e => onUpdate({ ...item, label: e.target.value })}
        />
        {/* Price input */}
        <input
          className="ios-input text-right price-display"
          style={{ width: 72, flexShrink: 0 }}
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={item.price === 0 ? '' : item.price}
          placeholder="0"
          onChange={e => onUpdate({ ...item, price: parseFloat(e.target.value) || 0 })}
        />
        <span className="text-sm font-semibold price-display live-price" style={{ minWidth: 72, flexShrink: 0, textAlign: 'right' }}>
          {formatPrice(displayPrice, currency)}
        </span>
      </div>
      <button className="press-feedback text-ios-red ml-1 shrink-0" onClick={onDelete}>
        <Trash2 size={16} />
      </button>
    </div>
  )
}

// ─── Price summary card ──────────────────────────────────────────────────────

function PriceSummary({ quote, settings }: { quote: Quote; settings: AppSettings }) {
  const prices = settings.metalPrices
  const rate = settings.usdRate
  const currency = quote.currency
  const fmt = (n: number) => formatPrice(currency === 'USD' ? n * rate : n, currency)

  // ── Push to line sheet state ──
  const [pushOpen, setPushOpen] = useState(false)
  const [lsSheetsList, setLsSheetsList] = useState<any[]>([])
  const [selLsId, setSelLsId] = useState('')
  const [selProd, setSelProd] = useState(-1)
  const [selVar, setSelVar] = useState(-1)
  const [pushed, setPushed] = useState(false)

  function openPush() {
    try {
      const raw = localStorage.getItem('bs_ls_v1')
      const d = raw ? JSON.parse(raw) : {}
      setLsSheetsList(d.lineSheets || [])
    } catch { setLsSheetsList([]) }
    setSelLsId(''); setSelProd(-1); setSelVar(-1); setPushed(false)
    setPushOpen(true)
  }

  function confirmPush(ws: number, rrp: number) {
    if (!selLsId || selProd < 0 || selVar < 0) return
    try {
      const raw = localStorage.getItem('bs_ls_v1')
      if (!raw) return
      const d = JSON.parse(raw)
      const ls = d.lineSheets.find((s: any) => s.id === selLsId)
      if (!ls) return
      const mv = ls.products[selProd]?.metalVariants[selVar]
      if (!mv) return
      mv.subtotalWholesale = Math.round(ws * 100) / 100
      mv.subtotalRRP = Math.ceil(rrp / 10) * 10
      localStorage.setItem('bs_ls_v1', JSON.stringify(d))
      setPushed(true)
      setTimeout(() => setPushOpen(false), 800)
    } catch (e) { alert('Error: ' + String(e)) }
  }

  const gpMap = settings.stoneGP ?? STONE_GP
  const hasVariants = (quote.metalVariants?.length ?? 0) > 0

  // Use first variant's metalLines for base summary when variants exist
  const activeMetal = hasVariants ? (quote.metalVariants![0].metalLines) : quote.metalLines
  const metalCost = calcMetalCost(activeMetal, prices)
  const stoneWS = quote.stoneLines.reduce((s, l) => s + (l.wholesaleCost || 0), 0)
  const stoneRetail = quote.stoneLines.reduce((s, l) => s + calcStoneRetail(l, gpMap), 0)
  const additionalTotal = calcAdditionalCost(quote.additionalItems)
  const totalCost = calcTotalCost(quote, prices)
  const retailPrice = calcRetailPrice(quote, prices, gpMap)

  return (
    <div className="ios-card mx-4 mb-3 animate-in">
      <div className="px-4 py-3 border-b border-ios-separator/60">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-ios-secondary" />
          <span className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">Summary</span>
        </div>
      </div>

      {/* Multi-variant pricing grid */}
      {hasVariants && quote.mode === 'retail' ? (
        <div className="px-4 py-3">
          <div className="text-xs text-ios-secondary mb-2 font-medium">Retail Price per variant ({quote.retailGP}% GP)</div>
          <div className="space-y-2">
            {(quote.metalVariants ?? []).map(variant => {
              const vQuote = { ...quote, metalLines: variant.metalLines }
              const vRetail = calcRetailPrice(vQuote, prices, gpMap)
              const vCost = calcTotalCost(vQuote, prices)
              return (
                <div key={variant.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span className="text-sm text-ios-secondary">{variant.name || 'Variant'}</span>
                  <div className="text-right">
                    <span className="text-sm font-bold price-display live-price">{fmt(vRetail)}</span>
                    <span className="text-xs text-ios-secondary ml-2">cost {fmt(vCost)}</span>
                  </div>
                </div>
              )
            })}
          </div>
          {stoneWS > 0 && (
            <div className="text-xs text-ios-secondary mt-2 pt-2 border-t border-ios-separator/60" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Stones (WS → Retail)</span>
              <span className="price-display">{fmt(stoneWS)} → {fmt(stoneRetail)}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="px-4 py-3 space-y-2">
          {metalCost > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span className="text-ios-secondary">Metal</span>
              <span className="price-display font-medium">{fmt(metalCost)}</span>
            </div>
          )}
          {stoneWS > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span className="text-ios-secondary">Stones (WS → Retail)</span>
              <span className="price-display font-medium">{fmt(stoneWS)} → {fmt(stoneRetail)}</span>
            </div>
          )}
          {quote.labour > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span className="text-ios-secondary">Labour</span>
              <span className="price-display font-medium">{fmt(quote.labour)}</span>
            </div>
          )}
          {quote.packaging > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span className="text-ios-secondary">Packaging</span>
              <span className="price-display font-medium">{fmt(quote.packaging)}</span>
            </div>
          )}
          {additionalTotal > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span className="text-ios-secondary">Additional items</span>
              <span className="price-display font-medium">{fmt(additionalTotal)}</span>
            </div>
          )}
          <div className="text-sm pt-1 border-t border-ios-separator/60" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="text-ios-secondary">Total cost</span>
            <span className="price-display font-semibold">{fmt(totalCost)}</span>
          </div>
        </div>
      )}

      <div className="gold-line" />

      {quote.mode === 'retail' && !hasVariants ? (
        <div className="px-4 py-4">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="text-xs text-ios-secondary font-medium mb-0.5">Retail Price ({quote.retailGP}% GP)</div>
              <div className="text-2xl font-bold price-display live-price tracking-tight">
                {fmt(retailPrice)}
              </div>
              <div className="text-xs text-ios-secondary mt-0.5">
                inc GST {fmt(retailPrice * 1.1)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-ios-secondary">Margin</div>
              <div className="text-lg font-bold" style={{ color: 'var(--gold)' }}>
                {fmt(retailPrice - totalCost)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Variant mode: show inc-GST for first variant as a reference
        <div className="px-4 py-3">
          <div className="text-xs text-ios-secondary">
            inc GST shown at checkout · Labour {fmt(quote.labour || 0)} · Packaging {fmt(quote.packaging || 0)}
          </div>
        </div>
      )}

      {/* Push to Line Sheet button */}
      {totalCost > 0 && (() => {
        const ws = (currency === 'USD' ? totalCost * rate : totalCost) * 2.2
        const rrp = Math.ceil((ws * 2) / 10) * 10
        const selSheet = lsSheetsList.find(s => s.id === selLsId)
        const selProducts = selSheet?.products || []
        const selVariants = selProd >= 0 ? (selProducts[selProd]?.metalVariants || []) : []
        return (
          <>
            <div className="px-4 pb-4 pt-1 space-y-2">
              <div className="flex gap-2">
                <button onClick={() => navigator.clipboard.writeText(ws.toFixed(2))}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold press-feedback border border-ios-separator">
                  Copy WS {formatPrice(ws, currency)}
                </button>
                <button onClick={() => navigator.clipboard.writeText(rrp.toFixed(2))}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold press-feedback border border-ios-separator">
                  Copy RRP {formatPrice(rrp, currency)}
                </button>
              </div>
              <button onClick={openPush} className="w-full py-2 rounded-xl text-sm font-semibold press-feedback"
                style={{ background: 'var(--gold)', color: '#000' }}>
                → Push to Line Sheet
              </button>
            </div>
            {pushOpen && (
              <div style={{ position:'fixed',inset:0,zIndex:9999,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'flex-end' }}
                onClick={e => { if(e.target===e.currentTarget) setPushOpen(false) }}>
                <div style={{ background:'#fff',borderRadius:'20px 20px 0 0',width:'100%',padding:'20px 20px 40px',maxHeight:'85vh',overflowY:'auto' }}>
                  <div style={{ width:36,height:5,background:'#ddd',borderRadius:3,margin:'0 auto 16px' }}/>
                  <div className="text-sm font-bold mb-1">Push to Line Sheet</div>
                  <div className="flex gap-4 mb-4 py-2 border-b border-ios-separator/60">
                    <div><div className="text-xs text-ios-secondary mb-0.5">Wholesale</div>
                      <div className="text-lg font-bold price-display">{formatPrice(ws, currency)}</div></div>
                    <div><div className="text-xs text-ios-secondary mb-0.5">RRP</div>
                      <div className="text-lg font-bold price-display">{formatPrice(rrp, currency)}</div></div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <div className="text-xs text-ios-secondary font-semibold uppercase tracking-wide mb-1">Line Sheet</div>
                      <select className="w-full p-2 rounded-lg border border-ios-separator text-sm"
                        value={selLsId} onChange={e => { setSelLsId(e.target.value); setSelProd(-1); setSelVar(-1) }}>
                        <option value="">Select sheet…</option>
                        {lsSheetsList.map((ls: any) => (
                          <option key={ls.id} value={ls.id}>{ls.buyerName} — {ls.collection}</option>
                        ))}
                      </select>
                    </div>
                    {selLsId && (
                      <div>
                        <div className="text-xs text-ios-secondary font-semibold uppercase tracking-wide mb-1">Product</div>
                        <select className="w-full p-2 rounded-lg border border-ios-separator text-sm"
                          value={selProd} onChange={e => { setSelProd(Number(e.target.value)); setSelVar(-1) }}>
                          <option value={-1}>Select product…</option>
                          {selProducts.map((p: any, i: number) => (
                            <option key={i} value={i}>{p.pieceName || `Product ${i+1}`}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {selProd >= 0 && (
                      <div>
                        <div className="text-xs text-ios-secondary font-semibold uppercase tracking-wide mb-1">Metal Variant</div>
                        <select className="w-full p-2 rounded-lg border border-ios-separator text-sm"
                          value={selVar} onChange={e => setSelVar(Number(e.target.value))}>
                          <option value={-1}>Select variant…</option>
                          {selVariants.map((mv: any, i: number) => (
                            <option key={i} value={i}>{mv.metalName || `Variant ${i+1}`}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {selVar >= 0 && (
                      <button onClick={() => confirmPush(ws, rrp)}
                        className="w-full py-3 rounded-xl font-bold text-sm press-feedback mt-2"
                        style={{ background: pushed ? 'var(--ios-green)' : 'var(--gold)', color: '#000', transition: 'background 0.3s' }}>
                        {pushed ? '✓ Done' : `Confirm — WS ${formatPrice(ws, currency)}  RRP ${formatPrice(rrp, currency)}`}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )
      })()}
    </div>
  )
}

// ─── Export sheet ─────────────────────────────────────────────────────────────

function ExportSheet({ open, onClose, quote, settings }: {
  open: boolean; onClose: () => void; quote: Quote; settings: AppSettings
}) {
  const prices = settings.metalPrices
  const [showLSPicker, setShowLSPicker] = useState(false)
  const [lsSheets, setLsSheets] = useState<{ id: string; name: string }[]>([])
  function copyText() {
    const text = generateTextExport(quote, prices, settings)
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied to clipboard!')
      onClose()
    })
  }

  function copyClientText() {
    const text = generateClientTextExport(quote, prices, settings)
    navigator.clipboard.writeText(text).then(() => {
      alert('Copied for client!')
      onClose()
    })
  }

  async function downloadClientPDF() {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const gpMap = settings.stoneGP ?? STONE_GP
    const rate = quote.currency === 'USD' ? settings.usdRate : 1
    const fmt2 = (n: number) => formatPrice((n || 0) * rate, quote.currency)

    const retailPrice = calcRetailPrice(quote, prices, gpMap)
    const finalPrice = quote.mode === 'retail' ? retailPrice : quote.wholesalePrice
    const gstAmount = finalPrice * 0.1
    const incGST = finalPrice * 1.1

    // Quote number — BSQ-YYMM-NNN via localStorage
    const now = new Date()
    const yymm = String(now.getFullYear()).slice(-2) + String(now.getMonth() + 1).padStart(2, '0')
    const counterKey = `bs-quote-counter-${yymm}`
    const counter = parseInt(localStorage.getItem(counterKey) || '0') + 1
    localStorage.setItem(counterKey, String(counter))
    const quoteNumber = `BSQ-${yymm}-${String(counter).padStart(3, '0')}`

    const pageW = doc.internal.pageSize.width
    const pageH = doc.internal.pageSize.height
    const marginL = 20
    const marginR = pageW - 20

    // ── HEADER: black band, logo centred ────────────────
    const headerH = 46
    doc.setFillColor(0, 0, 0)
    doc.rect(0, 0, pageW, headerH, 'F')

    // Load + centre logo
    let logoH = 0
    try {
      const logoRes = await fetch('/logo-nav.png')
      const logoBlob = await logoRes.blob()
      const logoDataUrl = await new Promise<string>(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(logoBlob)
      })
      const imgEl = new Image()
      await new Promise<void>(resolve => { imgEl.onload = () => resolve(); imgEl.onerror = () => resolve(); imgEl.src = logoDataUrl })
      const aspect = imgEl.naturalWidth / imgEl.naturalHeight
      logoH = 22
      const logoW = logoH * aspect
      doc.addImage(logoDataUrl, 'PNG', pageW / 2 - logoW / 2, (headerH - logoH) / 2, logoW, logoH)
    } catch {
      // Text fallback
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(255, 255, 255)
      doc.text('BROHN SMITH JEWELLERY', pageW / 2, headerH / 2 + 2, { align: 'center' })
      logoH = 10
    }

    // Thin white rule under header
    doc.setDrawColor(255, 255, 255)
    doc.setLineWidth(0.15)
    doc.line(0, headerH, pageW, headerH)
    doc.setLineWidth(0.2)

    // ── QUOTE INFO ───────────────────────────────────────
    let y = headerH + 12

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(0, 0, 0)
    doc.text('Quote', marginL, y)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(120, 120, 120)
    doc.text(quoteNumber, marginL, y + 6)

    const dateStr = new Date(quote.createdAt).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'long', year: 'numeric'
    })
    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    doc.text(dateStr, marginR, y, { align: 'right' })
    if (quote.clientName) {
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(0, 0, 0)
      doc.text(quote.clientName, marginR, y + 6, { align: 'right' })
    }

    y += 16

    // ── ITEMS TABLE ───────────────────────────────────────
    const tableRows: (string | number)[][] = []
    for (const m of quote.metalLines) tableRows.push([METAL_LABELS[m.metalType], ''])
    for (const s of quote.stoneLines) tableRows.push([STONE_LABELS_CLIENT[s.stoneType], ''])
    for (const item of (quote.additionalItems || [])) tableRows.push([item.label || 'Additional Item', fmt2(item.price)])

    autoTable(doc, {
      startY: y,
      head: [['Description', 'Amount']],
      body: tableRows,
      styles: { font: 'helvetica', fontSize: 10, cellPadding: { top: 4, bottom: 4, left: 5, right: 5 }, textColor: [30, 30, 30] },
      headStyles: { fillColor: [20, 20, 20], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: { 0: { cellWidth: 140 }, 1: { cellWidth: 30, halign: 'right' } },
      margin: { left: marginL, right: 20 },
    })

    let finalY = (doc as any).lastAutoTable.finalY

    // ── TOTALS ─────────────────────────────────────────
    finalY += 8
    doc.setDrawColor(200, 200, 200)
    doc.line(marginL, finalY, marginR, finalY)
    finalY += 6

    const col1 = 120
    const col2 = marginR
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(110, 110, 110)
    doc.text('Subtotal (ex GST)', col1, finalY, { align: 'right' })
    doc.text(finalPrice > 0 ? fmt2(finalPrice) : 'TBC', col2, finalY, { align: 'right' })
    finalY += 5

    if (finalPrice > 0) {
      doc.text('GST (10%)', col1, finalY, { align: 'right' })
      doc.text(fmt2(gstAmount), col2, finalY, { align: 'right' })
      finalY += 3
    }

    doc.setDrawColor(0, 0, 0)
    doc.setLineWidth(0.5)
    doc.line(col1 - 5, finalY + 1, marginR, finalY + 1)
    doc.setLineWidth(0.2)
    finalY += 7

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(0, 0, 0)
    doc.text('Total (inc GST)', col1, finalY, { align: 'right' })
    doc.text(finalPrice > 0 ? fmt2(incGST) : 'TBC', col2, finalY, { align: 'right' })
    finalY += 5

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(140, 140, 140)
    doc.text(quote.currency, col2, finalY, { align: 'right' })

    finalY += 14
    doc.setFontSize(8)
    doc.setTextColor(160, 160, 160)
    doc.text('This quote is valid for 30 days. All prices are subject to change based on metal spot prices.', marginL, finalY)

    // ── FOOTER: black band ────────────────────────────────
    doc.setFillColor(15, 15, 15)
    doc.rect(0, pageH - 20, pageW, 20, 'F')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(150, 150, 150)
    doc.text('All prices in AUD. Ex GST unless indicated.', marginL, pageH - 10)
    doc.setTextColor(180, 180, 180)
    doc.text('brohnsmith.com', marginR, pageH - 10, { align: 'right' })

    const clientSuffix = quote.clientName ? `_${quote.clientName.replace(/\s+/g, '_')}` : ''
    doc.save(`${quote.name.replace(/\s+/g, '_')}${clientSuffix}_client.pdf`)
    onClose()
  }

  function addToLineSheet() {
    try {
      const cur = quote.currency || 'AUD'
      const rate = cur === 'USD' ? (settings.usdRate ?? 1) : 1
      const px = settings.metalPrices ?? DEFAULT_METAL_PRICES
      const r2 = (n: number) => Math.round((isNaN(n) ? 0 : n) * 100) / 100

      // Shared parts (stones, additional items)
      const stoneParts = quote.stoneLines.map(s => STONE_LABELS_CLIENT[s.stoneType])
      const stoneMetaParts = quote.stoneLines.map(s => STONE_LABELS_CLIENT[s.stoneType])

      // Helper: build rows + totals for a given set of metalLines
      const buildVariantData = (metalLines: MetalLine[], variantName: string) => {
        const metaLabel = metalLines.length > 0 ? METAL_LABELS[metalLines[0].metalType] : variantName
        const lineDescription = [
          quote.name,
          variantName || metaLabel,
          stoneParts.length > 0 ? `Set with ${stoneParts.join(' & ')}` : '',
        ].filter(Boolean).join(', ')

        const rows: { id: string; description: string; wholesale: number; rrp: number }[] = []
        for (const m of metalLines) {
          const cost = (m.grams || 0) * (px[m.metalType] || 0) * rate
          rows.push({ id: crypto.randomUUID(), description: METAL_LABELS[m.metalType], wholesale: r2(cost * 2.2), rrp: r2(cost * 4.4) })
        }
        for (const s of quote.stoneLines) {
          const cost = (s.wholesaleCost || 0) * rate
          rows.push({ id: crypto.randomUUID(), description: STONE_LABELS_CLIENT[s.stoneType], wholesale: r2(cost * 2.2), rrp: r2(cost * 4.4) })
        }
        for (const item of (quote.additionalItems || [])) {
          const cost = (item.price || 0) * rate
          rows.push({ id: crypto.randomUUID(), description: item.label || 'Additional Item', wholesale: r2(cost * 2.2), rrp: r2(cost * 4.4) })
        }

        const variantQuote = { ...quote, metalLines }
        const totalConverted = calcTotalCost(variantQuote, px) * rate
        return {
          id: crypto.randomUUID(),
          metalName: variantName || metaLabel || 'Pricing',
          lineDescription,
          rows,
          subtotalWholesale: roundPrice(r2(totalConverted * 2.2)),
          subtotalRRP: roundPrice(r2(totalConverted * 4.4)),
        }
      }

      // Build one linesheet metalVariant per quote metal variant (or single)
      const variants = quote.metalVariants ?? []
      const metalVariants = variants.length > 0
        ? variants.map(v => buildVariantData(v.metalLines, v.name))
        : [buildVariantData(quote.metalLines, quote.metalLines[0] ? METAL_LABELS[quote.metalLines[0].metalType] : 'Pricing')]

      // Metadata string (from all metals across all variants + stones)
      const allMetalLabels = variants.length > 0
        ? variants.map(v => v.name).join(' / ')
        : (quote.metalLines[0] ? METAL_LABELS[quote.metalLines[0].metalType] : '')
      const metaParts = [allMetalLabels, ...stoneMetaParts].filter(Boolean)

      const product = {
        id: crypto.randomUUID(),
        pieceName: quote.name,
        sku: '',
        metadata: metaParts.join(' · '),
        images: [null, null],
        metalVariants,
      }

      const payload = encodeURIComponent(JSON.stringify({ currency: cur, product }))
      window.open(`/linesheet.html?v=${Date.now()}&import=${payload}`, '_blank')
      onClose()
    } catch (err) {
      console.error('addToLineSheet error:', err)
      alert(`Line sheet error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function downloadCSV() {
    const rate = quote.currency === 'USD' ? settings.usdRate : 1
    const fmt2 = (n: number) => ((n || 0) * rate).toFixed(2)
    const rows: string[][] = [
      ['Item', 'Type/Detail', 'Cost', 'Retail/Value', 'GP%'],
    ]
    for (const m of quote.metalLines) {
      const cost = (m.grams || 0) * prices[m.metalType]
      rows.push([METAL_LABELS[m.metalType], `${m.grams}g`, fmt2(cost), fmt2(cost), ''])
    }
    for (const s of quote.stoneLines) {
      const retail = calcStoneRetail(s, settings.stoneGP)
      const gp = ((settings.stoneGP?.[s.stoneType] ?? STONE_GP[s.stoneType]) * 100).toFixed(0)
      rows.push([STONE_LABELS[s.stoneType], '', fmt2(s.wholesaleCost), fmt2(retail), `${gp}%`])
    }
    for (const item of (quote.additionalItems || [])) {
      rows.push([item.label || 'Additional Item', 'Fixed price', fmt2(item.price), fmt2(item.price), '—'])
    }
    if (quote.labour > 0) rows.push(['Labour', '', fmt2(quote.labour), '', ''])
    if (quote.packaging > 0) rows.push(['Packaging', '', fmt2(quote.packaging), '', ''])
    rows.push(['', '', '', '', ''])
    const totalCost = calcTotalCost(quote, prices)
    rows.push(['TOTAL COST', '', fmt2(totalCost), '', ''])
    if (quote.mode === 'retail') {
      const retail = calcRetailPrice(quote, prices, settings.stoneGP)
      rows.push([`RETAIL PRICE (${quote.retailGP}% GP)`, '', '', fmt2(retail), `${quote.retailGP}%`])
    }

    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${quote.name.replace(/\s+/g, '_')}_quote.csv`
    a.click()
    URL.revokeObjectURL(url)
    onClose()
  }

  async function downloadPDF() {
    const { default: jsPDF } = await import('jspdf')
    const { default: autoTable } = await import('jspdf-autotable')
    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const rate = quote.currency === 'USD' ? settings.usdRate : 1
    const fmt2 = (n: number) => formatPrice((n || 0) * rate, quote.currency)

    // Header — embed logo
    try {
      const logoRes = await fetch('/logo-nav.png')
      const logoBlob = await logoRes.blob()
      const logoDataUrl = await new Promise<string>(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.readAsDataURL(logoBlob)
      })
      doc.addImage(logoDataUrl, 'PNG', 18, 10, 18, 18)
    } catch {}
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(130)
    doc.text(`Quote: ${quote.name}`, 120, 16)
    doc.text(`Date: ${new Date(quote.createdAt).toLocaleDateString('en-AU')}`, 120, 22)
    doc.text(`Mode: ${quote.mode === 'retail' ? 'Retail' : 'Wholesale'}`, 120, 28)
    doc.setTextColor(0)

    // Divider
    doc.setDrawColor(200)
    doc.line(20, 42, 190, 42)

    // Items table
    const tableRows: (string | number)[][] = []
    for (const m of quote.metalLines) {
      const cost = (m.grams || 0) * prices[m.metalType]
      tableRows.push([METAL_LABELS[m.metalType], `${m.grams}g`, fmt2(cost), '—'])
    }
    for (const s of quote.stoneLines) {
      const retail = calcStoneRetail(s, settings.stoneGP)
      const gp = ((settings.stoneGP?.[s.stoneType] ?? STONE_GP[s.stoneType]) * 100).toFixed(0)
      tableRows.push([STONE_LABELS[s.stoneType], `WS ${fmt2(s.wholesaleCost)}`, fmt2(retail), `${gp}% GP`])
    }
    for (const item of (quote.additionalItems || [])) {
      tableRows.push([item.label || 'Additional Item', 'Fixed price', fmt2(item.price), '—'])
    }
    if (quote.labour > 0) tableRows.push(['Labour', '', fmt2(quote.labour), ''])
    if (quote.packaging > 0) tableRows.push(['Packaging', '', fmt2(quote.packaging), ''])

    autoTable(doc, {
      startY: 46,
      head: [['Item', 'Detail', 'Cost', 'Note']],
      body: tableRows,
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [0, 0, 0], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      margin: { left: 20, right: 20 },
    })

    const finalY = (doc as any).lastAutoTable.finalY + 8
    const totalCost = calcTotalCost(quote, prices)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(130)
    doc.text(`Total Cost: ${fmt2(totalCost)}`, 20, finalY)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(0)
    if (quote.mode === 'retail') {
      const retail = calcRetailPrice(quote, prices, settings.stoneGP)
      doc.text(`Retail Price: ${fmt2(retail)}`, 20, finalY + 8)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(100)
      doc.text(`(${quote.retailGP}% GP)`, 20, finalY + 14)
    }

    doc.save(`${quote.name.replace(/\s+/g, '_')}_quote.pdf`)
    onClose()
  }

  return (
    <>
    <Sheet open={open} onClose={onClose} title="Export Quote">
      <div className="px-4 pb-8 space-y-2 mt-2">
        <p className="text-sm text-ios-secondary mb-3">
          {quote.name}{quote.clientName ? ` · ${quote.clientName}` : ''}
        </p>

        {/* Client exports */}
        <div className="px-1 mb-1">
          <span className="field-label">Client</span>
        </div>

        <button className="ios-card w-full press-feedback" onClick={downloadClientPDF}>
          <div className="ios-row">
            <div className="w-8 h-8 rounded-ios-xs bg-black flex items-center justify-center shrink-0">
              <FileText size={16} className="text-white" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-sm">Client Quote PDF</div>
              <div className="text-xs text-ios-secondary">Descriptions + price only · no internal costs</div>
            </div>
            <ChevronRight size={16} className="text-ios-separator" />
          </div>
        </button>

        <button className="ios-card w-full press-feedback" onClick={copyClientText}>
          <div className="ios-row">
            <div className="w-8 h-8 rounded-ios-xs bg-ios-bg border border-ios-separator/60 flex items-center justify-center shrink-0">
              <Copy size={16} className="text-ios-secondary" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-sm">Copy for Client</div>
              <div className="text-xs text-ios-secondary">WhatsApp / email · price only, no costs</div>
            </div>
            <ChevronRight size={16} className="text-ios-separator" />
          </div>
        </button>

        {/* Wholesale export */}
        <div className="px-1 mb-1 mt-3">
          <span className="field-label">Wholesale</span>
        </div>

        <button className="ios-card w-full press-feedback" onClick={() => {
          try {
            const raw = localStorage.getItem('bs_ls_v1')
            const st = raw ? JSON.parse(raw) : null
            setLsSheets((st?.lineSheets ?? []).map((ls: { id: string; buyerName?: string; collection?: string }) => ({
              id: ls.id,
              name: [ls.buyerName, ls.collection].filter(Boolean).join(' · ') || 'Untitled Sheet'
            })))
          } catch { setLsSheets([]) }
          setShowLSPicker(true)
        }}>
          <div className="ios-row">
            <div className="w-8 h-8 rounded-ios-xs bg-black flex items-center justify-center shrink-0">
              <Layers size={16} className="text-white" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-sm">Add to Line Sheet</div>
              <div className="text-xs text-ios-secondary">
                New sheet or add to existing · images added there
              </div>
            </div>
            <ChevronRight size={16} className="text-ios-separator" />
          </div>
        </button>

        {/* Internal exports */}
        <div className="px-1 mb-1 mt-3">
          <span className="field-label">Internal</span>
        </div>

        <button className="ios-card w-full press-feedback" onClick={copyText}>
          <div className="ios-row">
            <div className="w-8 h-8 rounded-ios-xs bg-ios-blue flex items-center justify-center shrink-0">
              <Copy size={16} className="text-white" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-sm">Copy as Text</div>
              <div className="text-xs text-ios-secondary">Full breakdown incl. costs & GP%</div>
            </div>
            <ChevronRight size={16} className="text-ios-separator" />
          </div>
        </button>

        <button className="ios-card w-full press-feedback" onClick={downloadCSV}>
          <div className="ios-row">
            <div className="w-8 h-8 rounded-ios-xs bg-ios-green flex items-center justify-center shrink-0">
              <Download size={16} className="text-white" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-sm">Export CSV</div>
              <div className="text-xs text-ios-secondary">Google Sheets / Excel with full data</div>
            </div>
            <ChevronRight size={16} className="text-ios-separator" />
          </div>
        </button>

        <button className="ios-card w-full press-feedback" onClick={downloadPDF}>
          <div className="ios-row">
            <div className="w-8 h-8 rounded-ios-xs bg-black flex items-center justify-center shrink-0">
              <FileText size={16} className="text-white" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-sm">Internal PDF</div>
              <div className="text-xs text-ios-secondary">Full cost breakdown for internal use</div>
            </div>
            <ChevronRight size={16} className="text-ios-separator" />
          </div>
        </button>
      </div>
    </Sheet>

    {/* Line sheet picker */}
    <Sheet open={showLSPicker} onClose={() => setShowLSPicker(false)} title="Add to Line Sheet">
      <div className="px-4 pb-8 space-y-2 mt-2">
        <p className="text-xs text-ios-secondary mb-3">{quote.name}</p>

        <button className="ios-card w-full press-feedback" onClick={() => {
          setShowLSPicker(false)
          addToLineSheet()
        }}>
          <div className="ios-row">
            <div className="w-8 h-8 rounded-ios-xs bg-black flex items-center justify-center shrink-0">
              <Plus size={16} className="text-white" />
            </div>
            <div className="flex-1 text-left">
              <div className="font-semibold text-sm">New Line Sheet</div>
            </div>
            <ChevronRight size={16} className="text-ios-separator" />
          </div>
        </button>

        {lsSheets.length > 0 && (
          <>
            <p className="text-xs text-ios-secondary px-1 pt-2">Add to existing</p>
            {lsSheets.map(ls => (
              <button key={ls.id} className="ios-card w-full press-feedback" onClick={() => {
                setShowLSPicker(false)
                // Use queue approach to append to existing sheet
                try {
                  const cur = quote.currency || 'AUD'
                  const rate = cur === 'USD' ? (settings.usdRate ?? 1) : 1
                  const px = settings.metalPrices ?? DEFAULT_METAL_PRICES
                  const r2 = (n: number) => Math.round((isNaN(n) ? 0 : n) * 100) / 100
                  const stoneParts = quote.stoneLines.map(s => STONE_LABELS_CLIENT[s.stoneType])
                  const buildVariantData = (metalLines: MetalLine[], variantName: string) => {
                    const rows: { id: string; description: string; wholesale: number; rrp: number }[] = []
                    for (const m of metalLines) {
                      const cost = (m.grams || 0) * (px[m.metalType] || 0) * rate
                      rows.push({ id: crypto.randomUUID(), description: METAL_LABELS[m.metalType], wholesale: r2(cost * 2.2), rrp: r2(cost * 4.4) })
                    }
                    for (const s of quote.stoneLines) {
                      const cost = (s.wholesaleCost || 0) * rate
                      rows.push({ id: crypto.randomUUID(), description: STONE_LABELS_CLIENT[s.stoneType], wholesale: r2(cost * 2.2), rrp: r2(cost * 4.4) })
                    }
                    for (const item of (quote.additionalItems || [])) {
                      const cost = (item.price || 0) * rate
                      rows.push({ id: crypto.randomUUID(), description: item.label || 'Additional Item', wholesale: r2(cost * 2.2), rrp: r2(cost * 4.4) })
                    }
                    const variantQuote = { ...quote, metalLines }
                    const totalConverted = calcTotalCost(variantQuote, px) * rate
                    const lineDescription = [quote.name, variantName, stoneParts.length > 0 ? `Set with ${stoneParts.join(' & ')}` : ''].filter(Boolean).join(', ')
                    return { id: crypto.randomUUID(), metalName: variantName || 'Pricing', lineDescription, rows, subtotalWholesale: roundPrice(r2(totalConverted * 2.2)), subtotalRRP: roundPrice(r2(totalConverted * 4.4)) }
                  }
                  const variants = quote.metalVariants ?? []
                  const metalVariants = variants.length > 0
                    ? variants.map(v => buildVariantData(v.metalLines, v.name))
                    : [buildVariantData(quote.metalLines, quote.metalLines[0] ? METAL_LABELS[quote.metalLines[0].metalType] : 'Pricing')]
                  const product = { id: crypto.randomUUID(), pieceName: quote.name, sku: '', metadata: metalVariants[0]?.metalName || '', images: [null, null], metalVariants }
                  localStorage.setItem('bs_ls_queue', JSON.stringify({ action: 'add', lsId: ls.id, currency: cur, products: [product] }))
                  window.open(`/linesheet.html?v=${Date.now()}`, '_blank')
                  onClose()
                } catch (err) {
                  alert(`Error: ${err instanceof Error ? err.message : String(err)}`)
                }
              }}>
                <div className="ios-row">
                  <div className="w-8 h-8 rounded-ios-xs bg-ios-bg border border-ios-separator/60 flex items-center justify-center shrink-0">
                    <Layers size={16} className="text-ios-secondary" />
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold text-sm">{ls.name}</div>
                  </div>
                  <ChevronRight size={16} className="text-ios-separator" />
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </Sheet>
    </>
  )
}

// ─── Quote Builder tab ────────────────────────────────────────────────────────

function QuoteBuilderTab({ quote, settings, onChange }: {
  quote: Quote
  settings: AppSettings
  onChange: (q: Quote) => void
}) {
  const [showExport, setShowExport] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const prices = settings.metalPrices

  // ── Metal variant helpers ──────────────────────────────────────────────────
  const hasVariants = (quote.metalVariants?.length ?? 0) > 0

  function addVariant() {
    const existing = quote.metalVariants ?? []
    let next: QuoteMetalVariant[]
    if (existing.length === 0) {
      // Promote current metalLines into first variant, clone as second
      const clonedLines = quote.metalLines.map(l => ({ ...l, id: crypto.randomUUID() }))
      const firstName = quote.metalLines[0] ? METAL_LABELS[quote.metalLines[0].metalType] : 'Variant 1'
      const secondName = clonedLines[0] ? METAL_LABELS[clonedLines[0].metalType] : 'Variant 2'
      next = [
        { id: crypto.randomUUID(), name: firstName, metalLines: quote.metalLines },
        { id: crypto.randomUUID(), name: secondName, metalLines: clonedLines },
      ]
    } else {
      const last = existing[existing.length - 1]
      const newLines = last.metalLines.map(l => ({ ...l, id: crypto.randomUUID() }))
      const newName = newLines[0] ? METAL_LABELS[newLines[0].metalType] : `Variant ${existing.length + 1}`
      next = [
        ...existing,
        { id: crypto.randomUUID(), name: newName, metalLines: newLines },
      ]
    }
    onChange({ ...quote, metalVariants: next, metalLines: next[0].metalLines })
  }

  function deleteVariant(variantId: string) {
    const next = (quote.metalVariants ?? []).filter(v => v.id !== variantId)
    onChange({ ...quote, metalVariants: next, metalLines: next[0]?.metalLines ?? quote.metalLines })
  }

  function updateVariantName(variantId: string, name: string) {
    const next = (quote.metalVariants ?? []).map(v => v.id === variantId ? { ...v, name } : v)
    onChange({ ...quote, metalVariants: next })
  }

  function addMetalToVariant(variantId: string) {
    const newLine: MetalLine = { id: crypto.randomUUID(), metalType: 'STG', grams: 0 }
    const next = (quote.metalVariants ?? []).map(v =>
      v.id === variantId ? { ...v, metalLines: [...v.metalLines, newLine] } : v
    )
    onChange({ ...quote, metalVariants: next, metalLines: next[0]?.metalLines ?? quote.metalLines })
  }

  function updateMetalInVariant(variantId: string, lineId: string, updated: MetalLine) {
    const next = (quote.metalVariants ?? []).map(v =>
      v.id === variantId ? { ...v, metalLines: v.metalLines.map(l => l.id === lineId ? updated : l) } : v
    )
    onChange({ ...quote, metalVariants: next, metalLines: next[0]?.metalLines ?? quote.metalLines })
  }

  function deleteMetalFromVariant(variantId: string, lineId: string) {
    const next = (quote.metalVariants ?? []).map(v =>
      v.id === variantId ? { ...v, metalLines: v.metalLines.filter(l => l.id !== lineId) } : v
    )
    onChange({ ...quote, metalVariants: next, metalLines: next[0]?.metalLines ?? quote.metalLines })
  }

  // ── Single-metal (non-variant) helpers ────────────────────────────────────
  function addMetal() {
    onChange({
      ...quote,
      metalLines: [
        ...quote.metalLines,
        { id: crypto.randomUUID(), metalType: 'STG', grams: 0 }
      ]
    })
  }

  function addStone() {
    onChange({
      ...quote,
      stoneLines: [
        ...quote.stoneLines,
        { id: crypto.randomUUID(), stoneType: 'lab-diamond', wholesaleCost: 0 }
      ]
    })
  }

  function updateMetal(id: string, updated: MetalLine) {
    onChange({ ...quote, metalLines: quote.metalLines.map(l => l.id === id ? updated : l) })
  }

  function deleteMetal(id: string) {
    onChange({ ...quote, metalLines: quote.metalLines.filter(l => l.id !== id) })
  }

  function updateStone(id: string, updated: StoneLine) {
    onChange({ ...quote, stoneLines: quote.stoneLines.map(l => l.id === id ? updated : l) })
  }

  function deleteStone(id: string) {
    onChange({ ...quote, stoneLines: quote.stoneLines.filter(l => l.id !== id) })
  }

  function addAdditionalItem() {
    onChange({
      ...quote,
      additionalItems: [
        ...(quote.additionalItems || []),
        { id: crypto.randomUUID(), label: '', price: 0 }
      ]
    })
  }

  function updateAdditionalItem(id: string, updated: AdditionalItem) {
    onChange({ ...quote, additionalItems: (quote.additionalItems || []).map(i => i.id === id ? updated : i) })
  }

  function deleteAdditionalItem(id: string) {
    onChange({ ...quote, additionalItems: (quote.additionalItems || []).filter(i => i.id !== id) })
  }

  const rate = settings.usdRate
  const currency = quote.currency

  return (
    <>
      <div className="scroll-content pt-2">
        {/* Quote name + client */}
        <div className="px-4 mb-3">
          {editingName ? (
            <input
              autoFocus
              className="text-xl font-bold w-full bg-transparent border-b border-ios-blue outline-none py-1"
              value={quote.name}
              onChange={e => onChange({ ...quote, name: e.target.value })}
              onBlur={() => setEditingName(false)}
              onKeyDown={e => e.key === 'Enter' && setEditingName(false)}
            />
          ) : (
            <button className="flex items-center gap-2 press-feedback" onClick={() => setEditingName(true)}>
              <h1 className="text-xl font-bold">{quote.name}</h1>
              <PenLine size={14} className="text-ios-secondary" />
            </button>
          )}
          <p className="text-xs text-ios-secondary mt-0.5">
            {new Date(quote.updatedAt || quote.createdAt).toLocaleDateString('en-AU', { dateStyle: 'medium' })}
          </p>
          <input
            className="mt-2 text-sm w-full bg-transparent border-b border-ios-separator/60 outline-none py-1 text-ios-secondary placeholder:text-ios-separator focus:border-ios-blue focus:text-black transition-colors"
            placeholder="Client name (optional)"
            value={quote.clientName || ''}
            onChange={e => onChange({ ...quote, clientName: e.target.value })}
          />
        </div>

        {/* Currency + GP row */}
        <div className="px-4 mb-3" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SegControl
            options={[{ value: 'AUD', label: 'AUD' }, { value: 'USD', label: 'USD' }]}
            value={quote.currency}
            onChange={v => onChange({ ...quote, currency: v as Currency, mode: 'retail' as const })}
          />
          <SegControl
            options={[{ value: '60', label: '60%' }, { value: '65', label: '65%' }, { value: '70', label: '70%' }, { value: '75', label: '75%' }]}
            value={String(quote.retailGP)}
            onChange={v => onChange({ ...quote, retailGP: parseInt(v) })}
            style={{ flex: 1 }}
          />
        </div>

        {/* Metals section */}
        <div className="px-4 mb-1">
          <div className="flex items-center justify-between mb-1">
            <span className="field-label">Metals</span>
            <div className="flex items-center gap-3">
              {!hasVariants && (
                <button className="press-feedback flex items-center gap-1 text-ios-blue text-xs font-semibold" onClick={addMetal}>
                  <Plus size={14} /> Add
                </button>
              )}
              <button className="press-feedback flex items-center gap-1 text-ios-blue text-xs font-semibold opacity-60" onClick={addVariant}>
                <Plus size={14} /> Variant
              </button>
            </div>
          </div>
        </div>

        {!hasVariants ? (
          <div className="ios-card mx-4 mb-3">
            {quote.metalLines.length === 0 ? (
              <button className="ios-row w-full text-ios-secondary text-sm press-feedback" onClick={addMetal}>
                <Plus size={16} className="mr-1" /> Add metal component
              </button>
            ) : (
              quote.metalLines.map(line => (
                <MetalLineRow
                  key={line.id}
                  line={line}
                  prices={prices}
                  currency={currency}
                  rate={rate}
                  onUpdate={updated => updateMetal(line.id, updated)}
                  onDelete={() => deleteMetal(line.id)}
                />
              ))
            )}
          </div>
        ) : (
          <div className="mx-4 mb-3 space-y-2">
            {(quote.metalVariants ?? []).map((variant, vi) => {
              const variantCost = calcMetalCost(variant.metalLines, prices) * (currency === 'USD' ? rate : 1)
              const variantTotal = calcTotalCost({ ...quote, metalLines: variant.metalLines }, prices) * (currency === 'USD' ? rate : 1)
              const variantRetail = calcRetailPrice({ ...quote, metalLines: variant.metalLines }, prices, settings.stoneGP ?? STONE_GP) * (currency === 'USD' ? rate : 1)
              const fmt = (n: number) => formatPrice(n, currency)
              return (
                <div key={variant.id} className="ios-card overflow-hidden">
                  {/* Variant header */}
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-ios-separator/60 bg-gray-50/60">
                    <input
                      className="flex-1 text-sm font-semibold bg-transparent outline-none"
                      value={variant.name}
                      placeholder={`Variant ${vi + 1}`}
                      onChange={e => updateVariantName(variant.id, e.target.value)}
                    />
                    <button
                      className="press-feedback flex items-center gap-1 text-ios-blue text-xs font-semibold"
                      onClick={() => addMetalToVariant(variant.id)}
                    >
                      <Plus size={12} /> Add
                    </button>
                    {(quote.metalVariants ?? []).length > 1 && (
                      <button
                        className="press-feedback text-ios-red ml-1"
                        onClick={() => deleteVariant(variant.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {/* Metal lines */}
                  {variant.metalLines.length === 0 ? (
                    <button className="ios-row w-full text-ios-secondary text-sm press-feedback" onClick={() => addMetalToVariant(variant.id)}>
                      <Plus size={16} className="mr-1" /> Add metal component
                    </button>
                  ) : (
                    variant.metalLines.map(line => (
                      <MetalLineRow
                        key={line.id}
                        line={line}
                        prices={prices}
                        currency={currency}
                        rate={rate}
                        onUpdate={updated => updateMetalInVariant(variant.id, line.id, updated)}
                        onDelete={() => deleteMetalFromVariant(variant.id, line.id)}
                      />
                    ))
                  )}
                  {/* Variant price footer */}
                  <div className="flex items-center justify-between px-3 py-2 border-t border-ios-separator/60 bg-gray-50/40 text-xs">
                    <span className="text-ios-secondary">Metal {fmt(variantCost)} · Total cost {fmt(variantTotal)}</span>
                    <span className="font-semibold price-display">
                      {quote.mode === 'retail' ? fmt(variantRetail) : '—'}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Stones section */}
        <div className="px-4 mb-1">
          <div className="flex items-center justify-between mb-1">
            <span className="field-label">Stones</span>
            <button className="press-feedback flex items-center gap-1 text-ios-blue text-xs font-semibold" onClick={addStone}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
        <div className="ios-card mx-4 mb-3">
          {quote.stoneLines.length === 0 ? (
            <button className="ios-row w-full text-ios-secondary text-sm press-feedback" onClick={addStone}>
              <Plus size={16} className="mr-1" /> Add stone component
            </button>
          ) : (
            quote.stoneLines.map(line => (
              <StoneLineRow
                key={line.id}
                line={line}
                currency={currency}
                rate={rate}
                stoneGP={settings.stoneGP ?? STONE_GP}
                onUpdate={updated => updateStone(line.id, updated)}
                onDelete={() => deleteStone(line.id)}
              />
            ))
          )}
        </div>

        {/* Additional Items section */}
        <div className="px-4 mb-1">
          <div className="flex items-center justify-between mb-1">
            <span className="field-label">Additional Items</span>
            <button className="press-feedback flex items-center gap-1 text-ios-blue text-xs font-semibold" onClick={addAdditionalItem}>
              <Plus size={14} /> Add
            </button>
          </div>
        </div>
        {(quote.additionalItems?.length ?? 0) > 0 && (
          <div className="ios-card mx-4 mb-3">
            {(quote.additionalItems || []).map(item => (
              <AdditionalItemRow
                key={item.id}
                item={item}
                currency={currency}
                rate={rate}
                onUpdate={updated => updateAdditionalItem(item.id, updated)}
                onDelete={() => deleteAdditionalItem(item.id)}
              />
            ))}
          </div>
        )}
        {(quote.additionalItems?.length ?? 0) === 0 && (
          <div className="ios-card mx-4 mb-3">
            <button className="ios-row w-full text-ios-secondary text-sm press-feedback" onClick={addAdditionalItem}>
              <Plus size={16} className="mr-1" /> Add fixed-price item (e.g. engraving, chain)
            </button>
          </div>
        )}

        {/* Labour & Packaging */}
        <div className="px-4 mb-1">
          <span className="field-label">Labour & Packaging</span>
        </div>
        <div className="ios-card mx-4 mb-3">
          <div className="ios-row row-sep">
            <span className="text-sm font-medium" style={{ flex: 1 }}>Labour</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="text-xs text-ios-secondary">{currency}</span>
              <input
                className="ios-input text-right price-display"
                style={{ width: 72 }}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={quote.labour === 0 ? '' : quote.labour}
                placeholder="0"
                onChange={e => onChange({ ...quote, labour: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
          <div className="ios-row">
            <span className="text-sm font-medium" style={{ flex: 1 }}>Packaging</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span className="text-xs text-ios-secondary">{currency}</span>
              <input
                className="ios-input text-right price-display"
                style={{ width: 72 }}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={quote.packaging === 0 ? '' : quote.packaging}
                placeholder="0"
                onChange={e => onChange({ ...quote, packaging: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>
        </div>

        {/* Price summary */}
        <PriceSummary quote={quote} settings={settings} />

        {/* Export button */}
        <div className="px-4 mb-6">
          <button
            className="w-full press-feedback btn-gold rounded-ios py-3.5 text-sm font-bold tracking-wide"
            onClick={() => setShowExport(true)}
          >
            Export Quote
          </button>
        </div>
      </div>

      <ExportSheet
        open={showExport}
        onClose={() => setShowExport(false)}
        quote={quote}
        settings={settings}
      />
    </>
  )
}

// ─── Products catalogue ───────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ProductCategory, string> = {
  ring: '💍 Ring',
  earrings: '✦ Earrings',
  necklace: '⬡ Necklace',
  bracelet: '◯ Bracelet',
  pendant: '▽ Pendant',
  bangle: '○ Bangle',
  sapphire: '◈ Sapphire',
  other: '· Other',
}

const CATEGORY_EMOJI: Record<ProductCategory, string> = {
  ring: '💍', earrings: '✦', necklace: '⬡', bracelet: '◯',
  pendant: '▽', bangle: '○', sapphire: '◈', other: '·',
}

const CATEGORY_GROUP: Record<ProductCategory, string> = {
  ring: 'HAND', bracelet: 'HAND', bangle: 'HAND',
  necklace: 'NECK', pendant: 'NECK',
  earrings: 'EAR',
  sapphire: 'SAPPHIRES',
  other: 'OTHER',
}
const GROUP_ORDER = ['HAND', 'NECK', 'EAR', 'SAPPHIRES', 'OTHER']

function productFromQuote(quote: Quote): Product {
  return {
    id: crypto.randomUUID(),
    sku: '',
    name: quote.name,
    category: 'other',
    description: '',
    metalLines: quote.metalLines.map(l => ({ ...l })),
    metalVariants: (quote.metalVariants?.length ?? 0) > 0
      ? quote.metalVariants!.map(v => ({ ...v, metalLines: v.metalLines.map(l => ({ ...l })) }))
      : undefined,
    stoneLines: quote.stoneLines.map(l => ({ ...l })),
    labour: quote.labour,
    packaging: quote.packaging,
    notes: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function quoteFromProduct(product: Product): Quote {
  return {
    ...newQuote(),
    name: product.name,
    metalLines: product.metalLines.map(l => ({ ...l, id: crypto.randomUUID() })),
    metalVariants: (product.metalVariants?.length ?? 0) > 0
      ? product.metalVariants!.map(v => ({ ...v, id: crypto.randomUUID(), metalLines: v.metalLines.map(l => ({ ...l, id: crypto.randomUUID() })) }))
      : undefined,
    stoneLines: product.stoneLines.map(l => ({ ...l, id: crypto.randomUUID() })),
    labour: product.labour,
    packaging: product.packaging,
  }
}

function ProductEditSheet({ product, open, onClose, onSave, settings }: {
  product: Product | null
  open: boolean
  onClose: () => void
  onSave: (p: Product) => void
  settings: AppSettings
}) {
  const [draft, setDraft] = useState<Product | null>(null)

  useEffect(() => {
    if (open && product) setDraft({ ...product })
  }, [open, product])

  if (!open || !draft) return null

  const prices = settings.metalPrices
  const metalCost = calcMetalCost(draft.metalLines, prices)
  const stoneRetail = draft.stoneLines.reduce((s, l) => s + calcStoneRetail(l), 0)

  function addMetal() {
    setDraft(d => d ? { ...d, metalLines: [...d.metalLines, { id: crypto.randomUUID(), metalType: 'STG', grams: 0 }] } : d)
  }
  function addStone() {
    setDraft(d => d ? { ...d, stoneLines: [...d.stoneLines, { id: crypto.randomUUID(), stoneType: 'lab-diamond', wholesaleCost: 0 }] } : d)
  }

  return (
    <Sheet open={open} onClose={onClose} title={draft.id && draft.createdAt !== draft.updatedAt ? 'Edit Product' : 'New Product'}>
      <div className="px-4 pb-10 space-y-4">
        {/* Name & SKU */}
        <div className="ios-card">
          <div className="ios-row row-sep">
            <span className="text-sm font-medium w-20 shrink-0">Name</span>
            <input
              className="ios-input text-sm"
              placeholder="e.g. Solitaire Ring"
              value={draft.name}
              onChange={e => setDraft({ ...draft, name: e.target.value })}
            />
          </div>
          <div className="ios-row row-sep">
            <span className="text-sm font-medium w-20 shrink-0">SKU</span>
            <input
              className="ios-input text-sm"
              placeholder="e.g. RNG-001"
              value={draft.sku}
              onChange={e => setDraft({ ...draft, sku: e.target.value })}
            />
          </div>
          <div className="ios-row row-sep">
            <span className="text-sm font-medium w-20 shrink-0">Category</span>
            <div className="relative flex-1 flex items-center">
              <select
                className="ios-select text-sm flex-1 pr-5"
                value={draft.category}
                onChange={e => setDraft({ ...draft, category: e.target.value as ProductCategory })}
              >
                {(Object.keys(CATEGORY_LABELS) as ProductCategory[]).map(c => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
              <ChevronDown size={12} className="absolute right-0 text-ios-secondary pointer-events-none" />
            </div>
          </div>
          <div className="ios-row">
            <span className="text-sm font-medium w-20 shrink-0">Notes</span>
            <input
              className="ios-input text-sm"
              placeholder="Optional notes"
              value={draft.notes}
              onChange={e => setDraft({ ...draft, notes: e.target.value })}
            />
          </div>
          {draft.category === 'ring' && (
            <div className="ios-row row-sep" style={{borderTop:'0.5px solid var(--ios-separator)'}}>
              <span className="text-sm font-medium w-20 shrink-0">Sizes</span>
              <input
                className="ios-input text-sm"
                placeholder="e.g. H – T"
                value={draft.sizes ?? ''}
                onChange={e => setDraft({ ...draft, sizes: e.target.value })}
              />
            </div>
          )}
        </div>

        {/* Metals */}
        <div>
          <div className="flex justify-between items-center mb-1 px-1">
            <span className="field-label">Metals</span>
            <button className="press-feedback text-ios-blue text-xs font-semibold flex items-center gap-1" onClick={addMetal}>
              <Plus size={13} /> Add
            </button>
          </div>
          <div className="ios-card">
            {draft.metalLines.length === 0 ? (
              <button className="ios-row w-full text-ios-secondary text-sm press-feedback" onClick={addMetal}>
                <Plus size={15} className="mr-1" /> Add metal
              </button>
            ) : draft.metalLines.map(line => (
              <div key={line.id} className="ios-row row-sep">
                <div className="relative flex items-center bg-ios-bg rounded-ios-xs px-2 py-1 shrink-0">
                  <select
                    className="ios-select font-semibold text-sm pr-3"
                    value={line.metalType}
                    onChange={e => setDraft({ ...draft, metalLines: draft.metalLines.map(l => l.id === line.id ? { ...l, metalType: e.target.value as MetalType } : l) })}
                  >
                    {(['STG','9YG','9WG','18YG','18WG','PLT'] as MetalType[]).map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <ChevronDown size={11} className="absolute right-1.5 text-ios-secondary pointer-events-none" />
                </div>
                <NumInput
                  value={line.grams}
                  onChange={v => setDraft({ ...draft, metalLines: draft.metalLines.map(l => l.id === line.id ? { ...l, grams: v } : l) })}
                  suffix="g"
                  step="0.1"
                />
                <button className="press-feedback text-ios-red ml-auto shrink-0"
                  onClick={() => setDraft({ ...draft, metalLines: draft.metalLines.filter(l => l.id !== line.id) })}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Variant summary (read-only) */}
        {(draft.metalVariants?.length ?? 0) > 0 && (
          <div className="ios-card px-4 py-3 bg-amber-50/40">
            <div className="text-xs font-semibold uppercase tracking-wider text-ios-secondary mb-2">Metal Variants</div>
            {draft.metalVariants!.map(v => (
              <div key={v.id} className="text-sm py-0.5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span>{v.name}</span>
                <span className="text-xs text-ios-secondary">{v.metalLines.map(l => `${l.grams}g ${l.metalType}`).join(', ')}</span>
              </div>
            ))}
            <p className="text-xs text-ios-secondary mt-2">Edit variants in Quote Builder → Save</p>
          </div>
        )}

        {/* Stones */}
        <div>
          <div className="flex justify-between items-center mb-1 px-1">
            <span className="field-label">Stones</span>
            <button className="press-feedback text-ios-blue text-xs font-semibold flex items-center gap-1" onClick={addStone}>
              <Plus size={13} /> Add
            </button>
          </div>
          <div className="ios-card">
            {draft.stoneLines.length === 0 ? (
              <button className="ios-row w-full text-ios-secondary text-sm press-feedback" onClick={addStone}>
                <Plus size={15} className="mr-1" /> Add stone
              </button>
            ) : draft.stoneLines.map(line => (
              <div key={line.id} className="ios-row row-sep">
                <div className="relative flex items-center bg-ios-bg rounded-ios-xs px-2 py-1 shrink-0">
                  <select
                    className="ios-select font-semibold text-sm pr-3"
                    value={line.stoneType}
                    onChange={e => setDraft({ ...draft, stoneLines: draft.stoneLines.map(l => l.id === line.id ? { ...l, stoneType: e.target.value as StoneType } : l) })}
                  >
                    <option value="lab-diamond">Lab ◆</option>
                    <option value="sapphire">Sapph.</option>
                    <option value="natural">Natural</option>
                  </select>
                  <ChevronDown size={11} className="absolute right-1.5 text-ios-secondary pointer-events-none" />
                </div>
                <div className="flex items-center gap-1 flex-1">
                  <span className="text-ios-secondary text-xs shrink-0">WS</span>
                  <NumInput
                    value={line.wholesaleCost}
                    onChange={v => setDraft({ ...draft, stoneLines: draft.stoneLines.map(l => l.id === line.id ? { ...l, wholesaleCost: v } : l) })}
                  />
                </div>
                <button className="press-feedback text-ios-red ml-1 shrink-0"
                  onClick={() => setDraft({ ...draft, stoneLines: draft.stoneLines.filter(l => l.id !== line.id) })}>
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Labour & Packaging */}
        <div className="ios-card">
          <div className="ios-row row-sep">
            <span className="text-sm font-medium flex-1">Labour</span>
            <NumInput value={draft.labour} onChange={v => setDraft({ ...draft, labour: v })} prefix="$" />
          </div>
          <div className="ios-row">
            <span className="text-sm font-medium flex-1">Packaging</span>
            <NumInput value={draft.packaging} onChange={v => setDraft({ ...draft, packaging: v })} prefix="$" />
          </div>
        </div>

        {/* Cost summary */}
        {(metalCost > 0 || stoneRetail > 0 || draft.labour > 0) && (
          <div className="ios-card px-4 py-3 bg-gray-50">
            <div className="text-xs text-ios-secondary mb-2 font-semibold uppercase tracking-wider">Cost Preview (AUD)</div>
            {metalCost > 0 && <div className="flex justify-between text-sm mb-1"><span className="text-ios-secondary">Metals</span><span className="price-display">{formatPrice(metalCost, 'AUD')}</span></div>}
            {stoneRetail > 0 && <div className="flex justify-between text-sm mb-1"><span className="text-ios-secondary">Stones (retail)</span><span className="price-display">{formatPrice(stoneRetail, 'AUD')}</span></div>}
            {draft.labour > 0 && <div className="flex justify-between text-sm mb-1"><span className="text-ios-secondary">Labour</span><span className="price-display">{formatPrice(draft.labour, 'AUD')}</span></div>}
          </div>
        )}

        <button
          className="w-full btn-gold rounded-ios py-3.5 text-sm font-bold press-feedback"
          onClick={() => { onSave({ ...draft, updatedAt: new Date().toISOString() }); onClose() }}
        >
          Save Product
        </button>
      </div>
    </Sheet>
  )
}

// ─── Quick price view ─────────────────────────────────────────────────────────

const GP_STEPS = [60, 65, 70, 75, 80, 85]

function PriceViewSheet({ product, open, onClose, onLoadToQuote, onAddToQuote, settings }: {
  product: Product | null
  open: boolean
  onClose: () => void
  onLoadToQuote: (p: Product, gp: number) => void
  onAddToQuote: (p: Product) => void
  settings: AppSettings
}) {
  const [currency, setCurrency] = useState<Currency>('AUD')
  if (!open || !product) return null

  const prices = settings.metalPrices
  const rate = settings.usdRate
  const fmt = (n: number) => formatPrice(currency === 'USD' ? n * rate : n, currency)

  const metalCost = calcMetalCost(product.metalLines, prices)
  const stoneRetail = product.stoneLines.reduce((s, l) => s + calcStoneRetail(l), 0)
  const stoneWS = product.stoneLines.reduce((s, l) => s + l.wholesaleCost, 0)
  const baseCost = metalCost + (product.labour || 0) + (product.packaging || 0)
  const totalCost = baseCost + stoneWS
  const hasComponents = metalCost > 0 || product.labour > 0 || product.packaging > 0

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="px-4 pb-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-4 pt-1">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg leading-tight">{product.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              {product.sku && <span className="text-[11px] font-mono bg-ios-bg px-2 py-0.5 rounded text-ios-secondary">{product.sku}</span>}
              {product.notes && <span className="text-xs text-ios-secondary truncate">{product.notes}</span>}
            </div>
          </div>
          <SegControl
            options={[{ value: 'AUD', label: 'AUD' }, { value: 'USD', label: 'USD' }]}
            value={currency}
            onChange={v => setCurrency(v as Currency)}
            className="ml-3 shrink-0"
          />
        </div>

        {/* Cost breakdown */}
        {hasComponents && (
          <div className="ios-card mb-3 px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-ios-secondary mb-2">Cost Breakdown</div>
            {product.metalLines.map(l => {
              const cost = l.grams * prices[l.metalType]
              return (
                <div key={l.id} className="flex justify-between text-sm mb-1">
                  <span className="text-ios-secondary">{l.grams}g {l.metalType}</span>
                  <span className="price-display font-medium">{fmt(cost)}</span>
                </div>
              )
            })}
            {product.stoneLines.map(l => (
              <div key={l.id} className="flex justify-between text-sm mb-1">
                <span className="text-ios-secondary">{STONE_LABELS[l.stoneType].split(' (')[0]}</span>
                <span className="price-display font-medium">{fmt(l.wholesaleCost)}</span>
              </div>
            ))}
            {product.labour > 0 && (
              <div className="flex justify-between text-sm mb-1">
                <span className="text-ios-secondary">Labour</span>
                <span className="price-display font-medium">{fmt(product.labour)}</span>
              </div>
            )}
            {product.packaging > 0 && (
              <div className="flex justify-between text-sm mb-1">
                <span className="text-ios-secondary">Packaging</span>
                <span className="price-display font-medium">{fmt(product.packaging)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm pt-2 border-t border-ios-separator/60 font-semibold">
              <span>Total cost</span>
              <span className="price-display">{fmt(totalCost)}</span>
            </div>
          </div>
        )}

        {/* Price grid */}
        {hasComponents ? (
          <div className="ios-card mb-3 overflow-hidden">
            <div className="px-4 pt-3 pb-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">Retail at GP%</div>
            </div>
            {GP_STEPS.map((gp, idx) => {
              const retail = baseCost / (1 - gp / 100) + stoneRetail
              const isDefault = gp === 70
              return (
                <button
                  key={gp}
                  className={`ios-row w-full row-sep press-feedback text-left ${isDefault ? 'bg-amber-50/60' : ''}`}
                  onClick={() => { onLoadToQuote(product, gp); onClose() }}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <span className={`text-sm font-semibold w-8 ${isDefault ? 'text-black' : 'text-ios-secondary'}`}>{gp}%</span>
                    {isDefault && <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded" style={{ background: 'var(--gold)', color: '#000' }}>default</span>}
                  </div>
                  <span className={`price-display font-bold text-base ${isDefault ? 'text-black' : 'text-ios-secondary'}`}>
                    {fmt(retail)}
                  </span>
                  <ChevronRight size={14} className="text-ios-separator ml-2 shrink-0" />
                </button>
              )
            })}
          </div>
        ) : (
          <div className="ios-card mb-3 px-4 py-4 text-center">
            <p className="text-sm text-ios-secondary">No cost data — load into Quote Builder to add metals & stones</p>
          </div>
        )}

        {product.notes && (
          <div className="ios-card mb-3 px-4 py-3 bg-amber-50/40">
            <p className="text-xs text-ios-secondary leading-relaxed">📋 {product.notes}</p>
          </div>
        )}

        {/* Load into quote CTA */}
        <div className="flex flex-col gap-2">
          <button
            className="w-full btn-gold rounded-ios py-3.5 text-sm font-bold press-feedback"
            onClick={() => { onLoadToQuote(product, 70); onClose() }}
          >
            New Quote from Product →
          </button>
          <button
            className="w-full bg-ios-bg rounded-ios py-3 text-sm font-semibold press-feedback text-ios-blue"
            onClick={() => { onAddToQuote(product); onClose() }}
          >
            Add metals &amp; labour to current quote
          </button>
          <p className="text-xs text-ios-secondary text-center px-2">
            Keeps any stones already in your quote
          </p>
        </div>
      </div>
    </Sheet>
  )
}

function ImportButton({ onImport, existing }: {
  onImport: (p: Product[]) => void
  existing: Product[]
}) {
  const [loading, setLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pendingData, setPendingData] = useState<Product[] | null>(null)

  async function handleImport() {
    setLoading(true)
    try {
      const res = await fetch('/catalogue.json')
      const data = await res.json()
      const imported: Product[] = data.products || []
      if (existing.length > 0) {
        setPendingData(imported)
        setShowConfirm(true)
      } else {
        onImport(imported)
      }
    } catch {
      alert('Could not load catalogue.')
    } finally {
      setLoading(false)
    }
  }

  function doMerge(replace: boolean) {
    if (!pendingData) return
    if (replace) {
      onImport(pendingData)
    } else {
      const existingNames = new Set(existing.map(p => p.name))
      const newOnes = pendingData.filter(p => !existingNames.has(p.name))
      onImport([...existing, ...newOnes])
    }
    setShowConfirm(false)
    setPendingData(null)
  }

  return (
    <>
      <button
        className="press-feedback bg-ios-bg rounded-ios-sm px-3 py-2 text-xs font-semibold flex items-center gap-1 text-ios-secondary"
        onClick={handleImport}
        disabled={loading}
      >
        <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        Import
      </button>

      <Sheet open={showConfirm} onClose={() => setShowConfirm(false)} title="Import Catalogue">
        <div className="px-4 pb-8 space-y-3">
          <p className="text-sm text-ios-secondary">
            You already have {existing.length} product{existing.length !== 1 ? 's' : ''}. How should we handle the import?
          </p>
          <button className="ios-card w-full press-feedback" onClick={() => doMerge(false)}>
            <div className="ios-row">
              <div className="flex-1 text-left">
                <div className="font-semibold text-sm">Merge (add new only)</div>
                <div className="text-xs text-ios-secondary">Keep existing, add products not already in catalogue</div>
              </div>
            </div>
          </button>
          <button className="ios-card w-full press-feedback" onClick={() => doMerge(true)}>
            <div className="ios-row">
              <div className="flex-1 text-left">
                <div className="font-semibold text-sm text-ios-red">Replace all</div>
                <div className="text-xs text-ios-secondary">Remove existing products and load fresh from spreadsheet</div>
              </div>
            </div>
          </button>
        </div>
      </Sheet>
    </>
  )
}

// ─── Price rounding ───────────────────────────────────────────────────────────
// Tiered: <$200 → nearest $5 · $200–$1000 → nearest $10 · >$1000 → nearest $25
function roundPrice(n: number): number {
  if (n <= 0) return 0
  const step = n < 200 ? 5 : n < 1000 ? 10 : 25
  return Math.round(n / step) * step
}

// ─── Helpers: batch line sheet + stock CSV ────────────────────────────────────

function productToLSItem(
  p: Product,
  prices: AppSettings['metalPrices'],
  cur: string,
  usdRate: number
) {
  const rate = cur === 'USD' ? (usdRate ?? 1) : 1
  const r2 = (n: number) => Math.round((isNaN(n) ? 0 : n) * 100) / 100
  const stoneParts = p.stoneLines.map(s => STONE_LABELS_CLIENT[s.stoneType])
  const stoneMetaParts = p.stoneLines.map(s => STONE_LABELS_CLIENT[s.stoneType])

  // Helper: build a single linesheet metalVariant from a set of metalLines + a name
  const buildLSVariant = (metalLines: MetalLine[], variantName: string) => {
    const rows: { id: string; description: string; wholesale: number; rrp: number }[] = []
    for (const m of metalLines) {
      const cost = (m.grams || 0) * (prices[m.metalType] || 0) * rate
      rows.push({ id: crypto.randomUUID(), description: METAL_LABELS[m.metalType], wholesale: r2(cost * 2.2), rrp: r2(cost * 4.4) })
    }
    for (const s of p.stoneLines) {
      const cost = (s.wholesaleCost || 0) * rate
      rows.push({ id: crypto.randomUUID(), description: STONE_LABELS_CLIENT[s.stoneType], wholesale: r2(cost * 2.2), rrp: r2(cost * 4.4) })
    }
    const metalTotalCost = metalLines.reduce((s, m) => s + (m.grams || 0) * (prices[m.metalType] || 0), 0)
    const totalCost = (
      metalTotalCost +
      p.stoneLines.reduce((s, st) => s + (st.wholesaleCost || 0), 0) +
      (p.labour || 0) + (p.packaging || 0)
    ) * rate
    const lineDescription = [
      p.name,
      variantName,
      stoneParts.length > 0 ? `Set with ${stoneParts.join(' & ')}` : '',
    ].filter(Boolean).join(', ')
    return {
      id: crypto.randomUUID(),
      metalName: variantName || 'Pricing',
      lineDescription,
      rows,
      subtotalWholesale: roundPrice(r2(totalCost * 2.2)),
      subtotalRRP: roundPrice(r2(totalCost * 4.4)),
    }
  }

  // Use product's metalVariants if present, otherwise fall back to metalLines
  const productVariants = p.metalVariants ?? []
  const lsVariants = productVariants.length > 0
    ? productVariants.map(v => buildLSVariant(v.metalLines, v.name))
    : [buildLSVariant(p.metalLines, p.metalLines[0] ? METAL_LABELS[p.metalLines[0].metalType] : 'Pricing')]

  // Metadata: variant names + stone types
  const allMetalLabels = productVariants.length > 0
    ? productVariants.map(v => v.name).join(' / ')
    : (p.metalLines[0] ? METAL_LABELS[p.metalLines[0].metalType] : '')
  const metaParts = [allMetalLabels, ...stoneMetaParts].filter(Boolean)

  return {
    id: p.id,  // stable ID — ties to IDB image keys across sheet rebuilds
    pieceName: p.name,
    sku: p.sku || '',
    metadata: metaParts.join(' · '),
    sizes: p.sizes || '',
    group: CATEGORY_GROUP[p.category] ?? '',
    images: [null, null] as [null, null],
    metalVariants: lsVariants,
  }
}

function downloadStockCSV(
  items: { name: string; lineDescription: string; wholesale: number; rrp: number; group: string }[],
  cur: string
) {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
  const header = ['Qty', 'Description', `Wholesale (${cur})`, `MSRP (${cur})`, `Total Wholesale`, `Total MSRP`].join(',')
  const rows: string[] = []
  let sumWS = 0, sumRRP = 0
  let lastGroup = ''
  for (const it of items) {
    if (it.group !== lastGroup) {
      if (lastGroup) rows.push('') // blank spacer between groups
      rows.push(`${it.group},,,,, `)
      rows.push(header)
      lastGroup = it.group
    }
    const desc = it.lineDescription || it.name
    rows.push([1, escape(desc), it.wholesale.toFixed(2), it.rrp.toFixed(2), it.wholesale.toFixed(2), it.rrp.toFixed(2)].join(','))
    sumWS += it.wholesale
    sumRRP += it.rrp
  }
  rows.push('')
  rows.push(['', 'TOTAL', '', '', sumWS.toFixed(2), sumRRP.toFixed(2)].join(','))
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `stock-quote-${new Date().toISOString().slice(0,10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function ProductsTab({ products, settings, onLoadToQuote, onAddToQuote, onSaveProducts }: {
  products: Product[]
  settings: AppSettings
  onLoadToQuote: (p: Product, gp: number) => void
  onAddToQuote: (p: Product) => void
  onSaveProducts: (p: Product[]) => void
}) {
  const [search, setSearch] = useState('')
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [priceViewProduct, setPriceViewProduct] = useState<Product | null>(null)
  const [filterCat, setFilterCat] = useState<ProductCategory | 'all'>('all')
  const [swipedId, setSwipedId] = useState<string | null>(null)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showLSPicker, setShowLSPicker] = useState(false)
  const [lsPickerSheets, setLSPickerSheets] = useState<{ id: string; label: string }[]>([])
  const [lsPickerCurrency, setLSPickerCurrency] = useState('AUD')

  const filtered = products.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase())
    const matchCat = filterCat === 'all' || p.category === filterCat
    return matchSearch && matchCat
  })

  // Group by category
  const grouped = filtered.reduce((acc, p) => {
    const key = p.category
    if (!acc[key]) acc[key] = []
    acc[key].push(p)
    return acc
  }, {} as Record<string, Product[]>)

  function handleNew() {
    const blank: Product = {
      id: crypto.randomUUID(),
      sku: '',
      name: 'New Product',
      category: 'ring',
      description: '',
      metalLines: [],
      stoneLines: [],
      labour: 0,
      packaging: 0,
      notes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    setEditProduct(blank)
    setShowEdit(true)
  }

  function handleEdit(p: Product) {
    setEditProduct(p)
    setShowEdit(true)
    setSwipedId(null)
  }

  function handleSave(p: Product) {
    onSaveProducts(products.some(x => x.id === p.id)
      ? products.map(x => x.id === p.id ? p : x)
      : [p, ...products])
  }

  function handleDelete(id: string) {
    onSaveProducts(products.filter(p => p.id !== id))
    setSwipedId(null)
  }

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function openLSPicker() {
    try {
      const raw = localStorage.getItem('bs_ls_v1')
      const sheets: { id: string; label: string }[] = []
      if (raw) {
        const data = JSON.parse(raw)
        for (const ls of (data.lineSheets || [])) {
          const label = ls.buyerName
            ? `${ls.buyerName}${ls.collection ? ' · ' + ls.collection : ''}`
            : `Untitled · ${ls.date || ''}`
          sheets.push({ id: ls.id, label })
        }
      }
      setLSPickerSheets(sheets)
    } catch { setLSPickerSheets([]) }
    setShowLSPicker(true)
  }

  function handleBatchToLineSheet(lsId: string | 'new') {
    try {
      const px = settings.metalPrices ?? DEFAULT_METAL_PRICES
      const cur = lsPickerCurrency
      // Sort selected products by group order (HAND → NECK → EAR → OTHER)
      const sel = products
        .filter(p => selectedIds.has(p.id))
        .sort((a, b) => {
          const ga = GROUP_ORDER.indexOf(CATEGORY_GROUP[a.category] ?? 'OTHER')
          const gb = GROUP_ORDER.indexOf(CATEGORY_GROUP[b.category] ?? 'OTHER')
          return ga !== gb ? ga - gb : a.name.localeCompare(b.name)
        })
      const lsProducts = sel.map(p => productToLSItem(p, px, cur, settings.usdRate ?? 1))

      // Write bridge to localStorage
      localStorage.setItem('bs_ls_queue', JSON.stringify({
        action: lsId === 'new' ? 'new' : 'add',
        lsId: lsId === 'new' ? null : lsId,
        currency: cur,
        products: lsProducts,
      }))

      // Download stock CSV with group headers
      const csvItems = sel.map((p, i) => ({
        name: lsProducts[i].pieceName,
        lineDescription: lsProducts[i].metalVariants[0]?.lineDescription || lsProducts[i].pieceName,
        wholesale: lsProducts[i].metalVariants[0]?.subtotalWholesale || 0,
        rrp: lsProducts[i].metalVariants[0]?.subtotalRRP || 0,
        group: CATEGORY_GROUP[p.category] ?? 'OTHER',
      }))
      downloadStockCSV(csvItems, cur)

      // Open line sheet builder
      window.open(`/linesheet.html?v=${Date.now()}`, '_blank')

      // Reset select mode
      setSelectMode(false)
      setSelectedIds(new Set())
      setShowLSPicker(false)
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function buildAllSheets() {
    try {
      const px = settings.metalPrices ?? DEFAULT_METAL_PRICES
      const cur = lsPickerCurrency

      // Group all products by category group, sorted A-Z within each group
      const grouped: Record<string, Product[]> = {}
      for (const group of GROUP_ORDER) grouped[group] = []
      for (const p of products) {
        const g = CATEGORY_GROUP[p.category] ?? 'OTHER'
        if (!grouped[g]) grouped[g] = []
        grouped[g].push(p)
      }
      for (const g of GROUP_ORDER) {
        grouped[g].sort((a, b) => a.name.localeCompare(b.name))
      }

      // Build one linesheet per non-empty group
      const sheets = GROUP_ORDER
        .filter(g => grouped[g].length > 0)
        .map(g => ({
          groupName: g,
          products: grouped[g].map(p => productToLSItem(p, px, cur, settings.usdRate ?? 1))
        }))

      if (sheets.length === 0) { alert('No products in catalogue.'); return }

      // Write directly into bs_ls_v1 so no separate bridge key is needed
      // Strip images from existing data to avoid localStorage quota errors
      // (images are now stored in IndexedDB by linesheet.html)
      const existing = (() => {
        try {
          const r = localStorage.getItem('bs_ls_v1')
          if (!r) return { lineSheets: [] }
          const d = JSON.parse(r)
          return {
            lineSheets: (d.lineSheets || []).map((ls: { logoImage?: unknown; products?: { images?: unknown[] }[] }) => ({
              ...ls, logoImage: null,
              products: (ls.products || []).map((p: { images?: unknown[] }) => ({ ...p, images: [null, null] }))
            }))
          }
        } catch { return { lineSheets: [] } }
      })()
      const today = new Date().toISOString().slice(0, 10)
      const newSheets = sheets.map(sh => {
        // Reuse existing sheet ID if same collection exists — preserves logo
        const existingSheet = existing.lineSheets.find((ls: { collection?: string }) => ls.collection === sh.groupName)
        return {
          id: existingSheet?.id ?? crypto.randomUUID(),
          buyerName: existingSheet?.buyerName ?? '',
          collection: sh.groupName,
          date: today,
          currency: existingSheet?.currency ?? cur,
          footerTerms: 'All prices AUD ex GST unless otherwise stated',
          logoImage: null,
          products: sh.products,
        }
      })
      existing.lineSheets = existing.lineSheets.filter((ls: { collection?: string }) =>
        !sheets.some(sh => sh.groupName === ls.collection)
      )
      existing.lineSheets.push(...newSheets)
      localStorage.setItem('bs_ls_v1', JSON.stringify(existing))
      window.open(`/linesheet.html?v=${Date.now()}`, '_blank')
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  function buildCategorySheet(category: string) {
    try {
      const px = settings.metalPrices ?? DEFAULT_METAL_PRICES
      const cur = lsPickerCurrency
      const items = products
        .filter(p => p.category === category)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(p => productToLSItem(p, px, cur, settings.usdRate ?? 1))
      if (items.length === 0) { alert('No products in this category.'); return }
      const existing = (() => {
        try {
          const r = localStorage.getItem('bs_ls_v1')
          if (!r) return { lineSheets: [] }
          const d = JSON.parse(r)
          return {
            lineSheets: (d.lineSheets || []).map((ls: { logoImage?: unknown; products?: { images?: unknown[] }[] }) => ({
              ...ls, logoImage: null,
              products: (ls.products || []).map((p: { images?: unknown[] }) => ({ ...p, images: [null, null] }))
            }))
          }
        } catch { return { lineSheets: [] } }
      })()
      const label = CATEGORY_LABELS[category as ProductCategory] ?? category
      // Reuse existing sheet ID if same collection exists — preserves logo
      const existingSheet = existing.lineSheets.find((ls: { collection?: string }) => ls.collection === label)
      existing.lineSheets = existing.lineSheets.filter((ls: { collection?: string }) => ls.collection !== label)
      existing.lineSheets.push({
        id: existingSheet?.id ?? crypto.randomUUID(),
        buyerName: existingSheet?.buyerName ?? '',
        collection: label,
        date: new Date().toISOString().slice(0, 10),
        currency: existingSheet?.currency ?? cur,
        footerTerms: 'All prices AUD ex GST unless otherwise stated',
        logoImage: null,
        products: items,
      })
      localStorage.setItem('bs_ls_v1', JSON.stringify(existing))
      window.open(`/linesheet.html?v=${Date.now()}`, '_blank')
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const cats = Array.from(new Set(products.map(p => p.category)))
  const prices = settings.metalPrices

  return (
    <>
      <div className="scroll-content pt-2">
        <div className="px-4 mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Products</h1>
            <p className="text-xs text-ios-secondary mt-0.5">{products.length} item{products.length !== 1 ? 's' : ''} in catalogue</p>
          </div>
          <div className="flex items-center gap-2">
            {!selectMode && products.length > 0 && (
              <button
                className="press-feedback rounded-ios-sm px-3 py-2 text-xs font-bold bg-black text-white flex items-center gap-1"
                onClick={buildAllSheets}
                title="Create one line sheet per group from entire catalogue"
              >
                <Layers size={13} /> Build All
              </button>
            )}
            {!selectMode && <ImportButton onImport={onSaveProducts} existing={products} />}
            {selectMode && (
              <button
                className="press-feedback rounded-ios-sm px-3 py-2 text-xs font-bold bg-ios-bg text-ios-blue border border-ios-separator"
                onClick={() => {
                  if (selectedIds.size === products.length) setSelectedIds(new Set())
                  else setSelectedIds(new Set(products.map(p => p.id)))
                }}
              >
                {selectedIds.size === products.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
            {products.length > 0 && (
              <button
                className={`press-feedback rounded-ios-sm px-3 py-2 text-xs font-bold flex items-center gap-1 ${selectMode ? 'bg-ios-bg text-ios-secondary border border-ios-separator' : 'bg-ios-bg text-ios-blue border border-ios-separator'}`}
                onClick={() => { setSelectMode(v => !v); setSelectedIds(new Set()) }}
              >
                {selectMode ? 'Cancel' : 'Select'}
              </button>
            )}
            {!selectMode && (
              <button className="press-feedback btn-gold rounded-ios-sm px-3 py-2 text-xs font-bold flex items-center gap-1" onClick={handleNew}>
                <Plus size={13} /> Add
              </button>
            )}
          </div>
        </div>

        {/* Search bar */}
        {products.length > 0 && (
          <>
            <div className="px-4 mb-2">
              <div className="ios-card flex items-center gap-2 px-3 py-2">
                <Search size={15} className="text-ios-secondary shrink-0" />
                <input
                  className="ios-input text-sm"
                  placeholder="Search name or SKU…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && <button onClick={() => setSearch('')} className="text-ios-secondary press-feedback"><X size={14} /></button>}
              </div>
            </div>

            {/* Category filter chips */}
            {cats.length > 1 && (
              <div className="px-4 mb-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                <button
                  className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold press-feedback ${filterCat === 'all' ? 'bg-black text-white' : 'bg-white text-ios-secondary border border-ios-separator'}`}
                  onClick={() => setFilterCat('all')}
                >All</button>
                {cats.map(c => (
                  <button
                    key={c}
                    className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold press-feedback ${filterCat === c ? 'bg-black text-white' : 'bg-white text-ios-secondary border border-ios-separator'}`}
                    onClick={() => setFilterCat(c as ProductCategory)}
                  >
                    {CATEGORY_EMOJI[c as ProductCategory]} {c.charAt(0).toUpperCase() + c.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {filtered.length === 0 && products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-ios-secondary px-8 text-center">
            <Package size={40} className="mb-3 opacity-30" />
            <p className="text-sm font-semibold">No products yet</p>
            <p className="text-xs mt-1 leading-relaxed">Add your rings, earrings and other pieces to build a priceable catalogue</p>
            <button className="mt-5 btn-gold rounded-ios px-5 py-2.5 text-sm font-bold press-feedback" onClick={handleNew}>
              Add First Product
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-ios-secondary text-sm">No results for "{search}"</div>
        ) : (
          Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} className="mb-4">
              <div className="px-4 mb-1 flex items-center justify-between">
                <span className="field-label">{CATEGORY_LABELS[cat as ProductCategory]}</span>
                {!selectMode && (
                  <button
                    className="text-[11px] font-semibold text-ios-blue press-feedback"
                    onClick={() => buildCategorySheet(cat)}
                    title={`Build line sheet from ${CATEGORY_LABELS[cat as ProductCategory] ?? cat}`}
                  >
                    Build Sheet ›
                  </button>
                )}
              </div>
              <div className="ios-card mx-4">
                {items.map((p, idx) => {
                  const metalCost = calcMetalCost(p.metalLines, prices)
                  const stoneRetail = p.stoneLines.reduce((s, l) => s + calcStoneRetail(l), 0)
                  const baseCost = metalCost + p.labour + p.packaging
                  const approxRetail = baseCost / 0.30 + stoneRetail

                  const isSelected = selectedIds.has(p.id)
                  return (
                    <div key={p.id} className={`relative overflow-hidden ${idx < items.length - 1 ? 'row-sep' : ''}`}>
                      {/* Swipe actions (hidden in select mode) */}
                      {!selectMode && (
                        <div
                          className="absolute right-0 top-0 bottom-0 flex items-stretch"
                          style={{ opacity: swipedId === p.id ? 1 : 0, transition: 'opacity 0.2s', pointerEvents: swipedId === p.id ? 'auto' : 'none' }}
                        >
                          <button className="bg-ios-blue px-4 text-white flex items-center" onClick={() => handleEdit(p)}>
                            <Edit3 size={16} />
                          </button>
                          <button className="bg-ios-red px-4 text-white flex items-center" onClick={() => handleDelete(p.id)}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}

                      <button
                        className={`ios-row w-full text-left press-feedback ${isSelected ? 'bg-blue-50' : ''}`}
                        onClick={() => selectMode ? toggleSelect(p.id) : (setPriceViewProduct(p), setSwipedId(null))}
                        onContextMenu={e => { if (!selectMode) { e.preventDefault(); setSwipedId(swipedId === p.id ? null : p.id) } }}
                      >
                        {selectMode && (
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mr-1 ${isSelected ? 'bg-ios-blue border-ios-blue' : 'border-ios-separator bg-white'}`}>
                            {isSelected && <span className="text-white text-[10px] font-bold">✓</span>}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm truncate">{p.name}</span>
                            {p.sku && (
                              <span className="text-[10px] font-mono bg-ios-bg px-1.5 py-0.5 rounded text-ios-secondary shrink-0">{p.sku}</span>
                            )}
                          </div>
                          <div className="text-xs text-ios-secondary mt-0.5 flex items-center gap-2">
                            {p.metalLines.length > 0 && <span>{p.metalLines.map(l => `${l.grams}g ${l.metalType}`).join(', ')}</span>}
                            {p.stoneLines.length > 0 && <span>· {p.stoneLines.length} stone{p.stoneLines.length > 1 ? 's' : ''}</span>}
                          </div>
                        </div>
                        <div className="text-right shrink-0 ml-3">
                          {approxRetail > 0 && (
                            <>
                              <div className="text-xs text-ios-secondary">~retail</div>
                              <div className="text-sm font-bold price-display">{formatPrice(approxRetail, 'AUD')}</div>
                            </>
                          )}
                          {!selectMode && <ArrowRight size={14} className="text-ios-separator ml-auto mt-1" />}
                        </div>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
        <p className="text-xs text-ios-secondary text-center mt-2 mb-4">
          {selectMode ? 'Tap products to select' : 'Tap to load into quote · Long-press to edit/delete'}
        </p>
      </div>

      {/* Sticky select bar */}
      {selectMode && (
        <div className="fixed bottom-16 left-0 right-0 z-50 px-4 pb-2">
          <div className="ios-card flex items-center gap-3 px-4 py-3 shadow-lg">
            <span className="text-sm font-semibold flex-1">
              {selectedIds.size === 0 ? 'Select products' : `${selectedIds.size} selected`}
            </span>
            {selectedIds.size > 0 && (
              <button
                className="btn-gold rounded-ios-sm px-4 py-2 text-xs font-bold press-feedback flex items-center gap-1.5"
                onClick={openLSPicker}
              >
                <Layers size={13} /> Add to Line Sheet
              </button>
            )}
          </div>
        </div>
      )}

      {/* Line sheet picker sheet */}
      <Sheet open={showLSPicker} onClose={() => setShowLSPicker(false)} title="Add to Line Sheet">
        <div className="px-5 pb-6">
          <div className="mb-4 flex items-center justify-between">
            <span className="field-label">Currency</span>
            <div className="seg-control">
              {['AUD','USD','GBP','EUR'].map(c => (
                <button key={c} className={`seg-option ${lsPickerCurrency === c ? 'active' : ''}`} onClick={() => setLSPickerCurrency(c)}>{c}</button>
              ))}
            </div>
          </div>
          <div className="mb-2">
            <span className="field-label block mb-2">{selectedIds.size} product{selectedIds.size !== 1 ? 's' : ''} → Line Sheet</span>
            <div className="ios-card overflow-hidden">
              <button
                className="ios-row w-full text-left press-feedback"
                onClick={() => handleBatchToLineSheet('new')}
              >
                <div className="w-8 h-8 rounded-ios-xs bg-black flex items-center justify-center shrink-0">
                  <Plus size={15} className="text-white" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">New Line Sheet</div>
                  <div className="text-xs text-ios-secondary">Create a fresh line sheet with these products</div>
                </div>
                <ChevronRight size={16} className="text-ios-separator" />
              </button>
              {lsPickerSheets.map((ls, i) => (
                <div key={ls.id} className={i > 0 || lsPickerSheets.length > 0 ? 'row-sep' : ''}>
                  <button
                    className="ios-row w-full text-left press-feedback"
                    onClick={() => handleBatchToLineSheet(ls.id)}
                  >
                    <div className="w-8 h-8 rounded-ios-xs bg-ios-bg border border-ios-separator/60 flex items-center justify-center shrink-0">
                      <FileText size={15} className="text-ios-secondary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{ls.label}</div>
                      <div className="text-xs text-ios-secondary">Add to this line sheet</div>
                    </div>
                    <ChevronRight size={16} className="text-ios-separator" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <p className="text-xs text-ios-secondary mt-3">A stock CSV will also download automatically.</p>
        </div>
      </Sheet>

      <ProductEditSheet
        product={editProduct}
        open={showEdit}
        onClose={() => setShowEdit(false)}
        onSave={handleSave}
        settings={settings}
      />

      <PriceViewSheet
        product={priceViewProduct}
        open={!!priceViewProduct}
        onClose={() => setPriceViewProduct(null)}
        onLoadToQuote={onLoadToQuote}
        onAddToQuote={onAddToQuote}
        settings={settings}
      />
    </>
  )
}

// ─── Settings tab ─────────────────────────────────────────────────────────────

function SettingsTab({ settings, onChange }: {
  settings: AppSettings
  onChange: (s: AppSettings) => void
}) {
  const [refreshing, setRefreshing] = useState(false)
  const [sheetUrl, setSheetUrl] = useState(settings.googleSheetUrl || DEFAULT_SETTINGS.googleSheetUrl)
  const [copied, setCopied] = useState(false)

  function copyShareLink() {
    const p = settings.metalPrices
    const params = new URLSearchParams({
      STG: p.STG.toString(),
      '9YG': p['9YG'].toString(),
      '9WG': p['9WG'].toString(),
      '18YG': p['18YG'].toString(),
      '18WG': p['18WG'].toString(),
      PLT: p.PLT.toString(),
      usd: settings.usdRate.toString(),
    })
    const url = `${window.location.origin}/?prices=${btoa(params.toString())}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  async function fetchFromSheet() {
    if (!settings.googleSheetUrl) return
    setRefreshing(true)
    try {
      const res = await fetch(settings.googleSheetUrl)
      const text = await res.text()
      const rows = text.split('\n').map(r => r.split(',').map(c => c.trim().replace(/"/g, '')))
      const priceMap: Partial<AppSettings['metalPrices']> = {}
      for (const row of rows) {
        const [metal, price] = row
        const k = metal?.toUpperCase() as MetalType
        if (k && DEFAULT_METAL_PRICES[k] !== undefined) {
          const p = parseFloat(price)
          if (!isNaN(p)) priceMap[k] = p
        }
      }
      const now = new Date().toISOString()
      onChange({
        ...settings,
        metalPrices: { ...settings.metalPrices, ...priceMap },
        lastFetched: now,
        metalPricesUpdatedAt: now,
      })
    } catch (e) {
      alert('Could not fetch prices. Check the sheet URL.')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="scroll-content pt-2">
      <div className="px-4 mb-3">
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      {/* Metal Prices */}
      <div className="px-4 mb-1 flex items-baseline gap-2">
        <span className="field-label">Metal Prices (AUD per gram)</span>
        {settings.metalPricesUpdatedAt && (
          <span className="text-[11px] text-ios-secondary">
            Updated {new Date(settings.metalPricesUpdatedAt).toLocaleString('en-AU', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </span>
        )}
      </div>
      <div className="ios-card mx-4 mb-3">
        {(Object.keys(DEFAULT_METAL_PRICES) as MetalType[]).map((metal, idx, arr) => (
          <div key={metal} className={`ios-row ${idx < arr.length - 1 ? 'row-sep' : ''}`}>
            <div className="flex-1">
              <div className="font-semibold text-sm">{metal}</div>
              <div className="text-xs text-ios-secondary">{METAL_LABELS[metal]}</div>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-ios-secondary">$</span>
              <NumInput
                value={settings.metalPrices[metal]}
                onChange={v => onChange({
                  ...settings,
                  metalPrices: { ...settings.metalPrices, [metal]: v },
                  metalPricesUpdatedAt: new Date().toISOString(),
                })}
                step="0.01"
              />
              <span className="text-xs text-ios-secondary">/g</span>
            </div>
          </div>
        ))}
      </div>

      {/* Google Sheet integration */}
      <div className="px-4 mb-1">
        <span className="field-label">Live Metal Prices (Google Sheet CSV)</span>
      </div>
      <div className="ios-card mx-4 mb-3">
        <div className="px-4 py-3">
          <p className="text-xs text-ios-secondary mb-2">
            Publish your Google Sheet as CSV and paste the URL. Sheet must have metal code in column A, price in column B.
          </p>
          <input
            className="ios-input text-sm border border-ios-separator rounded-ios-xs px-3 py-2 mb-2"
            placeholder="https://docs.google.com/spreadsheets/..."
            value={sheetUrl}
            onChange={e => setSheetUrl(e.target.value)}
            onBlur={() => onChange({ ...settings, googleSheetUrl: sheetUrl })}
          />
          <button
            className="flex items-center gap-2 text-ios-blue text-sm font-semibold press-feedback"
            onClick={fetchFromSheet}
            disabled={!settings.googleSheetUrl && !sheetUrl}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Fetch Prices
          </button>
          {settings.lastFetched && (
            <p className="text-xs text-ios-secondary mt-2">
              Last fetched: {new Date(settings.lastFetched).toLocaleString('en-AU')}
            </p>
          )}
        </div>
      </div>

      {/* Currency */}
      <div className="px-4 mb-1">
        <span className="field-label">Currency</span>
      </div>
      <div className="ios-card mx-4 mb-3">
        <div className="ios-row">
          <span className="text-sm font-medium flex-1">AUD → USD Rate</span>
          <NumInput
            value={settings.usdRate}
            onChange={v => onChange({ ...settings, usdRate: v })}
            step="0.001"
          />
        </div>
      </div>

      {/* Stone GP targets — now editable */}
      <div className="px-4 mb-1">
        <span className="field-label">Stone GP Targets</span>
      </div>
      <div className="ios-card mx-4 mb-3">
        {(Object.keys(settings.stoneGP ?? STONE_GP) as StoneType[]).map((st, idx, arr) => {
          const currentPct = Math.round((settings.stoneGP?.[st] ?? STONE_GP[st]) * 100)
          return (
            <div key={st} className={`ios-row ${idx < arr.length - 1 ? 'row-sep' : ''}`}>
              <span className="text-sm font-medium flex-1">{STONE_LABELS_CLIENT[st]}</span>
              <div className="flex items-center gap-1">
                <NumInput
                  value={currentPct}
                  onChange={v => onChange({
                    ...settings,
                    stoneGP: { ...(settings.stoneGP ?? STONE_GP), [st]: v / 100 },
                  })}
                  step="1"
                />
                <span className="text-xs text-ios-secondary">% GP</span>
              </div>
              <span className="text-xs text-ios-secondary w-10 text-right">
                ÷ {(1 - (settings.stoneGP?.[st] ?? STONE_GP[st])).toFixed(2)}
              </span>
            </div>
          )
        })}
      </div>

      {/* Wax multipliers */}
      <div className="px-4 mb-1">
        <span className="field-label">Wax-to-Cast Multipliers</span>
      </div>
      <div className="ios-card mx-4 mb-6">
        {(Object.entries(settings.waxMultipliers ?? DEFAULT_WAX_MULTIPLIERS) as [keyof typeof DEFAULT_WAX_MULTIPLIERS, number][]).map(([key, val], idx, arr) => (
          <div key={key} className={`ios-row ${idx < arr.length - 1 ? 'row-sep' : ''}`}>
            <span className="text-sm font-medium flex-1">
              {key === '9YG' ? '9YG / 9WG' : key === '18YG' ? '18YG / 18WG' : key}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-xs text-ios-secondary">wax ×</span>
              <NumInput
                value={val}
                onChange={v => onChange({
                  ...settings,
                  waxMultipliers: { ...(settings.waxMultipliers ?? DEFAULT_WAX_MULTIPLIERS), [key]: v },
                })}
                step="0.01"
              />
            </div>
          </div>
        ))}
        <div className="px-4 pb-3 pt-1">
          <p className="text-xs text-ios-secondary">✱ PLT value is density-derived — treat as estimate</p>
        </div>
      </div>

      {/* Sync to other device */}
      <div className="px-4 mb-1">
        <span className="field-label">Sync to Another Device</span>
      </div>
      <div className="ios-card mx-4 mb-8 px-4 py-4">
        <p className="text-xs text-ios-secondary mb-3 leading-relaxed">
          Copy a link with your current metal prices and USD rate. Open it on your phone (or any device) to apply the same settings instantly.
        </p>
        <button
          className="w-full press-feedback rounded-ios py-3 text-sm font-bold flex items-center justify-center gap-2"
          style={{ background: copied ? 'var(--ios-green)' : 'black', color: 'white', transition: 'background 0.3s' }}
          onClick={copyShareLink}
        >
          {copied ? <><CheckCircle size={15} /> Copied!</> : <><Copy size={15} /> Copy prices link</>}
        </button>
        <p className="text-[11px] text-ios-secondary mt-2 text-center">
          Paste the link in Safari on your other device
        </p>
      </div>
    </div>
  )
}

// ─── Loose Stones tab ─────────────────────────────────────────────────────────

const STONE_CUSTOM = 'custom' as const
type StoneTypeOrCustom = StoneType | typeof STONE_CUSTOM

const STONE_TYPE_OPTIONS: { value: StoneTypeOrCustom; label: string }[] = [
  { value: 'sapphire',    label: 'Sapphire' },
  { value: 'lab-diamond', label: 'Lab Diamond' },
  { value: 'natural',     label: 'Natural Diamond' },
  { value: 'custom',      label: 'Custom GP%' },
]

interface BradleyGem {
  code: string
  description: string
  colour: string
  cut: string
  carats: number
  wholesale: number
  retail: number
  source: string
}

const COLOUR_DOT: Record<string, string> = {
  Blue: '#4a90d9',
  Green: '#4caf7d',
  Teal: '#2bafb0',
  Parti: '#b08a45',
}

function StonesTab({ settings, onAddToQuote }: {
  settings: AppSettings
  onAddToQuote: (stone: StoneLine) => void
}) {
  const [stoneType, setStoneType] = useState<StoneTypeOrCustom>('sapphire')
  const [customGPPct, setCustomGPPct] = useState(70)
  const [wholesale, setWholesale] = useState(0)
  const [carats, setCarats] = useState(0)
  const [desc, setDesc] = useState('')

  // Bradley Gems lookup state
  const [gems, setGems] = useState<BradleyGem[]>([])
  const [gemSearch, setGemSearch] = useState('')
  const [selectedGem, setSelectedGem] = useState<BradleyGem | null>(null)

  // Load Bradley Gems catalogue
  useEffect(() => {
    fetch('/bradley-gems.json')
      .then(r => r.json())
      .then(setGems)
      .catch(() => {})
  }, [])

  const filteredGems = gemSearch.trim()
    ? gems.filter(g =>
        g.code.toLowerCase().includes(gemSearch.toLowerCase()) ||
        g.description.toLowerCase().includes(gemSearch.toLowerCase()) ||
        g.colour.toLowerCase().includes(gemSearch.toLowerCase()) ||
        g.cut.toLowerCase().includes(gemSearch.toLowerCase())
      )
    : gems

  function selectGem(gem: BradleyGem) {
    setSelectedGem(gem)
    setWholesale(gem.wholesale)
    setCarats(gem.carats)
    setDesc(`${gem.code} · ${gem.description} · ${gem.carats}ct`)
    setStoneType('sapphire')
    setGemSearch(gem.code)
  }

  const gpMap = settings.stoneGP ?? STONE_GP
  const gp = stoneType === 'custom' ? customGPPct / 100 : gpMap[stoneType]
  const gpPct = stoneType === 'custom' ? customGPPct : Math.round(gp * 100)

  const retail = wholesale > 0 ? wholesale / (1 - gp) : 0
  const retailGST = retail * 1.1
  const perCt = carats > 0 && wholesale > 0 ? wholesale / carats : 0
  const retailPerCt = carats > 0 && retail > 0 ? retail / carats : 0

  const fmt = (n: number) => formatPrice(n, 'AUD')
  const hasResult = wholesale > 0

  function handleAdd() {
    if (wholesale <= 0 || stoneType === 'custom') return
    onAddToQuote({
      id: crypto.randomUUID(),
      stoneType: stoneType as StoneType,
      wholesaleCost: wholesale,
    })
  }

  return (
    <div className="scroll-content pt-2">
      <div className="px-4 mb-3">
        <h1 className="text-xl font-bold">Loose Stones</h1>
        <p className="text-xs text-ios-secondary mt-0.5">Wholesale → retail calculator</p>
      </div>

      {/* ── Bradley Gems Lookup ── */}
      <div className="px-4 mb-1">
        <div className="flex items-center justify-between mb-1">
          <span className="field-label">Bradley Gems</span>
          <span className="text-xs text-ios-secondary">{gems.length} stones</span>
        </div>
      </div>
      <div className="ios-card mx-4 mb-3">
        {/* Search input */}
        <div className="ios-row row-sep">
          <Search size={14} className="text-ios-secondary shrink-0 mr-1" />
          <input
            className="ios-input text-sm flex-1"
            placeholder="Code, colour or cut… e.g. S.P.FF or Teal"
            value={gemSearch}
            onChange={e => { setGemSearch(e.target.value); setSelectedGem(null) }}
          />
          {gemSearch && (
            <button
              className="press-feedback text-ios-secondary ml-1 shrink-0"
              onClick={() => { setGemSearch(''); setSelectedGem(null) }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Results list — show all when empty, filtered when searching */}
        {filteredGems.length === 0 ? (
          <div className="px-4 py-3 text-sm text-ios-secondary">No stones match</div>
        ) : (
          <div style={{ maxHeight: gemSearch ? 260 : 200, overflowY: 'auto' }}>
            {filteredGems.map((gem, idx) => (
              <button
                key={gem.code}
                className={`w-full text-left press-feedback ${idx < filteredGems.length - 1 ? 'row-sep' : ''} ${selectedGem?.code === gem.code ? 'bg-ios-bg' : ''}`}
                onClick={() => selectGem(gem)}
              >
                <div className="ios-row py-2">
                  {/* Colour dot */}
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: COLOUR_DOT[gem.colour] ?? '#999' }}
                  />
                  <div className="flex-1 min-w-0 ml-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-ios-blue">{gem.code}</span>
                      {selectedGem?.code === gem.code && (
                        <CheckCircle size={12} className="text-ios-green shrink-0" />
                      )}
                    </div>
                    <div className="text-xs text-ios-secondary truncate">
                      {gem.cut} · {gem.carats}ct
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold price-display">{fmt(gem.wholesale)}</div>
                    <div className="text-xs text-ios-secondary">WS ex GST</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Stone type */}
      <div className="px-4 mb-1"><span className="field-label">Stone type</span></div>
      <div className="ios-card mx-4 mb-3">
        <div className="ios-row">
          <div className="flex-1 relative flex items-center">
            <select
              className="ios-select w-full font-semibold text-sm"
              value={stoneType}
              onChange={e => setStoneType(e.target.value as StoneTypeOrCustom)}
            >
              {STONE_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-0 text-ios-secondary pointer-events-none" />
          </div>
          {stoneType !== 'custom' && (
            <div className="text-sm font-semibold shrink-0" style={{ color: 'var(--gold)' }}>
              {gpPct}% GP
            </div>
          )}
          {stoneType === 'custom' && (
            <div className="flex items-center gap-1 shrink-0">
              <NumInput
                value={customGPPct}
                onChange={setCustomGPPct}
                step="1"
              />
              <span className="text-xs text-ios-secondary">% GP</span>
            </div>
          )}
        </div>
      </div>

      {/* Inputs */}
      <div className="px-4 mb-1"><span className="field-label">Stone details</span></div>
      <div className="ios-card mx-4 mb-3">
        <div className="ios-row row-sep">
          <span className="text-sm font-medium flex-1">Wholesale cost</span>
          <div className="flex items-center gap-1">
            <span className="text-xs text-ios-secondary">$</span>
            <NumInput value={wholesale} onChange={setWholesale} placeholder="0.00" />
          </div>
        </div>
        <div className="ios-row row-sep">
          <span className="text-sm font-medium flex-1">Carat weight</span>
          <div className="flex items-center gap-1">
            <NumInput value={carats} onChange={setCarats} placeholder="0.00" step="0.01" />
            <span className="text-xs text-ios-secondary">ct</span>
          </div>
        </div>
        <div className="ios-row">
          <span className="text-sm text-ios-secondary flex-1">Description</span>
          <input
            className="ios-input text-sm text-right flex-1"
            placeholder="e.g. 1.2ct Parti Oval"
            value={desc}
            onChange={e => setDesc(e.target.value)}
          />
        </div>
      </div>

      {/* Results */}
      {hasResult && (
        <div className="ios-card mx-4 mb-3 animate-in">
          <div className="px-4 py-3 border-b border-ios-separator/60">
            <div className="flex items-center gap-2">
              <Gem size={14} className="text-ios-secondary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">Result</span>
              {selectedGem && (
                <span className="ml-auto text-xs font-mono font-semibold text-ios-blue bg-ios-bg px-2 py-0.5 rounded-full">
                  {selectedGem.code}
                </span>
              )}
            </div>
          </div>
          <div className="px-4 py-3 space-y-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span className="text-ios-secondary">Wholesale</span>
              <span className="price-display font-medium">{fmt(wholesale)}</span>
            </div>
            {perCt > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span className="text-ios-secondary">Cost per carat</span>
                <span className="price-display font-medium">{fmt(perCt)}/ct</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span className="text-ios-secondary">GP margin</span>
              <span className="font-semibold" style={{ color: 'var(--gold)' }}>{gpPct}%</span>
            </div>
            <div className="text-sm pt-1 border-t border-ios-separator/60" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-ios-secondary">Divisor</span>
              <span className="price-display font-medium">÷ {(1 - gp).toFixed(2)}</span>
            </div>
          </div>
          <div className="gold-line" />
          <div className="px-4 py-4">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div className="text-xs text-ios-secondary font-medium mb-0.5">Retail (ex GST)</div>
                <div className="text-2xl font-bold price-display tracking-tight">{fmt(retail)}</div>
                <div className="text-xs text-ios-secondary mt-0.5">inc GST {fmt(retailGST)}</div>
              </div>
              {retailPerCt > 0 && (
                <div className="text-right">
                  <div className="text-xs text-ios-secondary mb-0.5">Per carat</div>
                  <div className="text-lg font-bold price-display" style={{ color: 'var(--gold)' }}>
                    {fmt(retailPerCt)}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="px-4 pb-4 flex gap-2">
            <button
              className={`flex-1 py-3 rounded-xl text-sm font-bold press-feedback ${stoneType === 'custom' ? 'bg-ios-separator/30 text-ios-secondary' : 'btn-gold'}`}
              onClick={handleAdd}
              disabled={stoneType === 'custom'}
              title={stoneType === 'custom' ? 'Select a stone type to add to quote' : ''}
            >
              Add to Quote
            </button>
            <button
              className="px-4 py-3 rounded-xl text-sm font-semibold bg-ios-bg text-ios-secondary press-feedback"
              onClick={() => {
                const lines = [
                  desc || STONE_LABELS_CLIENT[stoneType as StoneType] || 'Stone',
                  `Wholesale: ${fmt(wholesale)}`,
                  `GP: ${gpPct}%`,
                  `Retail (ex GST): ${fmt(retail)}`,
                  `Retail (inc GST): ${fmt(retailGST)}`,
                  ...(perCt > 0 ? [`Per carat: ${fmt(perCt)}/ct`] : []),
                ]
                navigator.clipboard.writeText(lines.join('\n'))
              }}
            >
              <Copy size={16} />
            </button>
          </div>
        </div>
      )}

      {/* GP Reference */}
      <div className="px-4 mb-1 mt-2"><span className="field-label">GP Reference</span></div>
      <div className="ios-card mx-4 mb-3">
        {(Object.keys(gpMap) as StoneType[]).map((st, idx, arr) => (
          <div key={st} className={`ios-row ${idx < arr.length - 1 ? 'row-sep' : ''}`}>
            <span className="text-sm flex-1">{STONE_LABELS_CLIENT[st]}</span>
            <span className="text-sm font-semibold" style={{ color: 'var(--gold)' }}>
              {Math.round(gpMap[st] * 100)}% GP
            </span>
            <span className="text-xs text-ios-secondary ml-2">
              ÷ {(1 - gpMap[st]).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Wax Weight tab ───────────────────────────────────────────────────────────

const WAX_METALS_ALL: { code: string; label: string; multKey: '9YG' | '18YG' | 'STG' | 'PLT' }[] = [
  { code: 'STG',  label: 'STG',  multKey: 'STG'  },
  { code: '9YG',  label: '9YG',  multKey: '9YG'  },
  { code: '9WG',  label: '9WG',  multKey: '9YG'  },
  { code: '18YG', label: '18YG', multKey: '18YG' },
  { code: '18WG', label: '18WG', multKey: '18YG' },
  { code: 'PLT',  label: 'PLT ✱', multKey: 'PLT' },
]

const CROSS_FROM_OPTIONS = [
  { value: 'STG',   label: 'STG' },
  { value: '9YG',   label: '9YG / 9WG' },
  { value: '18YG',  label: '18YG / 18WG' },
  { value: 'PLT',   label: 'PLT' },
]

function WaxWeightTab({ settings }: { settings: AppSettings }) {
  const mults = settings.waxMultipliers ?? DEFAULT_WAX_MULTIPLIERS
  const prices = settings.metalPrices

  // Section 1 — wax to cast
  const [waxG, setWaxG] = useState(0)
  const [primaryMetal, setPrimaryMetal] = useState('')

  // Section 2 — cross-metal
  const [cxWeight, setCxWeight] = useState(0)
  const [cxFrom, setCxFrom] = useState('STG')

  // Section 3 — metal cost
  const [mcWeight, setMcWeight] = useState(0)
  const [mcMetal, setMcMetal] = useState<MetalType>('18YG')
  const [mcGP, setMcGP] = useState(70)

  const fmt2 = (n: number) => n.toFixed(2)
  const fmtPrice = (n: number) => formatPrice(n, 'AUD')

  // Cast weights
  const castRows = WAX_METALS_ALL.map(m => ({
    ...m,
    mult: mults[m.multKey],
    cast: waxG > 0 ? waxG * mults[m.multKey] : 0,
    isHighlight: primaryMetal === m.code,
  }))

  // Cross-metal rows
  const crossRatios = CROSS_METAL[cxFrom] ?? {}
  const crossRows = CROSS_FROM_OPTIONS.map(opt => ({
    label: opt.label,
    key: opt.value,
    weight: cxWeight > 0 ? cxWeight * (crossRatios[opt.value] ?? 1) : 0,
    isSource: opt.value === cxFrom,
  }))

  // Metal cost
  const pricePerG = prices[mcMetal] ?? 0
  const mcCost = mcWeight > 0 ? mcWeight * pricePerG : 0
  const mcRetail = mcCost > 0 ? mcCost / (1 - mcGP / 100) : 0
  const mcRetailGST = mcRetail * 1.1

  function copyWaxTable() {
    if (!waxG) return
    const lines = [`Wax weight: ${waxG}g`, '']
    castRows.forEach(r => lines.push(`${r.label}: ${fmt2(r.cast)}g  (× ${r.mult})`))
    navigator.clipboard.writeText(lines.join('\n'))
  }

  return (
    <div className="scroll-content pt-2">
      <div className="px-4 mb-3">
        <h1 className="text-xl font-bold">Wax Weight</h1>
        <p className="text-xs text-ios-secondary mt-0.5">Wax-to-cast · cross-metal · metal cost</p>
      </div>

      {/* ── Section 1: Wax to cast ── */}
      <div className="px-4 mb-1"><span className="field-label">Wax → Cast</span></div>
      <div className="ios-card mx-4 mb-3">
        <div className="ios-row row-sep">
          <span className="text-sm font-medium flex-1">Wax weight</span>
          <div className="flex items-center gap-1">
            <NumInput value={waxG} onChange={setWaxG} placeholder="0.000" step="0.001" />
            <span className="text-xs text-ios-secondary">g</span>
          </div>
        </div>
        <div className="ios-row">
          <span className="text-sm font-medium flex-1">Primary metal</span>
          <div className="relative flex items-center">
            <select
              className="ios-select text-sm pr-4"
              value={primaryMetal}
              onChange={e => setPrimaryMetal(e.target.value)}
            >
              <option value="">All</option>
              {WAX_METALS_ALL.map(m => (
                <option key={m.code} value={m.code}>{m.label.replace(' ✱', '')}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-0 text-ios-secondary pointer-events-none" />
          </div>
        </div>
      </div>

      {waxG > 0 && (
        <div className="animate-in">
          <div className="ios-card mx-4 mb-3 overflow-hidden">
            <table className="w-full" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <thead>
                <tr className="border-b border-ios-separator/60">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-ios-secondary uppercase tracking-wide">Metal</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-ios-secondary uppercase tracking-wide">Mult</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-ios-secondary uppercase tracking-wide">Cast</th>
                </tr>
              </thead>
              <tbody>
                {castRows.map((r, idx) => (
                  <tr
                    key={r.code}
                    className={`${idx < castRows.length - 1 ? 'border-b border-ios-separator/40' : ''} ${r.isHighlight ? 'bg-yellow-50' : ''}`}
                  >
                    <td className={`px-4 py-2.5 text-sm ${r.isHighlight ? 'font-bold' : 'font-medium'}`}>{r.label}</td>
                    <td className="px-4 py-2.5 text-sm text-right text-ios-secondary">× {r.mult}</td>
                    <td className={`px-4 py-2.5 text-sm text-right price-display ${r.isHighlight ? 'font-bold' : ''}`}>{fmt2(r.cast)}g</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mx-4 mb-4">
            <button
              className="w-full press-feedback bg-white rounded-xl py-3 text-sm font-semibold text-ios-secondary shadow-sm flex items-center justify-center gap-2"
              onClick={copyWaxTable}
            >
              <Copy size={14} /> Copy Weight Table
            </button>
          </div>
        </div>
      )}

      {/* ── Section 2: Cross-metal ── */}
      <div className="px-4 mb-1 mt-2"><span className="field-label">Cross-Metal Converter</span></div>
      <div className="px-4 mb-1">
        <p className="text-xs text-ios-secondary">Known cast weight in one metal → equivalent in others</p>
      </div>
      <div className="ios-card mx-4 mb-3">
        <div className="ios-row row-sep">
          <span className="text-sm font-medium flex-1">Known weight</span>
          <div className="flex items-center gap-1">
            <NumInput value={cxWeight} onChange={setCxWeight} placeholder="0.00" />
            <span className="text-xs text-ios-secondary">g</span>
          </div>
        </div>
        <div className="ios-row">
          <span className="text-sm font-medium flex-1">From metal</span>
          <div className="relative flex items-center">
            <select
              className="ios-select text-sm pr-4"
              value={cxFrom}
              onChange={e => setCxFrom(e.target.value)}
            >
              {CROSS_FROM_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-0 text-ios-secondary pointer-events-none" />
          </div>
        </div>
      </div>

      {cxWeight > 0 && (
        <div className="ios-card mx-4 mb-4 overflow-hidden animate-in">
          <table className="w-full" style={{ fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr className="border-b border-ios-separator/60">
                <th className="text-left px-4 py-2 text-xs font-semibold text-ios-secondary uppercase tracking-wide">To Metal</th>
                <th className="text-right px-4 py-2 text-xs font-semibold text-ios-secondary uppercase tracking-wide">Cast Weight</th>
              </tr>
            </thead>
            <tbody>
              {crossRows.map((r, idx) => (
                <tr
                  key={r.key}
                  className={`${idx < crossRows.length - 1 ? 'border-b border-ios-separator/40' : ''} ${r.isSource ? 'bg-yellow-50' : ''}`}
                >
                  <td className={`px-4 py-2.5 text-sm ${r.isSource ? 'font-bold' : 'font-medium'}`}>
                    {r.label}{r.isSource ? ' (source)' : ''}
                  </td>
                  <td className={`px-4 py-2.5 text-sm text-right price-display ${r.isSource ? 'font-bold' : ''}`}>
                    {fmt2(r.weight)}g
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Section 3: Metal cost from weight ── */}
      <div className="px-4 mb-1 mt-2"><span className="field-label">Metal Cost from Weight</span></div>
      <div className="px-4 mb-1">
        <p className="text-xs text-ios-secondary">Raw material cost + retail at your GP%</p>
      </div>
      <div className="ios-card mx-4 mb-3">
        <div className="ios-row row-sep">
          <span className="text-sm font-medium flex-1">Cast weight</span>
          <div className="flex items-center gap-1">
            <NumInput value={mcWeight} onChange={setMcWeight} placeholder="0.00" />
            <span className="text-xs text-ios-secondary">g</span>
          </div>
        </div>
        <div className="ios-row row-sep">
          <span className="text-sm font-medium flex-1">Metal</span>
          <div className="relative flex items-center">
            <select
              className="ios-select text-sm pr-4 font-semibold"
              value={mcMetal}
              onChange={e => setMcMetal(e.target.value as MetalType)}
            >
              {(Object.keys(prices) as MetalType[]).map(m => (
                <option key={m} value={m}>{m} — ${prices[m].toFixed(2)}/g</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-0 text-ios-secondary pointer-events-none" />
          </div>
        </div>
        <div className="ios-row">
          <span className="text-sm font-medium flex-1">GP%</span>
          <div className="flex items-center gap-1">
            <NumInput value={mcGP} onChange={setMcGP} step="1" />
            <span className="text-xs text-ios-secondary">%</span>
          </div>
        </div>
      </div>

      {mcWeight > 0 && mcCost > 0 && (
        <div className="ios-card mx-4 mb-6 animate-in">
          <div className="px-4 py-3 space-y-2">
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <span className="text-ios-secondary">Metal cost ({mcMetal} @ ${pricePerG.toFixed(2)}/g)</span>
              <span className="price-display font-medium">{fmtPrice(mcCost)}</span>
            </div>
            <div className="text-sm pt-1 border-t border-ios-separator/60" style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="text-ios-secondary">Retail at {mcGP}% GP (ex GST)</span>
              <span className="price-display font-semibold">{fmtPrice(mcRetail)}</span>
            </div>
          </div>
          <div className="gold-line" />
          <div className="px-4 py-3 flex justify-between">
            <span className="text-sm text-ios-secondary">inc GST</span>
            <span className="text-lg font-bold price-display" style={{ color: 'var(--gold)' }}>{fmtPrice(mcRetailGST)}</span>
          </div>
        </div>
      )}
    </div>
  )
}


// ─── Root app ─────────────────────────────────────────────────────────────────

type Tab = 'build' | 'stones' | 'wax' | 'products' | 'sheets' | 'settings'

export default function App() {
  const [tab, setTab] = useState<Tab>('build')
  const [quote, setQuote] = useState<Quote>(newQuote)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [products, setProducts] = useState<Product[]>([])
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setQuote(loadActiveQuote())
    setSettings(loadSettings())
    setProducts(loadProducts())
    setHydrated(true)
  }, [])

  // Apply shared prices from URL on first load (only after hydration)
  useEffect(() => {
    if (!hydrated) return
    const param = new URLSearchParams(window.location.search).get('prices')
    if (!param) return
    try {
      const p = new URLSearchParams(atob(param))
      const updated: AppSettings = {
        ...settings,
        usdRate: parseFloat(p.get('usd') || '') || settings.usdRate,
        metalPrices: {
          STG:   parseFloat(p.get('STG')  || '') || settings.metalPrices.STG,
          '9YG': parseFloat(p.get('9YG')  || '') || settings.metalPrices['9YG'],
          '9WG': parseFloat(p.get('9WG')  || '') || settings.metalPrices['9WG'],
          '18YG':parseFloat(p.get('18YG') || '') || settings.metalPrices['18YG'],
          '18WG':parseFloat(p.get('18WG') || '') || settings.metalPrices['18WG'],
          PLT:   parseFloat(p.get('PLT')  || '') || settings.metalPrices.PLT,
        }
      }
      setSettings(updated)
      // Clean up the URL so it doesn't re-apply on refresh
      window.history.replaceState({}, '', '/')
      setTab('settings')
    } catch {}
  }, [hydrated]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!hydrated) return
    saveActiveQuote(quote)
  }, [quote, hydrated])

  useEffect(() => {
    if (!hydrated) return
    saveSettings(settings)
  }, [settings, hydrated])

  useEffect(() => {
    if (!hydrated) return
    saveProducts(products)
  }, [products, hydrated])

  // All hooks declared — safe to return early now
  if (!hydrated) return null

  function handleLoadProductToQuote(p: Product, gp: number = 70) {
    const q = { ...quoteFromProduct(p), retailGP: gp, mode: 'retail' as const }
    setQuote(q)
    setTab('build')
  }

  // Merge product metals + labour into the current quote, preserving existing stones
  function handleAddProductToQuote(p: Product) {
    setQuote(prev => ({
      ...prev,
      name: prev.name === 'New Quote' ? p.name : prev.name,
      metalLines: [
        ...prev.metalLines,
        ...p.metalLines.map(l => ({ ...l, id: crypto.randomUUID() })),
      ],
      labour: (prev.labour || 0) + (p.labour || 0),
      packaging: (prev.packaging || 0) + (p.packaging || 0),
    }))
    setTab('build')
  }

  function handleAddStoneToQuote(stone: StoneLine) {
    setQuote(prev => ({ ...prev, stoneLines: [...prev.stoneLines, stone] }))
    setTab('build')
  }

  function handleNewQuote() {
    const q = newQuote()
    setQuote(q)
    setTab('build')
  }

  return (
    <div className="min-h-screen bg-ios-bg" style={{ maxWidth: 430, margin: '0 auto', position: 'relative' }}>
      {/* Nav bar */}
      <div className="sticky top-0 z-30 bg-ios-bg/90 backdrop-blur-md border-b border-ios-separator/40 px-4 pb-3 flex items-center justify-between" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)' }}>
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-nav.png" alt="Brohn Smith" style={{ height: 28, width: 28, objectFit: 'contain' }} />
          <span className="text-xs font-medium text-ios-secondary uppercase tracking-widest">Pricing</span>
        </div>
        <div className="flex items-center gap-3">
          {tab === 'build' && (<>
            <button
              className="press-feedback text-ios-secondary text-xs font-semibold flex items-center gap-1"
              title="Save as product"
              onClick={() => {
                const p = productFromQuote(quote)
                setProducts(prev => [p, ...prev])
                setTab('products')
              }}
            >
              <Package size={15} /> Save
            </button>
            <button
              className="press-feedback text-ios-blue text-sm font-semibold flex items-center gap-1"
              onClick={handleNewQuote}
            >
              <Plus size={16} /> New
            </button>
          </>)}
          <button
            className="press-feedback text-ios-secondary text-xs font-semibold"
            title="Open second window"
            onClick={() => window.open(window.location.href, '_blank')}
          >⧉</button>
        </div>
      </div>

      {/* Tab content */}
      <div style={{ paddingBottom: 64 }}>
        {tab === 'build' && (
          <QuoteBuilderTab quote={quote} settings={settings} onChange={setQuote} />
        )}
        {tab === 'stones' && (
          <StonesTab settings={settings} onAddToQuote={handleAddStoneToQuote} />
        )}
        {tab === 'wax' && (
          <WaxWeightTab settings={settings} />
        )}
        {tab === 'products' && (
          <ProductsTab
            products={products}
            settings={settings}
            onLoadToQuote={(p, gp) => handleLoadProductToQuote(p, gp)}
            onAddToQuote={handleAddProductToQuote}
            onSaveProducts={setProducts}
          />
        )}
        {tab === 'settings' && (
          <SettingsTab settings={settings} onChange={setSettings} />
        )}
      </div>

      {/* Bottom tab bar */}
      <div className="tab-bar">
        <div className="flex">
          {[
            { id: 'build',    icon: PenLine,      label: 'Sales'    },
            { id: 'stones',   icon: Gem,           label: 'Stones'   },
            { id: 'wax',      icon: Layers,        label: 'Wax'      },
            { id: 'products', icon: Package,       label: 'Products' },
            { id: 'sheets',   icon: LayoutList,    label: 'Sheets'   },
            { id: 'settings', icon: SettingsIcon,  label: 'Settings' },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              className="flex-1 flex flex-col items-center gap-0.5 py-2 press-feedback"
              style={{ color: tab === id ? 'var(--gold)' : 'var(--ios-secondary)' }}
              onClick={() => id === 'sheets' ? window.location.href = '/linesheet.html' : setTab(id as Tab)}
            >
              <Icon size={20} strokeWidth={tab === id ? 2.5 : 1.8} />
              <span className="text-[9px] font-semibold">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
