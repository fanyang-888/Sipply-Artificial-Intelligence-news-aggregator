"""Keyword rules that map a signal title to one of the cluster ``topic_tag`` values.

Same categories and priority order as the clusters backfill
(migrations/versions/w3d3_backfill_topic_tags.py), but matched on word
boundaries: "api" no longer matches "capital", nor "fund" "fundamental".
A keyword ending in "*" is a prefix ("acqui*" matches "acquires"); one
starting with "re:" is a raw regular expression.

Bare model names (Claude, Gemini…) are not release signals on their own —
community posts mention them constantly — so Model Release needs a version
number next to the name ("Gemini 4", "GPT-6.1") or release wording.
Unlike the backfill, "launch" counts as Product Launch (see below).
"""

from __future__ import annotations

import re
from collections import Counter

_MODEL_VERSION = (
    r"re:\b(gpt|claude|gemini|llama|mistral|qwen|deepseek|sonnet|opus|haiku|grok|phi|gemma)"
    r"(\s+[a-z]+)?[\s-]?v?\d"  # one optional word between: "Mistral Large 4"
)
_MONEY = r"re:\$\d[\d.,]*\s?(k|m|b|bn|million|billion|trillion)\b"

_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("Funding", ("funding", "funded", "fundrais*", "investment*", "investor*", "invests",
                 "invested", "series a", "series b", "series c", "seed round", "valuation*",
                 "acquire*", "acquisition*", "acquihire*", "ipo", "venture", "revenue*", _MONEY)),
    ("Model Release", ("release*", "new model", "weights", "system card", _MODEL_VERSION)),
    # "research", not "research*": "safety researchers fired" is a Safety story
    ("Research", ("research", "paper*", "arxiv", "study", "studies", "dataset*", "training",
                  "preprint*", "findings", "experiment*", "mathematic*", "manuscript*")),
    ("Safety", ("safety", "alignment", "bias", "risk*", "harmful", "guardrail*", "jailbreak*",
                "red team*", "responsible", "ethic*", "rogue", "conscious*", "misuse")),
    ("Regulation", ("regulat*", "policy", "policies", "law", "laws", "lawsuit*", "sue", "sues",
                    "sued", "suing", "govern*", "legislat*", "congress", "eu ai act", "compliance",
                    "ban", "bans", "banned", "legal", "court")),
    # "launch" lives here, not under Model Release: most launches in community
    # posts are products and features; model launches carry a version number
    ("Product Launch", ("launch*", "product*", "feature*", "update*", "plugin*", "integration*",
                        "api", "apis", "sdk", "tool*", "chatbot*", "assistant*", "app", "apps",
                        "beta", "agent*")),
    ("Open Source", ("open source", "open-source", "open weight*", "open-weight*", "github",
                     "hugging face", "mit license", "apache", "self-hosted", "local llm*")),
    ("Infrastructure", ("infrastructure", "cloud", "gpu*", "chip*", "hardware", "data center*",
                        "datacenter*", "nvidia", "amd", "tpu*", "compute", "inference")),
    ("Benchmark", ("benchmark*", "leaderboard*", "eval", "evals", "mmlu", "humaneval", "sota",
                   "state-of-the-art")),
]


def _compile(keyword: str) -> str:
    if keyword.startswith("re:"):
        return keyword[3:]
    if keyword.endswith("*"):
        return r"\b" + re.escape(keyword[:-1])
    return r"\b" + re.escape(keyword) + r"\b"


_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (tag, re.compile("|".join(_compile(k) for k in keywords), re.IGNORECASE))
    for tag, keywords in _RULES
]
_PRIORITY = {tag: i for i, (tag, _) in enumerate(_RULES)}


def tag_title(title: str) -> str:
    """First matching rule wins; "Other" when nothing matches."""
    for tag, pattern in _PATTERNS:
        if pattern.search(title):
            return tag
    return "Other"


def tag_titles(titles: list[str]) -> str:
    """Majority tag across a topic's titles, ignoring "Other"; ties go to rule priority."""
    votes = Counter(t for t in (tag_title(x) for x in titles) if t != "Other")
    if not votes:
        return "Other"
    return min(votes, key=lambda t: (-votes[t], _PRIORITY[t]))
