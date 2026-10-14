"""The committed relevance model (models/scorer.pkl) loads cleanly with the pinned scikit-learn.

Production ran scikit-learn 1.9.1 against a model saved with 1.8.0 (an
InconsistentVersionWarning on every pipeline run) because requirements.txt
only said ">=1.4.0". A failed load falls back to flat 3.0 scores without
failing anything, so this test is the alarm: change the pin without
retraining and it fails in CI.
"""

from __future__ import annotations

import pickle
import warnings
from pathlib import Path

from sklearn.exceptions import InconsistentVersionWarning

from app.services.ml_scorer import MLScorer

MODEL = Path(__file__).resolve().parent.parent / "models" / "scorer.pkl"


def test_model_loads_without_a_version_mismatch():
    with warnings.catch_warnings():
        warnings.simplefilter("error", InconsistentVersionWarning)
        with MODEL.open("rb") as f:
            artifact = pickle.load(f)
    scorer = MLScorer(artifact)
    assert scorer.n_train > 0

    scores = scorer.predict("OpenAI releases a new model for coding agents", "Developers can use it in the API today.")
    assert set(scores) == {"audience_fit", "practical_relevance", "novelty"}
    assert all(1.0 <= v <= 5.0 for v in scores.values())
