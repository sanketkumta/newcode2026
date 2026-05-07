import { useState, useEffect } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Legend } from 'recharts'

const COLORS = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6','#f97316','#06b6d4']
const fmt = n => `₹${(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`

export default function Charts({ toast }) {
  const [enriched, setEnriched] = useState([])
  const [history, setHistory]   = useState([])
  const [chartSym, setChartSym] = useState('')
  const [period, setPeriod]     = useState('1y')
  const [loadingHist, setLoadingHist] = useState(false)

  useEffect(() => {
    fetch('/api/portfolio/enriched').then(r => r.json()).then(d => setEnriched(Array.isArray(d) ? d : []))
  }, [])

  async function loadHistory() {
    if (!chartSym.trim()) { toast('Enter a symbol', 'error'); return }
    setLoadingHist(true)
    try {
      const res = await fetch(`/api/market/history/${chartSym.trim().toUpperCase()}?period=${period}`)
      const data = await res.json()
      setHistory(data)
      if (!data.length) toast('No price data found', 'error')
    } catch (e) { toast(e.message, 'error') }
    finally { setLoadingHist(false) }
  }

  const totalVal = enriched.reduce((s, h) => s + (h.currentValue ?? 0), 0)
  const alloc = enriched.map(h => ({ name: h.symbol, value: +(h.currentValue ?? 0).toFixed(2), pct: totalVal > 0 ? +(h.currentValue / totalVal * 100).toFixed(1) : 0 }))
  const pnlData = [...enriched].sort((a, b) => (a.pnlPct ?? 0) - (b.pnlPct ?? 0)).map(h => ({ name: h.symbol, pnlPct: +(h.pnlPct ?? 0).toFixed(2) }))

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Allocation */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Portfolio Allocation</h2>
          {!alloc.length ? (
            <div className="h-56 flex items-center justify-center text-gray-500 text-sm">No holdings yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={alloc} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, pct }) => `${name} ${pct}%`} labelLine={false}>
                  {alloc.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#e5e7eb' }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* P&L Bar */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">P&L % by Stock</h2>
          {!pnlData.length ? (
            <div className="h-56 flex items-center justify-center text-gray-500 text-sm">No holdings yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pnlData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={v => [`${v}%`, 'P&L']} contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#e5e7eb' }} />
                <Bar dataKey="pnlPct" radius={[4, 4, 0, 0]}>
                  {pnlData.map((d, i) => <Cell key={i} fill={d.pnlPct >= 0 ? '#10b981' : '#ef4444'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Price History */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-300">Price History</h2>
          <div className="flex gap-2">
            <input value={chartSym} onChange={e => setChartSym(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && loadHistory()}
              placeholder="Symbol"
              className="w-32 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-indigo-500 text-gray-200 placeholder-gray-500" />
            <select value={period} onChange={e => setPeriod(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none focus:border-indigo-500">
              <option value="1mo">1 Month</option>
              <option value="3mo">3 Months</option>
              <option value="6mo">6 Months</option>
              <option value="1y">1 Year</option>
              <option value="2y">2 Years</option>
            </select>
            <button onClick={loadHistory} disabled={loadingHist}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg">
              {loadingHist ? '…' : 'Load'}
            </button>
          </div>
        </div>
        {!history.length ? (
          <div className="h-56 flex items-center justify-center text-gray-500 text-sm">Enter a symbol and click Load</div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={history} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={d => d.slice(5)} interval={Math.floor(history.length / 8)} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} tickFormatter={v => `₹${v.toLocaleString('en-IN')}`} width={75} />
              <Tooltip formatter={v => [`₹${v.toLocaleString('en-IN')}`, 'Close']} contentStyle={{ background: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#e5e7eb', fontSize: 12 }} />
              <Line type="monotone" dataKey="close" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
