"""
StealthBrowser — production-ready anti-detection Playwright wrapper.

Techniques applied per context:
  1. navigator.webdriver   → undefined (not just false)
  2. navigator.plugins     → realistic PluginArray with 3 entries
  3. navigator.languages   → ['en-US', 'en']
  4. navigator.platform    → matches OS implied by user agent
  5. navigator.hardwareConcurrency / deviceMemory → profile values
  6. window.chrome         → full API surface expected by sites
  7. Permissions API       → notifications returns 'default' not a rejected promise
  8. Canvas 2D             → pixel-level noise (changes fingerprint hash)
  9. WebGL                 → UNMASKED_VENDOR / RENDERER spoofed to match profile
 10. AudioContext          → base latency jittered
 11. navigator.connection  → realistic 4G values
 12. Remove Playwright artifacts (__playwright, window.playwright, cdc_ vars)
 13. outerWidth / outerHeight → match viewport
 14. screen dimensions      → match profile

Each BrowserContext gets:
  - A randomly chosen BrowserProfile (UA, viewport, timezone, hw all consistent)
  - All stealth init scripts injected before any page script runs
  - Session persistence via session_manager (DB-backed)
"""
import asyncio
import logging
import random
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Optional

from playwright.async_api import async_playwright, Browser, BrowserContext, Playwright

from .user_agents import BrowserProfile, random_profile

logger = logging.getLogger(__name__)

# ── Launch args ────────────────────────────────────────────────────────────────

_LAUNCH_ARGS = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-accelerated-2d-canvas",
    "--disable-gpu",
    "--no-first-run",
    "--no-zygote",
    # The single most important flag for headless detection
    "--disable-blink-features=AutomationControlled",
    "--disable-features=IsolateOrigins,site-per-process",
    # Prevent infobars that expose automation
    "--disable-infobars",
    # Mimic a real browser's codec support
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    # Language headers
    "--lang=en-US",
    # Prevent background throttling
    "--disable-backgrounding-occluded-windows",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
]


# ── Stealth init script template ───────────────────────────────────────────────

def _build_stealth_script(profile: BrowserProfile) -> str:
    """
    Build the JavaScript init script for a specific browser profile.
    Injected before page scripts run so our overrides win.
    """
    return f"""
(function() {{
    'use strict';

    // ── 1. Remove webdriver traces ─────────────────────────────────────────
    const _delete = (obj, prop) => {{
        try {{ Object.defineProperty(obj, prop, {{ get: () => undefined }}); }} catch(e) {{}}
    }};
    _delete(navigator, 'webdriver');
    // Delete cdc_ variables injected by ChromeDriver
    for (const key of Object.keys(window)) {{
        if (key.startsWith('cdc_') || key.startsWith('__playwright') || key === 'playwright') {{
            try {{ delete window[key]; }} catch(e) {{}}
        }}
    }}

    // ── 2. Realistic plugins ───────────────────────────────────────────────
    const _plugins = [
        {{ name: 'Chrome PDF Plugin',   filename: 'internal-pdf-viewer',               description: 'Portable Document Format', version: '' }},
        {{ name: 'Chrome PDF Viewer',   filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '',                         version: '' }},
        {{ name: 'Native Client',       filename: 'internal-nacl-plugin',              description: '',                         version: '' }},
    ];
    const _pa = Object.create(PluginArray.prototype);
    Object.defineProperty(_pa, 'length', {{ get: () => _plugins.length }});
    _plugins.forEach((p, i) => {{
        const plugin = Object.create(Plugin.prototype);
        Object.assign(plugin, p);
        Object.defineProperty(_pa, i, {{ get: () => plugin }});
        Object.defineProperty(_pa, p.name, {{ get: () => plugin }});
    }});
    _pa.item = i => _pa[i] || null;
    _pa.namedItem = n => _pa[n] || null;
    _pa.refresh = () => {{}};
    Object.defineProperty(navigator, 'plugins', {{ get: () => _pa }});

    // ── 3. Languages ──────────────────────────────────────────────────────
    Object.defineProperty(navigator, 'languages', {{ get: () => ['en-US', 'en'] }});

    // ── 4. Platform ───────────────────────────────────────────────────────
    Object.defineProperty(navigator, 'platform', {{ get: () => '{profile.platform}' }});

    // ── 5. Hardware ───────────────────────────────────────────────────────
    Object.defineProperty(navigator, 'hardwareConcurrency', {{ get: () => {profile.hardware_concurrency} }});
    Object.defineProperty(navigator, 'deviceMemory', {{ get: () => {profile.device_memory} }});

    // ── 6. window.chrome ──────────────────────────────────────────────────
    if (!window.chrome || typeof window.chrome !== 'object') {{
        window.chrome = {{}};
    }}
    window.chrome.app = {{
        isInstalled: false,
        InstallState: {{ DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }},
        RunningState: {{ CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }},
        getDetails:      function() {{ return null; }},
        getIsInstalled:  function() {{ return false; }},
        installState:    function(cb) {{ cb(window.chrome.app.InstallState.NOT_INSTALLED); }},
        runningState:    function() {{ return window.chrome.app.RunningState.CANNOT_RUN; }},
    }};
    window.chrome.runtime = {{
        PlatformOs:      {{ MAC: 'mac', WIN: 'win', ANDROID: 'android', CROS: 'cros', LINUX: 'linux', OPENBSD: 'openbsd' }},
        PlatformArch:    {{ ARM: 'arm', ARM64: 'arm64', X86_32: 'x86-32', X86_64: 'x86-64', MIPS: 'mips', MIPS64: 'mips64' }},
        connect:         function() {{ return {{ onMessage: {{ addListener: function() {{}} }}, postMessage: function() {{}} }}; }},
        sendMessage:     function() {{}},
        id:              undefined,
    }};
    window.chrome.csi    = function() {{ return {{ startE: Date.now(), onloadT: Date.now(), pageT: Math.random() * 5000, tran: 15 }}; }};
    window.chrome.loadTimes = function() {{
        const now = Date.now() / 1000;
        return {{
            requestTime: now - Math.random() * 2,
            startLoadTime: now - Math.random(),
            commitLoadTime: now - Math.random() * 0.5,
            finishDocumentLoadTime: now - Math.random() * 0.1,
            finishLoadTime: now,
            firstPaintTime: now - Math.random() * 0.05,
            firstPaintAfterLoadTime: 0,
            navigationType: 'Other',
            wasFetchedViaSpdy: false,
            wasNpnNegotiated: false,
            npnNegotiatedProtocol: 'unknown',
            wasAlternateProtocolAvailable: false,
            connectionInfo: 'http/1.1',
        }};
    }};

    // ── 7. Permissions API ────────────────────────────────────────────────
    if (navigator.permissions && navigator.permissions.query) {{
        const _origQuery = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = function(params) {{
            if (params && params.name === 'notifications') {{
                return Promise.resolve({{ state: 'default', onchange: null }});
            }}
            return _origQuery(params);
        }};
    }}

    // ── 8. Canvas 2D fingerprint noise ────────────────────────────────────
    const _origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {{
        const ctx2d = _origGetContext.call(this, type, ...args);
        if (!ctx2d || type !== '2d') return ctx2d;
        if (ctx2d.__noisyGetImageData) return ctx2d;  // already patched
        const _origGID = ctx2d.getImageData.bind(ctx2d);
        ctx2d.getImageData = function(x, y, w, h) {{
            const imageData = _origGID(x, y, w, h);
            // XOR every 128th byte — changes hash, invisible to human eye
            for (let i = 0; i < imageData.data.length; i += 128) {{
                imageData.data[i] ^= 1;
            }}
            return imageData;
        }};
        const _origFillText = ctx2d.fillText.bind(ctx2d);
        ctx2d.fillText = function(text, x, y, ...rest) {{
            // Nudge text rendering by sub-pixel — affects fingerprint
            return _origFillText(text, x + 0.0001, y + 0.0001, ...rest);
        }};
        ctx2d.__noisyGetImageData = true;
        return ctx2d;
    }};

    // ── 9. WebGL fingerprint ──────────────────────────────────────────────
    const _patchWebGL = (ctor) => {{
        if (!window[ctor]) return;
        const _origGP = window[ctor].prototype.getParameter;
        window[ctor].prototype.getParameter = function(param) {{
            if (param === 37445) return '{profile.webgl_vendor}';    // UNMASKED_VENDOR_WEBGL
            if (param === 37446) return '{profile.webgl_renderer}';  // UNMASKED_RENDERER_WEBGL
            return _origGP.call(this, param);
        }};
    }};
    _patchWebGL('WebGLRenderingContext');
    _patchWebGL('WebGL2RenderingContext');

    // ── 10. AudioContext fingerprint ──────────────────────────────────────
    if (window.AudioContext || window.webkitAudioContext) {{
        const _AC = window.AudioContext || window.webkitAudioContext;
        const _origAC = _AC.prototype.__lookupGetter__
            ? _AC.prototype.__lookupGetter__('baseLatency') : null;
        Object.defineProperty(_AC.prototype, 'baseLatency', {{
            get: function() {{
                const orig = _origAC ? _origAC.call(this) : 0.005333333333333333;
                return orig + (Math.random() * 0.0001 - 0.00005);
            }}
        }});
    }}

    // ── 11. navigator.connection ──────────────────────────────────────────
    const _conn = {{
        effectiveType: '4g',
        type: 'wifi',
        rtt: 50 + Math.floor(Math.random() * 30),
        downlink: 8 + Math.random() * 4,
        downlinkMax: Infinity,
        saveData: false,
        onchange: null,
        ontypechange: null,
        addEventListener: function() {{}},
        removeEventListener: function() {{}},
        dispatchEvent: function() {{ return true; }},
    }};
    try {{
        Object.defineProperty(navigator, 'connection', {{ get: () => _conn }});
        Object.defineProperty(navigator, 'mozConnection', {{ get: () => _conn }});
        Object.defineProperty(navigator, 'webkitConnection', {{ get: () => _conn }});
    }} catch(e) {{}}

    // ── 12. Screen dimensions ─────────────────────────────────────────────
    try {{
        Object.defineProperty(screen, 'width',      {{ get: () => {profile.screen_w} }});
        Object.defineProperty(screen, 'height',     {{ get: () => {profile.screen_h} }});
        Object.defineProperty(screen, 'availWidth', {{ get: () => {profile.screen_w} }});
        Object.defineProperty(screen, 'availHeight',{{ get: () => {profile.screen_h} - 40 }});
        Object.defineProperty(window, 'outerWidth', {{ get: () => {profile.viewport_w} }});
        Object.defineProperty(window, 'outerHeight',{{ get: () => {profile.viewport_h} + 88 }});
    }} catch(e) {{}}

    // ── 13. Iframe contentWindow stealth (re-apply) ───────────────────────
    // Some detection scripts check inside iframes
    const _origAttach = HTMLIFrameElement.prototype.__lookupGetter__
        ? HTMLIFrameElement.prototype.__lookupGetter__('contentWindow') : null;
    if (_origAttach) {{
        Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {{
            get: function() {{
                const cw = _origAttach.call(this);
                if (!cw) return cw;
                try {{
                    Object.defineProperty(cw.navigator, 'webdriver', {{ get: () => undefined }});
                }} catch(e) {{}}
                return cw;
            }}
        }});
    }}

}})();
"""


# ── StealthBrowser ─────────────────────────────────────────────────────────────

@dataclass
class _Slot:
    context:   BrowserContext
    profile:   BrowserProfile
    in_use:    bool = False
    use_count: int  = 0


class StealthBrowser:
    """
    Drop-in replacement for BrowserPool with full anti-detection.

    Usage:
        sb = StealthBrowser(pool_size=3)
        await sb.start()

        async with sb.acquire() as ctx:
            page = await ctx.new_page()
            ...

        await sb.shutdown()

    The yielded object is a plain Playwright BrowserContext — all adapters
    continue to work without modification. Stealth is injected at the
    context level (init scripts) so every page automatically inherits it.
    """

    def __init__(self, pool_size: int = 3, max_uses: int = 12, headless: bool = True):
        self._pool_size = pool_size
        self._max_uses  = max_uses
        self._headless  = headless
        self._pool:     list[_Slot] = []
        self._browser:  Optional[Browser] = None
        self._pw:       Optional[Playwright] = None
        self._lock      = asyncio.Lock()

    async def start(self) -> None:
        self._pw      = await async_playwright().start()
        self._browser = await self._pw.chromium.launch(
            headless = self._headless,
            args     = _LAUNCH_ARGS,
        )
        logger.info("StealthBrowser: launched (headless=%s)", self._headless)
        for _ in range(self._pool_size):
            slot = await self._new_slot()
            self._pool.append(slot)

    async def _new_slot(self) -> _Slot:
        profile = random_profile()
        ctx     = await self._new_context(profile)
        return _Slot(context=ctx, profile=profile)

    async def _new_context(self, profile: BrowserProfile, storage_state: Optional[dict] = None) -> BrowserContext:
        ctx = await self._browser.new_context(
            user_agent          = profile.user_agent,
            viewport            = {"width": profile.viewport_w, "height": profile.viewport_h},
            locale              = profile.language,
            timezone_id         = profile.timezone,
            java_script_enabled = True,
            accept_downloads    = True,
            storage_state       = storage_state,
            # Tell sites we accept these media types
            extra_http_headers  = {
                "Accept-Language": f"{profile.language},en;q=0.9",
                "sec-ch-ua-platform": (
                    '"Windows"' if "Win" in profile.platform else
                    '"macOS"'   if "Mac" in profile.platform else
                    '"Linux"'
                ),
            },
        )
        await ctx.add_init_script(_build_stealth_script(profile))
        logger.debug(
            "StealthBrowser: new context — %s / %s / %s",
            profile.user_agent[:60], profile.timezone, profile.platform,
        )
        return ctx

    @asynccontextmanager
    async def acquire(self, storage_state: Optional[dict] = None):
        """
        Check out a context. If the pool is exhausted, create an overflow context.
        Recycles the slot after max_uses to prevent memory/cookie accumulation.
        """
        if storage_state is not None:
            profile = random_profile()
            ctx = await self._new_context(profile, storage_state=storage_state)
            try:
                yield ctx
            finally:
                try:
                    await ctx.close()
                except Exception:
                    pass
            return

        slot: Optional[_Slot] = None
        overflow = False

        async with self._lock:
            for s in self._pool:
                if not s.in_use:
                    s.in_use = True
                    slot = s
                    break
            if slot is None:
                slot     = await self._new_slot()
                slot.in_use = True
                self._pool.append(slot)
                overflow = True

        try:
            yield slot.context
        finally:
            slot.use_count += 1
            if overflow or slot.use_count >= self._max_uses:
                async with self._lock:
                    try:
                        await slot.context.close()
                    except Exception:
                        pass
                    if overflow:
                        self._pool.remove(slot)
                    else:
                        new_slot         = await self._new_slot()
                        slot.context     = new_slot.context
                        slot.profile     = new_slot.profile
                        slot.use_count   = 0
                        slot.in_use      = False
            else:
                slot.in_use = False

    async def shutdown(self) -> None:
        for slot in self._pool:
            try:
                await slot.context.close()
            except Exception:
                pass
        if self._browser:
            await self._browser.close()
        if self._pw:
            await self._pw.stop()
        logger.info("StealthBrowser: shut down cleanly")

    # ── Convenience: create a single one-shot context (for verify endpoint) ──

    @classmethod
    async def one_shot_context(cls) -> tuple[BrowserContext, "StealthBrowser"]:
        """
        Create a single stealth context without a pool — for short-lived tasks
        like credential verification. Caller is responsible for calling shutdown().

        Usage:
            ctx, sb = await StealthBrowser.one_shot_context()
            try:
                page = await ctx.new_page()
                ...
            finally:
                await sb.shutdown()
        """
        sb = cls(pool_size=1, headless=True)
        await sb.start()
        # Return the first slot's context directly
        slot = sb._pool[0]
        slot.in_use = True
        return slot.context, sb
