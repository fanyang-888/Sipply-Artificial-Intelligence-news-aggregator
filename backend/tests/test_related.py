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


# ---------------------------------------------------------------------------
# All at once (the pipeline's relate_stories stage)
# ---------------------------------------------------------------------------

from app.services.related import related_for_all  # noqa: E402


def test_all_at_once_ranks_like_one_at_a_time():
    newsletters = [
        story(f"import-ai-{n}", f"Import AI {n}: Creativity and RSI; open weight models; AI goes to space", tag="Research")
        for n in (460, 462, 465, 476)
    ]
    weather = story("weather", "Google's weather model forecasts extreme weather days ahead", "Extreme weather forecasting.")
    target = story("t", "Anthropic launches Claude Haiku 5.5", "Anthropic's new small model.", "Model Release")
    near = story("near", "Claude Haiku 5.5 benchmarks: faster and cheaper", "Benchmarks of the new Haiku model.")
    company = story("company", "Anthropic revenue jumps to $16.8B in third quarter", "Quarterly revenue.", "Funding")
    other = story("other", "Nvidia ships new GPUs for data centers", "Hardware news.")
    stories = [CLIMATE, *newsletters, weather, target, near, company, other]

    related = related_for_all(stories, targets=[0, 6])
    assert related == {"climate": ["weather"], "t": ["near", "company"]}  # never itself


def test_all_at_once_only_looks_within_the_window():
    target = story("t", "OpenAI fires three safety researchers")
    close = story("close", "OpenAI fires safety researchers over leak", days=10)
    far = story("far", "OpenAI fires safety researchers, a year on", days=200)
    assert related_for_all([target, close, far], targets=[0, 2]) == {"t": ["close"], "far": []}
    assert related_for_all([], targets=[]) == {}


def test_the_stage_stores_related_stories_for_recent_and_new_stories(db, make_cluster):
    from sqlalchemy import delete

    from app.models.cluster import Cluster
    from app.services.related import assign_related

    db.execute(delete(Cluster))
    now = NOW
    haiku = make_cluster(title="Anthropic launches Claude Haiku 5.5", summary="Anthropic's new small model.", last_seen_at=now - timedelta(days=1))
    bench = make_cluster(title="Claude Haiku 5.5 benchmarks: faster and cheaper", summary="Benchmarks of the new Haiku model.", last_seen_at=now - timedelta(days=2))
    # Old, and worked out on an earlier run: left as it is
    old = make_cluster(title="Claude Haiku 5 benchmarks", summary="Benchmarks.", last_seen_at=now - timedelta(days=90), related_ids=["kept"])
    # Old, never worked out: done once
    older = make_cluster(title="Claude Haiku 5 launches", summary="Anthropic's small model.", last_seen_at=now - timedelta(days=100))
    # Not public yet (no Chinese title): neither related nor given related stories
    draft = make_cluster(title="Claude Haiku 5.5 benchmarks draft", title_zh=None, last_seen_at=now - timedelta(days=1))

    summary = assign_related(db, now=now)
    assert summary == {"stories": 4, "related": 3}
    for c in (haiku, bench, old, older, draft):
        db.refresh(c)
    assert haiku.related_ids == [str(bench.id)] and bench.related_ids == [str(haiku.id)]
    assert old.related_ids == ["kept"] and older.related_ids == [str(old.id)]
    assert draft.related_ids is None
