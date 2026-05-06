from pydantic import BaseModel
from typing import Optional


class HoldingCreate(BaseModel):
    symbol: str
    name: Optional[str] = None
    quantity: float
    avg_price: float
    platform: str = "manual"


class HoldingUpdate(BaseModel):
    quantity: Optional[float] = None
    avg_price: Optional[float] = None
    name: Optional[str] = None


class SettingsUpdate(BaseModel):
    ai_provider: Optional[str] = None       # rule_based | gemini | groq | anthropic
    gemini_api_key: Optional[str] = None
    groq_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    kite_api_key: Optional[str] = None
    kite_api_secret: Optional[str] = None
    analysis_interval_hours: Optional[int] = None
    price_alert_threshold: Optional[float] = None
