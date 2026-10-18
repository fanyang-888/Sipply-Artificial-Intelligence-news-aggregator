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

# Publishers whose titles can end in their own name ("... | TechCrunch", seen 2026-10-18).
# Only these names are removed, so a title that merely contains " | " or " - " is kept.
_PUBLISHERS = (
    "TechCrunch", "The Verge", "Ars Technica", "The Register", "VentureBeat", "WIRED", "Wired",
    "Reuters", "Bloomberg", "Engadget", "CNBC", "Axios", "Anthropic", "OpenAI", "Google DeepMind",
    "DeepMind", "Google", "Hugging Face", "Meta AI", "Meta", "Import AI", "AI News", "MIT Technology Review",
)
_PUBLISHER_SUFFIX = re.compile(
    r"\s+[|\-–—]\s+(?:%s)\s*$" % "|".join(re.escape(p) for p in sorted(_PUBLISHERS, key=len, reverse=True)),
    re.IGNORECASE,
)


def clean_title(text: str | None) -> str:
    """Decode leftover HTML entities (double-encoded feeds), collapse whitespace and drop a
    trailing publisher name."""
    if not text:
        return ""
    out = text
    for _ in range(2):
        if not _ENTITY.search(out):
            break
        out = html.unescape(out)
    out = _SPACE.sub(" ", out).strip()
    # The story's own headline, not "<headline> | <publisher>"
    stripped = _PUBLISHER_SUFFIX.sub("", out).strip()
    return stripped or out
