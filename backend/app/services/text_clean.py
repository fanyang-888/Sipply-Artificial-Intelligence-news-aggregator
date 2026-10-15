"""Clean text that came from feeds before it is stored or shown.

Some feeds encode titles twice, so after feedparser decodes them once a title
still reads "ChatGPT isn&#8217;t safe" (seen on The Verge, 2026-10-15). Decoding
until no entity is left (at most twice) fixes that without touching text that
merely contains an ampersand.
"""

from __future__ import annotations

import html
import re

_ENTITY = re.compile(r"&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z][a-zA-Z0-9]{1,30});")
_SPACE = re.compile(r"\s+")


def clean_title(text: str | None) -> str:
    """Decode leftover HTML entities (double-encoded feeds) and collapse whitespace."""
    if not text:
        return ""
    out = text
    for _ in range(2):
        if not _ENTITY.search(out):
            break
        out = html.unescape(out)
    return _SPACE.sub(" ", out).strip()
