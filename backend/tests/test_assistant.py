"""The assistant service, with OpenAI replaced by a fake client.

Nothing here reaches the API: these check what we do with a response, not
what the model says. That is what the eval suite is for.
"""

import json
from types import SimpleNamespace

import openai
import pytest

from app.schemas.assistant import VehicleContext
from app.services import assistant
from app.services.assistant_tools import ASSISTANT_TOOLS


def _call(name: str, args: dict | str) -> SimpleNamespace:
    arguments = args if isinstance(args, str) else json.dumps(args)
    return SimpleNamespace(type="function_call", name=name, arguments=arguments)


def _response(output: list, text: str = "") -> SimpleNamespace:
    return SimpleNamespace(output=output, output_text=text, usage=None, model="fake")


class _FakeClient:
    def __init__(self, result):
        self.result = result
        self.sent: dict = {}
        self.responses = SimpleNamespace(create=self._create)

    async def _create(self, **kwargs):
        self.sent = kwargs
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


@pytest.fixture
def fake(monkeypatch):
    def install(result):
        client = _FakeClient(result)
        monkeypatch.setattr(assistant, "_client", lambda: client)
        return client

    return install


# ── Tool declarations ─────────────────────────────────────────────────────────


@pytest.mark.parametrize("tool", ASSISTANT_TOOLS, ids=lambda t: t["name"])
def test_every_tool_meets_strict_mode_rules(tool):
    params = tool["parameters"]
    assert tool["strict"] is True
    assert params["additionalProperties"] is False
    assert set(params["required"]) == set(params["properties"])


def test_optional_fields_become_nullable_and_required_ones_do_not():
    by_name = {tool["name"]: tool["parameters"]["properties"] for tool in ASSISTANT_TOOLS}

    assert by_name["set_climate"]["fan_speed"]["type"] == ["integer", "null"]
    assert by_name["set_display"]["mode"]["enum"] == ["dark", "light", None]
    # Required before the conversion, so still not allowed to be null.
    assert by_name["control_music"]["action"]["type"] == "string"
    assert by_name["call_user"]["username"]["type"] == "string"


# ── ask() ─────────────────────────────────────────────────────────────────────


async def test_nulls_are_stripped_from_actions(fake):
    fake(_response([_call("set_climate", {"target_temperature": 23, "fan_speed": None})]))

    actions = (await assistant.ask("I'm cold", VehicleContext())).actions

    assert actions == [{"tool": "set_climate", "args": {"target_temperature": 23}}]


async def test_calls_with_every_field_null_are_dropped(fake):
    fake(
        _response(
            [
                _call("set_vehicle_controls", {"wipers": True}),
                _call("set_display", {"mode": None, "preferences_panel": None}),
            ]
        )
    )

    actions = (await assistant.ask("wipers", VehicleContext())).actions

    assert actions == [{"tool": "set_vehicle_controls", "args": {"wipers": True}}]


async def test_unknown_tools_and_bad_arguments_are_dropped(fake):
    fake(
        _response(
            [
                _call("open_boot", {}),
                _call("set_vehicle_controls", "{not json"),
                _call("set_vehicle_controls", {"headlights": True}),
            ]
        )
    )

    actions = (await assistant.ask("lights", VehicleContext())).actions

    assert actions == [{"tool": "set_vehicle_controls", "args": {"headlights": True}}]


async def test_silent_action_gets_a_spoken_acknowledgement(fake):
    fake(_response([_call("set_vehicle_controls", {"wipers": True})]))

    reply = (await assistant.ask("wipers on", VehicleContext())).reply

    assert reply == "Done."


async def test_question_returns_text_and_no_actions(fake):
    fake(_response([], text="You have 40% fuel."))

    answer = await assistant.ask("how much fuel?", VehicleContext(fuel_level=40))

    assert (answer.reply, answer.actions) == ("You have 40% fuel.", [])


async def test_car_state_is_sent_apart_from_the_static_instructions(fake):
    client = fake(_response([]))

    await assistant.ask("hello", VehicleContext(speed=50))

    assert client.sent["instructions"] == assistant.SYSTEM_PROMPT
    developer, user = client.sent["input"]
    assert developer["role"] == "developer" and "50 km/h" in developer["content"]
    assert user == {"role": "user", "content": "hello"}
    assert client.sent["store"] is False


# ── Errors ────────────────────────────────────────────────────────────────────


def _status_error(cls, status: int, code: str | None = None):
    request = SimpleNamespace(method="POST", url="https://api.openai.com/v1/responses")
    response = SimpleNamespace(status_code=status, headers={}, request=request)
    # The SDK unwraps the {"error": {...}} envelope before building the
    # exception, so the body it receives is the inner object.
    body = {"code": code} if code else None
    return cls("error", response=response, body=body)


async def test_rate_limit_is_marked_retryable(fake):
    fake(_status_error(openai.RateLimitError, 429))

    with pytest.raises(assistant.AssistantUnavailableError) as raised:
        await assistant.ask("hi", VehicleContext())

    assert raised.value.rate_limited is True


async def test_exhausted_quota_is_not_marked_retryable(fake):
    fake(_status_error(openai.RateLimitError, 429, code="insufficient_quota"))

    with pytest.raises(assistant.AssistantUnavailableError) as raised:
        await assistant.ask("hi", VehicleContext())

    assert raised.value.rate_limited is False
    assert "quota" in str(raised.value)
