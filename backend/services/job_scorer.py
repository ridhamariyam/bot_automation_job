"""
Job Scoring Service — rates how well a job matches a user's profile.

Score breakdown (0-100):
  title_score       0-25  title / role match against user's target titles
  skills_score      0-35  overlap of job's required skills vs user's skills
  experience_score  0-20  required experience level vs user's years_exp
  relevance_score   0-15  overall domain / industry fit
  quality_score     0-5   job quality signals (real company, not MLM, etc.)

Two scorers:
  ai_score_job     — GPT-4o-mini, returns full breakdown with explanations
  keyword_score_job — fast TF-IDF-style fallback, no API required

Both return a ScoreResult so callers are scorer-agnostic.
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
from dataclasses import dataclass, field, asdict
from typing import Optional

logger = logging.getLogger(__name__)

# ── ScoreResult ────────────────────────────────────────────────────────────────

@dataclass
class ScoreResult:
    total:             int                 # 0-100
    title_score:       int                 # 0-25
    skills_score:      int                 # 0-35
    experience_score:  int                 # 0-20
    relevance_score:   int                 # 0-15
    quality_score:     int                 # 0-5
    matched_skills:    list[str]           # skills present in both JD and profile
    missing_skills:    list[str]           # skills in JD not in profile
    reasoning:         str                 # 1-2 sentence human-readable explanation
    experience_required: Optional[str] = None  # "3-5 years" extracted from JD
    scorer:            str = "keyword"     # "ai" | "keyword" | "cached"

    def to_dict(self) -> dict:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    @classmethod
    def from_json(cls, s: str) -> "ScoreResult":
        return cls(**json.loads(s))

    @classmethod
    def skip_result(cls, reason: str) -> "ScoreResult":
        return cls(
            total=0, title_score=0, skills_score=0,
            experience_score=0, relevance_score=0, quality_score=0,
            matched_skills=[], missing_skills=[],
            reasoning=reason, scorer="skip",
        )


# ── OpenAI client ──────────────────────────────────────────────────────────────

def _openai_client():
    from openai import AsyncOpenAI
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("OPENAI_API_KEY not set")
    return AsyncOpenAI(api_key=key)


_SCORE_PROMPT = """\
You are a job-fit scoring engine. Score how well a candidate matches a job.

CANDIDATE PROFILE
Target titles: {target_titles}
Skills: {skills}
Years of experience: {years_exp}

JOB
Title: {job_title}
Company: {company}
Description:
{description}

SCORING RULES — assign integer points in each category:

title_score (0-25)
  25 = exact or very close match to a target title
  15 = same discipline, different seniority
  5  = loosely related
  0  = unrelated

skills_score (0-35)
  score = round(35 * matched_count / max(required_count, 1))
  where matched_count = skills the candidate has that the job requires
  and required_count = distinct technical skills explicitly listed in the JD

experience_score (0-20)
  20 = candidate experience is within or above required range
  10 = candidate is 1-2 years below requirement
  0  = candidate is 3+ years below requirement, or requirement unknown → 10

relevance_score (0-15)
  15 = job is in exactly the candidate's domain
  8  = adjacent domain
  0  = different domain entirely

quality_score (0-5)
  5 = well-known company, clear JD, specific responsibilities
  3 = unknown company but legitimate JD
  1 = vague / recruiter spam / multi-level marketing signals
  0 = obvious scam

Return ONLY valid JSON, no markdown:
{{
  "title_score": <int>,
  "skills_score": <int>,
  "experience_score": <int>,
  "relevance_score": <int>,
  "quality_score": <int>,
  "matched_skills": [<string>, ...],
  "missing_skills": [<string>, ...],
  "experience_required": "<string or null>",
  "reasoning": "<1-2 sentences explaining the overall fit>"
}}
"""


# ── AI scorer ──────────────────────────────────────────────────────────────────

async def ai_score_job(
    job_title:   str,
    company:     str,
    description: str,
    target_titles: list[str],
    skills:      list[str],
    years_exp:   int = 0,
) -> ScoreResult:
    """
    Score a job using GPT-4o-mini. Returns ScoreResult.
    Raises on API error — callers should fallback to keyword_score_job.
    """
    client = _openai_client()
    prompt = _SCORE_PROMPT.format(
        target_titles = ", ".join(target_titles) or "not specified",
        skills        = ", ".join(skills[:40]) or "not specified",
        years_exp     = years_exp or "not specified",
        job_title     = job_title[:120],
        company       = company[:80],
        description   = description[:3000],
    )

    resp = await client.chat.completions.create(
        model           = "gpt-4o-mini",
        messages        = [{"role": "user", "content": prompt}],
        response_format = {"type": "json_object"},
        temperature     = 0,
        max_tokens      = 400,
    )

    raw = json.loads(resp.choices[0].message.content)

    title_score      = _clamp(raw.get("title_score", 0),      0, 25)
    skills_score     = _clamp(raw.get("skills_score", 0),     0, 35)
    experience_score = _clamp(raw.get("experience_score", 0), 0, 20)
    relevance_score  = _clamp(raw.get("relevance_score", 0),  0, 15)
    quality_score    = _clamp(raw.get("quality_score", 0),    0, 5)
    total            = title_score + skills_score + experience_score + relevance_score + quality_score

    return ScoreResult(
        total            = total,
        title_score      = title_score,
        skills_score     = skills_score,
        experience_score = experience_score,
        relevance_score  = relevance_score,
        quality_score    = quality_score,
        matched_skills   = raw.get("matched_skills", [])[:20],
        missing_skills   = raw.get("missing_skills", [])[:15],
        reasoning        = raw.get("reasoning", "")[:400],
        experience_required = raw.get("experience_required"),
        scorer           = "ai",
    )


# ── Keyword scorer (no API) ────────────────────────────────────────────────────

# Common English stop words — excluded from term matching
_STOP = frozenset({
    "the","a","an","and","or","but","in","on","at","to","for","of","with",
    "by","from","is","are","was","were","be","been","have","has","had",
    "will","would","could","should","may","might","must","shall","can",
    "this","that","these","those","we","you","our","your","their","its",
    "about","after","before","during","through","under","over","between",
    "into","than","more","most","other","some","such","no","not","only",
    "also","as","if","so","all","any","both","each","few","many","same",
})

# Tech/skill synonyms so "js" matches "javascript" etc.
_SYNONYMS: dict[str, str] = {
    "js": "javascript", "ts": "typescript", "py": "python",
    "ml": "machine learning", "ai": "artificial intelligence",
    "k8s": "kubernetes", "kube": "kubernetes",
    "aws": "amazon web services", "gcp": "google cloud",
    "sql server": "mssql", "ms sql": "mssql",
    "node": "nodejs", "node.js": "nodejs",
    "react.js": "react", "reactjs": "react",
    "vue.js": "vue", "vuejs": "vue",
    "rest api": "rest", "restful": "rest",
    "nosql": "nosql", "no-sql": "nosql",
    "dl": "deep learning", "nlp": "natural language processing",
}


def _normalise(text: str) -> str:
    text = text.lower()
    for alias, canon in _SYNONYMS.items():
        text = text.replace(alias, canon)
    return text


def _tokens(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9#+.]+", _normalise(text))
    return {w for w in words if w not in _STOP and len(w) > 1}


def _skill_tokens(skills: list[str]) -> set[str]:
    result: set[str] = set()
    for s in skills:
        result.update(_tokens(s))
        result.add(_normalise(s).strip())
    return result


def keyword_score_job(
    job_title:     str,
    company:       str,
    description:   str,
    target_titles: list[str],
    skills:        list[str],
    years_exp:     int = 0,
) -> ScoreResult:
    """
    Fast keyword-based scoring — no external API.
    Returns ScoreResult with scorer="keyword".
    """
    desc_lower  = _normalise(description)
    title_lower = _normalise(job_title)
    desc_tokens = _tokens(description)

    # ── Title score (0-25) ─────────────────────────────────────────────────
    title_score = 0
    for ut in target_titles:
        ut_norm = _normalise(ut)
        ut_words = _tokens(ut)
        if ut_norm in title_lower:
            title_score = 25; break
        matching_words = ut_words & _tokens(job_title)
        ratio = len(matching_words) / max(len(ut_words), 1)
        title_score = max(title_score, round(ratio * 20))

    title_score = _clamp(title_score, 0, 25)

    # ── Skills score (0-35) ────────────────────────────────────────────────
    user_skill_tokens   = _skill_tokens(skills)
    required_in_desc    = _extract_required_skills(description)
    matched_skills_list: list[str] = []
    missing_skills_list: list[str] = []

    for skill in required_in_desc:
        s_tok = _skill_tokens([skill])
        if s_tok & user_skill_tokens:
            matched_skills_list.append(skill)
        else:
            missing_skills_list.append(skill)

    if required_in_desc:
        skills_score = round(35 * len(matched_skills_list) / len(required_in_desc))
    else:
        # No explicit skill list — use token overlap as proxy
        overlap = user_skill_tokens & desc_tokens
        skills_score = min(28, len(overlap) * 3)

    skills_score = _clamp(skills_score, 0, 35)

    # ── Experience score (0-20) ────────────────────────────────────────────
    required_years = _extract_required_years(description)
    if required_years is None:
        experience_score = 10   # unknown requirement → neutral
        exp_str: Optional[str] = None
    else:
        gap = years_exp - required_years
        if gap >= 0:
            experience_score = 20
        elif gap >= -2:
            experience_score = 12
        elif gap >= -4:
            experience_score = 5
        else:
            experience_score = 0
        exp_str = f"{required_years}+ years"

    experience_score = _clamp(experience_score, 0, 20)

    # ── Relevance score (0-15) ─────────────────────────────────────────────
    # Proxy: what fraction of the user's skill tokens appear in the description
    if user_skill_tokens:
        overlap_frac = len(user_skill_tokens & desc_tokens) / len(user_skill_tokens)
        relevance_score = round(overlap_frac * 15)
    else:
        relevance_score = 5

    relevance_score = _clamp(relevance_score, 0, 15)

    # ── Quality score (0-5) ────────────────────────────────────────────────
    quality_score = _quality_heuristic(job_title, company, description)

    total = title_score + skills_score + experience_score + relevance_score + quality_score
    total = _clamp(total, 0, 100)

    reasoning = _build_reasoning(
        total, title_score, skills_score,
        matched_skills_list, missing_skills_list, job_title, company,
    )

    return ScoreResult(
        total            = total,
        title_score      = title_score,
        skills_score     = skills_score,
        experience_score = experience_score,
        relevance_score  = relevance_score,
        quality_score    = quality_score,
        matched_skills   = matched_skills_list[:20],
        missing_skills   = missing_skills_list[:15],
        reasoning        = reasoning,
        experience_required = exp_str if required_years else None,
        scorer           = "keyword",
    )


# ── Combined scorer with caching ───────────────────────────────────────────────

async def score_job(
    job_title:     str,
    company:       str,
    description:   str,
    target_titles: list[str],
    skills:        list[str],
    years_exp:     int = 0,
    user_email:    str = "",
    job_url:       str = "",
) -> ScoreResult:
    """
    Primary entry point. Tries AI scorer, falls back to keyword.
    Caches results in job_scores table when user_email + job_url are provided.
    """
    # Check cache first
    if user_email and job_url:
        cached = _load_cache(user_email, job_url)
        if cached:
            return cached

    if not description.strip():
        result = keyword_score_job(
            job_title, company, description or job_title,
            target_titles, skills, years_exp,
        )
    else:
        try:
            result = await ai_score_job(
                job_title, company, description, target_titles, skills, years_exp,
            )
        except Exception as e:
            logger.warning("AI scorer failed, using keyword fallback: %s", e)
            result = keyword_score_job(
                job_title, company, description, target_titles, skills, years_exp,
            )

    # Write cache
    if user_email and job_url:
        _save_cache(user_email, job_url, result)

    return result


async def batch_score_jobs(
    jobs:          list[dict],
    target_titles: list[str],
    skills:        list[str],
    years_exp:     int = 0,
    user_email:    str = "",
    concurrency:   int = 8,
) -> list[tuple[dict, ScoreResult]]:
    """
    Score a batch of jobs concurrently.
    Each job dict must have keys: title, company, description, url (optional).
    Returns list of (job, ScoreResult) tuples.
    """
    sem = asyncio.Semaphore(concurrency)

    async def _one(job: dict) -> tuple[dict, ScoreResult]:
        async with sem:
            result = await score_job(
                job_title     = job.get("title", ""),
                company       = job.get("company", ""),
                description   = job.get("description", ""),
                target_titles = target_titles,
                skills        = skills,
                years_exp     = years_exp,
                user_email    = user_email,
                job_url       = job.get("url", ""),
            )
            return job, result

    return list(await asyncio.gather(*[_one(j) for j in jobs]))


# ── Cache helpers ──────────────────────────────────────────────────────────────

def _cache_key(user_email: str, job_url: str) -> str:
    import hashlib
    return hashlib.sha256(f"{user_email}:{job_url}".encode()).hexdigest()[:32]


def _load_cache(user_email: str, job_url: str) -> Optional[ScoreResult]:
    try:
        import sys, os as _os
        sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
        from database import SessionLocal, JobScore
        key = _cache_key(user_email, job_url)
        with SessionLocal() as db:
            row = db.query(JobScore).filter_by(cache_key=key).first()
            if row:
                result = ScoreResult.from_json(row.result_json)
                result.scorer = "cached"
                return result
    except Exception:
        pass
    return None


def _save_cache(user_email: str, job_url: str, result: ScoreResult) -> None:
    try:
        import sys, os as _os
        sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), ".."))
        from database import SessionLocal, JobScore
        from datetime import datetime
        key = _cache_key(user_email, job_url)
        with SessionLocal() as db:
            row = db.query(JobScore).filter_by(cache_key=key).first()
            if row:
                row.result_json = result.to_json()
                row.scored_at   = datetime.utcnow()
            else:
                db.add(JobScore(
                    cache_key   = key,
                    user_email  = user_email,
                    job_url     = job_url,
                    total_score = result.total,
                    result_json = result.to_json(),
                ))
            db.commit()
    except Exception:
        pass


# ── Extraction helpers ─────────────────────────────────────────────────────────

# Common tech skills used in keyword extraction from JDs
_SKILL_PATTERNS = re.compile(
    r"\b("
    r"python|javascript|typescript|java|c\+\+|c#|go|rust|ruby|php|swift|kotlin|scala|r\b"
    r"|react|angular|vue|svelte|nextjs|nuxt|django|fastapi|flask|spring|rails|laravel"
    r"|nodejs|express|nestjs|graphql|rest|grpc|websocket"
    r"|postgresql|mysql|sqlite|mongodb|redis|elasticsearch|cassandra|dynamodb|mssql"
    r"|docker|kubernetes|terraform|ansible|jenkins|github\s*actions|circleci|gitlab\s*ci"
    r"|aws|azure|gcp|google\s*cloud|amazon\s*web\s*services"
    r"|machine\s*learning|deep\s*learning|nlp|computer\s*vision|pytorch|tensorflow|keras|scikit.learn"
    r"|pandas|numpy|spark|kafka|airflow|dbt|snowflake|bigquery"
    r"|linux|bash|shell|git|jira|agile|scrum|devops|ci/cd|microservices|api\s*gateway"
    r")",
    re.IGNORECASE,
)


def _extract_required_skills(description: str) -> list[str]:
    """Extract skill names mentioned in a job description."""
    found = _SKILL_PATTERNS.findall(description)
    seen: dict[str, str] = {}
    for match in found:
        key = _normalise(match)
        if key not in seen:
            seen[key] = match.strip()
    return list(seen.values())[:30]


def _extract_required_years(description: str) -> Optional[int]:
    """Extract minimum years of experience from description. Returns None if not found."""
    patterns = [
        r"(\d+)\+?\s*(?:to\s*\d+)?\s*years?\s*(?:of\s*)?(?:relevant\s*)?experience",
        r"minimum\s*(?:of\s*)?(\d+)\s*years?",
        r"at\s*least\s*(\d+)\s*years?",
        r"(\d+)-\d+\s*years?\s*(?:of\s*)?experience",
    ]
    for pat in patterns:
        m = re.search(pat, description, re.IGNORECASE)
        if m:
            return int(m.group(1))
    return None


def _quality_heuristic(job_title: str, company: str, description: str) -> int:
    desc_lower = description.lower()
    scam_signals = [
        "earn from home", "make money fast", "no experience needed",
        "unlimited earning", "join our team today", "work from anywhere",
        "multi-level", "mlm", "network marketing",
    ]
    if any(s in desc_lower for s in scam_signals):
        return 0
    if len(description) < 150:
        return 1   # too thin — probably scraper artefact
    if company and company.lower() not in ("unknown", ""):
        return 4
    return 3


def _build_reasoning(
    total:           int,
    title_score:     int,
    skills_score:    int,
    matched:         list[str],
    missing:         list[str],
    job_title:       str,
    company:         str,
) -> str:
    grade = "strong" if total >= 75 else "moderate" if total >= 55 else "weak"
    parts = [f"{grade.capitalize()} match ({total}/100) for {job_title} at {company}."]
    if matched:
        parts.append(f"Matched: {', '.join(matched[:4])}.")
    if missing:
        parts.append(f"Gaps: {', '.join(missing[:3])}.")
    return " ".join(parts)


def _clamp(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, int(v)))
