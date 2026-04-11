"""
Resume parser — extracts structured data from an uploaded PDF resume.

Two-step process:
  1. pdfplumber extracts raw text from the uploaded file.
  2. GPT-4o-mini structures the text into our Resume schema.

The structured output maps directly to the Resume / Experience / Project /
Skill / Education database models.
"""
import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


def parse_resume_pdf(file_bytes: bytes) -> dict:
    """
    Extract and structure text from a PDF resume.

    Returns a dict compatible with the Resume create schema:
    {
      "full_name", "email", "phone", "location",
      "linkedin_url", "github_url", "website_url",
      "professional_summary",
      "experiences": [{company, title, location, start_date, end_date, current, bullets: [...]}],
      "projects":    [{name, description, tech_stack, url, bullets: [...]}],
      "skills":      [{skill, category, proficiency}],
      "educations":  [{institution, degree, field, start_year, end_year, gpa}],
    }
    """
    text = _extract_text(file_bytes)
    if not text.strip():
        raise ValueError("Could not extract text from the uploaded PDF")

    return _structure_with_ai(text)


def _extract_text(file_bytes: bytes) -> str:
    try:
        import pdfplumber
        import io
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
        return "\n".join(pages)
    except Exception as e:
        logger.error("pdfplumber extraction failed: %s", e)
        raise


def _structure_with_ai(text: str) -> dict:
    try:
        import os
        from openai import OpenAI
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

        system_prompt = """You are a resume parser. Extract structured information from a resume.
Return ONLY valid JSON with this exact structure (no markdown, no code blocks):
{
  "full_name": "",
  "email": "",
  "phone": "",
  "location": "",
  "linkedin_url": "",
  "github_url": "",
  "website_url": "",
  "professional_summary": "",
  "experiences": [
    {"company": "", "title": "", "location": "", "start_date": "", "end_date": "", "current": false, "bullets": ["..."]}
  ],
  "projects": [
    {"name": "", "description": "", "tech_stack": "", "url": "", "bullets": ["..."]}
  ],
  "skills": [
    {"skill": "", "category": "", "proficiency": ""}
  ],
  "educations": [
    {"institution": "", "degree": "", "field": "", "start_year": "", "end_year": "", "gpa": ""}
  ]
}
Rules:
- bullets must be a JSON array of strings (never a string)
- If a field is unknown, use empty string ""
- current = true only for ongoing positions (no end date listed)
- category for skills: "Languages", "Frameworks", "Tools", "Databases", "Cloud", "Other"
- proficiency: "Expert", "Intermediate", or "Beginner"
"""
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": f"Parse this resume:\n\n{text[:6000]}"},
            ],
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        raw = resp.choices[0].message.content or "{}"
        return json.loads(raw)

    except Exception as e:
        logger.error("AI resume parsing failed: %s", e)
        # Return empty scaffold on failure
        return {
            "full_name": "", "email": "", "phone": "", "location": "",
            "linkedin_url": "", "github_url": "", "website_url": "",
            "professional_summary": "",
            "experiences": [], "projects": [], "skills": [], "educations": [],
        }
