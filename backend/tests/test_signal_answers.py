"""AI answer tracking: parsing a web-search response, the daily checks, and the API."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from openai.types.responses import Response

from app.signals import answers as A

NOW = datetime(2026, 10, 15, 14, 5, tzinfo=timezone.utc)


def sdk_response(*, cited, sources, text="Brad Smith said AI is less regulated than milk."):
    """A Responses API result in the documented shape, validated by the SDK's own model."""
    annotations = [
        {"type": "url_citation", "url": url, "title": f"Title {i}", "start_index": 0, "end_index": 10}
        for i, url in enumerate(cited)
    ]
    return Response.model_validate(
        {
            "id": "resp_1",
            "object": "response",
            "created_at": 1792000000,
            "model": "gpt-4.1-mini",
            "status": "completed",
            "parallel_tool_calls": True,
            "tool_choice": "required",
            "tools": [{"type": "web_search", "search_context_size": "medium"}],
            "output": [
                {
                    "type": "web_search_call",
                    "id": "ws_1",
                    "status": "completed",
                    "action": {
                        "type": "search",
                        "query": "Microsoft president AI regulation milk",
                        "sources": [{"type": "url", "url": u} for u in sources],
                    },
                },
                {
                    "type": "message",
                    "id": "msg_1",
                    "role": "assistant",
                    "status": "completed",
                    "content": [{"type": "output_text", "text": text, "annotations": annotations}],
                },
            ],
            "usage": {
                "input_tokens": 1200,
                "input_tokens_details": {"cached_tokens": 0, "cache_write_tokens": 0},
                "output_tokens": 300,
                "output_tokens_details": {"reasoning_tokens": 0},
                "total_tokens": 1500,
            },
        }
    )


# ---------------------------------------------------------------------------
# Pure parts
# ---------------------------------------------------------------------------

def test_domains_and_sipply():
    assert A.domain_of("https://www.TechCrunch.com/2026/10/x") == "techcrunch.com"
    assert A.is_sipply("https://www.sipply.dev/cluster/abc") and A.is_sipply("https://sipply.dev/")
    assert not A.is_sipply("https://notsipply.dev/") and not A.is_sipply("https://sipply.dev.evil.com/")


def test_parse_response_reads_citations_sources_and_usage():
    parsed = A.parse_response(
        sdk_response(
            cited=["https://www.theguardian.com/a", "https://techcrunch.com/b", "https://www.theguardian.com/a"],
            sources=["https://www.theguardian.com/a", "https://techcrunch.com/b", "https://www.sipply.dev/cluster/1"],
        )
    )
    assert parsed["answer"].startswith("Brad Smith")
    assert [c["domain"] for c in parsed["citations"]] == ["theguardian.com", "techcrunch.com"]  # deduped, in order
    assert parsed["citations"][0]["title"] == "Title 0"
    assert len(parsed["sources"]) == 3 and parsed["searches"] == 1
    assert (parsed["input_tokens"], parsed["output_tokens"]) == (1200, 300)
    # one search: $0.01 + 8,000 search tokens + 1,200 in + 300 out at gpt-4.1-mini rates
    assert A.estimate_cost(parsed) == round(0.01 + 9200 * 0.40e-6 + 300 * 1.60e-6, 5)


def test_parse_response_tolerates_missing_parts():
    parsed = A.parse_response(SimpleNamespace(output=None, usage=None))
    assert parsed == {"answer": "", "citations": [], "sources": [], "searches": 0, "input_tokens": 0, "output_tokens": 0}


# ---------------------------------------------------------------------------
# The daily checks (DB)
# ---------------------------------------------------------------------------

class FakeOpenAI:
    def __init__(self, respond):
        self.calls: list[dict] = []
        self.respond = respond
        self.responses = SimpleNamespace(create=self._create)

    def _create(self, **kw):
        self.calls.append(kw)
        return self.respond(kw["input"])


def seed(db, make_cluster):
    from sqlalchemy import delete

    from app.models.answer_check import AnswerCheck
    from app.models.signal import SignalTopic

    db.execute(delete(AnswerCheck))
    db.execute(delete(SignalTopic))
    story = make_cluster(title="Microsoft president says AI is less regulated than milk")
    rows = [
        # (label, signals, platforms, score, question, covered story)
        ("AI less regulated than milk", 60, {"hn": 2, "news": 58}, 80.0, "What did Microsoft's president say about AI and milk?", story.id),
        ("NTT data center for Anthropic", 15, {"news": 15}, 70.0, "Is NTT building a data center for Anthropic in Japan?", None),
        ("Three Claude videos", 3, {"youtube": 3}, 75.0, "Which Claude videos are popular?", None),  # weak signal: skipped
        ("No question yet", 20, {"news": 20}, 90.0, None, None),
    ]
    for label, n, sources, score, question, covered in rows:
        db.add(SignalTopic(label=label, signal_count=n, source_counts=sources, score=score, question_en=question, covered_cluster_id=covered))
    db.flush()
    return story


def test_run_checks_asks_inner_ring_questions_and_records_citations(db, make_cluster):
    from sqlalchemy import select

    from app.models.answer_check import AnswerCheck

    story = seed(db, make_cluster)

    def respond(question):
        if "milk" in question:
            return sdk_response(cited=["https://www.sipply.dev/cluster/1", "https://www.theguardian.com/a"], sources=["https://www.sipply.dev/cluster/1"])
        return sdk_response(cited=["https://www.reuters.com/x"], sources=["https://www.reuters.com/x", "https://www.sipply.dev/x"])

    fake = FakeOpenAI(respond)
    summary = A.run_checks(db, fake, now=NOW)
    assert (summary["questions"], summary["checked"], summary["sipply_cited"], summary["failed"]) == (2, 2, 1, 0)
    assert summary["cost_usd"] > 0
    assert [c["input"] for c in fake.calls] == [
        "What did Microsoft's president say about AI and milk?",
        "Is NTT building a data center for Anthropic in Japan?",
    ]
    call = fake.calls[0]
    assert call["tools"] == [{"type": "web_search", "search_context_size": "medium"}]
    assert call["tool_choice"] == "required" and call["include"] == ["web_search_call.action.sources"]

    checks = {c.topic_label: c for c in db.execute(select(AnswerCheck)).scalars()}
    milk, ntt = checks["AI less regulated than milk"], checks["NTT data center for Anthropic"]
    assert (milk.sipply_cited, milk.sipply_in_sources, milk.covered_cluster_id) == (True, True, story.id)
    assert (ntt.sipply_cited, ntt.sipply_in_sources, ntt.covered_cluster_id) == (False, True, None)
    assert milk.citations[1]["domain"] == "theguardian.com" and milk.model == A.MODEL


def test_run_checks_stops_at_the_first_api_error_and_prunes_old_rows(db, make_cluster):
    from sqlalchemy import func, select

    from app.models.answer_check import AnswerCheck

    seed(db, make_cluster)
    db.add(AnswerCheck(checked_at=NOW - timedelta(days=100), question="old", model="m", citations=[], sources=[]))
    db.flush()

    def boom(question):
        raise RuntimeError("429 insufficient_quota")

    fake = FakeOpenAI(boom)
    summary = A.run_checks(db, fake, now=NOW)
    assert len(fake.calls) == 1 and (summary["checked"], summary["failed"], summary["pruned"]) == (0, 2, 1)
    assert db.execute(select(func.count()).select_from(AnswerCheck)).scalar_one() == 0


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

def test_answers_endpoint_and_topic_check(db, make_cluster, monkeypatch):
    from fastapi.testclient import TestClient

    from app.api.routes import radar as R
    from app.db import get_db
    from app.main import app

    monkeypatch.setattr(R, "cache_get", lambda key: None)
    monkeypatch.setattr(R, "cache_set", lambda key, value: None)
    seed(db, make_cluster)

    def respond(question):
        if "milk" in question:
            return sdk_response(cited=["https://www.sipply.dev/cluster/1", "https://www.theguardian.com/a"], sources=[])
        return sdk_response(cited=["https://www.theguardian.com/b", "https://www.reuters.com/x"], sources=[])

    from app.auth import get_current_user

    A.run_checks(db, FakeOpenAI(respond), now=datetime.now(timezone.utc))
    app.dependency_overrides[get_db] = lambda: db
    try:
        client = TestClient(app)
        body = client.get("/api/radar/answers").json()
        topics = {t["label"]: t for t in client.get("/api/radar").json()["topics"]}
        unauthorized = client.get("/api/admin/radar/answers").status_code
        app.dependency_overrides[get_current_user] = lambda: "editor"
        admin = client.get("/api/admin/radar/answers").json()
    finally:
        app.dependency_overrides.clear()

    # Public: which sites the assistant cites, nothing about whether it cited Sipply
    assert (body["checks"], body["questions"]) == (2, 2)
    assert not any("sipply" in key.lower() for key in body)
    assert not any("sipply" in key.lower() for r in body["recent"] for key in r)
    assert body["topDomains"][0] == {"domain": "theguardian.com", "citations": 2, "share": 1.0}
    # Editor: the Sipply numbers, behind the admin login
    assert unauthorized == 401
    assert (admin["checks"], admin["sipplyCited"], admin["sipplyCovered"], admin["sipplyCitedWhenCovered"]) == (2, 1, 1, 1)
    assert {r["sipplyHasStory"] for r in admin["recent"]} == {True, False}
    assert {r["question"] for r in body["recent"]} == {
        "What did Microsoft's president say about AI and milk?",
        "Is NTT building a data center for Anthropic in Japan?",
    }

    milk = topics["AI less regulated than milk"]
    assert milk["question"] == "What did Microsoft's president say about AI and milk?"
    assert "sipplyCited" not in milk["answerCheck"]
    assert [c["domain"] for c in milk["answerCheck"]["citations"]] == ["sipply.dev", "theguardian.com"]
    assert topics["No question yet"]["answerCheck"] is None
