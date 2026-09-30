"""
Route scoring and ranking engine.

Pure functions for normalizing criteria, Pareto filtering,
and computing weighted utility scores across route candidates.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class RouteFeatures:
    """Raw feature values for a single route candidate."""
    index: int
    duration_s: int = 0
    distance_m: int = 0
    toll_cost: float = 0.0
    fuel_cost: float = 0.0
    highway_fraction: float = 1.0       # 0.0 = all local roads, 1.0 = all highway
    scenic_score: float = 0.0           # density of parks/viewpoints (Phase 4)
    family_stop_score: float = 0.0      # quality/spacing of family stops (Phase 4)
    weather_risk: float = 0.0           # 0.0 = clear, 1.0 = severe (Phase 3)
    labels: list[str] = field(default_factory=list)


@dataclass
class UserWeights:
    """Normalized preference weights derived from onboarding profile."""
    time: float = 0.25
    cost: float = 0.25
    scenic: float = 0.25
    family: float = 0.25


@dataclass
class ScoredRoute:
    """A route with computed per-criterion scores and final utility."""
    index: int
    time_score: float = 0.0       # 0–10, higher = faster
    cost_score: float = 0.0       # 0–10, higher = cheaper
    scenic_score: float = 0.0     # 0–10, higher = more scenic
    family_score: float = 0.0     # 0–10, higher = more family-friendly
    weather_risk: float = 0.0     # 0–1, lower = safer
    utility: float = 0.0          # final weighted score
    explanation: str = ""


# ── Weight Extraction ─────────────────────────────────────────────────────────

def extract_weights(
    fastest_arrival: int = 5,
    lowest_cost: int = 5,
    scenic_routes: int = 3,
    family_friendly: int = 3,
) -> UserWeights:
    """
    Convert 0–10 onboarding sliders into normalized weights summing to 1.
    If all values are zero, fall back to equal weights.
    """
    raw = [float(fastest_arrival), float(lowest_cost),
           float(scenic_routes), float(family_friendly)]
    total = sum(raw)

    if total == 0:
        return UserWeights()  # equal 0.25 each

    return UserWeights(
        time=raw[0] / total,
        cost=raw[1] / total,
        scenic=raw[2] / total,
        family=raw[3] / total,
    )


# ── Criterion Scoring ─────────────────────────────────────────────────────────

def _compute_time_scores(routes: list[RouteFeatures]) -> list[float]:
    """Score routes on time: lower duration → higher score (0–10)."""
    durations = [r.duration_s for r in routes]
    if not durations:
        return []
    min_d, max_d = min(durations), max(durations)
    if max_d == min_d:
        return [10.0] * len(routes)
    # Invert: fastest gets 10, slowest gets 0
    return [10.0 * (1.0 - (d - min_d) / (max_d - min_d)) for d in durations]


def _compute_cost_scores(
    routes: list[RouteFeatures],
    fuel_price_per_l: float = 7.0,
    consumption_l_per_100km: float = 7.5,
) -> list[float]:
    """Score routes on total cost (fuel + tolls): cheaper → higher score (0–10)."""
    costs = []
    for r in routes:
        fuel = (r.distance_m / 100_000) * consumption_l_per_100km * fuel_price_per_l
        total = fuel + r.toll_cost
        costs.append(total)
        r.fuel_cost = fuel  # store for explanation

    if not costs:
        return []
    min_c, max_c = min(costs), max(costs)
    if max_c == min_c:
        return [10.0] * len(routes)
    return [10.0 * (1.0 - (c - min_c) / (max_c - min_c)) for c in costs]


def _compute_scenic_scores(routes: list[RouteFeatures]) -> list[float]:
    """
    Score routes on scenicness (0–10).

    Proxy: share of non-highway road. In Phase 4, this will also include
    density and ratings of parks/viewpoints along the route.
    """
    scores = []
    for r in routes:
        # Non-highway fraction as a base scenic indicator
        non_highway = 1.0 - r.highway_fraction
        # Combine with explicit scenic score from Places API (Phase 4)
        combined = (non_highway * 5.0) + (r.scenic_score * 5.0)
        scores.append(min(10.0, combined))
    return scores


def _compute_family_scores(routes: list[RouteFeatures]) -> list[float]:
    """
    Score routes on family-friendliness (0–10).

    In Phase 4, this will use actual stop quality/spacing.
    For now, shorter routes with lower weather risk score higher.
    """
    if not routes:
        return []

    # Placeholder: use family_stop_score directly (populated in Phase 4)
    raw = [r.family_stop_score for r in routes]
    max_r = max(raw) if raw else 0
    if max_r == 0:
        # Fallback: prefer shorter, safer routes for families
        durations = [r.duration_s for r in routes]
        min_d, max_d = min(durations), max(durations)
        if max_d == min_d:
            return [5.0] * len(routes)
        return [
            5.0 + 5.0 * (1.0 - (d - min_d) / (max_d - min_d)) * (1.0 - r.weather_risk)
            for d, r in zip(durations, routes)
        ]
    return [10.0 * (v / max_r) if max_r > 0 else 5.0 for v in raw]


# ── Pareto Filter ─────────────────────────────────────────────────────────────

def _dominates(a: ScoredRoute, b: ScoredRoute) -> bool:
    """Return True if route `a` dominates route `b` on all criteria."""
    scores_a = (a.time_score, a.cost_score, a.scenic_score, a.family_score)
    scores_b = (b.time_score, b.cost_score, b.scenic_score, b.family_score)
    at_least_one_better = False
    for sa, sb in zip(scores_a, scores_b):
        if sa < sb:
            return False
        if sa > sb:
            at_least_one_better = True
    return at_least_one_better


def pareto_filter(scored: list[ScoredRoute]) -> list[ScoredRoute]:
    """Remove dominated routes. Never removes all candidates."""
    if len(scored) <= 1:
        return scored
    non_dominated = []
    for candidate in scored:
        if not any(_dominates(other, candidate) for other in scored if other is not candidate):
            non_dominated.append(candidate)
    return non_dominated if non_dominated else scored[:1]


# ── Weather Penalty ───────────────────────────────────────────────────────────

SEVERE_WEATHER_THRESHOLD = 0.7  # risk above this penalizes or vetoes


def apply_weather_penalty(scored: list[ScoredRoute], features: list[RouteFeatures]) -> None:
    """
    Apply weather as a safety modifier (not a preference).

    - Severe risk inflates effective time score downward
    - Adds a warning flag for the explanation
    """
    for s, f in zip(scored, features):
        s.weather_risk = f.weather_risk
        if f.weather_risk >= SEVERE_WEATHER_THRESHOLD:
            # Penalize: reduce time score proportionally
            penalty = f.weather_risk * 3.0  # up to 3 points off
            s.time_score = max(0.0, s.time_score - penalty)


# ── Main Scoring Pipeline ────────────────────────────────────────────────────

def score_and_rank(
    features: list[RouteFeatures],
    weights: UserWeights,
    fuel_price_per_l: float = 7.0,
    consumption_l_per_100km: float = 7.5,
) -> list[ScoredRoute]:
    """
    Full scoring pipeline:
    1. Compute per-criterion scores (0–10)
    2. Apply weather penalty
    3. Pareto filter
    4. Compute weighted utility
    5. Sort by utility descending
    6. Generate explanations

    Returns scored routes sorted best-first.
    """
    if not features:
        return []

    # Step 1: per-criterion scoring
    time_scores = _compute_time_scores(features)
    cost_scores = _compute_cost_scores(features, fuel_price_per_l, consumption_l_per_100km)
    scenic_scores = _compute_scenic_scores(features)
    family_scores = _compute_family_scores(features)

    scored = []
    for i, f in enumerate(features):
        scored.append(ScoredRoute(
            index=f.index,
            time_score=time_scores[i],
            cost_score=cost_scores[i],
            scenic_score=scenic_scores[i],
            family_score=family_scores[i],
        ))

    # Step 2: weather penalty
    apply_weather_penalty(scored, features)

    # Step 3: Pareto filter
    non_dominated = pareto_filter(scored)
    dominated_indices = {s.index for s in scored} - {s.index for s in non_dominated}

    # Step 4: weighted utility
    for s in scored:
        s.utility = (
            weights.time * (s.time_score / 10.0)
            + weights.cost * (s.cost_score / 10.0)
            + weights.scenic * (s.scenic_score / 10.0)
            + weights.family * (s.family_score / 10.0)
        )
        # Penalize dominated routes slightly
        if s.index in dominated_indices:
            s.utility *= 0.95

    # Step 5: sort
    scored.sort(key=lambda s: s.utility, reverse=True)

    # Step 6: explanations
    for rank, s in enumerate(scored):
        s.explanation = _build_explanation(s, weights, rank, features)

    return scored


def _build_explanation(
    s: ScoredRoute,
    w: UserWeights,
    rank: int,
    features: list[RouteFeatures],
) -> str:
    """Generate a human-readable 'why this route' sentence."""
    # Find which criterion contributed most
    contributions = {
        "speed": w.time * s.time_score,
        "cost": w.cost * s.cost_score,
        "scenery": w.scenic * s.scenic_score,
        "family-friendliness": w.family * s.family_score,
    }
    best_criterion = max(contributions, key=contributions.get)

    parts = []
    if rank == 0:
        parts.append("Best match for your preferences")
    else:
        parts.append(f"Alternative #{rank}")

    parts.append(f"— strongest on {best_criterion}")

    if s.weather_risk >= SEVERE_WEATHER_THRESHOLD:
        parts.append("⚠️ severe weather risk on this route")
    elif s.weather_risk >= 0.3:
        parts.append("— moderate weather concerns")

    # Fuel efficiency label
    feat = next((f for f in features if f.index == s.index), None)
    if feat and "FUEL_EFFICIENT" in feat.labels:
        parts.append("🌿 fuel-efficient")

    return ". ".join(parts) + "."
