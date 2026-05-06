import asyncio
from datetime import datetime
from typing import Optional
import pytz

IST = pytz.timezone("Asia/Kolkata")


class AnalysisScheduler:
    def __init__(self, notification_queue: asyncio.Queue):
        self.queue = notification_queue
        self._scheduler = None

    def is_market_open(self) -> bool:
        now = datetime.now(IST)
        if now.weekday() >= 5:
            return False
        open_time = now.replace(hour=9, minute=15, second=0, microsecond=0)
        close_time = now.replace(hour=15, minute=30, second=0, microsecond=0)
        return open_time <= now <= close_time

    def start(self):
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from apscheduler.triggers.cron import CronTrigger

        self._scheduler = AsyncIOScheduler(timezone=IST)

        # Hourly portfolio check during market hours
        self._scheduler.add_job(
            self._market_open_check,
            CronTrigger(minute=0, hour="9-15", day_of_week="mon-fri"),
            id="hourly_check",
            replace_existing=True,
        )

        # Price alert check every 15 min during market
        self._scheduler.add_job(
            self._price_alert_check,
            CronTrigger(minute="*/15", hour="9-15", day_of_week="mon-fri"),
            id="price_check",
            replace_existing=True,
        )

        # End of day notification
        self._scheduler.add_job(
            self._end_of_day,
            CronTrigger(hour=15, minute=35, day_of_week="mon-fri"),
            id="eod",
            replace_existing=True,
        )

        # Market open notification
        self._scheduler.add_job(
            self._market_open_notify,
            CronTrigger(hour=9, minute=15, day_of_week="mon-fri"),
            id="market_open",
            replace_existing=True,
        )

        self._scheduler.start()

    async def _market_open_notify(self):
        await self.queue.put(
            {
                "type": "market",
                "title": "Market Open",
                "message": "NSE/BSE markets are now open. Have a great trading day!",
                "timestamp": datetime.now(IST).isoformat(),
            }
        )

    async def _market_open_check(self):
        await self.queue.put(
            {
                "type": "analysis_trigger",
                "title": "Scheduled Analysis",
                "message": "Time for your hourly portfolio check. Click 'Analyze Portfolio' to get AI insights.",
                "timestamp": datetime.now(IST).isoformat(),
            }
        )

    async def _price_alert_check(self):
        await self.queue.put(
            {
                "type": "price_check",
                "title": "Price Update",
                "message": "Refreshing portfolio prices...",
                "timestamp": datetime.now(IST).isoformat(),
                "silent": True,
            }
        )

    async def _end_of_day(self):
        await self.queue.put(
            {
                "type": "eod",
                "title": "Market Closed",
                "message": "Markets closed for the day. Run end-of-day portfolio analysis for a full summary.",
                "timestamp": datetime.now(IST).isoformat(),
            }
        )
