"""Merging stories that report the same event: candidates, the GPT judge, the DB stage, old addresses."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.models.story_redirect import StoryRedirect
from app.services import story_merge as M

NOW = datetime(2026, 10, 18, 2, 0, tzinfo=timezone.utc)

# Real stories from 2026-10-13…17: title + the opening of Sipply's summary
META_TC = (
    "Meta removes language that raised scraping and AI training concerns. Meta has recently updated its commercial "
    "terms of use by removing specific language that had raised significant concerns regarding the scraping of content"
)
META_VERGE = (
    "Meta removes language that may have allowed it to scrape news sites. Meta has recently updated its terms of "
    "service to eliminate language that permitted the scraping of content from news sites for AI training purposes."
)
FLOW_A = (
    "FlowBudget: Training-Free Sampling-Budget Estimation for Flow Matching Models. Researchers have developed a "
    "novel approach called FLOWBUDGET, a training-free estimator for the sampling budget of flow matching models."
)
FLOW_B = (
    "Posterior Flow Matching. The recent paper on Posterior Flow Matching (PFM) presents a novel generative modeling "
    "framework that significantly enhances traditional flow matching techniques."
)
REPLIT = (
    "Replit is no longer working with Anthropic, CEO says. Replit has officially ended its partnership with AI "
    "company Anthropic, as revealed by CEO Amjad Masad at the TechCrunch Disrupt event."
)


def test_candidates_pair_similar_news_but_never_two_papers():
    texts = [META_TC, META_VERGE, FLOW_A, FLOW_B, REPLIT]
    kinds = ["news", "news", "research", "research", "news"]
    seen = [NOW - timedelta(days=1)] * 5
    pairs = M.candidate_pairs(texts, kinds=kinds, seen=seen)
    assert [(i, j) for i, j, _ in pairs][:1] == [(0, 1)]
    assert (2, 3) not in [(i, j) for i, j, _ in pairs]  # papers on one method are separate works
    assert all(a >= b for (_, _, a), (_, _, b) in zip(pairs, pairs[1:]))  # most similar first


def test_candidates_skip_stories_far_apart_and_pairs_already_judged():
    texts = [META_TC, META_VERGE]
    kinds = ["news", "news"]
    assert M.candidate_pairs(texts, kinds=kinds, seen=[NOW, NOW - timedelta(days=M.MAX_DAYS_APART + 1)]) == []
    assert M.candidate_pairs(texts, kinds=kinds, seen=[NOW, NOW], skip={(0, 1)}) == []
    assert M.candidate_pairs([META_TC], kinds=["news"], seen=[NOW]) == []


class FakeOpenAI:
    """Stands in for openai.OpenAI. ``same(a, b)`` answers a pair; ``rows`` overrides the reply."""

    def __init__(self, same=lambda a, b: False, rows=None):
        self.calls: list[list[dict]] = []
        self.same = same
        self.rows = rows
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    def _create(self, **kw):
        sent = json.loads(kw["messages"][1]["content"])
        self.calls.append(sent)
        rows = self.rows if self.rows is not None else [{"id": p["id"], "same": self.same(p["a"], p["b"])} for p in sent]
        message = SimpleNamespace(content=json.dumps({"pairs": rows}))
        return SimpleNamespace(
            choices=[SimpleNamespace(message=message)], usage=SimpleNamespace(prompt_tokens=800, completion_tokens=40)
        )


def both_mention(word):
    return lambda a, b: all(word in " ".join(s["headlines"]) for s in (a, b))


def test_judge_sends_headlines_and_summary_and_reads_yes_or_no():
    pairs = [
        ({"headlines": ["Meta removes language"], "about": "Meta updated its terms."},
         {"headlines": ["Meta removes scraping language"], "about": "Meta changed its terms."}),
        ({"headlines": ["Replit drops Anthropic"], "about": "Replit ended it."},
         {"headlines": ["Cerebras CEO on doom"], "about": "Feldman spoke."}),
    ]
    fake = FakeOpenAI(same=both_mention("Meta"))
    verdicts, p, c = M.judge_pairs(fake, pairs)
    assert verdicts == [True, False] and (p, c) == (800, 40)
    assert fake.calls[0][0] == {"id": 0, "a": pairs[0][0], "b": pairs[0][1]}

    # Missing, out of range or not a yes/no: no verdict, so nothing is merged
    fake = FakeOpenAI(rows=[{"id": 0, "same": "yes"}, {"id": 7, "same": True}, "junk"])
    assert M.judge_pairs(fake, pairs)[0] == [None, None]


# ---------------------------------------------------------------------------
# The stage (DB)
# ---------------------------------------------------------------------------

def about_meta_terms(story):
    text = " ".join(story["headlines"]).lower()
    return "scrap" in text or "terms" in text


def same_meta_terms(a, b):
    return about_meta_terms(a) and about_meta_terms(b)


def seed_stories(db, make_cluster, make_article, make_source):
    from sqlalchemy import delete

    from app.models.cluster import Cluster
    from app.models.signal import SignalTopic

    db.execute(delete(SignalTopic))
    db.execute(delete(Cluster))
    verge, tc = make_source(name="The Verge AI"), make_source(name="TechCrunch AI")
    arxiv = make_source(name="arXiv cs.LG", type="research")

    def story(title, *, source, hours, summary=None, slug=None, excerpt=None):
        c = make_cluster(
            title=title, summary=summary, slug=slug,
            first_seen_at=NOW - timedelta(hours=hours), last_seen_at=NOW - timedelta(hours=hours),
            created_at=NOW - timedelta(hours=hours - 1),
            summarized_at=NOW - timedelta(hours=hours - 1) if summary else None,
            translated_at=NOW - timedelta(hours=hours - 1) if summary else None,
        )
        make_article(title=title, source=source, cluster_id=c.id, excerpt=excerpt, published_at=NOW - timedelta(hours=hours))
        return c

    s = {
        # The Verge's first report, then two stories on Meta taking it back (one not summarized yet)
        "terms": story("Meta’s new terms may allow it to train AI on news sites for free", source=verge, hours=60,
                       summary="Meta has updated its terms of service, which may allow the company to scrape content from news sites for AI training.",
                       slug="metas-new-terms-may-allow-it-to-train-ai-aaaaaaaa"),
        "tc": story("Meta removes language that raised scraping and AI training concerns", source=tc, hours=30,
                    summary="Meta has updated its commercial terms of use, removing language about scraping content for AI training.",
                    slug="meta-removes-language-that-raised-scraping-bbbbbbbb"),
        "verge": story("Meta removes language that may have allowed it to scrape news sites", source=verge, hours=2,
                       excerpt="Meta updated its terms of service to remove language that let it scrape news sites for AI training."),
        # Same company, different news
        "muse": story("Meta launches an open-weight AI model that runs on Macs", source=tc, hours=20,
                      summary="Meta released Muse Spark Open, an open-weight AI model it trained on news sites and the web, under new terms of service for developers.",
                      slug="meta-launches-an-open-weight-ai-model-cccccccc"),
        "flow_a": story(FLOW_A.split(". ")[0], source=arxiv, hours=40, summary=FLOW_A, slug="flowbudget-dddddddd"),
        "flow_b": story(FLOW_B.split(". ")[0], source=arxiv, hours=45, summary=FLOW_B, slug="posterior-flow-matching-eeeeeeee"),
        "old": story("Meta’s terms of service, explained", source=verge, hours=24 * 9,
                     summary="An explainer on Meta's terms of service and scraping.", slug="metas-terms-explained-ffffffff"),
    }
    db.add(SignalTopic(label="Meta drops its news scraping terms", signal_count=9, source_counts={"news": 9}, score=60, covered_cluster_id=s["tc"].id))
    db.flush()
    return s


def test_run_merge_joins_one_event_into_its_oldest_published_story(db, make_cluster, make_article, make_source):
    from sqlalchemy import select

    from app.models.article import Article
    from app.models.cluster import Cluster
    from app.models.signal import SignalTopic

    s = seed_stories(db, make_cluster, make_article, make_source)
    # A story merged into "tc" on an earlier run
    earlier = StoryRedirect(old_id=uuid.uuid4(), old_slug="meta-scraping-terms-11111111", cluster_id=s["tc"].id)
    db.add(earlier)
    db.flush()
    fake = FakeOpenAI(same=same_meta_terms)
    summary = M.run_story_merge(db, fake, now=NOW)
    assert summary["stories"] == 6  # the 9-day-old explainer is outside the window
    assert summary["merged"] == 2 and summary["same"] >= 2 and summary["pairs"] > summary["same"]
    assert summary["cost_usd"] > 0
    sent = [(" ".join(p["a"]["headlines"]), " ".join(p["b"]["headlines"])) for call in fake.calls for p in call]
    assert not any("Flow" in a and "Flow" in b for a, b in sent)  # papers are never paired

    # The Verge's first report keeps its address and now has all three articles
    kept = db.get(Cluster, s["terms"].id)
    assert kept.article_count == 3 and kept.source_count == 2
    assert db.execute(select(Article).where(Article.cluster_id == kept.id)).scalars().all().__len__() == 3
    # …and is summarized and translated again over all its sources
    assert kept.summarized_at is None and kept.translated_at is None
    assert db.get(Cluster, s["tc"].id) is None and db.get(Cluster, s["verge"].id) is None
    assert db.get(Cluster, s["muse"].id) is not None

    redirects = {r.old_id: r for r in db.execute(select(StoryRedirect)).scalars()}
    tc = redirects[s["tc"].id]
    assert (tc.old_slug, tc.cluster_id) == ("meta-removes-language-that-raised-scraping-bbbbbbbb", kept.id)
    assert tc.snapshot["title"] == "Meta removes language that raised scraping and AI training concerns"
    assert len(tc.snapshot["article_ids"]) == 1
    assert redirects[s["verge"].id].old_slug is None  # never had a public address
    assert redirects[earlier.old_id].cluster_id == kept.id  # no redirect to a deleted story
    # The radar topic that pointed at the merged story points at the kept one
    topic = db.execute(select(SignalTopic)).scalars().one()
    assert topic.covered_cluster_id == kept.id


def test_pairs_judged_different_are_not_asked_again(db, make_cluster, make_article, make_source):
    s = seed_stories(db, make_cluster, make_article, make_source)
    first = M.run_story_merge(db, FakeOpenAI(same=same_meta_terms), now=NOW)
    assert first["pairs"] > first["same"]
    again = FakeOpenAI(same=same_meta_terms)
    second = M.run_story_merge(db, again, now=NOW)
    assert again.calls == [] and second["pairs"] == 0 and second["merged"] == 0
    assert s["muse"].id  # still there


def test_no_answer_merges_nothing_and_an_api_error_stops_the_stage(db, make_cluster, make_article, make_source):
    from app.models.cluster import Cluster

    s = seed_stories(db, make_cluster, make_article, make_source)
    summary = M.run_story_merge(db, FakeOpenAI(rows=[]), now=NOW)
    assert summary["merged"] == 0 and summary["failed"] == summary["pairs"] > 0

    def boom(**kw):
        raise RuntimeError("401 invalid_api_key")

    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=boom)))
    summary = M.run_story_merge(db, client, now=NOW)
    assert summary["merged"] == 0 and summary["failed"] == summary["pairs"] > 0
    assert all(db.get(Cluster, c.id) is not None for c in s.values())


def test_a_group_with_a_pair_judged_different_is_left_alone(db, make_cluster, make_article, make_source):
    from app.models.cluster import Cluster

    s = seed_stories(db, make_cluster, make_article, make_source)

    def same(a, b):
        heads = {" ".join(a["headlines"])[:20], " ".join(b["headlines"])[:20]}
        if heads == {"Meta’s new terms may", "Meta removes languag"} and any("may have allowed" in h for h in a["headlines"] + b["headlines"]):
            return False  # the first report and The Verge's follow-up: "different"
        return same_meta_terms(a, b)

    summary = M.run_story_merge(db, FakeOpenAI(same=same), now=NOW)
    # TechCrunch's story matches both, but they don't match each other: nothing joins on a chain
    assert summary["same"] == 2 and summary["merged"] == 0
    assert all(db.get(Cluster, s[k].id) is not None for k in ("terms", "tc", "verge"))
