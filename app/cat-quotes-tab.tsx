'use client'

import { useState, useRef } from 'react'
import { Plus, Trash2, ChevronLeft, Copy, Check, SlidersHorizontal, Package, X, ChevronRight } from 'lucide-react'
import type { Product } from '@/lib/types'
import {
  type CatalogueRates, type CatMetal, type CatProductType,
  type CatProductLine, type CatComponentLine, type CatLineItem, type CatQuote,
  DEFAULT_CAT_RATES,
  getProductWeight, getLinePrice, calcQuoteTotals,
  genCatQuoteText, loadCatRates, saveCatRates, loadCatQuotes,
  saveCatQuotesStore, nextCatQuoteNumber, newCatQuote,
} from '@/lib/catalogue'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAUD(n: number) {
  return '$' + n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const METALS: CatMetal[] = ['STG', '9YG', '18YG']
const METAL_LABEL: Record<CatMetal, string> = { STG: 'Sterling Silver', '9YG': '9ct Gold', '18YG': '18ct Gold' }
const TYPE_LABEL: Record<CatProductType, string> = { standard: 'Standard', charm: 'Charm', chain: 'Chain', earring: 'Earring' }

function productAvailableMetals(p: Product): CatMetal[] {
  return METALS.filter(m => getProductWeight(p, m) > 0)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RatesSheet({ rates, onSave, onClose }: {
  rates: CatalogueRates
  onSave: (r: CatalogueRates) => void
  onClose: () => void
}) {
  const [local, setLocal] = useState<CatalogueRates>({ ...rates })
  const set = (k: keyof CatalogueRates, v: string) =>
    setLocal(r => ({ ...r, [k]: parseFloat(v) || 0 }))

  const rows: { label: string; key: keyof CatalogueRates; suffix?: string }[] = [
    { label: 'Cast STG $/g', key: 'castSTG' },
    { label: 'Cast 9YG $/g', key: 'cast9YG' },
    { label: 'Cast 18YG $/g', key: 'cast18YG' },
    { label: 'Earring handmade $/g', key: 'earringRate' },
    { label: 'Margin', key: 'margin', suffix: '%' },
    { label: 'Chain margin', key: 'chainMargin', suffix: '%' },
    { label: 'Charm add-on STG $/pc', key: 'charmAddonSTG' },
    { label: 'Charm add-on 9YG $/pc', key: 'charmAddon9YG' },
    { label: 'Charm add-on 18YG $/pc', key: 'charmAddon18YG' },
  ]

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet-panel">
        <div className="sheet-handle" />
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <h2 className="font-bold text-base">Catalogue Rates</h2>
          <button className="press-feedback text-ios-blue font-semibold text-sm" onClick={() => { onSave(local); onClose() }}>Save</button>
        </div>
        <div className="ios-card mx-4 mb-3">
          {rows.map(({ label, key, suffix }) => (
            <div key={key} className="ios-row row-sep">
              <span className="text-sm flex-1">{label}</span>
              <div className="flex items-center gap-1">
                {!suffix && <span className="text-ios-secondary text-sm">$</span>}
                <input
                  className="ios-input text-right w-24"
                  type="number"
                  step="0.01"
                  value={suffix ? (local[key] as number) * 100 : local[key] as number}
                  onChange={e => set(key, suffix ? String(parseFloat(e.target.value) / 100) : e.target.value)}
                />
                {suffix && <span className="text-ios-secondary text-sm">%</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="px-4">
          <button className="w-full text-sm text-ios-secondary text-center py-2 press-feedback"
            onClick={() => setLocal({ ...DEFAULT_CAT_RATES })}>
            Reset to defaults
          </button>
        </div>
      </div>
    </>
  )
}

function ProductPickerSheet({ products, onAdd, onClose }: {
  products: Product[]
  onAdd: (line: CatProductLine) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Product | null>(null)
  const [metal, setMetal] = useState<CatMetal>('STG')
  const [ptype, setPtype] = useState<CatProductType>('standard')

  const filtered = products.filter(p => {
    if (!search) return true
    return p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || '').toLowerCase().includes(search.toLowerCase())
  })

  function handleSelect(p: Product) {
    setSelected(p)
    const available = productAvailableMetals(p)
    if (available.length) setMetal(available[0])
    setPtype(p.catalogueType ?? 'standard')
  }

  function handleAdd() {
    if (!selected) return
    onAdd({
      type: 'product',
      id: crypto.randomUUID(),
      productId: selected.id,
      productName: selected.name,
      productType: ptype,
      metal,
      qty: 1,
    })
  }

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} />
      <div className="sheet-panel" style={{ maxHeight: '90vh' }}>
        <div className="sheet-handle" />
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <h2 className="font-bold text-base">{selected ? selected.name : 'Add Product'}</h2>
          <button className="press-feedback text-ios-blue font-semibold text-sm" onClick={onClose}>Cancel</button>
        </div>

        {!selected ? (
          <>
            <div className="px-4 mb-3">
              <input
                className="ios-input w-full px-3"
                placeholder="Search products…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
            </div>
            {filtered.length === 0 ? (
              <p className="text-sm text-ios-secondary text-center py-8">No products found</p>
            ) : (
              <div className="overflow-y-auto" style={{ maxHeight: 'calc(90vh - 120px)' }}>
                <div className="ios-card mx-4 mb-4">
                  {filtered.map((p, i) => {
                    const avail = productAvailableMetals(p)
                    return (
                      <button
                        key={p.id}
                        className={`ios-row press-feedback w-full text-left ${i < filtered.length - 1 ? 'row-sep' : ''}`}
                        onClick={() => handleSelect(p)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{p.name}</div>
                          {p.sku && <div className="text-xs text-ios-secondary">{p.sku}</div>}
                        </div>
                        <div className="flex gap-1 ml-2">
                          {avail.length === 0
                            ? <span className="text-xs text-ios-red bg-ios-red/10 rounded px-1.5 py-0.5">No weights</span>
                            : avail.map(m => (
                              <span key={m} className="text-xs text-ios-secondary bg-ios-secondary/10 rounded px-1.5 py-0.5">{m}</span>
                            ))
                          }
                        </div>
                        <ChevronRight size={14} className="text-ios-separator ml-2 shrink-0" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="px-4 space-y-3 pb-6">
            <button className="flex items-center gap-1 text-ios-blue text-sm press-feedback mb-1" onClick={() => setSelected(null)}>
              <ChevronLeft size={16} /> All products
            </button>

            {/* Metal selector */}
            <div>
              <div className="field-label mb-1">Metal</div>
              <div className="ios-card">
                {METALS.map((m, i) => {
                  const w = getProductWeight(selected, m)
                  const avail = w > 0
                  return (
                    <button
                      key={m}
                      disabled={!avail}
                      onClick={() => avail && setMetal(m)}
                      className={`ios-row press-feedback w-full text-left ${i < 2 ? 'row-sep' : ''}`}
                      style={{ opacity: avail ? 1 : 0.35 }}
                    >
                      <div className="flex-1">
                        <div className="text-sm">{METAL_LABEL[m]}</div>
                        {avail
                          ? <div className="text-xs text-ios-secondary">{w.toFixed(3)}g</div>
                          : <div className="text-xs text-ios-red">No weight set</div>
                        }
                      </div>
                      {metal === m && avail && <Check size={16} className="text-ios-blue" />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Product type selector */}
            <div>
              <div className="field-label mb-1">Pricing type</div>
              <div className="ios-card">
                {(['standard', 'charm', 'chain', 'earring'] as CatProductType[]).map((t, i) => (
                  <button
                    key={t}
                    onClick={() => setPtype(t)}
                    className={`ios-row press-feedback w-full text-left ${i < 3 ? 'row-sep' : ''}`}
                  >
                    <span className="text-sm flex-1">{TYPE_LABEL[t]}</span>
                    {ptype === t && <Check size={16} className="text-ios-blue" />}
                  </button>
                ))}
              </div>
            </div>

            <button
              className="w-full btn-gold rounded-ios py-3.5 text-sm font-bold press-feedback"
              onClick={handleAdd}
            >
              Add to Quote
            </button>
          </div>
        )}
      </div>
    </>
  )
}

// ─── Main tab ─────────────────────────────────────────────────────────────────

export default function CatalogueQuotesTab({ products }: { products: Product[] }) {
  const [rates, setRates] = useState<CatalogueRates>(() =>
    typeof window !== 'undefined' ? loadCatRates() : { ...DEFAULT_CAT_RATES }
  )
  const [quotes, setQuotes] = useState<CatQuote[]>(() =>
    typeof window !== 'undefined' ? loadCatQuotes() : []
  )
  const [active, setActive] = useState<CatQuote | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [showRates, setShowRates] = useState(false)
  const [addingComp, setAddingComp] = useState(false)
  const [compDraft, setCompDraft] = useState({ name: '', rawCost: '', qty: '1', labour: '', packaging: '', useChainMargin: false })
  const [copied, setCopied] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  function persistQuotes(next: CatQuote[]) {
    saveCatQuotesStore(next)
    setQuotes(next)
  }

  function saveActive(q: CatQuote) {
    const updated = { ...q, updatedAt: new Date().toISOString() }
    const exists = quotes.find(x => x.id === updated.id)
    const next = exists
      ? quotes.map(x => x.id === updated.id ? updated : x)
      : [updated, ...quotes]
    persistQuotes(next)
    setActive(updated)
  }

  function handleNew() {
    setActive(newCatQuote(nextCatQuoteNumber()))
  }

  function updateActive(patch: Partial<CatQuote>) {
    if (!active) return
    setActive({ ...active, ...patch })
  }

  function addLine(line: CatLineItem) {
    if (!active) return
    setActive({ ...active, lineItems: [...active.lineItems, line] })
  }

  function updateLine(id: string, patch: Partial<CatLineItem>) {
    if (!active) return
    setActive({
      ...active,
      lineItems: active.lineItems.map(l => l.id === id ? { ...l, ...patch } as CatLineItem : l),
    })
  }

  function removeLine(id: string) {
    if (!active) return
    setActive({ ...active, lineItems: active.lineItems.filter(l => l.id !== id) })
  }

  function handleAddComponent() {
    const raw = parseFloat(compDraft.rawCost) || 0
    if (!compDraft.name || raw <= 0) return
    addLine({
      type: 'component',
      id: crypto.randomUUID(),
      name: compDraft.name,
      rawCost: raw,
      qty: parseInt(compDraft.qty) || 1,
      labour: parseFloat(compDraft.labour) || 0,
      packaging: parseFloat(compDraft.packaging) || 0,
      useChainMargin: compDraft.useChainMargin,
    })
    setCompDraft({ name: '', rawCost: '', qty: '1', labour: '', packaging: '', useChainMargin: false })
    setAddingComp(false)
  }

  async function handleCopyText() {
    if (!active) return
    const text = genCatQuoteText(active, products, rates)
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── List view ────────────────────────────────────────────────────────────────
  if (!active) {
    return (
      <div>
        <div className="px-4 pt-4 pb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-ios-secondary">Saved Quotes</span>
          <button
            className="press-feedback text-ios-secondary"
            onClick={() => setShowRates(true)}
            title="Edit rates"
          >
            <SlidersHorizontal size={16} />
          </button>
        </div>

        {quotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Package size={40} className="text-ios-secondary opacity-30" />
            <p className="text-sm text-ios-secondary">No quotes yet</p>
          </div>
        ) : (
          <div className="ios-card mx-4 mb-4">
            {quotes.map((q, i) => {
              const t = calcQuoteTotals(q, products, rates)
              return (
                <div
                  key={q.id}
                  className={`ios-row press-feedback ${i < quotes.length - 1 ? 'row-sep' : ''}`}
                  onClick={() => setActive(q)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">#{q.number}</div>
                    <div className="text-xs text-ios-secondary mt-0.5 truncate">
                      {q.customer || 'No customer'} · {new Date(q.date).toLocaleDateString('en-AU')}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {t.totalInc > 0 && (
                      <span className="text-sm font-semibold">{fmtAUD(t.totalInc)}</span>
                    )}
                    <button
                      className="text-ios-red press-feedback"
                      onClick={e => { e.stopPropagation(); setDeleteId(q.id) }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        <div className="px-4">
          <button className="w-full btn-gold rounded-ios py-3.5 text-sm font-bold press-feedback" onClick={handleNew}>
            + New Quote
          </button>
        </div>

        {/* Delete confirm */}
        {deleteId && (
          <>
            <div className="sheet-overlay" onClick={() => setDeleteId(null)} />
            <div className="sheet-panel">
              <div className="sheet-handle" />
              <div className="px-5 pt-4 pb-6 text-center">
                <p className="font-bold text-base mb-1">Delete quote?</p>
                <p className="text-sm text-ios-secondary mb-5">This cannot be undone.</p>
                <button
                  className="w-full py-3 text-sm font-bold text-white bg-ios-red rounded-ios mb-2 press-feedback"
                  onClick={() => { persistQuotes(quotes.filter(q => q.id !== deleteId)); setDeleteId(null) }}
                >Delete</button>
                <button className="w-full py-3 text-sm text-ios-blue press-feedback" onClick={() => setDeleteId(null)}>Cancel</button>
              </div>
            </div>
          </>
        )}

        {showRates && (
          <RatesSheet
            rates={rates}
            onSave={r => { saveCatRates(r); setRates(r) }}
            onClose={() => setShowRates(false)}
          />
        )}
      </div>
    )
  }

  // ── Editor view ───────────────────────────────────────────────────────────────
  const totals = calcQuoteTotals(active, products, rates)

  return (
    <div>
      {/* Editor nav */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-3">
        <button className="press-feedback text-ios-blue flex items-center gap-0.5 text-sm font-semibold" onClick={() => setActive(null)}>
          <ChevronLeft size={18} /> Quotes
        </button>
        <span className="flex-1 text-center text-sm font-semibold text-ios-secondary">#{active.number}</span>
        <button
          className="press-feedback text-ios-blue text-sm font-semibold"
          onClick={() => saveActive(active)}
        >Save</button>
      </div>

      {/* Header card */}
      <div className="ios-card mx-4 mb-3">
        <div className="ios-row row-sep">
          <span className="text-sm text-ios-secondary w-20 shrink-0">Customer</span>
          <input
            className="ios-input flex-1 text-right"
            placeholder="Name or company"
            value={active.customer}
            onChange={e => updateActive({ customer: e.target.value })}
          />
        </div>
        <div className="ios-row row-sep">
          <span className="text-sm text-ios-secondary w-20 shrink-0">Date</span>
          <input
            className="ios-input flex-1 text-right"
            type="date"
            value={active.date}
            onChange={e => updateActive({ date: e.target.value })}
          />
        </div>
        <div className="px-4 py-2">
          <textarea
            className="w-full text-sm bg-transparent outline-none resize-none text-ios-secondary placeholder:text-ios-separator"
            rows={2}
            placeholder="Notes (optional)"
            value={active.notes}
            onChange={e => updateActive({ notes: e.target.value })}
          />
        </div>
      </div>

      {/* Line items */}
      {active.lineItems.length > 0 && (
        <div className="ios-card mx-4 mb-3">
          {active.lineItems.map((line, i) => {
            const p = getLinePrice(line, products, rates)
            const isLast = i === active.lineItems.length - 1
            return (
              <div key={line.id} className={`px-4 py-3 ${isLast ? '' : 'border-b border-ios-separator/30'}`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {line.type === 'product' ? line.productName : line.name || <span className="text-ios-secondary">Unnamed component</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {line.type === 'product' ? (
                        <>
                          {/* Metal selector */}
                          {METALS.map(m => {
                            const prod = products.find(pr => pr.id === line.productId)
                            const avail = prod ? getProductWeight(prod, m) > 0 : false
                            return (
                              <button
                                key={m}
                                disabled={!avail}
                                onClick={() => avail && updateLine(line.id, { metal: m })}
                                className={`text-xs px-1.5 py-0.5 rounded press-feedback ${
                                  line.metal === m
                                    ? 'bg-ios-blue/15 text-ios-blue font-semibold'
                                    : avail ? 'text-ios-secondary bg-ios-secondary/10' : 'opacity-25 text-ios-secondary bg-ios-secondary/10'
                                }`}
                              >
                                {m}
                              </button>
                            )
                          })}
                          <span className="text-xs text-ios-separator">·</span>
                          {/* Type selector */}
                          {(['standard', 'charm', 'chain', 'earring'] as CatProductType[]).map(t => (
                            <button
                              key={t}
                              onClick={() => updateLine(line.id, { productType: t })}
                              className={`text-xs px-1.5 py-0.5 rounded press-feedback capitalize ${
                                (line as CatProductLine).productType === t
                                  ? 'bg-ios-blue/15 text-ios-blue font-semibold'
                                  : 'text-ios-secondary bg-ios-secondary/10'
                              }`}
                            >
                              {t}
                            </button>
                          ))}
                        </>
                      ) : (
                        <span className="text-xs text-ios-secondary">Component · cost {fmtAUD((line as CatComponentLine).rawCost)}</span>
                      )}
                    </div>
                  </div>

                  {/* Qty and price */}
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1">
                      <button
                        className="w-6 h-6 rounded-full bg-ios-secondary/15 text-ios-secondary text-sm font-bold press-feedback flex items-center justify-center"
                        onClick={() => line.qty > 1 && updateLine(line.id, { qty: line.qty - 1 })}
                      >−</button>
                      <span className="text-sm w-5 text-center font-medium">{line.qty}</span>
                      <button
                        className="w-6 h-6 rounded-full bg-ios-secondary/15 text-ios-secondary text-sm font-bold press-feedback flex items-center justify-center"
                        onClick={() => updateLine(line.id, { qty: line.qty + 1 })}
                      >+</button>
                    </div>
                    {p.lineIncGST != null
                      ? <span className="text-sm font-semibold">{fmtAUD(p.lineIncGST)}</span>
                      : <span className="text-xs font-bold text-ios-red">NO PRICE</span>
                    }
                    {p.unitIncGST != null && line.qty > 1 && (
                      <span className="text-xs text-ios-secondary">{fmtAUD(p.unitIncGST)} ea</span>
                    )}
                  </div>

                  {/* Remove */}
                  <button className="text-ios-secondary press-feedback self-start mt-0.5 ml-0.5" onClick={() => removeLine(line.id)}>
                    <X size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add line buttons */}
      <div className="px-4 mb-3 flex gap-2">
        <button
          className="flex-1 py-2.5 rounded-ios border border-ios-separator/60 text-sm font-semibold text-ios-blue press-feedback"
          onClick={() => setShowPicker(true)}
        >
          + Product
        </button>
        <button
          className="flex-1 py-2.5 rounded-ios border border-ios-separator/60 text-sm font-semibold text-ios-secondary press-feedback"
          onClick={() => setAddingComp(v => !v)}
        >
          + Component
        </button>
      </div>

      {/* Component form */}
      {addingComp && (
        <div className="ios-card mx-4 mb-3 animate-in">
          <div className="px-4 pt-3 pb-2">
            <div className="field-label mb-1">Component name</div>
            <input
              className="ios-input w-full"
              placeholder="e.g. Ball clasp, Jump ring"
              value={compDraft.name}
              onChange={e => setCompDraft(d => ({ ...d, name: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="ios-row row-sep px-4">
            <span className="text-sm flex-1">Cost (ex GST)</span>
            <div className="flex items-center gap-1">
              <span className="text-ios-secondary text-sm">$</span>
              <input className="ios-input text-right w-24" type="number" step="0.01" placeholder="0.00"
                value={compDraft.rawCost}
                onChange={e => setCompDraft(d => ({ ...d, rawCost: e.target.value }))} />
            </div>
          </div>
          <div className="ios-row row-sep px-4">
            <span className="text-sm flex-1">Qty</span>
            <input className="ios-input text-right w-16" type="number" step="1" min="1"
              value={compDraft.qty}
              onChange={e => setCompDraft(d => ({ ...d, qty: e.target.value }))} />
          </div>
          <div className="ios-row row-sep px-4">
            <span className="text-sm flex-1">Labour (optional)</span>
            <div className="flex items-center gap-1">
              <span className="text-ios-secondary text-sm">$</span>
              <input className="ios-input text-right w-24" type="number" step="0.01" placeholder="0.00"
                value={compDraft.labour}
                onChange={e => setCompDraft(d => ({ ...d, labour: e.target.value }))} />
            </div>
          </div>
          <div className="ios-row row-sep px-4">
            <span className="text-sm flex-1">Packaging (optional)</span>
            <div className="flex items-center gap-1">
              <span className="text-ios-secondary text-sm">$</span>
              <input className="ios-input text-right w-24" type="number" step="0.01" placeholder="0.00"
                value={compDraft.packaging}
                onChange={e => setCompDraft(d => ({ ...d, packaging: e.target.value }))} />
            </div>
          </div>
          <div className="ios-row px-4">
            <span className="text-sm flex-1">Use chain margin (50%)</span>
            <input type="checkbox" checked={compDraft.useChainMargin}
              onChange={e => setCompDraft(d => ({ ...d, useChainMargin: e.target.checked }))} />
          </div>
          <div className="px-4 py-3 flex gap-2">
            <button className="flex-1 py-2 text-sm text-ios-secondary press-feedback" onClick={() => setAddingComp(false)}>Cancel</button>
            <button className="flex-1 py-2 text-sm font-bold text-ios-blue press-feedback" onClick={handleAddComponent}>Add</button>
          </div>
        </div>
      )}

      {/* Totals */}
      {active.lineItems.length > 0 && (
        <div className="ios-card mx-4 mb-3">
          <div className="ios-row row-sep px-4">
            <span className="text-sm text-ios-secondary">Subtotal ex GST</span>
            <span className="text-sm font-medium">{fmtAUD(totals.subtotalEx)}</span>
          </div>
          <div className="ios-row row-sep px-4">
            <span className="text-sm text-ios-secondary">GST (10%)</span>
            <span className="text-sm font-medium">{fmtAUD(totals.gst)}</span>
          </div>
          <div className="ios-row px-4">
            <span className="text-sm font-bold">Total inc GST</span>
            <span className="text-lg font-bold">{fmtAUD(totals.totalInc)}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-4 mb-3 space-y-2">
        <button
          className={`w-full btn-gold rounded-ios py-3.5 text-sm font-bold press-feedback flex items-center justify-center gap-2 ${copied ? 'opacity-80' : ''}`}
          onClick={handleCopyText}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied!' : 'Copy as Text'}
        </button>
        <button
          className="w-full py-3 text-sm text-ios-red press-feedback"
          onClick={() => {
            if (quotes.find(q => q.id === active.id)) {
              persistQuotes(quotes.filter(q => q.id !== active.id))
            }
            setActive(null)
          }}
        >
          {quotes.find(q => q.id === active.id) ? 'Delete Quote' : 'Discard'}
        </button>
      </div>

      {/* Overlays */}
      {showPicker && (
        <ProductPickerSheet
          products={products}
          onAdd={line => { addLine(line); setShowPicker(false) }}
          onClose={() => setShowPicker(false)}
        />
      )}
      {showRates && (
        <RatesSheet
          rates={rates}
          onSave={r => { saveCatRates(r); setRates(r) }}
          onClose={() => setShowRates(false)}
        />
      )}
    </div>
  )
}
