"""Parse text from PDF or DOCX CV files."""
import io
import re
from typing import Optional

import pdfplumber


def extract_text_from_pdf(file_bytes: bytes) -> str:
    text_parts = []
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)
    return "\n".join(text_parts)


def parse_email(text: str) -> Optional[str]:
    match = re.search(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}", text)
    return match.group() if match else None


def parse_phone(text: str) -> Optional[str]:
    match = re.search(r"(\+91[\s\-]?)?[6-9]\d{9}", text)
    return match.group() if match else None


SKILL_KEYWORDS = [
    "Python", "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "FastAPI",
    "Django", "Flask", "AWS", "GCP", "Azure", "Docker", "Kubernetes", "SQL", "PostgreSQL",
    "MongoDB", "Redis", "GraphQL", "REST", "HTML", "CSS", "Tailwind", "Git", "Linux",
    "Java", "Go", "Rust", "C++", "C#", ".NET", "Spring", "Figma", "Machine Learning",
    "Deep Learning", "TensorFlow", "PyTorch", "Data Science", "Pandas", "NumPy",
]


def extract_skills_from_text(text: str) -> list[str]:
    found = []
    text_lower = text.lower()
    for skill in SKILL_KEYWORDS:
        if skill.lower() in text_lower:
            found.append(skill)
    return found


def parse_cv(file_bytes: bytes, content_type: str) -> dict:
    """Extract structured data from a CV file."""
    if "pdf" in content_type:
        raw_text = extract_text_from_pdf(file_bytes)
    else:
        # Fallback: treat as plain text for DOCX
        raw_text = file_bytes.decode("utf-8", errors="ignore")

    detected_skills = extract_skills_from_text(raw_text)
    email = parse_email(raw_text)
    phone = parse_phone(raw_text)

    return {
        "raw_text": raw_text[:3000],  # cap at 3k chars
        "detected_skills": detected_skills,
        "detected_email": email,
        "detected_phone": phone,
    }
