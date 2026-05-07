import { useState, useEffect } from 'react'

const fmt = (n) => `₹${(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtPct = (n) => `${(n ?? 0) >= 0 ? '+' : ''}${(n ?? 0).toFixed(2)}%`
const updown = (n) => (n ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'

function Card({ label, value, sub, subColor }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-xl font-bold text-gray-100">{value}</div>
      {sub && <div className={`text-xs mt-0.5 ${subColor ?? 'text-gray-400'}`}>{sub}</div>}
    </div>
  )
}

function RecBadge({ rec }) {
  const styles = { buy: 'bg-emerald-900/70 text-emerald-400', strong_buy: 'bg-emerald-800 text-emerald-300', sell: 'bg-red-900/70 text-red-400', hold: 'bg-gray-800 text-gray-400' }
  return <span className={`text-xs px-2 py-0.5 rounded font-semibold ${styles[rec] ?? styles.hold}`}>{rec?.replace('_', ' ').toUpperCase()}</span>
}

function AnalysisBox({ result }) {
  const [expanded, setExpanded] = useState(true)
  if (!result) return null
  return (
    <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 mt-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold">{result.symbol ?? 'Portfolio'} Analysis</span>
        <RecBadge rec={result.recommendation} />
        <span className="text-xs text-gray-500 ml-auto">{new Date(result.created_at).toLocaleString('en-IN')}</span>
        <button onClick={() => setExpanded(e => !e)} className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</button>
      </div>
      {expanded && <div className="analysis-content" dangerouslySetInnerHTML={{ __html: mdToHtml(result.content) }} />}
    </div>
  )
}

function mdToHtml(md = '') {
  return md
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\|(.+)\|/g, (_, row) => `<tr>${row.split('|').map(c => `<td>${c.trim()}</td>`).join('')}</tr>`)
    .replace(/(<tr>.*<\/tr>\n?)+/g, m => `<table>${m}</table>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hult])(.+)$/gm, '<p>$1</p>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
}

export default function Dashboard({ toast, goTo }) {
  const [enriched, setEnriched] = useState([])
  const [indices, setIndices]   = useState({})
  const [loading, setLoading]   = useState(true)
  const [quickSymbol, setQuickSymbol] = useState('')
  const [analysisResult, setAnalysisResult] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [e, i] = await Promise.all([
        fetch('/api/portfolio/enriched').then(r => r.json()),
        fetch('/api/market/indices').then(r => r.json())
      ])
      setEnriched(Array.isArray(e) ? e : [])
      setIndices(i)
    } catch (err) { toast(err.message, 'error') }
    finally { setLoading(false) }
  }

  async function runPortfolioAnalysis() {
    setAnalyzing(true)
    try {
      const res = await fetch('/api/analysis/portfolio', { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAnalysisResult(data)
      toast('Portfolio analysis complete', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setAnalyzing(false) }
  }

  async function analyzeQuickStock() {
    if (!quickSymbol.trim()) { toast('Enter a symbol', 'error'); return }
    setAnalyzing(true)
    try {
      const res = await fetch(`/api/analysis/stock/${quickSymbol.trim().toUpperCase()}`, { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setAnalysisResult(data)
      toast(`${quickSymbol.toUpperCase()} analyzed`, 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setAnalyzing(false) }
  }

  const totalInv = enriched.reduce((s, h) => s + (h.investedValue ?? 0), 0)
  const totalCur = enriched.reduce((s, h) => s + (h.currentValue ?? 0), 0)
  const totalPnl = totalCur - totalInv
  const totalPnlPct = totalInv > 0 ? (totalPnl / totalInv * 100) : 0
  const todayPnl = enriched.reduce((s, h) => s + (h.change ?? 0) * h.quantity, 0)

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card label="Total Invested"  value={fmt(totalInv)} />
        <Card label="Current Value"   value={fmt(totalCur)} />
        <Card label="Total P&L"       value={fmt(totalPnl)}   sub={fmtPct(totalPnlPct)} subColor={updown(totalPnl)} />
        <Card label="Today's P&L"     value={<span className={updown(todayPnl)}>{fmt(todayPnl)}</span>} />
      </div>

      {/* Indices */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300">Market Indices</h2>
          <button onClick={loadAll} className="text-xs text-gray-400 hover:text-white bg-gray-800 px-2 py-1 rounded">Refresh</button>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {Object.entries(indices).map(([name, d]) => (
            <div key={name} className="text-center">
              <div className="text-xs text-gray-400">{name}</div>
              <div className="text-base font-bold mt-1">{d.currentPrice ? d.currentPrice.toLocaleString('en-IN') : '—'}</div>
              <div className={`text-xs ${updown(d.changePct)}`}>{d.currentPrice ? fmtPct(d.changePct) : '—'}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Holdings table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between p-4">
          <h2 className="text-sm font-semibold text-gray-300">Holdings</h2>
          <div className="flex gap-2">
            <button onClick={loadAll} className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg border border-gray-700">Refresh</button>
            <button onClick={() => goTo('portfolio')} className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg border border-gray-700">Manage</button>
          </div>
        </div>
        {loading ? (
          <div className="text-center text-gray-500 text-sm py-10">Loading live prices…</div>
        ) : !enriched.length ? (
          <div className="text-center text-gray-500 text-sm py-10">No holdings. <button onClick={() => goTo('portfolio')} className="text-indigo-400 hover:underline">Add stocks →</button></div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-t border-gray-800 text-xs text-gray-500">
              <th className="text-left p-3">Symbol</th>
              <th className="text-right p-3">LTP</th>
              <th className="text-right p-3">Day</th>
              <th className="text-right p-3">P&L</th>
              <th className="text-right p-3">RSI</th>
              <th className="text-right p-3">MACD</th>
            </tr></thead>
            <tbody>
              {enriched.map(h => (
                <tr key={h.id} className="border-t border-gray-800/50 hover:bg-gray-800/30">
                  <td className="p-3 font-medium">{h.symbol}<span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${h.platform === 'kite' ? 'bg-emerald-900/50 text-emerald-400' : h.platform === 'groww' ? 'bg-purple-900/50 text-purple-400' : 'bg-gray-800 text-gray-500'}`}>{h.platform}</span></td>
                  <td className="p-3 text-right">{fmt(h.currentPrice)}</td>
                  <td className={`p-3 text-right ${updown(h.changePct)}`}>{fmtPct(h.changePct)}</td>
                  <td className="p-3 text-right">
                    <div className={updown(h.pnl)}>{fmt(h.pnl)}</div>
                    <div className={`text-xs ${updown(h.pnlPct)}`}>{fmtPct(h.pnlPct)}</div>
                  </td>
                  <td className={`p-3 text-right text-xs ${h.rsiSignal === 'oversold' ? 'text-emerald-400' : h.rsiSignal === 'overbought' ? 'text-red-400' : 'text-gray-400'}`}>
                    {h.rsi?.toFixed(1) ?? '—'}
                  </td>
                  <td className={`p-3 text-right text-xs ${h.macdSignal === 'bullish' ? 'text-emerald-400' : 'text-red-400'}`}>{h.macdSignal ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Quick Analysis */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300">Quick Analysis</h2>
          <div className="flex gap-2">
            <input value={quickSymbol} onChange={e => setQuickSymbol(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && analyzeQuickStock()}
              placeholder="Symbol (e.g. RELIANCE)"
              className="text-xs bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-gray-200 placeholder-gray-500 w-44 focus:outline-none focus:border-indigo-500" />
            <button onClick={analyzeQuickStock} disabled={analyzing} className="text-xs bg-gray-800 hover:bg-gray-700 disabled:opacity-50 px-3 py-1.5 rounded-lg border border-gray-700">
              Analyze Stock
            </button>
            <button onClick={runPortfolioAnalysis} disabled={analyzing} className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-1.5 rounded-lg text-white">
              {analyzing ? 'Analyzing…' : 'Analyze Portfolio'}
            </button>
          </div>
        </div>
        <AnalysisBox result={analysisResult} />
      </div>
    </div>
  )
}
