from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape

log = logging.getLogger(__name__)

TEMPLATES = Path(__file__).parent / "templates"


def render_html(context: dict[str, Any]) -> str:
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES)),
        autoescape=select_autoescape(["html", "j2"]),
    )
    css = (TEMPLATES / "brief.css").read_text()
    template = env.get_template("brief.html.j2")
    return template.render(css=css, **context)


def humanize_date(d: datetime) -> str:
    return d.strftime("%a · %b %-d, %Y") if hasattr(d, "strftime") else str(d)
