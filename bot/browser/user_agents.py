"""
Browser profiles — cohesive bundles of user-agent, viewport, timezone,
platform string, and hardware specs that belong together naturally.

A real Windows machine on Chrome doesn't have timezone=Asia/Kolkata and
screen=2560x1600. These profiles are internally consistent.
"""
import random
from dataclasses import dataclass


@dataclass(frozen=True)
class BrowserProfile:
    user_agent:           str
    platform:             str   # navigator.platform value
    viewport_w:           int
    viewport_h:           int
    screen_w:             int
    screen_h:             int
    timezone:             str
    hardware_concurrency: int
    device_memory:        int   # GB (powers of 2 only: 1,2,4,8,16)
    language:             str = "en-US"
    webgl_vendor:         str = "Intel Inc."
    webgl_renderer:       str = "Intel Iris OpenGL Engine"


PROFILES: list[BrowserProfile] = [
    # ── Windows / Chrome ──────────────────────────────────────────────────────
    BrowserProfile(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        platform="Win32", viewport_w=1920, viewport_h=1080,
        screen_w=1920, screen_h=1080, timezone="America/New_York",
        hardware_concurrency=8, device_memory=8,
        webgl_vendor="Google Inc. (NVIDIA)", webgl_renderer="ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0)",
    ),
    BrowserProfile(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        platform="Win32", viewport_w=1440, viewport_h=900,
        screen_w=1440, screen_h=900, timezone="America/Chicago",
        hardware_concurrency=4, device_memory=4,
        webgl_vendor="Google Inc. (Intel)", webgl_renderer="ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)",
    ),
    BrowserProfile(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        platform="Win32", viewport_w=1536, viewport_h=864,
        screen_w=1536, screen_h=864, timezone="America/Los_Angeles",
        hardware_concurrency=8, device_memory=16,
        webgl_vendor="Google Inc. (AMD)", webgl_renderer="ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0)",
    ),
    BrowserProfile(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        platform="Win32", viewport_w=1366, viewport_h=768,
        screen_w=1366, screen_h=768, timezone="America/Denver",
        hardware_concurrency=4, device_memory=4,
        webgl_vendor="Google Inc. (Intel)", webgl_renderer="ANGLE (Intel, Intel(R) HD Graphics 520 Direct3D11 vs_5_0 ps_5_0)",
    ),
    BrowserProfile(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        platform="Win32", viewport_w=1280, viewport_h=720,
        screen_w=2560, screen_h=1440, timezone="America/Phoenix",
        hardware_concurrency=12, device_memory=16,
        webgl_vendor="Google Inc. (NVIDIA)", webgl_renderer="ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)",
    ),
    # ── Windows / Edge ────────────────────────────────────────────────────────
    BrowserProfile(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
        platform="Win32", viewport_w=1920, viewport_h=1080,
        screen_w=1920, screen_h=1080, timezone="Europe/London",
        hardware_concurrency=8, device_memory=8,
        webgl_vendor="Google Inc. (Intel)", webgl_renderer="ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)",
    ),
    BrowserProfile(
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0",
        platform="Win32", viewport_w=1600, viewport_h=900,
        screen_w=1600, screen_h=900, timezone="Europe/Berlin",
        hardware_concurrency=4, device_memory=8,
        webgl_vendor="Google Inc. (Intel)", webgl_renderer="ANGLE (Intel, Intel(R) Iris Xe Graphics Direct3D11 vs_5_0 ps_5_0)",
    ),
    # ── macOS / Chrome ────────────────────────────────────────────────────────
    BrowserProfile(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        platform="MacIntel", viewport_w=1440, viewport_h=900,
        screen_w=1440, screen_h=900, timezone="America/Los_Angeles",
        hardware_concurrency=8, device_memory=8,
        webgl_vendor="Apple Inc.", webgl_renderer="Apple M1",
    ),
    BrowserProfile(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        platform="MacIntel", viewport_w=1280, viewport_h=800,
        screen_w=2560, screen_h=1600, timezone="America/New_York",
        hardware_concurrency=10, device_memory=16,
        webgl_vendor="Apple Inc.", webgl_renderer="Apple M2 Pro",
    ),
    BrowserProfile(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        platform="MacIntel", viewport_w=1512, viewport_h=982,
        screen_w=3024, screen_h=1964, timezone="America/Chicago",
        hardware_concurrency=12, device_memory=16,
        webgl_vendor="Apple Inc.", webgl_renderer="Apple M3",
    ),
    # ── macOS / Safari ────────────────────────────────────────────────────────
    BrowserProfile(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
        platform="MacIntel", viewport_w=1440, viewport_h=900,
        screen_w=1440, screen_h=900, timezone="America/Toronto",
        hardware_concurrency=8, device_memory=8,
        webgl_vendor="Apple Inc.", webgl_renderer="Apple M1",
    ),
    # ── Linux / Chrome ────────────────────────────────────────────────────────
    BrowserProfile(
        user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        platform="Linux x86_64", viewport_w=1920, viewport_h=1080,
        screen_w=1920, screen_h=1080, timezone="Europe/Berlin",
        hardware_concurrency=16, device_memory=16,
        webgl_vendor="Google Inc. (NVIDIA)", webgl_renderer="ANGLE (NVIDIA, NVIDIA GeForce GTX 970/PCIe/SSE2, OpenGL 4.6.0)",
    ),
    BrowserProfile(
        user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        platform="Linux x86_64", viewport_w=1280, viewport_h=1024,
        screen_w=1280, screen_h=1024, timezone="Asia/Kolkata",
        hardware_concurrency=8, device_memory=8,
        webgl_vendor="Google Inc. (Intel)", webgl_renderer="ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)",
    ),
]


def random_profile() -> BrowserProfile:
    return random.choice(PROFILES)


def profile_for_timezone(tz: str) -> BrowserProfile:
    """Return a profile whose timezone matches, or a random one."""
    matches = [p for p in PROFILES if p.timezone == tz]
    return random.choice(matches) if matches else random_profile()
