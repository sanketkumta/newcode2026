import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { db, initDb, nextId } from './db.js'
import { getQuote, getTechnical, getMarketIndices, getPortfolioData, getHistory } from './marketData.js'
import { analyzePortfolio, analyzeStock } from './aiAnalysis.js'

const app = express()
app.use(cors())
app.use(express.json())

await initDb()

// SSE clients
const sseClients = new Set()
function broadcast(event, data) {
  for (const res of sseClients) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  }
}

function addNotif(type, title, message) {
  const n = { id: nextId('notifications'), type, title, message, is_read: false, created_at: new Date().toISOString() }
  db.data.notifications.unshift(n)
  db.write()
  broadcast('notification', n)
  return n
}

function getSettings() {
  return db.data.settings ?? {}
}

// ── Portfolio ──────────────────────────────────────────────────────────────

app.get('/api/portfolio', (req, res) => {
  res.json(db.data.holdings)
})

app.get('/api/portfolio/enriched', async (req, res) => {
  try {
    const enriched = await getPortfolioData(db.data.holdings)
    res.json(enriched)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/portfolio/holding', async (req, res) => {
  const { symbol, name, quantity, avg_price, platform = 'manual' } = req.body
  if (!symbol || !quantity || !avg_price) return res.status(400).json({ error: 'symbol, quantity and avg_price required' })

  const sym = symbol.toUpperCase()
  if (db.data.holdings.find(h => h.symbol === sym && h.platform === platform)) {
    return res.status(400).json({ error: `${sym} already exists for ${platform}` })
  }
  const holding = { id: nextId('holdings'), symbol: sym, name: name || sym, quantity: +quantity, avg_price: +avg_price, platform, created_at: new Date().toISOString() }
  db.data.holdings.push(holding)
  await db.write()
  res.json({ id: holding.id, message: 'Holding added' })
})

app.put('/api/portfolio/holding/:id', async (req, res) => {
  const h = db.data.holdings.find(h => h.id === +req.params.id)
  if (!h) return res.status(404).json({ error: 'Not found' })
  const { quantity, avg_price, name } = req.body
  if (quantity != null) h.quantity  = +quantity
  if (avg_price != null) h.avg_price = +avg_price
  if (name != null) h.name = name
  h.updated_at = new Date().toISOString()
  await db.write()
  res.json({ message: 'Updated' })
})

app.delete('/api/portfolio/holding/:id', async (req, res) => {
  const idx = db.data.holdings.findIndex(h => h.id === +req.params.id)
  if (idx === -1) return res.status(404).json({ error: 'Not found' })
  db.data.holdings.splice(idx, 1)
  await db.write()
  res.json({ message: 'Deleted' })
})

// ── Market data ────────────────────────────────────────────────────────────

app.get('/api/market/quote/:symbol', async (req, res) => {
  res.json(await getQuote(req.params.symbol))
})

app.get('/api/market/technical/:symbol', async (req, res) => {
  res.json(await getTechnical(req.params.symbol))
})

app.get('/api/market/indices', async (req, res) => {
  res.json(await getMarketIndices())
})

app.get('/api/market/history/:symbol', async (req, res) => {
  res.json(await getHistory(req.params.symbol, req.query.period))
})

// ── Analysis ───────────────────────────────────────────────────────────────

app.post('/api/analysis/portfolio', async (req, res) => {
  if (!db.data.holdings.length) return res.status(400).json({ error: 'No holdings to analyze' })
  try {
    const [enriched, indices] = await Promise.all([
      getPortfolioData(db.data.holdings),
      getMarketIndices()
    ])
    const result = await analyzePortfolio(enriched, indices, getSettings())
    const analysis = { id: nextId('analyses'), ...result, created_at: new Date().toISOString() }
    db.data.analyses.unshift(analysis)
    await db.write()
    addNotif('analysis', 'Portfolio Analysis Ready', `Recommendation: ${result.recommendation.toUpperCase()}`)
    res.json(analysis)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/analysis/stock/:symbol', async (req, res) => {
  const { symbol } = req.params
  try {
    const [quote, tech] = await Promise.all([getQuote(symbol), getTechnical(symbol)])
    const result = await analyzeStock(symbol, quote, tech, getSettings())
    const analysis = { id: nextId('analyses'), ...result, created_at: new Date().toISOString() }
    db.data.analyses.unshift(analysis)
    await db.write()
    addNotif('analysis', `Analysis: ${symbol.toUpperCase()}`, `Recommendation: ${result.recommendation.toUpperCase()}`)
    res.json(analysis)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/analysis/history', (req, res) => {
  res.json(db.data.analyses.slice(0, 10))
})

// ── Notifications ──────────────────────────────────────────────────────────

app.get('/api/notifications', (req, res) => {
  res.json(db.data.notifications.slice(0, 30))
})

app.put('/api/notifications/read-all', async (req, res) => {
  db.data.notifications.forEach(n => (n.is_read = true))
  await db.write()
  res.json({ message: 'All read' })
})

app.get('/api/notifications/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  sseClients.add(res)
  const hb = setInterval(() => res.write(`event: heartbeat\ndata: {}\n\n`), 5000)
  req.on('close', () => { sseClients.delete(res); clearInterval(hb) })
})

// ── Settings ───────────────────────────────────────────────────────────────

app.get('/api/settings', (req, res) => {
  const s = { ...getSettings() }
  for (const k of Object.keys(s)) {
    if (k.includes('key') || k.includes('secret') || k.includes('token')) s[k] = s[k] ? '••••••••' : null
  }
  res.json(s)
})

app.post('/api/settings', async (req, res) => {
  const allowed = ['ai_provider', 'anthropic_api_key', 'gemini_api_key', 'groq_api_key', 'kite_api_key', 'kite_api_secret']
  for (const k of allowed) {
    if (req.body[k] != null) db.data.settings[k] = req.body[k]
  }
  await db.write()
  res.json({ message: 'Settings saved' })
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`\n  Server → http://localhost:${PORT}\n`))
