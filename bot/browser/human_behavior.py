"""
Human behavior simulation — mouse curves, typing, scrolling.

All methods are static so any adapter can import and use them without
needing to inherit from a base class.
"""
import asyncio
import math
import random
from typing import Optional, Tuple

from playwright.async_api import Page


# ── Bezier curve utilities ─────────────────────────────────────────────────────

def _cubic_bezier(t: float, p0: Tuple, p1: Tuple, p2: Tuple, p3: Tuple) -> Tuple[float, float]:
    mt = 1 - t
    x = mt**3 * p0[0] + 3*mt**2*t * p1[0] + 3*mt*t**2 * p2[0] + t**3 * p3[0]
    y = mt**3 * p0[1] + 3*mt**2*t * p1[1] + 3*mt*t**2 * p2[1] + t**3 * p3[1]
    return x, y


def _curved_path(
    start: Tuple[float, float],
    end:   Tuple[float, float],
    steps: int = 28,
) -> list[Tuple[float, float]]:
    """
    Cubic bezier path between two points with randomised control points.
    Control points are perturbed to create natural-looking curves.
    """
    sx, sy = start
    ex, ey = end
    dist = math.hypot(ex - sx, ey - sy)

    # Control point spread scales with distance
    spread = dist * random.uniform(0.3, 0.6)
    cp1 = (sx + random.uniform(-spread, spread), sy + random.uniform(-spread, spread))
    cp2 = (ex + random.uniform(-spread, spread), ey + random.uniform(-spread, spread))

    path: list[Tuple[float, float]] = []
    for i in range(steps + 1):
        t = i / steps
        # Ease-in-out so the cursor accelerates then decelerates
        t_eased = t * t * (3 - 2 * t)
        px, py = _cubic_bezier(t_eased, start, cp1, cp2, end)
        path.append((round(px, 1), round(py, 1)))

    return path


# ── HumanBehavior ─────────────────────────────────────────────────────────────

class HumanBehavior:
    """
    Static helpers for human-like Playwright interactions.

    Usage in any adapter:
        from bot.browser.human_behavior import HumanBehavior as H
        await H.click(page, "#submit-btn")
        await H.type(page, "#email", "user@example.com")
        await H.scroll(page, "down", 600)
    """

    # Last known mouse position — updated on every move so paths chain smoothly
    _last_pos: Tuple[float, float] = (640.0, 400.0)

    @classmethod
    async def move(cls, page: Page, x: float, y: float) -> None:
        """Move the mouse along a bezier curve to (x, y)."""
        path = _curved_path(cls._last_pos, (x, y), steps=random.randint(20, 35))
        for px, py in path:
            await page.mouse.move(px, py)
            await asyncio.sleep(random.uniform(0.003, 0.016))
        cls._last_pos = (x, y)

    @classmethod
    async def click(cls, page: Page, selector: str, timeout: int = 8000) -> None:
        """
        Locate element, move to a random spot inside it along a curved path,
        optionally overshoot and correct, then click with natural press duration.
        """
        loc = page.locator(selector).first
        box = await loc.bounding_box(timeout=timeout)

        if not box:
            # Fallback to Playwright's built-in click if element has no box
            await loc.click()
            return

        # Target a random interior point (not always dead-center)
        tx = box["x"] + box["width"]  * random.uniform(0.2, 0.8)
        ty = box["y"] + box["height"] * random.uniform(0.2, 0.8)

        await cls.move(page, tx, ty)

        # Micro-pause before pressing (human reaction settling)
        await asyncio.sleep(random.uniform(0.06, 0.22))

        # 15% chance of slight overshoot + correction
        if random.random() < 0.15:
            ox = tx + random.uniform(-6, 6)
            oy = ty + random.uniform(-4, 4)
            await page.mouse.move(ox, oy)
            await asyncio.sleep(random.uniform(0.04, 0.12))
            await page.mouse.move(tx, ty)
            await asyncio.sleep(random.uniform(0.03, 0.08))

        # Press then release with randomised hold time
        await page.mouse.down()
        await asyncio.sleep(random.uniform(0.04, 0.18))
        await page.mouse.up()
        cls._last_pos = (tx, ty)

    @classmethod
    async def type(
        cls,
        page:     Page,
        selector: str,
        text:     str,
        clear:    bool = True,
        typos:    bool = False,
    ) -> None:
        """
        Type text with gaussian per-character delays, occasional bursts,
        hesitations after punctuation, and optional typo+correction.

        Typical WPM range: 38–72 (120–215 ms/char before gaussian spread).
        """
        await cls.click(page, selector)
        await asyncio.sleep(random.uniform(0.15, 0.35))

        if clear:
            await page.keyboard.press("Control+a")
            await asyncio.sleep(random.uniform(0.04, 0.10))
            await page.keyboard.press("Delete")
            await asyncio.sleep(random.uniform(0.08, 0.18))

        i = 0
        while i < len(text):
            ch = text[i]

            # Hesitation: longer pause after sentence-ending punctuation
            if i > 0 and text[i - 1] in ".!?":
                await asyncio.sleep(random.uniform(0.25, 0.75))
            elif i > 0 and text[i - 1] in ",;:":
                await asyncio.sleep(random.uniform(0.08, 0.25))

            # Random thinking pause (independent of character)
            if random.random() < 0.03:
                await asyncio.sleep(random.uniform(0.5, 1.8))

            # Burst typing: short stretch with fast keys
            if random.random() < 0.10:
                burst_len = random.randint(3, 8)
                for j in range(min(burst_len, len(text) - i)):
                    await page.keyboard.type(text[i + j], delay=0)
                    await asyncio.sleep(random.uniform(0.030, 0.070))
                i += burst_len
                continue

            # Optional typo + backspace + correction
            if typos and random.random() < 0.025 and ch.isalpha():
                wrong = random.choice("qwertyuiopasdfghjklzxcvbnm")
                await page.keyboard.type(wrong, delay=0)
                await asyncio.sleep(random.uniform(0.12, 0.35))
                await page.keyboard.press("Backspace")
                await asyncio.sleep(random.uniform(0.08, 0.20))

            # Gaussian delay around 130 ms (≈55 WPM), clipped [45, 320]
            delay_ms = random.gauss(mu=130, sigma=40)
            delay_ms = max(45.0, min(320.0, delay_ms))

            await page.keyboard.type(ch, delay=0)
            await asyncio.sleep(delay_ms / 1000)
            i += 1

    @classmethod
    async def scroll(
        cls,
        page:      Page,
        direction: str = "down",
        pixels:    Optional[int] = None,
    ) -> None:
        """
        Scroll with natural acceleration (ease-in) and deceleration (ease-out),
        broken into randomised chunks with inter-chunk micro-pauses.
        """
        if pixels is None:
            pixels = random.randint(250, 850)
        sign = 1 if direction == "down" else -1

        # Move mouse to a random viewport position before scrolling
        vx = random.randint(300, 1100)
        vy = random.randint(200, 700)
        await cls.move(page, vx, vy)

        steps = random.randint(7, 16)
        scrolled = 0
        for i in range(steps):
            t = (i + 1) / steps
            ease = t * t * (3 - 2 * t)          # smooth-step easing
            target = pixels * ease
            chunk = round(target - scrolled)
            scrolled += chunk
            if chunk:
                await page.mouse.wheel(0, sign * chunk)
            await asyncio.sleep(random.uniform(0.035, 0.110))

        # Post-scroll reading pause
        await asyncio.sleep(random.uniform(0.4, 1.5))

    @classmethod
    async def idle(cls, page: Page, min_s: float = 0.8, max_s: float = 3.5) -> None:
        """
        Random pause while occasionally nudging the mouse — looks like someone
        reading or waiting for a page to respond.
        """
        wait = random.uniform(min_s, max_s)
        if random.random() < 0.35 and wait > 1.2:
            # Split into two segments with a mouse nudge between them
            half = wait * random.uniform(0.35, 0.65)
            await asyncio.sleep(half)
            nx = cls._last_pos[0] + random.uniform(-30, 30)
            ny = cls._last_pos[1] + random.uniform(-20, 20)
            nx = max(10.0, min(1900.0, nx))
            ny = max(10.0, min(1060.0, ny))
            await page.mouse.move(nx, ny)
            cls._last_pos = (nx, ny)
            await asyncio.sleep(wait - half)
        else:
            await asyncio.sleep(wait)

    @classmethod
    async def read_page(cls, page: Page) -> None:
        """
        Simulate a human reading a page: scroll down in stages, pause,
        occasionally scroll back up slightly to re-read something.
        """
        total = random.randint(500, 1400)
        stages = random.randint(2, 4)
        per_stage = total // stages

        for _ in range(stages):
            await cls.scroll(page, "down", per_stage + random.randint(-80, 80))
            await asyncio.sleep(random.uniform(1.2, 3.5))

        # 30% chance to re-read (scroll back up a bit)
        if random.random() < 0.30:
            await cls.scroll(page, "up", random.randint(150, 450))
            await asyncio.sleep(random.uniform(1.0, 2.5))
