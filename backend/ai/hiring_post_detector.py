"""
Hiring post classifier + contact extractor.

classify_hiring_post()  — gpt-4o-mini (cheap, fast, high-volume)
extract_contact_from_text() — regex first, GPT fallback only when needed
"""
import asyncio
import json
import logging
import os
import re

logger = logging.getLogger(__name__)

# Keywords that strongly signal a hiring post (pre-filter before AI call)
HIRING_KEYWORDS = [
    "we're hiring", "we are hiring", "now hiring", "open position",
    "job opening", "looking for a", "seeking a", "dm me", "dm for",
    "send cv", "send resume", "apply now", "join our team",
    "urgent requirement", "immediate opening", "whatsapp", "wa.me",
    "positions available", "we need a", "hiring for", "job opportunity",
]

WHATSAPP_URL   = re.compile(r'wa\.me/(\d{7,15})')
PHONE_PATTERNS = [
    re.compile(r'\+91[\s\-]?[6-9]\d{9}'),          # +91 Indian mobile
    re.compile(r'\b[6-9]\d{9}\b'),                   # Indian mobile (bare)
    re.compile(r'\+\d{1,3}[\s\-.]?\d{6,14}'),        # International
    re.compile(r'\(\d{3}\)\s?\d{3}[\-\s]\d{4}'),     # US (555) 123-4567
    re.compile(r'\b\d{3}[\-\.\s]\d{3}[\-\.\s]\d{4}\b'),  # 555-123-4567
]
EMAIL_PATTERN = re.compile(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}')


def _client():
    from openai import AsyncOpenAI
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY not set")
    return AsyncOpenAI(api_key=key)


def keyword_prefilter(text: str) -> bool:
    """Fast check before spending on API call."""
    lower = text.lower()
    return any(kw in lower for kw in HIRING_KEYWORDS)


async def classify_hiring_post(post_text: str) -> bool:
    """
    Returns True if the text is a job hiring announcement.
    Uses gpt-4o-mini — ~$0.0002 per call at scale.
    Skips API if keyword pre-filter doesn't match.
    """
    if not keyword_prefilter(post_text):
        return False

    try:
        resp = await _client().chat.completions.create(
            model    = "gpt-4o-mini",
            messages = [{
                "role":    "user",
                "content": (
                    "Is this a job hiring announcement? Answer only 'yes' or 'no'.\n\n"
                    f"Post: {post_text[:600]}"
                ),
            }],
            temperature = 0,
            max_tokens  = 5,
        )
        return resp.choices[0].message.content.strip().lower().startswith("yes")
    except Exception as e:
        logger.warning("classify_hiring_post failed: %s — falling back to keyword match", e)
        return keyword_prefilter(post_text)


def extract_contacts_regex(text: str) -> dict:
    """
    Fast regex extraction — no API cost.
    Returns: {phone, whatsapp, email}
    """
    result: dict = {"phone": None, "whatsapp": None, "email": None}

    # WhatsApp URL is the most reliable signal
    wa = WHATSAPP_URL.search(text)
    if wa:
        raw = wa.group(1)
        # Ensure country code
        result["whatsapp"] = f"+{raw}" if not raw.startswith("+") else raw
        result["phone"]    = result["whatsapp"]

    # Phone via patterns
    if not result["phone"]:
        for pat in PHONE_PATTERNS:
            m = pat.search(text)
            if m:
                digits = re.sub(r"\D", "", m.group())
                if len(digits) >= 10:
                    result["phone"] = m.group().strip()
                    break

    # Email
    em = EMAIL_PATTERN.search(text)
    if em and "linkedin.com" not in em.group():
        result["email"] = em.group()

    return result


async def extract_contact_from_text(text: str) -> dict:
    """
    Extract phone/WhatsApp/email from text.
    Tries regex first; uses GPT-4o-mini only when regex finds nothing.
    """
    result = extract_contacts_regex(text)

    # Already found everything we need
    if result["phone"] or result["email"]:
        return result

    # GPT fallback for ambiguous formats
    try:
        resp = await _client().chat.completions.create(
            model    = "gpt-4o-mini",
            messages = [{
                "role":    "user",
                "content": (
                    "Extract contact info from this text. "
                    'Return JSON: {"phone": "...", "whatsapp": "...", "email": "..."}. '
                    "Use null for missing fields.\n\n"
                    f"Text: {text[:500]}"
                ),
            }],
            response_format = {"type": "json_object"},
            temperature     = 0,
            max_tokens       = 80,
        )
        gpt_result = json.loads(resp.choices[0].message.content)
        for key in ("phone", "whatsapp", "email"):
            if gpt_result.get(key):
                result[key] = gpt_result[key]
    except Exception as e:
        logger.debug("GPT contact extraction failed: %s", e)

    return result


async def classify_and_extract_batch(
    posts:       list[dict],
    concurrency: int = 10,
) -> list[dict]:
    """
    Process a list of posts: classify each and extract contacts.
    Skips posts that don't pass the keyword pre-filter.
    Returns only confirmed hiring posts with contact data.
    """
    sem = asyncio.Semaphore(concurrency)

    async def _process(post: dict) -> dict | None:
        async with sem:
            text = post.get("text", "")
            if not await classify_hiring_post(text):
                return None
            contacts = await extract_contact_from_text(text)
            return {**post, **contacts, "is_hiring_post": True}

    results = await asyncio.gather(*[_process(p) for p in posts])
    return [r for r in results if r is not None]
