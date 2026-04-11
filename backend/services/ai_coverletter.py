"""
AI Cover Letter Generator — backend/services/ai_coverletter.py

Re-exports from backend/ai/cover_letter.py so both import paths work:
  from ai.cover_letter import generate_cover_letter          # legacy
  from services.ai_coverletter import generate_cover_letter  # spec-required path
"""
from ai.cover_letter import (
    generate_cover_letter,
    generate_cover_letter_batch,
    _template_cover_letter,
)

__all__ = [
    "generate_cover_letter",
    "generate_cover_letter_batch",
    "_template_cover_letter",
]
