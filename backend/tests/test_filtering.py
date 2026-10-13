"""Low-signal filter rules (app.services.filtering._check)."""

from types import SimpleNamespace

from app.services.filtering import MIN_WORD_COUNT, _check

LONG_AI_BODY = " ".join(["The new language model improves inference speed."] * 30)


def article(**kw):
    defaults = dict(
        word_count=400,
        title="OpenAI ships a faster reasoning model",
        excerpt=None,
        cleaned_text=LONG_AI_BODY,
        raw_text=None,
    )
    defaults.update(kw)
    return SimpleNamespace(**defaults)


def test_passes_a_normal_ai_article():
    result = _check(article())
    assert result.is_filtered_out is False
    assert result.reason is None


def test_short_body_is_filtered():
    result = _check(article(word_count=10, cleaned_text="Too short to be a story."))
    assert (result.is_filtered_out, result.reason) == (True, "short_body")


def test_missing_word_count_falls_back_to_counting_text():
    # word_count was never set at ingest, but the body is long enough
    result = _check(article(word_count=None, cleaned_text=LONG_AI_BODY))
    assert result.is_filtered_out is False


def test_word_count_threshold_is_inclusive():
    body = " ".join(["model"] * MIN_WORD_COUNT)
    assert _check(article(word_count=MIN_WORD_COUNT, cleaned_text=body)).is_filtered_out is False


def test_short_title_is_filtered():
    result = _check(article(title="  Menu  "))
    assert (result.is_filtered_out, result.reason) == (True, "short_title")


def test_off_topic_is_filtered():
    bakery = " ".join(["The bakery on Main Street sold out of sourdough again."] * 20)
    result = _check(
        article(title="Local bakery wins regional sourdough award", cleaned_text=bakery)
    )
    assert (result.is_filtered_out, result.reason) == (True, "off_topic")


def test_ai_keyword_in_title_alone_keeps_article():
    bakery = " ".join(["The bakery on Main Street sold out of sourdough again."] * 20)
    result = _check(article(title="Bakery uses an LLM to plan its menu", cleaned_text=bakery))
    assert result.is_filtered_out is False


def test_feed_summary_body_is_not_too_short():
    # body_from_feed sources (OpenAI) store the RSS summary: a sentence or two by design
    summary = "Asana made its browser agent 76x cheaper and 5x faster in tests with GPT-6.1 Sol."
    feed = article(word_count=15, cleaned_text=summary, raw_meta={"full_fetch": {"extraction_method": "feed_summary"}})
    assert _check(feed).is_filtered_out is False
    fetched = article(word_count=15, cleaned_text=summary, raw_meta={"full_fetch": {"extraction_method": "dom_fallback"}})
    assert _check(fetched).reason == "short_body"


def test_ai_lab_newsroom_posts_are_never_off_topic():
    no_keywords = dict(title="2026 Usage Policy update", excerpt="We are updating the policy that governs use of our services.")
    assert _check(article(**no_keywords)).reason == "off_topic"
    lab = article(**no_keywords, source=SimpleNamespace(type="company_news"))
    assert _check(lab).is_filtered_out is False
    press = article(**no_keywords, source=SimpleNamespace(type="tech_press"))
    assert _check(press).reason == "off_topic"


def test_chatgpt_and_codex_count_as_ai_keywords():
    result = _check(article(title="How Oracle turns days of work into minutes with ChatGPT and Codex", excerpt="Across recruiting and operations."))
    assert result.is_filtered_out is False
