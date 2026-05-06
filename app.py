import os
import json
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Depends, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse
from dotenv import load_dotenv

load_dotenv()

from database import init_db, get_db, HoldingDB, AnalysisDB, NotificationDB, SettingDB
from models import HoldingCreate, HoldingUpdate, SettingsUpdate
from services.market_data import MarketDataService
from services.scheduler import AnalysisScheduler
from services.ai_analysis import AIAnalysisService

logger = logging.getLogger(__name__)
notification_queue: asyncio.Queue = asyncio.Queue()
market_service = MarketDataService()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    scheduler = AnalysisScheduler(notification_queue)
    scheduler.start()
    yield


app = FastAPI(title="Investment Monitor", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")


# ── helpers ────────────────────────────────────────────────────────────────

def get_setting(db: Session, key: str) -> Optional[str]:
    s = db.query(SettingDB).filter(SettingDB.key == key).first()
    return s.value if s else os.getenv(key.upper())


def set_setting(db: Session, key: str, value: str):
    s = db.query(SettingDB).filter(SettingDB.key == key).first()
    if s:
        s.value = value
    else:
        db.add(SettingDB(key=key, value=value))
    db.commit()


def _get_api_key(db: Session, provider: str) -> Optional[str]:
    key_map = {
        "anthropic": "anthropic_api_key",
        "gemini": "gemini_api_key",
        "groq": "groq_api_key",
    }
    db_key = key_map.get(provider)
    if not db_key:
        return None
    return get_setting(db, db_key) or os.getenv(db_key.upper())


def add_notification(db: Session, type: str, title: str, message: str):
    n = NotificationDB(type=type, title=title, message=message)
    db.add(n)
    db.commit()
    db.refresh(n)
    return n


# ── root ───────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def root():
    with open("static/index.html") as f:
        return f.read()


# ── portfolio ──────────────────────────────────────────────────────────────

@app.get("/api/portfolio")
async def get_portfolio(db: Session = Depends(get_db)):
    holdings = db.query(HoldingDB).all()
    return [
        {
            "id": h.id,
            "symbol": h.symbol,
            "name": h.name or h.symbol,
            "quantity": h.quantity,
            "avg_price": h.avg_price,
            "platform": h.platform,
            "created_at": h.created_at.isoformat() if h.created_at else None,
        }
        for h in holdings
    ]


@app.get("/api/portfolio/enriched")
async def get_portfolio_enriched(db: Session = Depends(get_db)):
    holdings = db.query(HoldingDB).all()
    if not holdings:
        return []
    raw = [
        {
            "id": h.id,
            "symbol": h.symbol,
            "name": h.name or h.symbol,
            "quantity": h.quantity,
            "avg_price": h.avg_price,
            "platform": h.platform,
        }
        for h in holdings
    ]
    return await market_service.get_portfolio_data(raw)


@app.post("/api/portfolio/holding")
async def add_holding(holding: HoldingCreate, db: Session = Depends(get_db)):
    existing = (
        db.query(HoldingDB)
        .filter(HoldingDB.symbol == holding.symbol.upper(), HoldingDB.platform == holding.platform)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"{holding.symbol.upper()} already exists for {holding.platform}. Use update.",
        )

    h = HoldingDB(
        symbol=holding.symbol.upper(),
        name=holding.name or holding.symbol.upper(),
        quantity=holding.quantity,
        avg_price=holding.avg_price,
        platform=holding.platform,
    )
    db.add(h)
    db.commit()
    db.refresh(h)
    return {"id": h.id, "message": "Holding added"}


@app.put("/api/portfolio/holding/{holding_id}")
async def update_holding(holding_id: int, update: HoldingUpdate, db: Session = Depends(get_db)):
    h = db.query(HoldingDB).filter(HoldingDB.id == holding_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Holding not found")
    if update.quantity is not None:
        h.quantity = update.quantity
    if update.avg_price is not None:
        h.avg_price = update.avg_price
    if update.name is not None:
        h.name = update.name
    h.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Updated"}


@app.delete("/api/portfolio/holding/{holding_id}")
async def delete_holding(holding_id: int, db: Session = Depends(get_db)):
    h = db.query(HoldingDB).filter(HoldingDB.id == holding_id).first()
    if not h:
        raise HTTPException(status_code=404, detail="Holding not found")
    db.delete(h)
    db.commit()
    return {"message": "Deleted"}


# ── market data ────────────────────────────────────────────────────────────

@app.get("/api/market/quote/{symbol}")
async def get_quote(symbol: str):
    return await market_service.get_quote(symbol)


@app.get("/api/market/technical/{symbol}")
async def get_technical(symbol: str):
    return await market_service.get_technical_indicators(symbol)


@app.get("/api/market/indices")
async def get_indices():
    return await market_service.get_market_indices()


@app.get("/api/market/history/{symbol}")
async def get_history(symbol: str, period: str = "1y"):
    return await market_service.get_historical_data(symbol, period)


# ── analysis ───────────────────────────────────────────────────────────────

@app.post("/api/analysis/portfolio")
async def run_portfolio_analysis(db: Session = Depends(get_db)):
    provider = get_setting(db, "ai_provider") or "rule_based"
    api_key = _get_api_key(db, provider)

    holdings = db.query(HoldingDB).all()
    if not holdings:
        raise HTTPException(status_code=400, detail="No holdings to analyze. Add some stocks first.")

    raw = [
        {"id": h.id, "symbol": h.symbol, "name": h.name or h.symbol,
         "quantity": h.quantity, "avg_price": h.avg_price, "platform": h.platform}
        for h in holdings
    ]
    enriched = await market_service.get_portfolio_data(raw)
    indices = await market_service.get_market_indices()

    result = AIAnalysisService(provider=provider, api_key=api_key).analyze_portfolio(enriched, indices)

    analysis = AnalysisDB(type="portfolio", content=result["content"], recommendation=result["recommendation"])
    db.add(analysis)
    add_notification(db, "analysis", "Portfolio Analysis Ready",
                     f"Recommendation: {result['recommendation'].replace('_', ' ').upper()}")
    db.commit()

    await notification_queue.put({
        "type": "analysis_complete",
        "title": "Portfolio Analysis Ready",
        "recommendation": result["recommendation"],
        "timestamp": datetime.utcnow().isoformat(),
    })

    return {
        "id": analysis.id,
        "content": result["content"],
        "recommendation": result["recommendation"],
        "created_at": analysis.created_at.isoformat(),
    }


@app.post("/api/analysis/stock/{symbol}")
async def analyze_stock(symbol: str, db: Session = Depends(get_db)):
    provider = get_setting(db, "ai_provider") or "rule_based"
    api_key = _get_api_key(db, provider)

    quote = await market_service.get_quote(symbol)
    technical = await market_service.get_technical_indicators(symbol)

    result = AIAnalysisService(provider=provider, api_key=api_key).analyze_stock(symbol, quote, technical)

    analysis = AnalysisDB(
        type="stock", symbol=symbol.upper(),
        content=result["content"], recommendation=result["recommendation"]
    )
    db.add(analysis)
    add_notification(db, "analysis", f"Analysis: {symbol.upper()}",
                     f"Recommendation: {result['recommendation'].replace('_', ' ').upper()}")
    db.commit()

    await notification_queue.put({
        "type": "stock_analysis",
        "symbol": symbol.upper(),
        "recommendation": result["recommendation"],
        "timestamp": datetime.utcnow().isoformat(),
    })

    return {
        "id": analysis.id,
        "content": result["content"],
        "recommendation": result["recommendation"],
        "symbol": symbol.upper(),
        "created_at": analysis.created_at.isoformat(),
    }


@app.get("/api/analysis/history")
async def get_analysis_history(limit: int = 10, db: Session = Depends(get_db)):
    analyses = db.query(AnalysisDB).order_by(AnalysisDB.created_at.desc()).limit(limit).all()
    return [
        {
            "id": a.id,
            "type": a.type,
            "symbol": a.symbol,
            "content": a.content,
            "recommendation": a.recommendation,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        }
        for a in analyses
    ]


# ── kite ───────────────────────────────────────────────────────────────────

@app.get("/api/kite/login-url")
async def get_kite_login_url(db: Session = Depends(get_db)):
    api_key = get_setting(db, "kite_api_key")
    if not api_key:
        raise HTTPException(status_code=400, detail="Kite API key not configured.")
    from services.kite_service import KiteService
    return {"login_url": KiteService(api_key=api_key, api_secret="").get_login_url()}


@app.post("/api/kite/auth")
async def kite_auth(request_token: str, db: Session = Depends(get_db)):
    api_key = get_setting(db, "kite_api_key")
    api_secret = get_setting(db, "kite_api_secret")
    if not api_key or not api_secret:
        raise HTTPException(status_code=400, detail="Kite credentials not configured.")
    from services.kite_service import KiteService
    session = KiteService(api_key=api_key, api_secret=api_secret).generate_session(request_token)
    set_setting(db, "kite_access_token", session["access_token"])
    return {"message": "Kite authenticated", "user": session.get("user_name")}


@app.get("/api/kite/sync")
async def sync_kite_holdings(db: Session = Depends(get_db)):
    api_key = get_setting(db, "kite_api_key")
    api_secret = get_setting(db, "kite_api_secret")
    access_token = get_setting(db, "kite_access_token")
    if not api_key or not access_token:
        raise HTTPException(status_code=400, detail="Kite not authenticated.")
    from services.kite_service import KiteService
    holdings = KiteService(api_key=api_key, api_secret=api_secret or "", access_token=access_token).get_holdings()

    synced = 0
    for h in holdings:
        existing = (
            db.query(HoldingDB)
            .filter(HoldingDB.symbol == h["symbol"], HoldingDB.platform == "kite")
            .first()
        )
        if existing:
            existing.quantity = h["quantity"]
            existing.avg_price = h["avg_price"]
        else:
            db.add(HoldingDB(symbol=h["symbol"], name=h["symbol"],
                             quantity=h["quantity"], avg_price=h["avg_price"], platform="kite"))
            synced += 1

    db.commit()
    return {"message": f"Synced {synced} new holdings from Kite", "total": len(holdings)}


# ── notifications ──────────────────────────────────────────────────────────

@app.get("/api/notifications")
async def get_notifications(db: Session = Depends(get_db), limit: int = 30):
    notifs = db.query(NotificationDB).order_by(NotificationDB.created_at.desc()).limit(limit).all()
    return [
        {
            "id": n.id, "type": n.type, "title": n.title,
            "message": n.message, "is_read": n.is_read,
            "created_at": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notifs
    ]


@app.put("/api/notifications/read-all")
async def mark_all_read(db: Session = Depends(get_db)):
    db.query(NotificationDB).update({"is_read": True})
    db.commit()
    return {"message": "All read"}


@app.put("/api/notifications/{notification_id}/read")
async def mark_read(notification_id: int, db: Session = Depends(get_db)):
    n = db.query(NotificationDB).filter(NotificationDB.id == notification_id).first()
    if n:
        n.is_read = True
        db.commit()
    return {"message": "Marked read"}


@app.get("/api/notifications/stream")
async def notification_stream(request: Request):
    async def event_generator():
        while True:
            if await request.is_disconnected():
                break
            try:
                notif = notification_queue.get_nowait()
                if not notif.get("silent"):
                    yield {"event": "notification", "data": json.dumps(notif)}
            except asyncio.QueueEmpty:
                yield {"event": "heartbeat", "data": json.dumps({"ts": datetime.utcnow().isoformat()})}
                await asyncio.sleep(5)

    return EventSourceResponse(event_generator())


# ── settings ───────────────────────────────────────────────────────────────

@app.get("/api/settings")
async def get_settings(db: Session = Depends(get_db)):
    settings = db.query(SettingDB).all()
    result = {}
    for s in settings:
        is_sensitive = any(w in s.key for w in ["key", "secret", "token"])
        result[s.key] = "••••••••" if is_sensitive and s.value else s.value
    return result


@app.post("/api/settings")
async def update_settings(settings: SettingsUpdate, db: Session = Depends(get_db)):
    mapping = {
        "ai_provider": settings.ai_provider,
        "gemini_api_key": settings.gemini_api_key,
        "groq_api_key": settings.groq_api_key,
        "anthropic_api_key": settings.anthropic_api_key,
        "kite_api_key": settings.kite_api_key,
        "kite_api_secret": settings.kite_api_secret,
        "analysis_interval_hours": str(settings.analysis_interval_hours) if settings.analysis_interval_hours else None,
        "price_alert_threshold": str(settings.price_alert_threshold) if settings.price_alert_threshold else None,
    }
    for key, value in mapping.items():
        if value:
            set_setting(db, key, value)
    return {"message": "Settings saved"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
