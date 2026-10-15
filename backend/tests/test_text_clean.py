"""Leftover HTML entities in feed titles (double-encoded feeds)."""

from __future__ import annotations

import pytest

from app.services.text_clean import clean_title


@pytest.mark.parametrize(
    ("raw", "clean"),
    [
        ("Eight states sue OpenAI, saying ChatGPT isn&#8217;t safe for kids", "Eight states sue OpenAI, saying ChatGPT isn’t safe for kids"),
        ("Q&amp;A: what&amp;#8217;s next", "Q&A: what’s next"),  # encoded twice
        ("AT&T and R&D stay as they are", "AT&T and R&D stay as they are"),
        ("Fish &#x26; chips", "Fish & chips"),
        ("  spaced\n out  ", "spaced out"),
        (None, ""),
        ("", ""),
    ],
)
def test_clean_title(raw, clean):
    assert clean_title(raw) == clean


def test_digest_email_decodes_titles_and_escapes_html():
    from datetime import date
    from types import SimpleNamespace

    from app.services.email_service import _build_html, _build_text

    stories = [
        SimpleNamespace(representative_title="ChatGPT isn&#8217;t safe", summary="Kids <script> & parents"),
        SimpleNamespace(representative_title="A &lt;b&gt; tag", summary=None),
    ]
    page = _build_html(stories, date(2026, 10, 15))
    assert "ChatGPT isn’t safe" in page and "&#8217;" not in page
    assert "Kids &lt;script&gt; &amp; parents" in page and "<script>" not in page
    assert "A &lt;b&gt; tag" in page  # decoded once, then escaped for HTML
    assert "FEATURED: ChatGPT isn’t safe" in _build_text(stories, date(2026, 10, 15))
