"""Real job application tracking — persisted to SQLite."""
import uuid
from datetime import datetime
from typing import Literal
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import SessionLocal, JobApplication

router = APIRouter()


class JobIn(BaseModel):
    user_email: str
    title: str
    company: str
    location: str = ""
    platform: str
    job_url: str = ""
    status: str = "Applied"
    proof: str = ""


class StatusIn(BaseModel):
    status: Literal["Applied", "Viewed", "Interview", "Rejected"]


@router.get("/stats/{user_email}")
def get_stats(user_email: str):
    with SessionLocal() as db:
        jobs = db.query(JobApplication).filter(
            JobApplication.user_email == user_email
        ).all()
        total = len(jobs)
        by_status = {}
        by_platform = {}
        for j in jobs:
            by_status[j.status] = by_status.get(j.status, 0) + 1
            by_platform[j.platform] = by_platform.get(j.platform, 0) + 1
        return {
            "total": total,
            "by_status": by_status,
            "by_platform": by_platform,
        }


@router.get("/{user_email}")
def list_jobs(user_email: str):
    with SessionLocal() as db:
        jobs = db.query(JobApplication).filter(
            JobApplication.user_email == user_email
        ).order_by(JobApplication.applied_at.desc()).all()
        return [_fmt(j) for j in jobs]


@router.post("")
def add_job(job: JobIn):
    with SessionLocal() as db:
        record = JobApplication(
            id=str(uuid.uuid4()),
            user_email=job.user_email,
            title=job.title,
            company=job.company,
            location=job.location,
            platform=job.platform,
            job_url=job.job_url,
            status=job.status,
            applied_at=datetime.utcnow(),
            proof=job.proof,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        return _fmt(record)


@router.patch("/{job_id}/status")
def update_status(job_id: str, body: StatusIn):
    with SessionLocal() as db:
        job = db.get(JobApplication, job_id)
        if not job:
            raise HTTPException(404, "Job not found")
        job.status = body.status
        db.commit()
        return _fmt(job)


def _fmt(j: JobApplication) -> dict:
    return {
        "id": j.id,
        "user_email": j.user_email,
        "title": j.title,
        "company": j.company,
        "location": j.location,
        "platform": j.platform,
        "job_url": j.job_url,
        "status": j.status,
        "applied_at": j.applied_at.isoformat() if j.applied_at else None,
        "proof": j.proof,
    }
