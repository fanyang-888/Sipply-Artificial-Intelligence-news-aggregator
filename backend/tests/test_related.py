"""Related stories: same subject, not just the same cluster type."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.services.related import StoryText, rank_related

NOW = datetime(2026, 10, 14, 12, tzinfo=timezone.utc)


def story(sid, title, summary="", tag=None, days=0):
    return StoryText(sid, title, summary, tag, NOW - timedelta(days=days))


CLIMATE = story(
    "climate",
    "HiRO-ACEv2: Simulating extreme weather at 3 km resolution for a fraction of the cost",
    "A climate emulator that simulates extreme weather events at 3 km resolution.",
    "Research",
)


def test_unrelated_high_scoring_stories_are_not_related():
    newsletters = [
        story(f"import-ai-{n}", f"Import AI {n}: Creativity and RSI; open weight models; AI goes to space", tag="Research")
        for n in (460, 462, 465, 476)
    ]
    weather = story("weather", "Google's weather model forecasts extreme weather days ahead", "Extreme weather forecasting.")
    assert rank_related(CLIMATE, newsletters + [weather]) == ["weather"]
    assert rank_related(CLIMATE, newsletters) == []


def test_same_company_counts_and_order_is_by_score():
    target = story("t", "Anthropic launches Claude Haiku 5.5", "Anthropic's new small model.", "Model Release")
    near = story("near", "Claude Haiku 5.5 benchmarks: faster and cheaper", "Benchmarks of the new Haiku model.")
    company = story("company", "Anthropic revenue jumps to $16.8B in third quarter", "Quarterly revenue.", "Funding")
    other = story("other", "Nvidia ships new GPUs for data centers", "Hardware news.")
    assert rank_related(target, [other, company, near]) == ["near", "company"]


def test_limit_and_empty_input():
    target = story("t", "OpenAI fires three safety researchers")
    many = [story(f"s{i}", f"OpenAI fires safety researchers, report {i}") for i in range(6)]
    assert len(rank_related(target, many, limit=4)) == 4
    assert rank_related(target, []) == []
