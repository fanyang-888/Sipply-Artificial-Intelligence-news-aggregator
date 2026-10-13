"""Load and validate ``signal_sources.yaml``."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, Field

_DEFAULT_FILE = Path(__file__).resolve().parent / "signal_sources.yaml"


class HNConfig(BaseModel):
    enabled: bool = True
    min_points: int = 3
    ask_min_points: int = 1
    hits_per_page: int = Field(default=100, ge=1, le=1000)
    max_pages: int = Field(default=5, ge=1)
    queries: list[str] = Field(default_factory=list)


class GNewsConfig(BaseModel):
    enabled: bool = True
    hl: str = "en-US"
    gl: str = "US"
    ceid: str = "US:en"
    queries: list[str] = Field(default_factory=list)


class YouTubeConfig(BaseModel):
    enabled: bool = True
    max_units_per_run: int = Field(default=600, ge=0)
    max_results: int = Field(default=25, ge=1, le=50)
    queries: list[str] = Field(default_factory=list)


class GitHubConfig(BaseModel):
    enabled: bool = True
    min_stars: int = Field(default=100, ge=0)
    per_page: int = Field(default=50, ge=1, le=100)
    # GitHub search qualifiers; "created:>=<window start>" and the star floor are added
    queries: list[str] = Field(default_factory=list)


class DevtoConfig(BaseModel):
    enabled: bool = True
    min_reactions: int = Field(default=10, ge=0)
    per_page: int = Field(default=50, ge=1, le=1000)
    tags: list[str] = Field(default_factory=list)


class LobstersConfig(BaseModel):
    enabled: bool = True
    min_score: int = Field(default=3, ge=0)
    max_pages: int = Field(default=3, ge=1)
    tags: list[str] = Field(default_factory=list)


class BlueskyConfig(BaseModel):
    enabled: bool = True  # still skipped while BLUESKY_HANDLE / BLUESKY_APP_PASSWORD are unset
    min_likes: int = Field(default=10, ge=0)
    limit: int = Field(default=100, ge=1, le=100)
    lang: str | None = "en"
    queries: list[str] = Field(default_factory=list)


class ThreadsConfig(BaseModel):
    enabled: bool = True  # still skipped while THREADS_ACCESS_TOKEN is unset
    limit: int = Field(default=50, ge=1, le=100)
    queries: list[str] = Field(default_factory=list)


class RadarConfig(BaseModel):
    window_days: int = Field(default=14, ge=4)
    refresh_overlap_days: int = Field(default=2, ge=1)
    hn: HNConfig = Field(default_factory=HNConfig)
    gnews: GNewsConfig = Field(default_factory=GNewsConfig)
    youtube: YouTubeConfig = Field(default_factory=YouTubeConfig)
    github: GitHubConfig = Field(default_factory=GitHubConfig)
    devto: DevtoConfig = Field(default_factory=DevtoConfig)
    lobsters: LobstersConfig = Field(default_factory=LobstersConfig)
    bluesky: BlueskyConfig = Field(default_factory=BlueskyConfig)
    threads: ThreadsConfig = Field(default_factory=ThreadsConfig)


def load_radar_config(path: Path | None = None) -> RadarConfig:
    raw = yaml.safe_load((path or _DEFAULT_FILE).read_text(encoding="utf-8")) or {}
    return RadarConfig.model_validate(raw)


@lru_cache(maxsize=1)
def radar_config() -> RadarConfig:
    return load_radar_config()
