"""
BrowserPool — thin wrapper around StealthBrowser that preserves the original
acquire() / shutdown() interface so all existing adapters work unchanged.

Imported as:
    from bot.browser.pool import BrowserPool, browser_pool
"""
from .stealth_browser import StealthBrowser

# BrowserPool is now just StealthBrowser — same interface, no code change needed
# in runner.py or any adapter.
BrowserPool = StealthBrowser

# Module-level singleton used by the ARQ worker
browser_pool = StealthBrowser(pool_size=3, max_uses=12)
