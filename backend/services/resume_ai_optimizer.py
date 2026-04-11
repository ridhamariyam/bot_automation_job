"""
Resume AI optimizer — tailors resume content for a specific job description.

Rewrites experience bullets, summary, and highlights relevant skills
without fabricating experience. Returns only the modified fields.
"""
import json
import logging
import os

logger = logging.getLogger(__name__)


async def optimize_resume_for_job(
    resume_data: dict,
    job_title:   str,
    company:     str,
    job_description: str,
) -> dict:
    """
    Tailors the resume to match a specific job posting.

    Returns a dict of modified fields that can be merged into resume_data:
    {
      "professional_summary": "...",     # rewritten
      "experiences": [...],              # bullets rewritten per experience
      "skills": [...],                   # reordered, most relevant first
    }
    Does NOT modify the resume DB record — the caller decides what to save.
    """
    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        # Build a compact resume snapshot for the prompt
        snapshot = _compact_snapshot(resume_data)

        system = """You are an expert resume consultant.
Given a candidate's resume and a job description, rewrite ONLY:
1. professional_summary (2-3 sentences, highlight match)
2. experience bullets (make them ATS-optimized, use job's keywords, keep truthful)
3. skill order (most relevant to this job first)

Return valid JSON only (no markdown) with this structure:
{
  "professional_summary": "...",
  "experiences": [
    {"id": "...", "bullets": ["...", "..."]}
  ],
  "top_skills": ["skill1", "skill2", "..."]
}
Rules:
- Never invent experience, numbers, or skills not in the original resume
- Keep bullets concise (max 150 chars each)
- top_skills: list the 8 most relevant skills for THIS job from the candidate's existing skills
"""
        resp = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": (
                    f"JOB: {job_title} at {company}\n\n"
                    f"JOB DESCRIPTION:\n{job_description[:2000]}\n\n"
                    f"CANDIDATE RESUME:\n{snapshot}"
                )},
            ],
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        raw = resp.choices[0].message.content or "{}"
        result = json.loads(raw)
        return result

    except Exception as e:
        logger.error("Resume AI optimization failed: %s", e)
        return {}


def _compact_snapshot(resume: dict) -> str:
    """Build a compact text representation of the resume for the AI prompt."""
    lines = []

    if resume.get("professional_summary"):
        lines.append(f"SUMMARY: {resume['professional_summary']}")

    for exp in resume.get("experiences", []):
        date_range = f"{exp.get('start_date','')} – {'Present' if exp.get('current') else exp.get('end_date','')}"
        lines.append(f"\nEXP [{exp.get('id','?')}]: {exp.get('title')} @ {exp.get('company')} ({date_range})")
        bullets = exp.get("bullets", [])
        if isinstance(bullets, str):
            try:
                bullets = json.loads(bullets)
            except Exception:
                bullets = [bullets]
        for b in (bullets or []):
            lines.append(f"  • {b}")

    lines.append("\nSKILLS:")
    for sk in resume.get("skills", []):
        lines.append(f"  {sk.get('category','')}: {sk.get('skill','')}")

    return "\n".join(lines)[:3000]
