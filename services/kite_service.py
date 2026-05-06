from typing import Dict, List, Optional


class KiteService:
    def __init__(self, api_key: str, api_secret: str, access_token: Optional[str] = None):
        from kiteconnect import KiteConnect

        self.kite = KiteConnect(api_key=api_key)
        self.api_secret = api_secret
        if access_token:
            self.kite.set_access_token(access_token)

    def get_login_url(self) -> str:
        return self.kite.login_url()

    def generate_session(self, request_token: str) -> Dict:
        session = self.kite.generate_session(request_token, api_secret=self.api_secret)
        return {
            "access_token": session["access_token"],
            "user_id": session.get("user_id"),
            "user_name": session.get("user_name"),
        }

    def get_holdings(self) -> List[Dict]:
        holdings = self.kite.holdings()
        return [
            {
                "symbol": h["tradingsymbol"],
                "name": h.get("tradingsymbol"),
                "quantity": h["quantity"],
                "avg_price": h["average_price"],
                "current_price": h.get("last_price", h["average_price"]),
                "pnl": h.get("pnl", 0),
                "platform": "kite",
            }
            for h in holdings
            if h["quantity"] > 0
        ]

    def get_positions(self) -> Dict:
        return self.kite.positions()
