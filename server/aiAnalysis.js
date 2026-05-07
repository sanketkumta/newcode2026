const SYSTEM_PROMPT = `You are an expert Indian stock market analyst (NSE/BSE).
Structure every response with these sections:
## 📊 Market Assessment
## 🔍 Key Observations
## 🎯 Recommendation (BUY / SELL / HOLD with entry, target, stop-loss in ₹)
## ⚠️ Risk Factors
## ✅ Action Items
Rules: RSI<30=oversold, RSI>70=overbought. Express prices in ₹. Be specific.`

function scoreStock(h) {
  let s = 0
  const rsi = h.rsi ?? 50
  if (rsi < 30) s += 3; else if (rsi < 40) s += 1; else if (rsi > 70) s -= 3; else if (rsi > 60) s -= 1
  if (h.macdSignal === 'bullish') s += 1; else if (h.macdSignal === 'bearish') s -= 1
  if (h.aboveSma50 === true) s += 1; else if (h.aboveSma50 === false) s -= 1
  return s
}

function extractRec(text) {
  const t = text.toLowerCase()
  if (t.includes('strong buy') || t.includes('strong accumulate')) return 'strong_buy'
  if (t.includes('strong sell')) return 'sell'
  if (t.includes('sell') && !t.includes("don't sell") && !t.includes('not sell')) return 'sell'
  if (t.includes('buy') || t.includes('accumulate')) return 'buy'
  return 'hold'
}

function fmt(n) { return (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }) }
function fmtPct(n) { return `${(n ?? 0) >= 0 ? '+' : ''}${(n ?? 0).toFixed(2)}%` }

// ── Rule-based ──────────────────────────────────────────────────────────────

export function ruleBasedPortfolio(data, indices) {
  const totalInv = data.reduce((s, h) => s + (h.investedValue ?? 0), 0)
  const totalCur = data.reduce((s, h) => s + (h.currentValue ?? 0), 0)
  const pnl      = totalCur - totalInv
  const pnlPct   = totalInv > 0 ? (pnl / totalInv * 100) : 0

  const scored   = data.map(h => ({ h, score: scoreStock(h) }))
  const buys     = scored.filter(x => x.score >= 2)
  const sells    = scored.filter(x => x.score <= -2)
  const holds    = scored.filter(x => x.score > -2 && x.score < 2)
  const avgScore = scored.reduce((s, x) => s + x.score, 0) / (scored.length || 1)
  const sentiment = avgScore > 0.5 ? 'Bullish 📈' : avgScore < -0.5 ? 'Bearish 📉' : 'Neutral ⚖️'

  const indexLines = Object.entries(indices)
    .filter(([, d]) => d.currentPrice)
    .map(([n, d]) => `- **${n}**: ₹${fmt(d.currentPrice)} (${fmtPct(d.changePct)})`)
    .join('\n')

  const line = h => `- **${h.symbol}** — ₹${fmt(h.currentPrice)} | P&L ${fmtPct(h.pnlPct)} | RSI ${h.rsi?.toFixed(1) ?? 'N/A'} | MACD ${h.macdSignal ?? '—'}`

  const sorted  = [...data].sort((a, b) => (a.pnlPct ?? 0) - (b.pnlPct ?? 0))
  const overbought = data.filter(h => (h.rsi ?? 0) > 70).map(h => h.symbol)

  const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })

  const content = `## 📊 Market Assessment
Portfolio is **${sentiment}** as of ${ts} IST.

**Summary** | Invested: ₹${fmt(totalInv)} | Current: ₹${fmt(totalCur)} | P&L: ₹${pnl >= 0 ? '+' : ''}${fmt(pnl)} (${fmtPct(pnlPct)})

**Market Indices**
${indexLines || '_Index data unavailable_'}

## 🔍 Key Observations
**Best Performers**
${sorted.slice(-2).reverse().map(h => `- **${h.symbol}**: ${fmtPct(h.pnlPct ?? 0)} P&L`).join('\n')}

**Laggards**
${sorted.slice(0, 2).map(h => `- **${h.symbol}**: ${fmtPct(h.pnlPct ?? 0)} P&L`).join('\n')}

${overbought.length ? `**⚠️ Overbought (RSI>70):** ${overbought.join(', ')} — consider booking partial profits` : ''}

## 🎯 Recommendation

**Accumulate / Add**
${buys.length ? buys.map(x => line(x.h)).join('\n') : '_No strong buy signals right now._'}

**Reduce / Exit**
${sells.length ? sells.map(x => line(x.h)).join('\n') : '_No strong sell signals right now._'}

**Hold**
${holds.map(x => line(x.h)).join('\n')}

## ⚠️ Risk Factors
- Use stop-losses on positions in sustained downtrend.
- Review any stock falling >7–8% from your average price.
- Monitor MACD crossovers daily for trend changes.

## ✅ Action Items
${buys.slice(0, 3).map(x => `- Average into **${x.h.symbol}** (RSI ${x.h.rsi?.toFixed(0) ?? 'N/A'}, bullish signals)`).join('\n')}
${sells.slice(0, 3).map(x => `- Review **${x.h.symbol}** for partial exit (RSI ${x.h.rsi?.toFixed(0) ?? 'N/A'}, bearish signals)`).join('\n')}
- Refresh and re-run daily during market hours (9:15 AM – 3:30 PM IST).
- _Tip: Add a free Gemini key in Settings for deeper AI narrative._
`
  return { content, recommendation: avgScore > 0.5 ? 'buy' : avgScore < -0.5 ? 'sell' : 'hold', type: 'portfolio' }
}

export function ruleBasedStock(symbol, quote, tech) {
  const price  = quote.currentPrice ?? 0
  const rsi    = tech.rsi
  const macd   = tech.macd ?? {}
  const ma     = tech.movingAverages ?? {}
  const bb     = tech.bollingerBands ?? {}
  let score = 0, signals = []

  if (rsi != null) {
    if (rsi < 30)      { score += 3; signals.push(`RSI ${rsi.toFixed(1)} — **oversold**, potential reversal`) }
    else if (rsi < 40) { score += 1; signals.push(`RSI ${rsi.toFixed(1)} — approaching oversold`) }
    else if (rsi > 70) { score -= 3; signals.push(`RSI ${rsi.toFixed(1)} — **overbought**, consider booking profits`) }
    else if (rsi > 60) { score -= 1; signals.push(`RSI ${rsi.toFixed(1)} — elevated, momentum may slow`) }
    else                             signals.push(`RSI ${rsi.toFixed(1)} — neutral zone`)
  }
  if ((macd.histogram ?? 0) > 0) { score += 1; signals.push('MACD histogram **positive** — bullish momentum') }
  else                            { score -= 1; signals.push('MACD histogram **negative** — bearish momentum') }
  if (ma.sma50) {
    if (price > ma.sma50) { score += 1; signals.push(`Above 50-SMA (₹${fmt(ma.sma50)}) — **bullish trend**`) }
    else                  { score -= 1; signals.push(`Below 50-SMA (₹${fmt(ma.sma50)}) — **bearish trend**`) }
  }
  if (ma.sma200) signals.push(price > ma.sma200 ? `Above 200-SMA — long-term uptrend intact` : `Below 200-SMA — long-term downtrend, caution`)

  const rec = score >= 3 ? 'buy' : score >= 1 ? 'buy' : score <= -3 ? 'sell' : score <= -1 ? 'sell' : 'hold'
  const recText = score >= 3 ? '**BUY** — strong bullish confluence' : score >= 1 ? '**BUY / Accumulate** — mild bullish bias'
    : score <= -3 ? '**SELL / Exit** — strong bearish signals' : score <= -1 ? '**REDUCE** — mild bearish bias'
    : '**HOLD** — mixed signals, wait for clarity'

  const target    = bb.upper ?? (price * 1.08)
  const stopLoss  = bb.lower ?? (price * 0.93)

  const content = `## 📊 Market Assessment — ${symbol.toUpperCase()}
**LTP**: ₹${fmt(price)} | **Day**: ${fmtPct(quote.changePct ?? 0)} | **Vol**: ${(quote.volume ?? 0).toLocaleString()}
**52W High**: ₹${fmt(tech.w52High)} | **52W Low**: ₹${fmt(tech.w52Low)}

## 🔍 Key Observations
${signals.map(s => `- ${s}`).join('\n')}

## 🎯 Recommendation
${recText}

| Level | Price |
|-------|-------|
| Entry | ₹${fmt(bb.lower ?? price)} – ₹${fmt(price)} |
| Target | ₹${fmt(target)} |
| Stop-Loss | ₹${fmt(stopLoss)} |

**Time Horizon**: Swing (1–4 weeks) based on technical signals.

## ⚠️ Risk Factors
- Technicals don't account for news, earnings, or macro events.
- Verify with volume — low-volume moves are less reliable.
- Set stop-loss immediately after entry.

## ✅ Action Items
${rec === 'buy' ? `- Buy in 2–3 tranches near ₹${fmt(bb.lower ?? price)}, target ₹${fmt(target)}.` : ''}
${rec === 'sell' ? `- Book profits / exit near ₹${fmt(price)}, stop-loss ₹${fmt(stopLoss)}.` : ''}
- _Tip: Add a free Gemini key in Settings for full AI narrative analysis._
`
  return { content, recommendation: rec, type: 'stock', symbol: symbol.toUpperCase() }
}

// ── Anthropic ───────────────────────────────────────────────────────────────

async function buildPortfolioPrompt(data, indices) {
  const totalInv = data.reduce((s, h) => s + (h.investedValue ?? 0), 0)
  const totalCur = data.reduce((s, h) => s + (h.currentValue ?? 0), 0)
  const pnl      = totalCur - totalInv
  const pnlPct   = totalInv > 0 ? (pnl / totalInv * 100) : 0

  const indexLines = Object.entries(indices)
    .filter(([, d]) => d.currentPrice)
    .map(([n, d]) => `  ${n}: ₹${fmt(d.currentPrice)} (${fmtPct(d.changePct)})`)
    .join('\n')

  const holdingLines = data.map(h =>
    `  ${h.symbol} [${(h.platform ?? 'manual').toUpperCase()}] Qty:${h.quantity} Avg:₹${fmt(h.avg_price)} ` +
    `LTP:₹${fmt(h.currentPrice)} P&L:${fmtPct(h.pnlPct)} RSI:${h.rsi ?? 'N/A'} MACD:${h.macdSignal ?? 'N/A'}`
  ).join('\n')

  return `PORTFOLIO ANALYSIS — ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
Invested: ₹${fmt(totalInv)} | Current: ₹${fmt(totalCur)} | P&L: ₹${pnl >= 0 ? '+' : ''}${fmt(pnl)} (${fmtPct(pnlPct)})

INDICES:\n${indexLines}\n\nHOLDINGS:\n${holdingLines}

Provide full portfolio analysis with BUY/SELL/HOLD signals, rebalancing advice, and specific price levels.`
}

function buildStockPrompt(symbol, quote, tech) {
  const ma = tech.movingAverages ?? {}, bb = tech.bollingerBands ?? {}, macd = tech.macd ?? {}
  return `STOCK: ${symbol.toUpperCase()} — ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
LTP: ₹${fmt(quote.currentPrice)} | Change: ${fmtPct(quote.changePct)} | Vol: ${(quote.volume ?? 0).toLocaleString()}
RSI: ${tech.rsi ?? 'N/A'} | MACD Hist: ${macd.histogram ?? 'N/A'}
SMA20: ₹${fmt(ma.sma20)} | SMA50: ₹${fmt(ma.sma50)} | SMA200: ₹${fmt(ma.sma200)}
BB Upper: ₹${fmt(bb.upper)} | BB Lower: ₹${fmt(bb.lower)}
52W High: ₹${fmt(tech.w52High)} | 52W Low: ₹${fmt(tech.w52Low)}
Provide BUY/SELL/HOLD with entry, target, stop-loss, and time horizon.`
}

async function callAnthropic(apiKey, prompt) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const client = new Anthropic({ apiKey })
  const res = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: prompt }]
  })
  return res.content[0].text
}

// ── Dispatch ────────────────────────────────────────────────────────────────

export async function analyzePortfolio(data, indices, settings) {
  const provider = settings.ai_provider ?? 'rule_based'
  try {
    if (provider === 'anthropic' && settings.anthropic_api_key) {
      const text = await callAnthropic(settings.anthropic_api_key, await buildPortfolioPrompt(data, indices))
      return { content: text, recommendation: extractRec(text), type: 'portfolio' }
    }
  } catch (e) { console.error('AI error:', e.message) }
  return ruleBasedPortfolio(data, indices)
}

export async function analyzeStock(symbol, quote, tech, settings) {
  const provider = settings.ai_provider ?? 'rule_based'
  try {
    if (provider === 'anthropic' && settings.anthropic_api_key) {
      const text = await callAnthropic(settings.anthropic_api_key, buildStockPrompt(symbol, quote, tech))
      return { content: text, recommendation: extractRec(text), type: 'stock', symbol: symbol.toUpperCase() }
    }
  } catch (e) { console.error('AI error:', e.message) }
  return ruleBasedStock(symbol, quote, tech)
}
