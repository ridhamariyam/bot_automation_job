"""
LinkedIn Posts adapter — detects hiring posts from recruiters/hiring managers
in the LinkedIn feed and extracts recruiter contact information.

This module re-exports from linkedin_hiring.py (same functionality,
named linkedin_posts.py to match the platform adapter naming convention).
"""
from bot.platforms.linkedin_hiring import scan_linkedin_feed_for_hiring_posts

__all__ = ["scan_linkedin_feed_for_hiring_posts"]
