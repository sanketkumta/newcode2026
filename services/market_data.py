import yfinance as yf
import pandas as pd
import ta
from typing import Dict, List, Optional
from datetime import datetime


class MarketDataService:

    def normalize_symbol(self, symbol: str) -> str:
        symbol = symbol.upper().strip()
        if symbol.startswith("^"):
            return symbol
        if "." not in symbol:
            return f"{symbol}.NS"
        return symbol

    async def get_quote(self, symbol: str) -> Dict:
        try:
            normalized = self.normalize_symbol(symbol)
            ticker = yf.Ticker(normalized)
            hist = ticker.history(period="5d")

            if hist.empty:
                return {"error": f"No data for {symbol}", "symbol": symbol}

            current_price = float(hist["Close"].iloc[-1])
            prev_price = float(hist["Close"].iloc[-2]) if len(hist) > 1 else current_price
            change = current_price - prev_price
            change_pct = (change / prev_price * 100) if prev_price else 0

            volume = hist["Volume"].iloc[-1]

            return {
                "symbol": symbol.upper(),
                "normalized_symbol": normalized,
                "current_price": round(current_price, 2),
                "previous_close": round(prev_price, 2),
                "change": round(change, 2),
                "change_pct": round(change_pct, 2),
                "volume": int(volume) if not pd.isna(volume) else 0,
                "timestamp": datetime.utcnow().isoformat(),
            }
        except Exception as e:
            return {"error": str(e), "symbol": symbol}

    async def get_technical_indicators(self, symbol: str) -> Dict:
        try:
            normalized = self.normalize_symbol(symbol)
            ticker = yf.Ticker(normalized)
            hist = ticker.history(period="1y")

            if hist.empty or len(hist) < 26:
                return {"error": "Insufficient data", "symbol": symbol}

            close = hist["Close"]
            high = hist["High"]
            low = hist["Low"]

            def safe_float(series, idx=-1):
                val = series.iloc[idx]
                return round(float(val), 4) if not pd.isna(val) else None

            rsi = ta.momentum.RSIIndicator(close, window=14).rsi()
            macd_obj = ta.trend.MACD(close)
            sma_20 = ta.trend.SMAIndicator(close, window=20).sma_indicator()
            sma_50 = ta.trend.SMAIndicator(close, window=50).sma_indicator()
            sma_200 = ta.trend.SMAIndicator(close, window=200).sma_indicator()
            ema_20 = ta.trend.EMAIndicator(close, window=20).ema_indicator()
            bb = ta.volatility.BollingerBands(close, window=20)

            current_price = float(close.iloc[-1])

            return {
                "symbol": symbol.upper(),
                "current_price": round(current_price, 2),
                "rsi": safe_float(rsi),
                "macd": {
                    "macd": safe_float(macd_obj.macd()),
                    "signal": safe_float(macd_obj.macd_signal()),
                    "histogram": safe_float(macd_obj.macd_diff()),
                },
                "moving_averages": {
                    "sma_20": safe_float(sma_20),
                    "sma_50": safe_float(sma_50),
                    "sma_200": safe_float(sma_200),
                    "ema_20": safe_float(ema_20),
                },
                "bollinger_bands": {
                    "upper": safe_float(bb.bollinger_hband()),
                    "middle": safe_float(bb.bollinger_mavg()),
                    "lower": safe_float(bb.bollinger_lband()),
                },
                "52w_high": round(float(high.max()), 2),
                "52w_low": round(float(low.min()), 2),
            }
        except Exception as e:
            return {"error": str(e), "symbol": symbol}

    async def get_market_indices(self) -> Dict:
        indices = {
            "NIFTY 50": "^NSEI",
            "SENSEX": "^BSESN",
            "NIFTY BANK": "^NSEBANK",
        }
        results = {}
        for name, symbol in indices.items():
            results[name] = await self.get_quote(symbol)
        return results

    async def get_portfolio_data(self, holdings: List[Dict]) -> List[Dict]:
        enriched = []
        for holding in holdings:
            quote = await self.get_quote(holding["symbol"])
            technical = await self.get_technical_indicators(holding["symbol"])

            current_price = quote.get("current_price", holding["avg_price"])
            invested = holding["quantity"] * holding["avg_price"]
            current_value = holding["quantity"] * current_price
            pnl = current_value - invested
            pnl_pct = (pnl / invested * 100) if invested > 0 else 0

            rsi = technical.get("rsi")
            macd_hist = (technical.get("macd") or {}).get("histogram", 0) or 0
            sma_50 = (technical.get("moving_averages") or {}).get("sma_50")

            enriched.append(
                {
                    **holding,
                    "current_price": current_price,
                    "invested_value": round(invested, 2),
                    "current_value": round(current_value, 2),
                    "pnl": round(pnl, 2),
                    "pnl_pct": round(pnl_pct, 2),
                    "change": quote.get("change", 0),
                    "change_pct": quote.get("change_pct", 0),
                    "rsi": rsi,
                    "rsi_signal": (
                        "oversold" if (rsi or 50) < 30
                        else "overbought" if (rsi or 50) > 70
                        else "neutral"
                    ),
                    "macd_signal": "bullish" if macd_hist > 0 else "bearish",
                    "above_sma_50": current_price > sma_50 if sma_50 else None,
                    "volume": quote.get("volume", 0),
                }
            )
        return enriched

    async def get_historical_data(self, symbol: str, period: str = "1y") -> List[Dict]:
        try:
            normalized = self.normalize_symbol(symbol)
            ticker = yf.Ticker(normalized)
            hist = ticker.history(period=period)

            result = []
            for date, row in hist.iterrows():
                result.append(
                    {
                        "date": date.strftime("%Y-%m-%d"),
                        "open": round(float(row["Open"]), 2),
                        "high": round(float(row["High"]), 2),
                        "low": round(float(row["Low"]), 2),
                        "close": round(float(row["Close"]), 2),
                        "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else 0,
                    }
                )
            return result
        except Exception:
            return []
