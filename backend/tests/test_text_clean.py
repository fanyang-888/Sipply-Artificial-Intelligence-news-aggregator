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


@pytest.mark.parametrize(
    ("raw", "clean"),
    [
        # Seen 2026-10-18: TechCrunch's feed titles now end in the site name, and Sipply's
        # headline (page title, JSON-LD headline, home page) read "... | TechCrunch | Sipply"
        ("Replit is no longer working with Anthropic, CEO says | TechCrunch", "Replit is no longer working with Anthropic, CEO says"),
        ("Disney agrees to hire the majority of Character.AI’s workforce | TechCrunch", "Disney agrees to hire the majority of Character.AI’s workforce"),
        ("Singapore office and government MOU | Anthropic", "Singapore office and government MOU"),
        ("Sora gets a new app - The Verge", "Sora gets a new app"),
        ("New chips announced — Ars Technica", "New chips announced"),
        # Only a known publisher's name is removed; other separators stay
        ("Claude vs GPT | which one to pick", "Claude vs GPT | which one to pick"),
        ("GPT-6 - what changed", "GPT-6 - what changed"),
        ("Why TechCrunch matters", "Why TechCrunch matters"),
        ("TechCrunch", "TechCrunch"),  # never empties a title
    ],
)
def test_clean_title_drops_a_trailing_publisher_name(raw, clean):
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
