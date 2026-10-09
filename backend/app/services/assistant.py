"""The in-car assistant's one call to OpenAI.

Nothing here executes a tool. The model's function calls are handed back to the
route, which passes them to the frontend to apply against the Zustand store.
That is the whole design: headlights, signals, hazards and wipers have no
backend model, and climate already persists itself when the store changes.
"""

import json
import logging
import time
from dataclasses import dataclass

import openai
from openai import AsyncOpenAI

from app.config import settings
from app.schemas.assistant import VehicleContext
from app.services.assistant_tools import ASSISTANT_TOOLS, TOOL_NAMES

logger = logging.getLogger(__name__)


class AssistantUnavailableError(RuntimeError):
    """Raised when the assistant cannot answer — no key, or the API failed.

    `rate_limited` separates "ask again in a moment" from "this is broken", so
    the route can answer 429 rather than 503 and the driver gets told which.
    """

    def __init__(self, message: str, *, rate_limited: bool = False):
        super().__init__(message)
        self.rate_limited = rate_limited


# The SDK's own defaults are a 600s timeout and two retries — far past nginx's
# 60s proxy timeout, so a stalled call would surface as a gateway error rather
# than a sentence. One try plus one retry at 10s each stays well inside it.
# Retrying is safe: the call is stateless (store=False) and changes nothing.
ATTEMPT_TIMEOUT_S = 10.0
MAX_RETRIES = 1

# A ceiling, not a target. A reply is one sentence and a few tool calls, far
# below this; the cap only matters if something goes wrong, and on a monitored
# key a runaway answer is the expensive kind of wrong. Reasoning tokens count
# toward it, so it leaves room for a reasoning model's thinking too.
MAX_OUTPUT_TOKENS = 500


SYSTEM_PROMPT = """\
You are the voice of a car's dashboard assistant. The driver is driving. Be
brief, warm and specific: one short sentence, occasionally two. Replies are
often read aloud, so write them to be heard rather than read — no lists, no
markdown, no emoji.

Act, do not ask. If a request is clear enough to act on, call the tool and say
what you did: "Headlights on." If a comfort request is vague, translate it
yourself using the current state below — "I'm cold" means raise the
temperature a degree or two, "it's stuffy" means cool it down or raise the fan.
Only ask a question when acting could plausibly be wrong in a way the driver
would mind.

Say what changed, not what you are about to do, and never invent a state you
did not set. If you turn nothing on, do not claim you did.

In a tool call, fill in only the fields the driver asked to change and pass
null for every other one. Null means "leave it as it is".

Answer questions about speed, fuel and temperature directly from the state
below. There is no tool for reading them, and no tool call is needed.

You cannot control navigation, windows, doors, locks or the boot. If asked, say
so plainly in one sentence rather than pretending to act.

Left signal, right signal and hazards are mutually exclusive — the car cannot
indicate one way while flashing both. If asked for an impossible combination,
pick one and CALL THE TOOL for it. Explaining the conflict is not doing it.

Saying you did something without calling the tool is the worst failure you can
make: the driver is told the car changed when it did not. If a sentence of
yours contains "I've turned on", "I've set" or anything like it, the matching
tool call must be in the same reply.

To call someone, use call_user with their exact username. Never use an email
address for a call. If the driver gives only a display name and you do not
know the exact username, ask them to provide the username.
"""


def _describe(context: VehicleContext) -> str:
    """Render the dashboard snapshot, sent as a developer message each call.

    Only fields the frontend actually sent are named. A missing value is left
    out entirely rather than described as zero, so the model never reports a
    fuel level nobody measured.
    """
    on_off = lambda flag: "on" if flag else "off"  # noqa: E731

    lines: list[str] = []
    add = lines.append

    if context.speed is not None:
        add(f"- Speed: {context.speed:.0f} km/h")
    if context.fuel_level is not None:
        add(f"- Fuel: {context.fuel_level:.0f}%")
    if context.engine_temp is not None:
        add(f"- Engine temperature: {context.engine_temp:.0f} C")
    if context.cabin_temp is not None:
        add(f"- Cabin temperature right now: {context.cabin_temp:.1f} C")

    if context.target_temperature is not None:
        add(f"- Climate target: {context.target_temperature:.1f} C")
    if context.fan_speed is not None:
        add(f"- Fan speed: {context.fan_speed} of 5")
    if context.ac_level is not None:
        add(f"- A-C level: {context.ac_level} of 3")
    if context.auto_mode is not None:
        add(f"- Auto climate: {on_off(context.auto_mode)}")
    if context.seat_heat_left is not None:
        add(f"- Driver seat heater: {context.seat_heat_left} of 3")
    if context.seat_heat_right is not None:
        add(f"- Passenger seat heater: {context.seat_heat_right} of 3")
    if context.front_defrost is not None:
        add(f"- Front defrost: {on_off(context.front_defrost)}")
    if context.rear_defrost is not None:
        add(f"- Rear defrost: {on_off(context.rear_defrost)}")

    if context.headlights is not None:
        add(f"- Headlights: {on_off(context.headlights)}")
    if context.hazards is not None:
        add(f"- Hazards: {on_off(context.hazards)}")
    if context.left_signal is not None:
        add(f"- Left signal: {on_off(context.left_signal)}")
    if context.right_signal is not None:
        add(f"- Right signal: {on_off(context.right_signal)}")
    if context.wipers is not None:
        add(f"- Wipers: {on_off(context.wipers)}")
    if context.headlights_auto is not None:
        add(f"- Automatic headlights: {on_off(context.headlights_auto)}")
    if context.fog_lights is not None:
        add(f"- Front fog lights: {on_off(context.fog_lights)}")
    if context.rear_fog_lights is not None:
        add(f"- Rear fog light: {on_off(context.rear_fog_lights)}")

    if context.theme is not None:
        add(f"- Dashboard appearance: {context.theme}")
    if context.preferences_open is not None:
        add(f"- Vehicle Preferences panel: {'open' if context.preferences_open else 'closed'}")

    if not lines:
        return "\nThe dashboard did not report its current state."

    return "\nCurrent state of the car:\n" + "\n".join(lines)


_client_instance: AsyncOpenAI | None = None


def _client() -> AsyncOpenAI:
    """One client for the process, so connections are pooled between requests."""
    global _client_instance
    if not settings.OPENAI_API_KEY:
        raise AssistantUnavailableError(
            "The assistant is not configured. Set OPENAI_API_KEY in the root .env."
        )
    if _client_instance is None:
        _client_instance = AsyncOpenAI(
            api_key=settings.OPENAI_API_KEY,
            timeout=ATTEMPT_TIMEOUT_S,
            max_retries=MAX_RETRIES,
        )
    return _client_instance


def _unavailable(exc: openai.OpenAIError) -> AssistantUnavailableError:
    """Translate an SDK error into what the driver should hear."""
    if isinstance(exc, openai.RateLimitError):
        # 429 covers two different things. A rate limit clears in seconds; an
        # exhausted quota does not, and retrying it only adds to the count the
        # key is monitored on.
        if getattr(exc, "code", None) == "insufficient_quota":
            return AssistantUnavailableError(
                "The assistant's usage quota has run out."
            )
        return AssistantUnavailableError(
            "Too many requests just now — try again in a moment.",
            rate_limited=True,
        )
    if isinstance(exc, openai.AuthenticationError):
        # A rejected key, likely revoked. Nothing the driver can do about it.
        return AssistantUnavailableError("The assistant's API key was rejected.")
    if isinstance(exc, openai.APITimeoutError):
        return AssistantUnavailableError("The assistant took too long to answer.")
    return AssistantUnavailableError("The assistant could not be reached.")


@dataclass
class AssistantAnswer:
    """What one call produced, and what it cost.

    The route only needs `reply` and `actions`. The rest is for the logs and
    the eval suite, which compares models on exactly these numbers.
    """

    reply: str
    actions: list[dict]
    model: str = ""
    latency_ms: int = 0
    input_tokens: int = 0
    cached_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0


def _usage(response) -> dict:
    usage = response.usage
    if usage is None:
        return {}
    return {
        "input_tokens": usage.input_tokens,
        "cached_tokens": getattr(usage.input_tokens_details, "cached_tokens", 0) or 0,
        "output_tokens": usage.output_tokens,
        "reasoning_tokens": getattr(usage.output_tokens_details, "reasoning_tokens", 0) or 0,
    }


async def ask(
    message: str,
    context: VehicleContext,
    *,
    model: str | None = None,
    reasoning_effort: str | None = None,
) -> AssistantAnswer:
    """Send one message and return the reply, the actions and the cost.

    `model` and `reasoning_effort` override the .env settings, so the eval
    suite can compare models without editing config. The route passes neither.

    Async because the route is: the model round trip is the slowest thing the
    backend does, and the sync client would hold the event loop for all of it.
    """
    client = _client()

    effort = reasoning_effort if reasoning_effort is not None else settings.OPENAI_REASONING_EFFORT
    extra: dict = {}
    if effort:
        # Only reasoning models accept this, so it is sent only when set.
        extra["reasoning"] = {"effort": effort}

    started = time.perf_counter()
    try:
        response = await client.responses.create(
            model=model or settings.OPENAI_MODEL,
            # Identical on every call, so OpenAI can cache it with the tools.
            # Everything that changes goes in `input` below, after it.
            instructions=SYSTEM_PROMPT,
            input=[
                # The car's state as a developer message, separate from what
                # the driver said: it is data from the dashboard, not speech.
                {"role": "developer", "content": _describe(context).strip()},
                {"role": "user", "content": message},
            ],
            tools=ASSISTANT_TOOLS,
            # Stateless: we send the dashboard snapshot ourselves every time,
            # so there is no server-side thread worth keeping.
            store=False,
            max_output_tokens=MAX_OUTPUT_TOKENS,
            **extra,
        )
    except openai.OpenAIError as exc:
        logger.error("OpenAI call failed", exc_info=exc)
        raise _unavailable(exc) from exc

    latency_ms = int((time.perf_counter() - started) * 1000)
    usage = _usage(response)
    # One line per call, so consumption can be totalled from the logs. The key
    # is monitored and there is no dashboard on our side, so this is the only
    # record of what the assistant spends.
    logger.info(
        "assistant call model=%s ms=%d %s",
        response.model,
        latency_ms,
        " ".join(f"{k.removesuffix('_tokens')}={v}" for k, v in usage.items()),
    )

    reply = (response.output_text or "").strip()

    actions: list[dict] = []
    for item in response.output or []:
        if item.type != "function_call":
            continue
        if item.name not in TOOL_NAMES:
            # A name we do not have a dispatcher for. Dropping it here keeps the
            # frontend from having to defend against invented tools.
            logger.warning("Dropping unknown tool call: %s", item.name)
            continue
        try:
            args = json.loads(item.arguments or "{}")
        except json.JSONDecodeError:
            # Strict mode should make this impossible; a cut-off answer at
            # MAX_OUTPUT_TOKENS is the one way it still could happen.
            logger.warning("Dropping %s with unparseable arguments", item.name)
            continue
        # Strict mode sends every field, null meaning "leave it alone". Drop
        # those so the frontend sees only what the driver asked to change.
        args = {k: v for k, v in args.items() if v is not None}
        if not args:
            # Every field null: a call that changes nothing. Small models emit
            # these alongside real calls; passing them on is pure noise.
            continue
        actions.append({"tool": item.name, "args": args})

    if not reply and actions:
        # It acted but said nothing. Better a plain acknowledgement than silence
        # from a dashboard that just changed something.
        reply = "Done."

    return AssistantAnswer(
        reply=reply,
        actions=actions,
        model=response.model,
        latency_ms=latency_ms,
        **usage,
    )
