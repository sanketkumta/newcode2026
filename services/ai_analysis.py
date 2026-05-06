"""
Multi-provider AI analysis service.

Supported providers (in order of recommendation for free usage):
  rule_based  — no API key, instant, always works
  gemini      — Google Gemini 1.5 Flash free tier (get key at aistudio.google.com)
  groq        — Groq free tier with Llama 3 (get key at console.groq.com)
  anthropic   — Anthropic Claude (paid, but best quality)
"""

from __future__ import annotations
from datetime import datetime
from typing import Dict, List, Optional

SYSTEM_PROMPT = """You are an expert Indian stock market analyst specializing in NSE/BSE equities.

When analyzing, structure your response with these exact sections:
## 📊 Market Assessment
## 🔍 Key Observations
## 🎯 Recommendation (BUY / SELL / HOLD with entry, target, stop-loss in ₹)
## ⚠️ Risk Factors
## ✅ Action Items

Guidelines:
- RSI < 30 = oversold (potential buy), RSI > 70 = overbought (potential sell)
- Price above 50 SMA = bullish trend
- MACD histogram positive = bullish momentum
- Express prices in ₹. Be specific about timing and price levels."""


# ── rule-based (zero API key) ──────────────────────────────────────────────

def _score_stock(h: Dict) -> int:
    """Return a simple signal score: positive = bullish, negative = bearish."""
    score = 0
    rsi = h.get("rsi") or 50
    if rsi < 30:
        score += 3
    elif rsi < 40:
        score += 1
    elif rsi > 70:
        score -= 3
    elif rsi > 60:
        score -= 1

    if h.get("macd_signal") == "bullish":
        score += 1
    elif h.get("macd_signal") == "bearish":
        score -= 1

    if h.get("above_sma_50") is True:
        score += 1
    elif h.get("above_sma_50") is False:
        score -= 1

    return score


def rule_based_portfolio(portfolio_data: List[Dict], market_indices: Dict) -> Dict:
    total_invested = sum(h.get("invested_value", 0) for h in portfolio_data)
    total_current = sum(h.get("current_value", 0) for h in portfolio_data)
    total_pnl = total_current - total_invested
    total_pnl_pct = (total_pnl / total_invested * 100) if total_invested > 0 else 0

    scored = [(h, _score_stock(h)) for h in portfolio_data]
    buy_signals = [(h, s) for h, s in scored if s >= 2]
    sell_signals = [(h, s) for h, s in scored if s <= -2]
    hold_signals = [(h, s) for h, s in scored if -2 < s < 2]

    # Overall portfolio sentiment
    avg_score = sum(s for _, s in scored) / len(scored) if scored else 0
    sentiment = "Bullish" if avg_score > 0.5 else "Bearish" if avg_score < -0.5 else "Neutral"

    # Market index summary
    index_lines = []
    for name, d in market_indices.items():
        if isinstance(d, dict) and "current_price" in d:
            chg = d.get("change_pct", 0)
            index_lines.append(f"- **{name}**: ₹{d['current_price']:,.2f} ({chg:+.2f}%)")

    def stock_line(h):
        rsi = h.get("rsi")
        rsi_str = f"RSI {rsi:.1f}" if rsi else "RSI N/A"
        return (
            f"- **{h['symbol']}** — LTP ₹{h.get('current_price',0):,.2f} | "
            f"P&L {h.get('pnl_pct',0):+.1f}% | {rsi_str} | "
            f"MACD {h.get('macd_signal','—')} | "
            f"{'Above' if h.get('above_sma_50') else 'Below'} 50-SMA"
        )

    buy_section = "\n".join(stock_line(h) for h, _ in buy_signals) if buy_signals else "_No strong buy signals right now._"
    sell_section = "\n".join(stock_line(h) for h, _ in sell_signals) if sell_signals else "_No strong sell signals right now._"
    hold_section = "\n".join(stock_line(h) for h, _ in hold_signals) if hold_signals else ""

    # Biggest winners/losers
    by_pnl = sorted(portfolio_data, key=lambda h: h.get("pnl_pct", 0))
    worst = by_pnl[:2]
    best = by_pnl[-2:][::-1]

    # Concentration risk
    weights = {h["symbol"]: h.get("current_value", 0) / total_current * 100 for h in portfolio_data} if total_current else {}
    concentrated = [(sym, w) for sym, w in weights.items() if w > 30]

    # Overbought stocks to watch
    overbought = [h["symbol"] for h in portfolio_data if (h.get("rsi") or 0) > 70]

    content = f"""## 📊 Market Assessment
Portfolio is **{sentiment}** as of {datetime.now().strftime('%d %b %Y, %H:%M IST')}.

**Portfolio Summary**
- Total Invested: ₹{total_invested:,.2f}
- Current Value: ₹{total_current:,.2f}
- Overall P&L: ₹{total_pnl:+,.2f} ({total_pnl_pct:+.2f}%)

**Market Indices**
{chr(10).join(index_lines) if index_lines else '_Index data unavailable_'}

## 🔍 Key Observations

**Best Performers**
{chr(10).join(f'- **{h["symbol"]}**: {h.get("pnl_pct",0):+.1f}% P&L' for h in best)}

**Laggards**
{chr(10).join(f'- **{h["symbol"]}**: {h.get("pnl_pct",0):+.1f}% P&L' for h in worst)}

{'**Overbought (RSI > 70) — consider booking partial profits:** ' + ', '.join(overbought) if overbought else ''}

## 🎯 Recommendation

**Accumulate / Add** _(strong technical signals)_
{buy_section}

**Reduce / Exit** _(weak technical signals)_
{sell_section}

**Hold** _(neutral signals)_
{hold_section}

## ⚠️ Risk Factors

{'- **Concentration risk**: ' + ', '.join(f"{sym} ({w:.0f}%)" for sym, w in concentrated) if concentrated else '- Portfolio appears well-diversified.'}
- Always use stop-losses — protect capital on positions showing sustained downtrend.
- Review any stock that falls >7–8% from your average price.
- Monitor MACD crossovers daily for trend reversals.

## ✅ Action Items

{chr(10).join(f'- Consider averaging into **{h["symbol"]}** (oversold RSI {h.get("rsi", 0):.0f}, bullish signals)' for h, _ in buy_signals[:3]) if buy_signals else ''}
{chr(10).join(f'- Review **{h["symbol"]}** for partial exit (RSI {h.get("rsi", 0):.0f}, bearish signals)' for h, _ in sell_signals[:3]) if sell_signals else ''}
- Refresh prices and re-run analysis daily during market hours (9:15 AM – 3:30 PM IST).
- _(Tip: Connect a free Gemini or Groq API key in Settings for deeper AI-powered insights.)_
"""

    overall_rec = "buy" if avg_score > 0.5 else "sell" if avg_score < -0.5 else "hold"
    return {"content": content, "recommendation": overall_rec, "type": "portfolio"}


def rule_based_stock(symbol: str, quote: Dict, technical: Dict) -> Dict:
    ma = technical.get("moving_averages") or {}
    bb = technical.get("bollinger_bands") or {}
    macd = technical.get("macd") or {}
    rsi = technical.get("rsi")
    price = quote.get("current_price", 0)

    score = 0
    signals = []

    if rsi:
        if rsi < 30:
            score += 3
            signals.append(f"RSI {rsi:.1f} — **oversold**, high probability reversal zone")
        elif rsi < 40:
            score += 1
            signals.append(f"RSI {rsi:.1f} — approaching oversold, watch for bounce")
        elif rsi > 70:
            score -= 3
            signals.append(f"RSI {rsi:.1f} — **overbought**, consider booking profits")
        elif rsi > 60:
            score -= 1
            signals.append(f"RSI {rsi:.1f} — elevated, momentum may slow")
        else:
            signals.append(f"RSI {rsi:.1f} — neutral zone")

    macd_hist = macd.get("histogram") or 0
    if macd_hist > 0:
        score += 1
        signals.append("MACD histogram **positive** — bullish momentum")
    elif macd_hist < 0:
        score -= 1
        signals.append("MACD histogram **negative** — bearish momentum")

    sma50 = ma.get("sma_50")
    sma200 = ma.get("sma_200")
    if sma50:
        if price > sma50:
            score += 1
            signals.append(f"Price above 50-SMA (₹{sma50:,.2f}) — **bullish trend**")
        else:
            score -= 1
            signals.append(f"Price below 50-SMA (₹{sma50:,.2f}) — **bearish trend**")

    if sma200:
        if price > sma200:
            signals.append(f"Price above 200-SMA (₹{sma200:,.2f}) — long-term uptrend intact")
        else:
            signals.append(f"Price below 200-SMA (₹{sma200:,.2f}) — long-term downtrend, caution")

    bb_lower = bb.get("lower")
    bb_upper = bb.get("upper")
    if bb_lower and price <= bb_lower * 1.01:
        score += 1
        signals.append(f"Price near Bollinger lower band (₹{bb_lower:,.2f}) — potential support")
    elif bb_upper and price >= bb_upper * 0.99:
        score -= 1
        signals.append(f"Price near Bollinger upper band (₹{bb_upper:,.2f}) — potential resistance")

    if score >= 3:
        rec = "buy"
        rec_text = "**BUY** — strong bullish confluence"
    elif score >= 1:
        rec = "buy"
        rec_text = "**BUY / Accumulate** — mild bullish bias"
    elif score <= -3:
        rec = "sell"
        rec_text = "**SELL / Exit** — strong bearish signals"
    elif score <= -1:
        rec = "sell"
        rec_text = "**REDUCE** — mild bearish bias, consider partial exit"
    else:
        rec = "hold"
        rec_text = "**HOLD** — mixed signals, wait for clearer direction"

    # Rough targets based on Bollinger Bands and SMAs
    target = bb_upper or (price * 1.08)
    stop_loss = bb_lower or (price * 0.93)
    entry = bb_lower or price

    content = f"""## 📊 Market Assessment — {symbol.upper()}

**LTP**: ₹{price:,.2f} | **Day Change**: {quote.get('change_pct', 0):+.2f}% | **Volume**: {quote.get('volume', 0):,}
**52W High**: ₹{technical.get('52w_high', 0):,.2f} | **52W Low**: ₹{technical.get('52w_low', 0):,.2f}

_Analysis generated: {datetime.now().strftime('%d %b %Y, %H:%M IST')}_

## 🔍 Key Observations

{chr(10).join(f'- {s}' for s in signals)}

## 🎯 Recommendation

{rec_text}

| Level | Price |
|-------|-------|
| Entry Range | ₹{entry:,.2f} – ₹{price:,.2f} |
| Target | ₹{target:,.2f} |
| Stop-Loss | ₹{stop_loss:,.2f} |

**Time Horizon**: Swing trade (1–4 weeks) based on technical signals.

## ⚠️ Risk Factors

- Technical signals alone don't account for news, earnings, or macro events.
- Verify volumes — low-volume moves are less reliable.
- Place stop-loss immediately after entry to limit downside.

## ✅ Action Items

{'- Watch for RSI to cross back above 30 as confirmation before buying.' if rsi and rsi < 35 else ''}
{'- Consider buying in 2–3 tranches rather than all at once.' if rec == 'buy' else ''}
{'- Book partial profits if price reaches Bollinger upper band.' if rec == 'buy' else ''}
{'- Keep strict stop-loss at ₹' + f'{stop_loss:,.2f}' + ' to manage risk.' if rec == 'sell' else ''}
- _(Tip: Add a free Gemini or Groq API key in Settings for deeper AI narrative analysis.)_
"""

    return {"content": content, "recommendation": rec, "type": "stock", "symbol": symbol.upper()}


# ── provider dispatch ──────────────────────────────────────────────────────

class AIAnalysisService:
    def __init__(self, provider: str = "rule_based", api_key: Optional[str] = None):
        self.provider = provider
        self.api_key = api_key

    def analyze_portfolio(self, portfolio_data: List[Dict], market_indices: Dict) -> Dict:
        if self.provider == "gemini":
            return self._gemini(self._portfolio_prompt(portfolio_data, market_indices), "portfolio")
        if self.provider == "groq":
            return self._groq(self._portfolio_prompt(portfolio_data, market_indices), "portfolio")
        if self.provider == "anthropic":
            return self._anthropic_portfolio(portfolio_data, market_indices)
        return rule_based_portfolio(portfolio_data, market_indices)

    def analyze_stock(self, symbol: str, quote: Dict, technical: Dict) -> Dict:
        if self.provider == "gemini":
            return self._gemini(self._stock_prompt(symbol, quote, technical), "stock", symbol)
        if self.provider == "groq":
            return self._groq(self._stock_prompt(symbol, quote, technical), "stock", symbol)
        if self.provider == "anthropic":
            return self._anthropic_stock(symbol, quote, technical)
        return rule_based_stock(symbol, quote, technical)

    # ── prompt builders ──────────────────────────────────────────────────

    def _portfolio_prompt(self, portfolio_data: List[Dict], market_indices: Dict) -> str:
        total_invested = sum(h.get("invested_value", 0) for h in portfolio_data)
        total_current = sum(h.get("current_value", 0) for h in portfolio_data)
        total_pnl = total_current - total_invested
        total_pnl_pct = (total_pnl / total_invested * 100) if total_invested > 0 else 0

        lines = [f"PORTFOLIO ANALYSIS — {datetime.now().strftime('%d %b %Y, %H:%M IST')}\n"]
        lines.append(f"Total Invested: ₹{total_invested:,.2f} | Current: ₹{total_current:,.2f} | P&L: ₹{total_pnl:+,.2f} ({total_pnl_pct:+.2f}%)\n")
        lines.append("MARKET INDICES:")
        for name, d in market_indices.items():
            if isinstance(d, dict) and "current_price" in d:
                lines.append(f"  {name}: ₹{d['current_price']:,.2f} ({d.get('change_pct', 0):+.2f}%)")
        lines.append("\nHOLDINGS:")
        for h in portfolio_data:
            lines.append(
                f"  {h['symbol']} [{h.get('platform','manual').upper()}] "
                f"Qty:{h['quantity']} Avg:₹{h['avg_price']:,.2f} LTP:₹{h.get('current_price',0):,.2f} "
                f"P&L:₹{h.get('pnl',0):+,.2f}({h.get('pnl_pct',0):+.1f}%) "
                f"RSI:{h.get('rsi','N/A')} MACD:{h.get('macd_signal','N/A')} AboveSMA50:{h.get('above_sma_50','N/A')}"
            )
        lines.append("\nProvide full portfolio analysis with BUY/SELL/HOLD signals, rebalancing advice, and specific price targets.")
        return "\n".join(lines)

    def _stock_prompt(self, symbol: str, quote: Dict, technical: Dict) -> str:
        ma = technical.get("moving_averages") or {}
        bb = technical.get("bollinger_bands") or {}
        macd = technical.get("macd") or {}
        return f"""STOCK ANALYSIS — {symbol.upper()} — {datetime.now().strftime('%d %b %Y, %H:%M IST')}

LTP: ₹{quote.get('current_price',0):,.2f} | Change: {quote.get('change_pct',0):+.2f}% | Volume: {quote.get('volume',0):,}
RSI: {technical.get('rsi','N/A')} | MACD: {macd.get('macd','N/A')} | Signal: {macd.get('signal','N/A')} | Hist: {macd.get('histogram','N/A')}
SMA20: ₹{ma.get('sma_20','N/A')} | SMA50: ₹{ma.get('sma_50','N/A')} | SMA200: ₹{ma.get('sma_200','N/A')}
BB Upper: ₹{bb.get('upper','N/A')} | BB Lower: ₹{bb.get('lower','N/A')}
52W High: ₹{technical.get('52w_high','N/A')} | 52W Low: ₹{technical.get('52w_low','N/A')}

Provide complete technical analysis with BUY/SELL/HOLD, entry price, target, stop-loss, and time horizon."""

    # ── Gemini ────────────────────────────────────────────────────────────

    def _gemini(self, prompt: str, analysis_type: str, symbol: str = None) -> Dict:
        import google.generativeai as genai
        genai.configure(api_key=self.api_key)
        model = genai.GenerativeModel(
            "gemini-1.5-flash",
            system_instruction=SYSTEM_PROMPT,
        )
        response = model.generate_content(prompt)
        content = response.text
        return {
            "content": content,
            "recommendation": self._extract_rec(content),
            "type": analysis_type,
            "symbol": symbol,
        }

    # ── Groq ──────────────────────────────────────────────────────────────

    def _groq(self, prompt: str, analysis_type: str, symbol: str = None) -> Dict:
        from groq import Groq
        client = Groq(api_key=self.api_key)
        response = client.chat.completions.create(
            model="llama-3.1-70b-versatile",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            max_tokens=2000,
            temperature=0.3,
        )
        content = response.choices[0].message.content
        return {
            "content": content,
            "recommendation": self._extract_rec(content),
            "type": analysis_type,
            "symbol": symbol,
        }

    # ── Anthropic ─────────────────────────────────────────────────────────

    def _anthropic_portfolio(self, portfolio_data: List[Dict], market_indices: Dict) -> Dict:
        import anthropic
        client = anthropic.Anthropic(api_key=self.api_key)
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2500,
            system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": self._portfolio_prompt(portfolio_data, market_indices)}],
        )
        content = response.content[0].text
        return {"content": content, "recommendation": self._extract_rec(content), "type": "portfolio"}

    def _anthropic_stock(self, symbol: str, quote: Dict, technical: Dict) -> Dict:
        import anthropic
        client = anthropic.Anthropic(api_key=self.api_key)
        response = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1500,
            system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
            messages=[{"role": "user", "content": self._stock_prompt(symbol, quote, technical)}],
        )
        content = response.content[0].text
        return {"content": content, "recommendation": self._extract_rec(content), "type": "stock", "symbol": symbol.upper()}

    # ── helpers ───────────────────────────────────────────────────────────

    def _extract_rec(self, content: str) -> str:
        c = content.lower()
        if any(w in c for w in ["strong buy", "strong accumulate"]):
            return "strong_buy"
        if any(w in c for w in ["strong sell", "exit immediately"]):
            return "sell"
        if "sell" in c and "don't sell" not in c and "not sell" not in c:
            return "sell"
        if "buy" in c or "accumulate" in c:
            return "buy"
        return "hold"
