import yahooFinance from 'yahoo-finance2'
import { RSI, MACD, BollingerBands, SMA, EMA } from 'technicalindicators'

yahooFinance.suppressNotices(['yahooSurvey'])

export function normalizeSymbol(symbol) {
  symbol = symbol.toUpperCase().trim()
  if (symbol.startsWith('^')) return symbol
  if (!symbol.includes('.')) return `${symbol}.NS`
  return symbol
}

export async function getQuote(symbol) {
  try {
    const norm = normalizeSymbol(symbol)
    const q = await yahooFinance.quote(norm, {}, { validateResult: false })
    return {
      symbol: symbol.toUpperCase(),
      currentPrice: q.regularMarketPrice ?? 0,
      change: q.regularMarketChange ?? 0,
      changePct: q.regularMarketChangePercent ?? 0,
      previousClose: q.regularMarketPreviousClose ?? 0,
      volume: q.regularMarketVolume ?? 0,
      timestamp: new Date().toISOString()
    }
  } catch (e) {
    return { error: e.message, symbol, currentPrice: 0, change: 0, changePct: 0 }
  }
}

export async function getTechnical(symbol) {
  try {
    const norm = normalizeSymbol(symbol)
    const end = new Date()
    const start = new Date(); start.setFullYear(start.getFullYear() - 1)

    const history = await yahooFinance.historical(norm, {
      period1: start.toISOString().split('T')[0],
      period2: end.toISOString().split('T')[0],
      interval: '1d'
    }, { validateResult: false })

    if (!history?.length || history.length < 30) return { error: 'Insufficient data', symbol }

    const closes = history.map(d => d.close).filter(Boolean)
    const highs  = history.map(d => d.high).filter(Boolean)
    const lows   = history.map(d => d.low).filter(Boolean)
    const last   = arr => arr[arr.length - 1]
    const r      = v => v != null ? Math.round(v * 100) / 100 : null

    const rsiArr  = RSI.calculate({ values: closes, period: 14 })
    const macdArr = MACD.calculate({ values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9, SimpleMAOscillator: false, SimpleMASignal: false })
    const bbArr   = BollingerBands.calculate({ period: 20, values: closes, stdDev: 2 })
    const sma20   = SMA.calculate({ period: 20, values: closes })
    const sma50   = SMA.calculate({ period: 50, values: closes })
    const sma200  = SMA.calculate({ period: 200, values: closes })
    const ema20   = EMA.calculate({ period: 20, values: closes })

    const cm = last(macdArr) ?? {}
    const cb = last(bbArr) ?? {}

    return {
      symbol: symbol.toUpperCase(),
      currentPrice: r(last(closes)),
      rsi: r(last(rsiArr)),
      macd: { macd: r(cm.MACD), signal: r(cm.signal), histogram: r(cm.histogram) },
      movingAverages: { sma20: r(last(sma20)), sma50: r(last(sma50)), sma200: r(last(sma200)), ema20: r(last(ema20)) },
      bollingerBands: { upper: r(cb.upper), middle: r(cb.middle), lower: r(cb.lower) },
      w52High: r(Math.max(...highs)),
      w52Low: r(Math.min(...lows))
    }
  } catch (e) {
    return { error: e.message, symbol }
  }
}

export async function getMarketIndices() {
  const indices = { 'NIFTY 50': '^NSEI', 'SENSEX': '^BSESN', 'NIFTY BANK': '^NSEBANK' }
  const results = {}
  for (const [name, sym] of Object.entries(indices)) {
    results[name] = await getQuote(sym)
  }
  return results
}

export async function getPortfolioData(holdings) {
  return Promise.all(holdings.map(async h => {
    const [quote, tech] = await Promise.all([getQuote(h.symbol), getTechnical(h.symbol)])
    const price   = quote.currentPrice || h.avg_price
    const invested = h.quantity * h.avg_price
    const current  = h.quantity * price
    const pnl      = current - invested
    const pnlPct   = invested > 0 ? (pnl / invested * 100) : 0
    const rsi      = tech.rsi
    const macdHist = tech.macd?.histogram ?? 0
    const sma50    = tech.movingAverages?.sma50

    return {
      ...h,
      currentPrice:  Math.round(price * 100) / 100,
      investedValue: Math.round(invested * 100) / 100,
      currentValue:  Math.round(current * 100) / 100,
      pnl:     Math.round(pnl * 100) / 100,
      pnlPct:  Math.round(pnlPct * 100) / 100,
      change:    quote.change ?? 0,
      changePct: quote.changePct ?? 0,
      rsi,
      rsiSignal:  !rsi ? 'neutral' : rsi < 30 ? 'oversold' : rsi > 70 ? 'overbought' : 'neutral',
      macdSignal: macdHist > 0 ? 'bullish' : 'bearish',
      aboveSma50: sma50 != null ? price > sma50 : null
    }
  }))
}

export async function getHistory(symbol, period = '1y') {
  try {
    const norm  = normalizeSymbol(symbol)
    const end   = new Date()
    const start = new Date()
    const months = { '1mo': 1, '3mo': 3, '6mo': 6, '1y': 12, '2y': 24 }[period] ?? 12
    start.setMonth(start.getMonth() - months)

    const hist = await yahooFinance.historical(norm, {
      period1: start.toISOString().split('T')[0],
      period2: end.toISOString().split('T')[0],
      interval: '1d'
    }, { validateResult: false })

    return hist.map(d => ({
      date:   d.date.toISOString().split('T')[0],
      open:   d.open,  high: d.high,
      low:    d.low,   close: d.close,
      volume: d.volume
    }))
  } catch { return [] }
}
