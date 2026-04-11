"""
Job Classifier — backend/services/job_classifier.py

Re-exports from backend/ai/job_classifier.py so both import paths work:
  from ai.job_classifier import score_job_relevance          # legacy
  from services.job_classifier import score_job_relevance    # spec-required path
"""
from ai.job_classifier import (
    score_job_relevance,
    filter_relevant_jobs,
    _keyword_score,
)

__all__ = [
    "score_job_relevance",
    "filter_relevant_jobs",
    "_keyword_score",
]
