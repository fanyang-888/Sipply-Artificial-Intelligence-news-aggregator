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


class RadarConfig(BaseModel):
    window_days: int = Field(default=14, ge=4)
    refresh_overlap_days: int = Field(default=2, ge=1)
    hn: HNConfig = Field(default_factory=HNConfig)
    gnews: GNewsConfig = Field(default_factory=GNewsConfig)
    youtube: YouTubeConfig = Field(default_factory=YouTubeConfig)


def load_radar_config(path: Path | None = None) -> RadarConfig:
    raw = yaml.safe_load((path or _DEFAULT_FILE).read_text(encoding="utf-8")) or {}
    return RadarConfig.model_validate(raw)


@lru_cache(maxsize=1)
def radar_config() -> RadarConfig:
    return load_radar_config()
