"""
LinkedIn feed scanner — detects hiring posts from recruiters/hiring managers.

These are NOT job listings; they are personal posts in the LinkedIn feed
that announce open positions. The AI classifier determines if a post is
a hiring announcement, then extracts contact info.
"""
import asyncio
import logging
import sys
import os
from pathlib import Path

from playwright.async_api import BrowserContext

logger = logging.getLogger(__name__)

# Ensure backend is importable
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))


async def scan_linkedin_feed_for_hiring_posts(
    context:    BrowserContext,
    max_posts:  int = 30,
) -> list[dict]:
    """
    Scrolls LinkedIn feed, classifies posts, extracts contacts.
    Returns list of dicts with: post_id, author, text, post_url, phone, whatsapp, email.
    Assumes the browser context is already logged in to LinkedIn.
    """
    from ai.hiring_post_detector import classify_and_extract_batch

    page = await context.new_page()
    raw_posts: list[dict] = []

    try:
        await page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded", timeout=20000)
        await asyncio.sleep(2.5)

        seen: set[str] = set()
        scroll_count   = 0

        while len(raw_posts) < max_posts * 3 and scroll_count < 20:
            post_els = await page.query_selector_all(
                "div.feed-shared-update-v2, div[data-urn*='urn:li:activity']"
            )

            for el in post_els:
                try:
                    post_id = await el.get_attribute("data-urn") or ""
                    if not post_id or post_id in seen:
                        continue
                    seen.add(post_id)

                    # Get post text
                    text_el = await el.query_selector(
                        ".feed-shared-text, .update-components-text, "
                        "[class*='commentary'], [class*='feed-shared-inline-show-more-text']"
                    )
                    if not text_el:
                        continue
                    text = (await text_el.inner_text()).strip()
                    if len(text) < 30:
                        continue

                    # Author name
                    author_el = await el.query_selector(
                        ".feed-shared-actor__name, .update-components-actor__name, "
                        "[class*='actor__name']"
                    )
                    author = (await author_el.inner_text()).strip() if author_el else "Unknown"

                    # Post URL
                    link_el = await el.query_selector("a[href*='/feed/update/']")
                    post_url = await link_el.get_attribute("href") if link_el else ""

                    raw_posts.append({
                        "post_id":  post_id,
                        "author":   author,
                        "text":     text[:800],
                        "post_url": post_url,
                        "platform": "linkedin_feed",
                    })

                except Exception:
                    continue

            # Scroll to load more
            await page.evaluate("window.scrollBy(0, 1000)")
            await asyncio.sleep(1.5 + scroll_count * 0.2)
            scroll_count += 1

    except Exception as e:
        logger.error("Feed scan page error: %s", e)
    finally:
        await page.close()

    logger.info("Collected %d raw posts, running AI classification...", len(raw_posts))

    # AI batch classification — filters to only real hiring posts + extracts contacts
    hiring_posts = await classify_and_extract_batch(raw_posts[:max_posts * 3])
    return hiring_posts[:max_posts]
