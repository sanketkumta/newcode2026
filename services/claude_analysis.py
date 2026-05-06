import anthropic
from typing import List, Dict
from datetime import datetime

FINANCIAL_SYSTEM_PROMPT = """You are an expert Indian stock market financial analyst specializing in:
- NSE and BSE listed equities
- Technical analysis: RSI, MACD, Moving Averages (SMA/EMA), Bollinger Bands
- Fundamental analysis and valuation
- Indian macro-economics, RBI policy, sectoral themes
- Retail investment strategy via Groww and Zerodha Kite

When analyzing, structure your response with these sections:
## 📊 Market Assessment
Brief overall view (bullish/bearish/neutral) with key drivers.

## 🔍 Key Observations
3-5 critical technical and fundamental points.

## 🎯 Recommendation
Clear BUY / SELL / HOLD with specific reasoning.
Include entry range, target price, and stop-loss in ₹.

## ⚠️ Risk Factors
2-3 risks to monitor closely.

## ✅ Action Items
Concrete steps for the investor with price levels and timing.

Guidelines:
- RSI < 30 = oversold (potential buy), RSI > 70 = overbought (potential sell)
- Price above 50 SMA = bullish trend, below = bearish
- MACD histogram positive = bullish momentum
- Bollinger Band squeeze = potential breakout
- Express all prices in Indian Rupees (₹)
- Be specific about market timing (intraday / swing / long-term)
- Consider Indian market hours: 9:15 AM – 3:30 PM IST"""


class ClaudeAnalysisService:
    def __init__(self, api_key: str):
        self.client = anthropic.Anthropic(api_key=api_key)

    def analyze_portfolio(self, portfolio_data: List[Dict], market_indices: Dict) -> Dict:
        total_invested = sum(h.get("invested_value", 0) for h in portfolio_data)
        total_current = sum(h.get("current_value", 0) for h in portfolio_data)
        total_pnl = total_current - total_invested
        total_pnl_pct = (total_pnl / total_invested * 100) if total_invested > 0 else 0

        prompt = f"""PORTFOLIO ANALYSIS — {datetime.now().strftime('%d %b %Y, %H:%M IST')}

=== PORTFOLIO SUMMARY ===
Total Invested: ₹{total_invested:,.2f}
Current Value:  ₹{total_current:,.2f}
Total P&L:      ₹{total_pnl:+,.2f} ({total_pnl_pct:+.2f}%)

=== MARKET INDICES ===
"""
        for name, data in market_indices.items():
            if isinstance(data, dict) and "current_price" in data:
                prompt += f"{name}: ₹{data['current_price']:,.2f} ({data.get('change_pct', 0):+.2f}%)\n"

        prompt += "\n=== HOLDINGS DETAIL ===\n"
        for h in portfolio_data:
            rsi = h.get("rsi", "N/A")
            prompt += f"""
▸ {h['symbol']} [{h.get('platform', 'manual').upper()}]
  Qty: {h['quantity']} | Avg: ₹{h['avg_price']:,.2f} | LTP: ₹{h.get('current_price', 0):,.2f}
  Invested: ₹{h.get('invested_value', 0):,.2f} | Current: ₹{h.get('current_value', 0):,.2f}
  P&L: ₹{h.get('pnl', 0):+,.2f} ({h.get('pnl_pct', 0):+.2f}%)
  Day Change: {h.get('change_pct', 0):+.2f}% | RSI: {rsi} ({h.get('rsi_signal', 'N/A')})
  MACD: {h.get('macd_signal', 'N/A')} | Above 50-SMA: {h.get('above_sma_50', 'N/A')}
"""

        prompt += """
Please provide:
1. Overall portfolio health and diversification assessment
2. Top stocks to add/average (with reasons and entry levels)
3. Stocks to reduce or exit (with target exit prices)
4. Portfolio rebalancing suggestions
5. Key opportunities and risks for next 2-4 weeks
6. Specific actionable items with price levels"""

        response = self.client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2500,
            system=[
                {
                    "type": "text",
                    "text": FINANCIAL_SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": prompt}],
        )

        content = response.content[0].text
        recommendation = self._extract_recommendation(content)

        return {
            "content": content,
            "recommendation": recommendation,
            "type": "portfolio",
            "input_tokens": response.usage.input_tokens,
            "cache_read_tokens": getattr(response.usage, "cache_read_input_tokens", 0),
        }

    def analyze_stock(self, symbol: str, quote: Dict, technical: Dict) -> Dict:
        ma = technical.get("moving_averages") or {}
        bb = technical.get("bollinger_bands") or {}
        macd = technical.get("macd") or {}

        prompt = f"""STOCK ANALYSIS — {symbol.upper()} — {datetime.now().strftime('%d %b %Y, %H:%M IST')}

=== PRICE DATA ===
LTP:            ₹{quote.get('current_price', 0):,.2f}
Day Change:     ₹{quote.get('change', 0):+.2f} ({quote.get('change_pct', 0):+.2f}%)
Previous Close: ₹{quote.get('previous_close', 0):,.2f}
Volume:         {quote.get('volume', 0):,}

=== TECHNICAL INDICATORS ===
RSI (14):      {technical.get('rsi', 'N/A')}
MACD:          {macd.get('macd', 'N/A')}
MACD Signal:   {macd.get('signal', 'N/A')}
MACD Hist:     {macd.get('histogram', 'N/A')}

=== MOVING AVERAGES ===
20 SMA:  ₹{ma.get('sma_20', 'N/A')}
50 SMA:  ₹{ma.get('sma_50', 'N/A')}
200 SMA: ₹{ma.get('sma_200', 'N/A')}
20 EMA:  ₹{ma.get('ema_20', 'N/A')}

=== BOLLINGER BANDS ===
Upper:  ₹{bb.get('upper', 'N/A')}
Middle: ₹{bb.get('middle', 'N/A')}
Lower:  ₹{bb.get('lower', 'N/A')}

=== RANGE ===
52W High: ₹{technical.get('52w_high', 'N/A')}
52W Low:  ₹{technical.get('52w_low', 'N/A')}

Provide a complete technical analysis with BUY/SELL/HOLD recommendation,
entry price range, target price, stop-loss, and time horizon."""

        response = self.client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=1500,
            system=[
                {
                    "type": "text",
                    "text": FINANCIAL_SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": prompt}],
        )

        content = response.content[0].text
        recommendation = self._extract_recommendation(content)

        return {
            "content": content,
            "recommendation": recommendation,
            "type": "stock",
            "symbol": symbol.upper(),
        }

    def _extract_recommendation(self, content: str) -> str:
        content_lower = content.lower()
        if any(w in content_lower for w in ["strong buy", "accumulate aggressively", "strong accumulate"]):
            return "strong_buy"
        if any(w in content_lower for w in ["strong sell", "exit immediately", "avoid"]):
            return "sell"
        if "sell" in content_lower and "don't sell" not in content_lower and "not sell" not in content_lower:
            return "sell"
        if "buy" in content_lower or "accumulate" in content_lower:
            return "buy"
        return "hold"
