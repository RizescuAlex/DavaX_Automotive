"""The in-car assistant's one call to Gemini.

Nothing here executes a tool. The model's function calls are handed back to the
route, which passes them to the frontend to apply against the Zustand store.
That is the whole design: headlights, signals, hazards and wipers have no
backend model, and climate already persists itself when the store changes.
"""

import asyncio
import logging

from google import genai

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


# Two separate budgets, because the SDK retries.
#
# The free tier serves on a best-effort basis: the same request answers in
# three seconds or hangs indefinitely, with quota to spare either way. A stuck
# call does not recover, so the cure is to give up early and ask again rather
# than wait — a working call needs well under ten seconds.
#
# ATTEMPT_TIMEOUT_S bounds one try, TOTAL_TIMEOUT_S bounds all of them, and the
# total stays under nginx's 60s proxy timeout so the driver always gets a
# sentence rather than a gateway error. Retrying is safe: the call is
# stateless (store=False) and changes nothing server-side.
ATTEMPT_TIMEOUT_S = 10.0
TOTAL_TIMEOUT_S = 25.0
MAX_ATTEMPTS = 3


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
    """Render the dashboard snapshot as the tail of the system instruction.

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


def _client() -> genai.Client:
    if not settings.GEMINI_API_KEY:
        raise AssistantUnavailableError(
            "The assistant is not configured. Set GEMINI_API_KEY in the root .env."
        )
    return genai.Client(api_key=settings.GEMINI_API_KEY)


async def ask(message: str, context: VehicleContext) -> tuple[str, list[dict]]:
    """Send one message and return (reply, actions).

    Async because the route is: the model round trip is the slowest thing the
    backend does, and the sync client would hold the event loop for all of it.
    """
    client = _client()

    loop = asyncio.get_running_loop()
    deadline = loop.time() + TOTAL_TIMEOUT_S
    interaction = None
    last_exc: Exception | None = None

    for attempt in range(1, MAX_ATTEMPTS + 1):
        remaining = deadline - loop.time()
        if remaining <= 1.0:
            break

        try:
            interaction = await asyncio.wait_for(
                client.aio.interactions.create(
                    model=settings.GEMINI_MODEL,
                    system_instruction=SYSTEM_PROMPT + _describe(context),
                    input=message,
                    tools=ASSISTANT_TOOLS,
                    # Stateless: we send the dashboard snapshot ourselves every
                    # time, so there is no server-side thread worth keeping.
                    store=False,
                    timeout=ATTEMPT_TIMEOUT_S,
                ),
                timeout=min(ATTEMPT_TIMEOUT_S, remaining),
            )
            break
        except (TimeoutError, asyncio.TimeoutError) as exc:
            # A stall, not a refusal. Worth another go inside the budget.
            last_exc = exc
            logger.warning("Gemini attempt %d timed out; retrying", attempt)
            continue
        except Exception as exc:  # noqa: BLE001 - a real error; do not retry it
            last_exc = exc
            break

    if interaction is None:
        exc = last_exc or RuntimeError("no attempt was made")
        logger.error("Gemini call failed", exc_info=exc)

        name = type(exc).__name__
        detail = str(exc)

        # Matched on name and text rather than by importing the SDK's private
        # error classes, which live under google.genai._gaos and move about.
        if "RateLimit" in name or "429" in detail:
            raise AssistantUnavailableError(
                "Too many requests just now — try again in a moment.",
                rate_limited=True,
            ) from exc

        if "Timeout" in name:
            raise AssistantUnavailableError(
                "The assistant took too long to answer."
            ) from exc

        raise AssistantUnavailableError("The assistant could not be reached.") from exc


    reply = (interaction.output_text or "").strip()

    actions: list[dict] = []
    for step in interaction.steps or []:
        if getattr(step, "type", None) != "function_call":
            continue
        if step.name not in TOOL_NAMES:
            # A name we do not have a dispatcher for. Dropping it here keeps the
            # frontend from having to defend against invented tools.
            logger.warning("Dropping unknown tool call: %s", step.name)
            continue
        actions.append({"tool": step.name, "args": step.arguments or {}})

    if not reply and actions:
        # It acted but said nothing. Better a plain acknowledgement than silence
        # from a dashboard that just changed something.
        reply = "Done."

    return reply, actions
