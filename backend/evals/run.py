"""Run the eval cases against a model and report pass rate, latency and tokens.

Every case is a real, billed request on the team's monitored key. Run it once
per model or prompt change, not in a loop.

    cd backend
    python -m evals.run                         # the model in .env
    python -m evals.run --model gpt-4.1-nano    # compare another model
    python -m evals.run --only climate/         # cases whose id contains this
    python -m evals.run --dry-run               # list cases, call nothing

In Docker: docker compose exec backend python -m evals.run
"""

import argparse
import asyncio
import json
import logging
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

BACKEND = Path(__file__).resolve().parent.parent
# Run locally, the root .env is one level up. In Docker the variables are
# already set and the file is absent, so this does nothing.
load_dotenv(BACKEND.parent / ".env")

from app.config import settings  # noqa: E402 - needs the .env loaded first
from app.schemas.assistant import VehicleContext  # noqa: E402
from app.services.assistant import AssistantUnavailableError, ask  # noqa: E402
from evals.cases import BASE_CONTEXT, CASES  # noqa: E402
from evals.checks import grade  # noqa: E402

RESULTS = Path(__file__).resolve().parent / "results"

# Give up rather than keep spending on a key that is failing.
MAX_CONSECUTIVE_ERRORS = 3


def _percentile(values: list[int], pct: float) -> int:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * pct))]


async def run(cases, model: str, effort: str) -> list[dict]:
    results = []
    errors_in_a_row = 0

    for i, case in enumerate(cases, 1):
        context = {**BASE_CONTEXT, **case.context}
        try:
            answer = await ask(
                case.message,
                VehicleContext(**context),
                model=model,
                reasoning_effort=effort,
            )
        except AssistantUnavailableError as exc:
            errors_in_a_row += 1
            print(f"[{i:2}/{len(cases)}] ERROR {case.id}: {exc}")
            results.append({"id": case.id, "message": case.message, "error": str(exc)})
            if "quota" in str(exc) or "key" in str(exc) or errors_in_a_row >= MAX_CONSECUTIVE_ERRORS:
                print("Stopping: the API is refusing requests.")
                break
            continue
        errors_in_a_row = 0

        result = grade(case, answer.actions, answer.reply, context)
        mark = "pass" if result.passed else "FAIL"
        print(
            f"[{i:2}/{len(cases)}] {mark} {case.id:<28} {answer.latency_ms:>5} ms  "
            f"in={answer.input_tokens} out={answer.output_tokens}"
        )
        for problem in result.problems:
            print(f"        - {problem}")

        results.append(
            {
                "id": case.id,
                "message": case.message,
                "passed": result.passed,
                "problems": result.problems,
                "notes": result.notes,
                "reply": answer.reply,
                "actions": answer.actions,
                "model": answer.model,
                "latency_ms": answer.latency_ms,
                "input_tokens": answer.input_tokens,
                "cached_tokens": answer.cached_tokens,
                "output_tokens": answer.output_tokens,
                "reasoning_tokens": answer.reasoning_tokens,
            }
        )

    return results


def summarise(results: list[dict]) -> dict:
    answered = [r for r in results if "error" not in r]
    passed = sum(r["passed"] for r in answered)
    latencies = [r["latency_ms"] for r in answered] or [0]
    total = lambda key: sum(r[key] for r in answered)  # noqa: E731
    return {
        "cases": len(results),
        "passed": passed,
        "errors": len(results) - len(answered),
        "pass_rate": round(passed / len(results), 3) if results else 0,
        "latency_ms_median": int(statistics.median(latencies)),
        "latency_ms_p95": _percentile(latencies, 0.95),
        "input_tokens": total("input_tokens"),
        "cached_tokens": total("cached_tokens"),
        "output_tokens": total("output_tokens"),
        "reasoning_tokens": total("reasoning_tokens"),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--model", default=settings.OPENAI_MODEL)
    parser.add_argument("--reasoning-effort", default=settings.OPENAI_REASONING_EFFORT)
    parser.add_argument("--only", help="run only cases whose id contains this")
    parser.add_argument("--dry-run", action="store_true", help="list cases, call nothing")
    args = parser.parse_args()

    cases = [c for c in CASES if not args.only or args.only in c.id]
    if not cases:
        print(f"No case id contains {args.only!r}.")
        return 1

    if args.dry_run:
        for case in cases:
            print(f"{case.id:<28} {case.message}")
        print(f"\n{len(cases)} cases, {len(cases)} requests to {args.model}.")
        return 0

    # The service logs a line per call; the runner prints its own.
    logging.basicConfig(level=logging.WARNING)

    label = args.model + (f" (reasoning {args.reasoning_effort})" if args.reasoning_effort else "")
    print(f"Running {len(cases)} cases against {label}\n")
    started = time.perf_counter()
    results = asyncio.run(run(cases, args.model, args.reasoning_effort))
    summary = summarise(results)

    print(
        f"\n{summary['passed']}/{summary['cases']} passed ({summary['pass_rate']:.0%})"
        f", {summary['errors']} errors, {time.perf_counter() - started:.0f}s total"
        f"\nlatency: median {summary['latency_ms_median']} ms, p95 {summary['latency_ms_p95']} ms"
        f"\ntokens:  {summary['input_tokens']} in ({summary['cached_tokens']} cached),"
        f" {summary['output_tokens']} out ({summary['reasoning_tokens']} reasoning)"
    )

    RESULTS.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    path = RESULTS / f"{stamp}_{args.model}{'_' + args.reasoning_effort if args.reasoning_effort else ''}.json"
    path.write_text(
        json.dumps(
            {"model": args.model, "reasoning_effort": args.reasoning_effort,
             "summary": summary, "results": results},
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"saved {path.relative_to(BACKEND)}")
    return 0 if summary["errors"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
