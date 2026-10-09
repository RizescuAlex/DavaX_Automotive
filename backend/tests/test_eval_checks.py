"""The eval grader itself. If this is wrong, every eval result is wrong."""

from evals.cases import BASE_CONTEXT, CASES
from evals.checks import UNSET, Case, grade, is_not, num

COLD = Case(
    "cold",
    "I'm cold",
    expect={"set_climate": {"target_temperature": num(gt=21, lte=23.5)}},
    allow=frozenset({"seat_heat_left"}),
)


def _climate(**args):
    return [{"tool": "set_climate", "args": args}]


def test_warmer_target_passes():
    assert grade(COLD, _climate(target_temperature=22.5), "", BASE_CONTEXT).passed


def test_unchanged_target_fails():
    # The smoke-test failure: "I'm cold" answered with the current 21.
    result = grade(COLD, _climate(target_temperature=21), "", BASE_CONTEXT)
    assert not result.passed
    assert "target_temperature = 21" in result.problems[0]


def test_resent_unchanged_value_is_a_note_not_a_failure():
    result = grade(COLD, _climate(target_temperature=22, fan_speed=2), "", BASE_CONTEXT)
    assert result.passed
    assert result.notes == ["re-sent fan_speed=2 (no change)"]


def test_changing_something_unasked_fails_unless_allowed():
    assert not grade(COLD, _climate(target_temperature=22, ac_level=0), "", BASE_CONTEXT).passed
    assert grade(COLD, _climate(target_temperature=22, seat_heat_left=2), "", BASE_CONTEXT).passed


def test_unexpected_tool_fails():
    actions = _climate(target_temperature=22) + [
        {"tool": "control_music", "args": {"action": "play"}}
    ]
    assert not grade(COLD, actions, "", BASE_CONTEXT).passed


def test_split_calls_to_one_tool_are_judged_together():
    case = Case("x", "x", expect={"set_vehicle_controls": {"wipers": True, "headlights": True}})
    actions = [
        {"tool": "set_vehicle_controls", "args": {"wipers": True}},
        {"tool": "set_vehicle_controls", "args": {"headlights": True}},
    ]
    assert grade(case, actions, "", BASE_CONTEXT).passed


def test_claiming_an_action_without_a_call_fails():
    case = Case("x", "x", expect={})
    assert not grade(case, [], "I've turned on the headlights.", BASE_CONTEXT).passed
    assert grade(case, [], "Your headlights are on.", BASE_CONTEXT).passed


def test_reply_must_mention_one_of():
    case = Case("x", "x", expect={}, reply_has=("62",))
    assert grade(case, [], "You have 62% left.", BASE_CONTEXT).passed
    assert not grade(case, [], "Plenty.", BASE_CONTEXT).passed


def test_any_of_passes_when_one_outcome_matches():
    case = Case("x", "x", any_of=({"set_vehicle_controls": {"headlights": True}}, {}))
    assert grade(case, [], "They're already on.", BASE_CONTEXT).passed


def test_display_fields_compare_against_their_context_names():
    case = Case("x", "x", expect={"control_music": {"action": "play"}})
    actions = [
        {"tool": "control_music", "args": {"action": "play"}},
        {"tool": "set_display", "args": {"mode": "dark", "preferences_panel": "closed"}},
    ]
    # Both already the car's state, so re-sending them changes nothing.
    assert grade(case, actions, "", BASE_CONTEXT).passed


def test_matchers():
    assert UNSET(None) and not UNSET(False)
    assert is_not(True)(False) and is_not(True)(None) and not is_not(True)(True)
    assert not num(gt=1)(True)  # a bool is not a number


def test_case_ids_are_unique():
    ids = [case.id for case in CASES]
    assert len(ids) == len(set(ids))
