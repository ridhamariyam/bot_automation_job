"""
Resume Builder API.

Endpoints:
  POST   /api/resume/{email}                   — create a new resume
  GET    /api/resume/{email}                   — list all resumes
  GET    /api/resume/{email}/{resume_id}        — get full resume
  PUT    /api/resume/{email}/{resume_id}        — update resume
  DELETE /api/resume/{email}/{resume_id}        — delete resume
  GET    /api/resume/{email}/{resume_id}/pdf    — download PDF
  GET    /api/resume/{email}/{resume_id}/excel  — download Excel
  POST   /api/resume/{email}/parse             — upload CV PDF → parse with AI
  POST   /api/resume/{email}/{resume_id}/optimize — AI-tailor for a job
"""
import json
import uuid
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel

from database import (
    SessionLocal, User, Resume, ResumeExperience,
    ResumeProject, ResumeSkill, ResumeEducation,
)

router  = APIRouter()
logger  = logging.getLogger(__name__)

MAX_UPLOAD_MB = 10


# ── Pydantic schemas ───────────────────────────────────────────────────────────

class ExperienceIn(BaseModel):
    id:          Optional[str]  = None
    company:     str
    title:       str
    location:    Optional[str]  = None
    start_date:  Optional[str]  = None
    end_date:    Optional[str]  = None
    current:     bool           = False
    description: Optional[str]  = None
    bullets:     Optional[list] = None
    sort_order:  int            = 0

class ProjectIn(BaseModel):
    id:          Optional[str]  = None
    name:        str
    description: Optional[str]  = None
    tech_stack:  Optional[str]  = None
    url:         Optional[str]  = None
    bullets:     Optional[list] = None
    sort_order:  int            = 0

class SkillIn(BaseModel):
    id:          Optional[str]  = None
    skill:       str
    category:    Optional[str]  = None
    proficiency: Optional[str]  = None

class EducationIn(BaseModel):
    id:           Optional[str] = None
    institution:  str
    degree:       Optional[str] = None
    field:        Optional[str] = None
    start_year:   Optional[str] = None
    end_year:     Optional[str] = None
    gpa:          Optional[str] = None
    achievements: Optional[str] = None
    sort_order:   int           = 0

class ResumeIn(BaseModel):
    title:                str  = "My Resume"
    full_name:            Optional[str] = None
    email:                Optional[str] = None
    phone:                Optional[str] = None
    location:             Optional[str] = None
    linkedin_url:         Optional[str] = None
    github_url:           Optional[str] = None
    website_url:          Optional[str] = None
    professional_summary: Optional[str] = None
    is_default:           bool          = False
    experiences:          list[ExperienceIn] = []
    projects:             list[ProjectIn]    = []
    skills:               list[SkillIn]      = []
    educations:           list[EducationIn]  = []

class OptimizeIn(BaseModel):
    job_title:       str
    company:         str
    job_description: str


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_resume_or_404(db, email: str, resume_id: str) -> Resume:
    resume = db.query(Resume).filter_by(id=resume_id, user_email=email).first()
    if not resume:
        raise HTTPException(404, "Resume not found")
    return resume


def _serialize_resume(r: Resume, include_related: bool = True) -> dict:
    data: dict = {
        "id":                   r.id,
        "user_email":           r.user_email,
        "title":                r.title,
        "full_name":            r.full_name,
        "email":                r.email,
        "phone":                r.phone,
        "location":             r.location,
        "linkedin_url":         r.linkedin_url,
        "github_url":           r.github_url,
        "website_url":          r.website_url,
        "professional_summary": r.professional_summary,
        "is_default":           r.is_default,
        "version":              r.version,
        "created_at":           r.created_at.isoformat() if r.created_at else None,
        "updated_at":           r.updated_at.isoformat() if r.updated_at else None,
    }
    if include_related:
        data["experiences"] = [_ser_exp(e)  for e in (r.experiences or [])]
        data["projects"]    = [_ser_proj(p) for p in (r.projects    or [])]
        data["skills"]      = [_ser_sk(s)   for s in (r.skills      or [])]
        data["educations"]  = [_ser_edu(ed) for ed in (r.educations or [])]
    return data


def _ser_exp(e: ResumeExperience) -> dict:
    bullets = e.bullets
    if bullets and isinstance(bullets, str):
        try: bullets = json.loads(bullets)
        except Exception: bullets = [bullets]
    return {
        "id": e.id, "company": e.company, "title": e.title,
        "location": e.location, "start_date": e.start_date,
        "end_date": e.end_date, "current": e.current,
        "description": e.description, "bullets": bullets or [],
        "sort_order": e.sort_order,
    }

def _ser_proj(p: ResumeProject) -> dict:
    bullets = p.bullets
    if bullets and isinstance(bullets, str):
        try: bullets = json.loads(bullets)
        except Exception: bullets = [bullets]
    return {
        "id": p.id, "name": p.name, "description": p.description,
        "tech_stack": p.tech_stack, "url": p.url,
        "bullets": bullets or [], "sort_order": p.sort_order,
    }

def _ser_sk(s: ResumeSkill) -> dict:
    return {"id": s.id, "skill": s.skill, "category": s.category, "proficiency": s.proficiency}

def _ser_edu(e: ResumeEducation) -> dict:
    return {
        "id": e.id, "institution": e.institution, "degree": e.degree,
        "field": e.field, "start_year": e.start_year, "end_year": e.end_year,
        "gpa": e.gpa, "achievements": e.achievements, "sort_order": e.sort_order,
    }


def _apply_resume_data(resume: Resume, body: ResumeIn, db):
    """Write scalar fields + related rows from a ResumeIn body."""
    resume.title                = body.title
    resume.full_name            = body.full_name
    resume.email                = body.email
    resume.phone                = body.phone
    resume.location             = body.location
    resume.linkedin_url         = body.linkedin_url
    resume.github_url           = body.github_url
    resume.website_url          = body.website_url
    resume.professional_summary = body.professional_summary
    resume.is_default           = body.is_default

    # Replace all related rows
    db.query(ResumeExperience).filter_by(resume_id=resume.id).delete()
    db.query(ResumeProject).filter_by(resume_id=resume.id).delete()
    db.query(ResumeSkill).filter_by(resume_id=resume.id).delete()
    db.query(ResumeEducation).filter_by(resume_id=resume.id).delete()

    for i, exp in enumerate(body.experiences):
        db.add(ResumeExperience(
            id=exp.id or str(uuid.uuid4()), resume_id=resume.id,
            company=exp.company, title=exp.title, location=exp.location,
            start_date=exp.start_date, end_date=exp.end_date, current=exp.current,
            description=exp.description,
            bullets=json.dumps(exp.bullets or []),
            sort_order=i,
        ))
    for i, proj in enumerate(body.projects):
        db.add(ResumeProject(
            id=proj.id or str(uuid.uuid4()), resume_id=resume.id,
            name=proj.name, description=proj.description,
            tech_stack=proj.tech_stack, url=proj.url,
            bullets=json.dumps(proj.bullets or []),
            sort_order=i,
        ))
    for sk in body.skills:
        db.add(ResumeSkill(
            id=sk.id or str(uuid.uuid4()), resume_id=resume.id,
            skill=sk.skill, category=sk.category, proficiency=sk.proficiency,
        ))
    for i, edu in enumerate(body.educations):
        db.add(ResumeEducation(
            id=edu.id or str(uuid.uuid4()), resume_id=resume.id,
            institution=edu.institution, degree=edu.degree, field=edu.field,
            start_year=edu.start_year, end_year=edu.end_year,
            gpa=edu.gpa, achievements=edu.achievements, sort_order=i,
        ))


# ── CRUD endpoints ─────────────────────────────────────────────────────────────

@router.post("/{email}")
def create_resume(email: str, body: ResumeIn):
    with SessionLocal() as db:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(404, "User not found")

        resume = Resume(id=str(uuid.uuid4()), user_email=email)
        db.add(resume)
        db.flush()   # get the id
        _apply_resume_data(resume, body, db)

        # If is_default, unset all others
        if body.is_default:
            db.query(Resume).filter(
                Resume.user_email == email, Resume.id != resume.id
            ).update({"is_default": False})

        db.commit()
        db.refresh(resume)
        return _serialize_resume(resume)


@router.get("/{email}")
def list_resumes(email: str):
    with SessionLocal() as db:
        resumes = db.query(Resume).filter_by(user_email=email).order_by(Resume.created_at.desc()).all()
        return [_serialize_resume(r, include_related=False) for r in resumes]


@router.get("/{email}/{resume_id}")
def get_resume(email: str, resume_id: str):
    with SessionLocal() as db:
        return _serialize_resume(_get_resume_or_404(db, email, resume_id))


@router.put("/{email}/{resume_id}")
def update_resume(email: str, resume_id: str, body: ResumeIn):
    with SessionLocal() as db:
        resume = _get_resume_or_404(db, email, resume_id)
        _apply_resume_data(resume, body, db)
        resume.version = (resume.version or 1) + 1
        if body.is_default:
            db.query(Resume).filter(
                Resume.user_email == email, Resume.id != resume_id
            ).update({"is_default": False})
        db.commit()
        db.refresh(resume)
        return _serialize_resume(resume)


@router.delete("/{email}/{resume_id}")
def delete_resume(email: str, resume_id: str):
    with SessionLocal() as db:
        resume = _get_resume_or_404(db, email, resume_id)
        db.delete(resume)
        db.commit()
    return {"status": "deleted"}


# ── PDF download ───────────────────────────────────────────────────────────────

@router.get("/{email}/{resume_id}/pdf")
def download_pdf(email: str, resume_id: str):
    with SessionLocal() as db:
        resume = _get_resume_or_404(db, email, resume_id)
        data   = _serialize_resume(resume)

    try:
        from services.resume_builder import build_resume_pdf
        pdf_bytes = build_resume_pdf(data)
    except Exception as e:
        logger.error("PDF generation failed: %s", e)
        raise HTTPException(500, f"PDF generation failed: {e}")

    filename = f"{(data.get('full_name') or 'resume').replace(' ', '_')}_resume.pdf"
    return Response(
        content     = pdf_bytes,
        media_type  = "application/pdf",
        headers     = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Excel download ─────────────────────────────────────────────────────────────

@router.get("/{email}/{resume_id}/excel")
def download_excel(email: str, resume_id: str):
    with SessionLocal() as db:
        resume = _get_resume_or_404(db, email, resume_id)
        data   = _serialize_resume(resume)

    try:
        from services.resume_excel_export import export_resume_excel
        xlsx_bytes = export_resume_excel(data)
    except Exception as e:
        logger.error("Excel export failed: %s", e)
        raise HTTPException(500, f"Excel export failed: {e}")

    filename = f"{(data.get('full_name') or 'resume').replace(' ', '_')}_resume.xlsx"
    return Response(
        content    = xlsx_bytes,
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers    = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Parse uploaded CV ──────────────────────────────────────────────────────────

@router.post("/{email}/parse")
async def parse_cv(email: str, file: UploadFile = File(...)):
    """
    Upload a PDF resume, parse it with AI, and create a new Resume record.
    Returns the created resume data.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Only PDF files are accepted")

    content = await file.read()
    if len(content) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(413, f"File exceeds {MAX_UPLOAD_MB}MB limit")

    try:
        from services.resume_parser import parse_resume_pdf
        parsed = parse_resume_pdf(content)
    except Exception as e:
        raise HTTPException(500, f"Resume parsing failed: {e}")

    # Build a ResumeIn from the parsed data
    body = ResumeIn(
        title                = f"Parsed CV — {file.filename}",
        full_name            = parsed.get("full_name"),
        email                = parsed.get("email"),
        phone                = parsed.get("phone"),
        location             = parsed.get("location"),
        linkedin_url         = parsed.get("linkedin_url"),
        github_url           = parsed.get("github_url"),
        website_url          = parsed.get("website_url"),
        professional_summary = parsed.get("professional_summary"),
        experiences = [
            ExperienceIn(**{k: v for k, v in exp.items() if k in ExperienceIn.model_fields})
            for exp in parsed.get("experiences", [])
        ],
        projects = [
            ProjectIn(**{k: v for k, v in proj.items() if k in ProjectIn.model_fields})
            for proj in parsed.get("projects", [])
        ],
        skills = [
            SkillIn(**{k: v for k, v in sk.items() if k in SkillIn.model_fields})
            for sk in parsed.get("skills", [])
        ],
        educations = [
            EducationIn(**{k: v for k, v in edu.items() if k in EducationIn.model_fields})
            for edu in parsed.get("educations", [])
        ],
    )
    return create_resume(email, body)


# ── AI-optimize for a job ──────────────────────────────────────────────────────

@router.post("/{email}/{resume_id}/optimize")
async def optimize_for_job(email: str, resume_id: str, body: OptimizeIn):
    """
    Tailors resume bullets / summary for a specific job.
    Returns a new resume version with the tailored content.
    Does NOT modify the original resume.
    """
    with SessionLocal() as db:
        original = _get_resume_or_404(db, email, resume_id)
        data     = _serialize_resume(original)

    try:
        from services.resume_ai_optimizer import optimize_resume_for_job
        optimized = await optimize_resume_for_job(
            resume_data     = data,
            job_title       = body.job_title,
            company         = body.company,
            job_description = body.job_description,
        )
    except Exception as e:
        raise HTTPException(500, f"AI optimization failed: {e}")

    # Build a new ResumeIn with the optimized fields merged in
    updated_summary  = optimized.get("professional_summary") or data.get("professional_summary")
    opt_exp_map      = {e["id"]: e for e in optimized.get("experiences", [])}

    new_experiences = []
    for exp in data.get("experiences", []):
        opt = opt_exp_map.get(exp["id"])
        bullets = opt["bullets"] if opt and opt.get("bullets") else exp.get("bullets", [])
        new_experiences.append(ExperienceIn(
            id=exp["id"], company=exp["company"], title=exp["title"],
            location=exp.get("location"), start_date=exp.get("start_date"),
            end_date=exp.get("end_date"), current=exp.get("current", False),
            description=exp.get("description"), bullets=bullets,
        ))

    top_skills = optimized.get("top_skills", [])
    existing_skills = data.get("skills", [])
    if top_skills:
        # Reorder: top_skills first, rest after
        ordered = []
        skill_map = {s["skill"]: s for s in existing_skills}
        for ts in top_skills:
            if ts in skill_map:
                ordered.append(SkillIn(**skill_map[ts]))
        for sk in existing_skills:
            if sk["skill"] not in top_skills:
                ordered.append(SkillIn(**{k: v for k, v in sk.items() if k in SkillIn.model_fields}))
        new_skills = ordered
    else:
        new_skills = [SkillIn(**{k: v for k, v in s.items() if k in SkillIn.model_fields}) for s in existing_skills]

    new_body = ResumeIn(
        title                = f"Tailored for {body.job_title} @ {body.company}",
        full_name            = data.get("full_name"),
        email                = data.get("email"),
        phone                = data.get("phone"),
        location             = data.get("location"),
        linkedin_url         = data.get("linkedin_url"),
        github_url           = data.get("github_url"),
        website_url          = data.get("website_url"),
        professional_summary = updated_summary,
        experiences          = new_experiences,
        projects             = [ProjectIn(**{k: v for k, v in p.items() if k in ProjectIn.model_fields}) for p in data.get("projects", [])],
        skills               = new_skills,
        educations           = [EducationIn(**{k: v for k, v in e.items() if k in EducationIn.model_fields}) for e in data.get("educations", [])],
    )
    return create_resume(email, new_body)
