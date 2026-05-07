import { useState, useEffect } from 'react'

function mdToHtml(md = '') {
  return md
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\|(.+)\|/g, (_, row) => `<tr>${row.split('|').map(c => `<td>${c.trim()}</td>`).join('')}</tr>`)
    .replace(/(<tr>.*<\/tr>\n?)+/g, m => `<table>${m}</table>`)
    .replace(/_(.+?)_/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hults])(.+)$/gm, '<p>$1</p>')
}

function RecBadge({ rec }) {
  const styles = { buy: 'bg-emerald-900/70 text-emerald-400', strong_buy: 'bg-emerald-800 text-emerald-300', sell: 'bg-red-900/70 text-red-400', hold: 'bg-gray-800 text-gray-400' }
  return <span className={`text-xs px-2 py-0.5 rounded font-semibold ${styles[rec] ?? styles.hold}`}>{(rec ?? 'hold').replace('_', ' ').toUpperCase()}</span>
}

export default function Analysis({ toast }) {
  const [stockSymbol, setStockSymbol] = useState('')
  const [result, setResult]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState([])

  useEffect(() => { loadHistory() }, [])

  async function loadHistory() {
    const res = await fetch('/api/analysis/history')
    setHistory(await res.json())
  }

  async function runPortfolio() {
    setLoading(true); setResult(null)
    try {
      const res = await fetch('/api/analysis/portfolio', { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
      loadHistory()
      toast('Portfolio analysis complete', 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  async function runStock() {
    if (!stockSymbol.trim()) { toast('Enter a symbol', 'error'); return }
    setLoading(true); setResult(null)
    try {
      const res = await fetch(`/api/analysis/stock/${stockSymbol.trim().toUpperCase()}`, { method: 'POST' })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setResult(data)
      loadHistory()
      toast(`${stockSymbol.toUpperCase()} analyzed`, 'success')
    } catch (e) { toast(e.message, 'error') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold">AI Analysis</h1>
        <button onClick={runPortfolio} disabled={loading}
          className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg">
          {loading ? 'Analyzing…' : 'Run Portfolio Analysis'}
        </button>
      </div>

      {/* Stock analysis */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Analyze Individual Stock</h2>
        <div className="flex gap-2">
          <input value={stockSymbol} onChange={e => setStockSymbol(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && runStock()}
            placeholder="NSE symbol — TCS, INFY, HDFC, WIPRO…"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 placeholder-gray-500" />
          <button onClick={runStock} disabled={loading}
            className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg">
            Analyze
          </button>
        </div>

        {loading && (
          <div className="text-center py-8 text-gray-400 text-sm">
            <div className="inline-block w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-2" />
            <div>Fetching data and running analysis…</div>
          </div>
        )}

        {result && (
          <div className="mt-4 bg-gray-800/50 border border-gray-700 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-semibold text-sm">{result.symbol ?? 'Portfolio'}</span>
              <RecBadge rec={result.recommendation} />
              <span className="text-xs text-gray-500 ml-auto">{new Date(result.created_at).toLocaleString('en-IN')}</span>
            </div>
            <div className="analysis-content" dangerouslySetInnerHTML={{ __html: mdToHtml(result.content) }} />
          </div>
        )}
      </div>

      {/* History */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-300">Analysis History</h2>
          <button onClick={loadHistory} className="text-xs text-gray-400 hover:text-white bg-gray-800 px-2 py-1 rounded">Refresh</button>
        </div>
        {!history.length ? (
          <p className="text-gray-500 text-sm">No analysis history yet. Run an analysis above.</p>
        ) : (
          <div className="space-y-3">
            {history.map(a => (
              <details key={a.id} className="border border-gray-700/50 rounded-lg">
                <summary className="flex items-center gap-2 p-3 cursor-pointer hover:bg-gray-800/30 rounded-lg">
                  <span className="font-medium text-sm">{a.symbol ?? 'Portfolio'}</span>
                  <RecBadge rec={a.recommendation} />
                  <span className="text-xs text-gray-500 capitalize ml-1">{a.type}</span>
                  <span className="text-xs text-gray-500 ml-auto">{new Date(a.created_at).toLocaleString('en-IN')}</span>
                </summary>
                <div className="px-3 pb-3 analysis-content" dangerouslySetInnerHTML={{ __html: mdToHtml(a.content) }} />
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
