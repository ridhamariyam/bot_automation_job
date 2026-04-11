"""
Recruiter Detector — backend/services/recruiter_detector.py

Re-exports from backend/ai/hiring_post_detector.py so both import paths work:
  from ai.hiring_post_detector import classify_hiring_post         # legacy
  from services.recruiter_detector import classify_hiring_post     # spec-required path
"""
from ai.hiring_post_detector import (
    classify_hiring_post,
    extract_contacts_regex,
    extract_contact_from_text,
    classify_and_extract_batch,
)

__all__ = [
    "classify_hiring_post",
    "extract_contacts_regex",
    "extract_contact_from_text",
    "classify_and_extract_batch",
]
