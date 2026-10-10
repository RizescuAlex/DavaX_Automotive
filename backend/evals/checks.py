"""How one eval case is graded. Pure functions, no API calls.

A case passes when every expected tool was called with acceptable values,
nothing else in the car was changed, and the reply says what it should. Values
the model re-sends unchanged are noted rather than failed: they do no harm.
"""

import re
from collections.abc import Callable
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Check:
    """A test for one argument, with the wording used when it fails."""

    test: Callable[[object], bool]
    desc: str

    def __call__(self, value: object) -> bool:
        return self.test(value)


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def eq(expected: object) -> Check:
    def test(value: object) -> bool:
        if isinstance(expected, bool):
            return value is expected
        if _is_number(expected):
            return _is_number(value) and abs(value - expected) < 1e-9
        return value == expected

    return Check(test, f"= {expected!r}")


def num(*, gt=None, gte=None, lt=None, lte=None) -> Check:
    """A number within bounds, e.g. num(gt=21, lte=23.5)."""
    parts = []
    if gt is not None:
        parts.append(f"> {gt}")
    if gte is not None:
        parts.append(f">= {gte}")
    if lt is not None:
        parts.append(f"< {lt}")
    if lte is not None:
        parts.append(f"<= {lte}")

    def test(value: object) -> bool:
        return (
            _is_number(value)
            and (gt is None or value > gt)
            and (gte is None or value >= gte)
            and (lt is None or value < lt)
            and (lte is None or value <= lte)
        )

    return Check(test, " and ".join(parts))


def is_not(value: object) -> Check:
    inner = eq(value)
    return Check(lambda v: not inner(v), f"anything but {value!r}")


UNSET = Check(lambda v: v is None, "not set")


@dataclass(frozen=True)
class Case:
    id: str
    message: str
    # tool name -> field -> Check or a plain value meaning eq(value).
    # An empty dict means "no tool should be called".
    expect: dict = field(default_factory=dict)
    # Several acceptable outcomes; the case passes if any one does.
    any_of: tuple = ()
    # Fields the model may also change without failing, e.g. the fan when cold.
    allow: frozenset = frozenset()
    # Overrides on top of BASE_CONTEXT.
    context: dict = field(default_factory=dict)
    # The reply must contain at least one of these (case-insensitive).
    reply_has: tuple = ()


@dataclass
class Grade:
    passed: bool
    problems: list[str]
    notes: list[str]


# A reply that reports a change. Only checked when nothing was called, where it
# means the driver is being told the car changed when it did not.
CLAIMS_ACTION = re.compile(
    r"\b(i've|i have) (turned|set|switched|opened|started|raised|lowered|increased|"
    r"decreased|put|changed|activated)\b"
    r"|\b(turned|switched) (on|off)\b"
    r"|\bis now (on|off|set)\b",
    re.IGNORECASE,
)

# Tool fields whose current value lives under another name in the context.
_STATE = {
    "mode": ("theme", lambda v: v),
    "preferences_panel": ("preferences_open", lambda v: v == "open"),
}


def _unchanged(name: str, value: object, context: dict) -> bool:
    key, to_state = _STATE.get(name, (name, lambda v: v))
    return key in context and eq(context[key])(to_state(value))


def _grade_outcome(expect: dict, case: Case, called: dict, context: dict):
    problems: list[str] = []
    notes: list[str] = []

    for tool, fields in expect.items():
        args = called.get(tool)
        if args is None:
            problems.append(f"did not call {tool}")
            continue
        for name, check in fields.items():
            check = check if isinstance(check, Check) else eq(check)
            value = args.get(name)
            if not check(value):
                problems.append(f"{tool}.{name} = {value!r}, expected {check.desc}")

    for tool, args in called.items():
        covered = expect.get(tool, {})
        if tool not in expect and not args:
            problems.append(f"unexpected call {tool}()")
        for name, value in args.items():
            if name in covered or name in case.allow:
                continue
            if _unchanged(name, value, context):
                notes.append(f"re-sent {name}={value!r} (no change)")
                continue
            prefix = "" if tool in expect else "unexpected "
            problems.append(f"{prefix}{tool}.{name} = {value!r}")

    return problems, notes


def grade(case: Case, actions: list[dict], reply: str, context: dict) -> Grade:
    # A model may split one tool's fields across two calls; judge them together.
    called: dict[str, dict] = {}
    for action in actions:
        called.setdefault(action["tool"], {}).update(action["args"])

    outcomes = [
        _grade_outcome(expect, case, called, context)
        for expect in (case.any_of or (case.expect,))
    ]
    problems, notes = min(outcomes, key=lambda outcome: len(outcome[0]))
    problems, notes = list(problems), list(notes)

    if case.reply_has and not any(s.lower() in reply.lower() for s in case.reply_has):
        problems.append(f"reply {reply!r} mentions none of {list(case.reply_has)}")

    if not actions and CLAIMS_ACTION.search(reply):
        problems.append(f"reply claims an action it did not take: {reply!r}")

    return Grade(passed=not problems, problems=problems, notes=notes)
