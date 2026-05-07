import { useState, useEffect } from 'react'

const fmt = n => `₹${(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

export default function Portfolio({ toast }) {
  const [holdings, setHoldings] = useState([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [editTarget, setEditTarget] = useState(null)
  const [form, setForm] = useState({ symbol: '', name: '', quantity: '', avg_price: '', platform: 'groww' })

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await fetch('/api/portfolio')
    setHoldings(await res.json())
    setLoading(false)
  }

  function openAdd() { setForm({ symbol: '', name: '', quantity: '', avg_price: '', platform: 'groww' }); setEditTarget(null); setModal(true) }
  function openEdit(h) { setForm({ symbol: h.symbol, name: h.name, quantity: String(h.quantity), avg_price: String(h.avg_price), platform: h.platform }); setEditTarget(h.id); setModal(true) }

  async function submit() {
    const { symbol, quantity, avg_price, name, platform } = form
    if (!symbol || !quantity || !avg_price) { toast('Symbol, quantity and price are required', 'error'); return }
    try {
      if (editTarget) {
        await fetch(`/api/portfolio/holding/${editTarget}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: +quantity, avg_price: +avg_price, name }) })
        toast('Holding updated', 'success')
      } else {
        const res = await fetch('/api/portfolio/holding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol, name, quantity: +quantity, avg_price: +avg_price, platform }) })
        const data = await res.json()
        if (data.error) throw new Error(data.error)
        toast(`${symbol.toUpperCase()} added`, 'success')
      }
      setModal(false)
      load()
    } catch (e) { toast(e.message, 'error') }
  }

  async function del(h) {
    if (!confirm(`Remove ${h.symbol}?`)) return
    await fetch(`/api/portfolio/holding/${h.id}`, { method: 'DELETE' })
    toast(`${h.symbol} removed`, 'success')
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-base font-semibold">Portfolio</h1>
        <button onClick={openAdd} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg">+ Add Holding</button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        {loading ? (
          <div className="text-center text-gray-500 text-sm py-10">Loading…</div>
        ) : !holdings.length ? (
          <div className="text-center text-gray-500 text-sm py-10">No holdings yet. Add your first stock.</div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-gray-500 border-b border-gray-800">
              <th className="text-left p-3">Symbol</th>
              <th className="text-right p-3">Quantity</th>
              <th className="text-right p-3">Avg Price</th>
              <th className="text-right p-3">Invested</th>
              <th className="text-right p-3">Platform</th>
              <th className="text-right p-3">Actions</th>
            </tr></thead>
            <tbody>
              {holdings.map(h => (
                <tr key={h.id} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                  <td className="p-3 font-medium">{h.symbol}<div className="text-xs text-gray-500">{h.name}</div></td>
                  <td className="p-3 text-right">{h.quantity}</td>
                  <td className="p-3 text-right">{fmt(h.avg_price)}</td>
                  <td className="p-3 text-right">{fmt(h.quantity * h.avg_price)}</td>
                  <td className="p-3 text-right capitalize">{h.platform}</td>
                  <td className="p-3 text-right">
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => openEdit(h)} className="text-xs bg-gray-800 hover:bg-gray-700 px-2 py-1 rounded border border-gray-700">Edit</button>
                      <button onClick={() => del(h)} className="text-xs bg-red-900/40 hover:bg-red-900/70 text-red-400 px-2 py-1 rounded border border-red-900/50">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-96 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">{editTarget ? 'Edit Holding' : 'Add Holding'}</h2>
              <button onClick={() => setModal(false)} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>
            <div className="space-y-3">
              {!editTarget && (
                <>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">NSE Symbol *</label>
                    <input value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                      placeholder="RELIANCE, TCS, INFY…"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Name (optional)</label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Reliance Industries"
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Quantity *</label>
                  <input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    placeholder="10"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Avg Price (₹) *</label>
                  <input type="number" value={form.avg_price} onChange={e => setForm(f => ({ ...f, avg_price: e.target.value }))}
                    placeholder="1500"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              {!editTarget && (
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Platform</label>
                  <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500">
                    <option value="groww">Groww</option>
                    <option value="kite">Zerodha Kite</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>
              )}
              <button onClick={submit} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg text-sm font-medium mt-2">
                {editTarget ? 'Update' : 'Add Holding'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
