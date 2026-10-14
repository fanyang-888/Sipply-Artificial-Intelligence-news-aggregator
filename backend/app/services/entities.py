"""Companies and model families with their own topic page (/topics/<slug>).

A story belongs to an entity when its **title** names it. Summaries are left
out on purpose: they mention rivals in passing ("…to compete with OpenAI and
Anthropic"), which would file a Meta launch under OpenAI too. Patterns are
case-sensitive where the plain word means something else ("meta-learning",
"apple orchard").
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class Entity:
    slug: str
    name: str
    patterns: tuple[re.Pattern[str], ...]

    def matches(self, title: str) -> bool:
        return any(p.search(title) for p in self.patterns)


def _ci(*words: str) -> tuple[re.Pattern[str], ...]:
    return tuple(re.compile(rf"\b{w}\b", re.IGNORECASE) for w in words)


def _cs(*words: str) -> tuple[re.Pattern[str], ...]:
    return tuple(re.compile(rf"\b{w}\b") for w in words)


ENTITIES: tuple[Entity, ...] = (
    Entity("openai", "OpenAI", _ci("OpenAI", "ChatGPT", r"GPT-\d+(\.\d+)?", "Sora", "Codex")),
    Entity("anthropic", "Anthropic", _ci("Anthropic", "Claude")),
    Entity("google", "Google & Gemini", _ci("Gemini", "Gemma", "DeepMind", "Google")),
    # "Meta-Learning" in paper titles is not Meta
    Entity("meta", "Meta & Llama", _cs(r"Meta(?!-)") + _ci("Llama")),
    Entity("microsoft", "Microsoft", _ci("Microsoft", "Copilot")),
    Entity("nvidia", "Nvidia", _ci("Nvidia")),
    Entity("apple", "Apple", _cs("Apple")),
    Entity("amazon", "Amazon & AWS", _cs("Amazon", "AWS") + _ci("Bedrock")),
    Entity("xai", "xAI & Grok", _cs("xAI") + _ci("Grok")),
    Entity("mistral", "Mistral", _ci("Mistral")),
    Entity("deepseek", "DeepSeek", _ci("DeepSeek")),
    Entity("qwen", "Qwen & Alibaba", _ci("Qwen", "Alibaba")),
    Entity("hugging-face", "Hugging Face", _ci(r"Hugging ?Face")),
)

BY_SLUG: dict[str, Entity] = {e.slug: e for e in ENTITIES}


def entities_in(title: str) -> list[Entity]:
    """Entities a story title names, in ENTITIES order."""
    return [e for e in ENTITIES if e.matches(title or "")]
