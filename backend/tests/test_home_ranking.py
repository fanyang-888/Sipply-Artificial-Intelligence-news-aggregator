"""Homepage ranking: radar attention, caps on papers / newsletters, a news lead."""

from __future__ import annotations

from app.services.home_ranking import Candidate, rank_home, story_kind


def cand(cid, score, age=0.0, attention=0.0, kind="news"):
    return Candidate(cid, score, age, attention, kind)


def ids(ranked):
    return [cid for cid, _ in ranked]


def test_radar_attention_lifts_a_story_people_are_talking_about():
    quiet = cand("climate blog", 63.8)
    talked_about = cand("Gemini 4 Argon", 57.0, attention=89)  # 57 + 0.25 × 89 ≈ 79
    assert ids(rank_home([quiet, talked_about], limit=2)) == ["Gemini 4 Argon", "climate blog"]


def test_attention_does_not_beat_age_forever():
    old_buzz = cand("old", 57.0, age=10, attention=100)  # 82 × e^-1.5 ≈ 18
    fresh = cand("fresh", 55.0)
    assert ids(rank_home([old_buzz, fresh], limit=2)) == ["fresh", "old"]


def test_at_most_two_papers_and_one_newsletter():
    stories = [cand(f"paper {i}", 70 - i, kind="research") for i in range(4)]
    stories += [cand(f"issue {i}", 69 - i, kind="newsletter") for i in range(2)]
    stories += [cand(f"news {i}", 50 - i) for i in range(4)]
    ranked = ids(rank_home(stories, limit=6))
    assert sum(r.startswith("paper") for r in ranked) == 2
    assert sum(r.startswith("issue") for r in ranked) == 1
    assert len(ranked) == 6


def test_the_lead_story_is_news_when_there_is_any():
    ranked = ids(rank_home([cand("paper", 70, kind="research"), cand("news", 50)], limit=2))
    assert ranked == ["news", "paper"]


def test_caps_give_way_when_there_are_not_enough_stories():
    papers = [cand(f"paper {i}", 60 - i, kind="research") for i in range(4)]
    assert ids(rank_home(papers, limit=3)) == ["paper 0", "paper 1", "paper 2"]


def test_story_kind():
    assert story_kind({"research"}) == "research"
    assert story_kind({"newsletter"}) == "newsletter"
    assert story_kind({"research", "tech_press"}) == "news"  # a paper the press picked up
    assert story_kind(set()) == "news"  # unknown sources count as news
