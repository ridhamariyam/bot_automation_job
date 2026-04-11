"""
Resume PDF builder.

Renders Jinja2 HTML template then converts to PDF via WeasyPrint.
WeasyPrint's system dependencies (pango, cairo, fontconfig) are
already present on Render because `playwright install --with-deps`
installs them as chromium dependencies.
"""
import json
import logging
from collections import defaultdict
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

TEMPLATE_DIR  = Path(__file__).parent.parent / "templates"
TEMPLATE_NAME = "resume_template.html"


def build_resume_pdf(resume_data: dict) -> bytes:
    """
    Convert a resume data dict to PDF bytes.
    resume_data keys come directly from the Resume + related rows.
    """
    ctx = _build_template_context(resume_data)
    html = _render_html(ctx)
    return _html_to_pdf(html)


def _build_template_context(d: dict) -> dict:
    """Prepare template variables, including parsed JSON bullets."""
    ctx = dict(d)

    # Parse JSON bullets on experiences
    for exp in ctx.get("experiences", []):
        raw = exp.get("bullets") or "[]"
        try:
            exp["bullets_list"] = json.loads(raw) if isinstance(raw, str) else (raw or [])
        except Exception:
            exp["bullets_list"] = [raw] if raw else []

    # Parse JSON bullets on projects
    for proj in ctx.get("projects", []):
        raw = proj.get("bullets") or "[]"
        try:
            proj["bullets_list"] = json.loads(raw) if isinstance(raw, str) else (raw or [])
        except Exception:
            proj["bullets_list"] = [raw] if raw else []

    # Group skills by category
    skills_by_category: dict[str, list[str]] = defaultdict(list)
    for s in ctx.get("skills", []):
        cat = s.get("category") or "Skills"
        skills_by_category[cat].append(s.get("skill", ""))
    ctx["skills_by_category"] = dict(skills_by_category)

    return ctx


def _render_html(context: dict) -> str:
    try:
        from jinja2 import Environment, FileSystemLoader
        env      = Environment(loader=FileSystemLoader(str(TEMPLATE_DIR)))
        template = env.get_template(TEMPLATE_NAME)
        return template.render(**context)
    except Exception as e:
        logger.error("Jinja2 render failed: %s", e)
        raise


def _html_to_pdf(html: str) -> bytes:
    try:
        from weasyprint import HTML, CSS
        return HTML(string=html, base_url=str(TEMPLATE_DIR)).write_pdf()
    except ImportError:
        logger.warning("WeasyPrint not installed — returning raw HTML bytes")
        return html.encode("utf-8")
    except Exception as e:
        logger.error("WeasyPrint PDF generation failed: %s", e)
        raise
