"""
AI Resume Tailor — backend/services/ai_resume_tailor.py

Re-exports from backend/ai/resume_tailor.py so both import paths work:
  from ai.resume_tailor import tailor_resume_for_job          # legacy
  from services.ai_resume_tailor import tailor_resume_for_job # spec-required path
"""
from ai.resume_tailor import tailor_resume_for_job

__all__ = ["tailor_resume_for_job"]
