"""
BrowserPool — manages a fixed pool of Playwright browser contexts.

Each worker process creates one pool at startup and keeps it alive.
Tasks check out a context, use it, return it. Contexts are recycled
after max_uses to prevent memory leaks and cookie accumulation.
"""
import asyncio
import random
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Optional

from playwright.async_api import async_playwright, Browser, BrowserContext

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
]

LAUNCH_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--no-first-run",
    "--no-zygote",
    "--disable-gpu",
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
    "--lang=en-US,en;q=0.9",
    "--window-size=1366,768",
]

# Injected into every page to remove bot fingerprints
STEALTH_SCRIPT = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'plugins',   { get: () => [1, 2, 3, 4, 5] });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
window.chrome = { runtime: {}, app: {}, csi: () => {}, loadTimes: () => {} };
Object.defineProperty(screen, 'width',  { get: () => 1366 });
Object.defineProperty(screen, 'height', { get: () => 768 });
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
"""


@dataclass
class _Slot:
    context:   BrowserContext
    in_use:    bool = False
    use_count: int  = 0


class BrowserPool:
    """
    Thread-safe pool of Playwright browser contexts.

    Usage:
        pool = BrowserPool(size=3)
        await pool.start()

        async with pool.acquire() as ctx:
            page = await ctx.new_page()
            ...   # use page
        # ctx is returned to the pool automatically

        await pool.shutdown()
    """

    def __init__(self, size: int = 3, max_uses: int = 15):
        self._size     = size
        self._max_uses = max_uses
        self._pool:    list[_Slot] = []
        self._browser: Optional[Browser] = None
        self._lock     = asyncio.Lock()
        self._pw       = None

    async def start(self):
        """Launch browser and fill pool. Call once at worker startup."""
        self._pw      = await async_playwright().start()
        self._browser = await self._pw.chromium.launch(
            headless=True,
            args=LAUNCH_ARGS,
        )
        for _ in range(self._size):
            ctx = await self._new_context()
            self._pool.append(_Slot(context=ctx))

    async def _new_context(self) -> BrowserContext:
        ua  = random.choice(USER_AGENTS)
        ctx = await self._browser.new_context(
            user_agent        = ua,
            viewport          = {"width": 1366, "height": 768},
            locale            = "en-US",
            timezone_id       = "America/New_York",
            java_script_enabled = True,
            accept_downloads  = True,
        )
        await ctx.add_init_script(STEALTH_SCRIPT)
        return ctx

    @asynccontextmanager
    async def acquire(self):
        """
        Check out a context from the pool.
        If all slots are busy, creates a temporary overflow context.
        Returns context to pool (or closes overflow) when done.
        """
        slot: Optional[_Slot] = None
        overflow = False

        async with self._lock:
            for s in self._pool:
                if not s.in_use:
                    s.in_use = True
                    slot = s
                    break
            if slot is None:
                # All slots busy — create overflow context
                ctx  = await self._new_context()
                slot = _Slot(context=ctx, in_use=True)
                self._pool.append(slot)
                overflow = True

        try:
            yield slot.context
        finally:
            slot.use_count += 1

            if overflow or slot.use_count >= self._max_uses:
                # Recycle: close and replace
                async with self._lock:
                    try:
                        await slot.context.close()
                    except Exception:
                        pass
                    if overflow:
                        self._pool.remove(slot)
                    else:
                        slot.context   = await self._new_context()
                        slot.use_count = 0
                        slot.in_use    = False
            else:
                slot.in_use = False

    async def shutdown(self):
        """Close all contexts and the browser. Call at worker shutdown."""
        for slot in self._pool:
            try:
                await slot.context.close()
            except Exception:
                pass
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()


# Module-level singleton — imported by worker and bot code
browser_pool = BrowserPool(size=3, max_uses=15)
