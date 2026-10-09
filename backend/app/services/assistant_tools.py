"""Tool declarations for the in-car assistant.

The backend executes none of these. The model returns function calls, the route
passes them through as `actions`, and the frontend applies them to the Zustand
store. Headlights, signals, hazards and wipers have no backend model at all, so
there is nothing here to execute against.

Declarations are in the Responses API shape (`{"type": "function", "name": ...}`).

They are written below the way they read best — optional fields simply left
out of `required` — and `_strict()` at the bottom converts them for OpenAI's
strict mode, which needs every field required and nullable instead. The model
sets only what the driver mentioned and sends null for the rest: "make it
warmer" is one field, not eight.
"""

import copy

# Mirrors CLIMATE_LIMITS in frontend/src/store/index.js. Duplicated rather than
# shared because the backend never validates these — climate_settings is an
# untyped JSONB column and the store clamps every write. They are stated here
# only so the model proposes values that survive the clamp instead of asking
# for 40 degrees and silently getting 28.
TEMP_MIN = 16
TEMP_MAX = 28
TEMP_STEP = 0.5
FAN_MAX = 5
AC_MAX = 3
SEAT_HEAT_MAX = 3


SET_CLIMATE = {
    "type": "function",
    "name": "set_climate",
    "description": (
        "Adjust the cabin climate. Set only the fields the driver asked about. "
        "Vague comfort requests map here: 'I'm cold' raises target_temperature, "
        "'it's stuffy' lowers it or raises the fan. Current values are in the "
        "vehicle context, so adjust relative to them rather than guessing."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "target_temperature": {
                "type": "number",
                "minimum": TEMP_MIN,
                "maximum": TEMP_MAX,
                "multipleOf": TEMP_STEP,
                "description": (
                    f"Cabin target in Celsius, {TEMP_MIN}-{TEMP_MAX} in "
                    f"{TEMP_STEP} steps."
                ),
            },
            "fan_speed": {
                "type": "integer",
                "minimum": 0,
                "maximum": FAN_MAX,
                "description": f"Blower strength, 0 (off) to {FAN_MAX}.",
            },
            "ac_level": {
                "type": "integer",
                "minimum": 0,
                "maximum": AC_MAX,
                "description": f"Air-conditioning intensity, 0 (off) to {AC_MAX}.",
            },
            "auto_mode": {
                "type": "boolean",
                "description": (
                    "Let the car manage fan and A-C itself. Turning this on "
                    "hands back manual control of those two."
                ),
            },
            "seat_heat_left": {
                "type": "integer",
                "minimum": 0,
                "maximum": SEAT_HEAT_MAX,
                "description": f"Driver's seat heater, 0 (off) to {SEAT_HEAT_MAX}.",
            },
            "seat_heat_right": {
                "type": "integer",
                "minimum": 0,
                "maximum": SEAT_HEAT_MAX,
                "description": f"Passenger's seat heater, 0 (off) to {SEAT_HEAT_MAX}.",
            },
            "front_defrost": {
                "type": "boolean",
                "description": "Clear the windscreen.",
            },
            "rear_defrost": {
                "type": "boolean",
                "description": "Clear the rear window.",
            },
        },
        "required": [],
    },
}


SET_VEHICLE_CONTROLS = {
    "type": "function",
    "name": "set_vehicle_controls",
    "description": (
        "Switch exterior controls on or off. These are absolute, not toggles: "
        "pass true to turn something on even if it is already on. "
        "Left signal, right signal and hazards are mutually exclusive — a car "
        "cannot indicate one way while flashing both. Never set more than one "
        "of those three to true in a single call; if the driver asks for a "
        "combination that is impossible, do the safest one and say so in the "
        "reply. Headlights and wipers are independent of everything.\n\n"
        "headlights forces them on or off. headlights_auto hands them to the "
        "dusk sensor instead — use it for 'put the headlights on auto' or "
        "'let the car decide', and never together with headlights in the same "
        "call. Fog lights are separate lamps from the headlights: fog_lights is "
        "the front pair, rear_fog_lights the rear lamp. 'Fog lights' on its own "
        "means both."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "headlights": {"type": "boolean", "description": "Headlights on or off."},
            "hazards": {
                "type": "boolean",
                "description": (
                    "Hazard flashers. Turning these on cancels either turn signal."
                ),
            },
            "left_signal": {
                "type": "boolean",
                "description": "Left indicator. Turning it on cancels right and hazards.",
            },
            "right_signal": {
                "type": "boolean",
                "description": "Right indicator. Turning it on cancels left and hazards.",
            },
            "wipers": {"type": "boolean", "description": "Windscreen wipers on or off."},
            "headlights_auto": {
                "type": "boolean",
                "description": (
                    "true puts the headlights on automatic, so the dusk sensor "
                    "turns them on and off. false switches automatic off and "
                    "leaves the headlights as they are now."
                ),
            },
            "fog_lights": {"type": "boolean", "description": "Front fog lights on or off."},
            "rear_fog_lights": {"type": "boolean", "description": "Rear fog light on or off."},
        },
        "required": [],
    },
}


SET_DISPLAY = {
    "type": "function",
    "name": "set_display",
    "description": (
        "Change what the dashboard screen shows: its appearance, and whether "
        "the Vehicle Preferences panel is open. Set only what the driver asked "
        "for.\n\n"
        "mode: 'dark' for night driving or glare, 'light' for daylight. These "
        "are the store's own values — do not send 'day' or 'night', which match "
        "no stylesheet and fail silently.\n\n"
        "preferences_panel: 'open' shows Vehicle Preferences, where the driver "
        "sets ambient lighting, mirrors, seat and steering position and "
        "exterior-light defaults — use it when they ask to see or change "
        "settings you have no parameter for. Opening it closes this "
        "conversation's panel, so keep the reply short."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "mode": {"type": "string", "enum": ["dark", "light"]},
            "preferences_panel": {"type": "string", "enum": ["open", "closed"]},
        },
        "required": [],
    },
}


CONTROL_MUSIC = {
    "type": "function",
    "name": "control_music",
    "description": (
        "Control Spotify playback. Playback needs a Spotify Premium account on "
        "the signed-in profile; without one the call fails and the driver "
        "should be told that rather than left waiting."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["play", "pause", "next", "previous"],
            },
        },
        "required": ["action"],
    },
}


CALL_USER = {
    "type": "function",
    "name": "call_user",
    "description": (
        "Start a voice call to a contact by their exact username. Use this only "
        "when the driver clearly asks to call someone. The backend will reject "
        "users who are not in the driver's contacts."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "username": {
                "type": "string",
                "description": "The contact's exact username, without an email domain.",
            }
        },
        "required": ["username"],
    },
}


# The whole toolset, in the order the model sees it. The count is a deliberate
# scope cap: new capabilities belong as parameters on an existing tool wherever
# they fit. call_user is the exception because it fits none of them — it is
# neither a car control nor the screen, and it is the one tool that reaches
# another person.
def _strict(tool: dict) -> dict:
    """Convert one declaration to the form OpenAI's strict mode accepts.

    Strict mode guarantees the arguments match the schema, but only for schemas
    where every property is required and no others are allowed. Optional fields
    therefore become required-but-nullable: the model must send each one, and
    null means "leave it alone". Fields that were already required keep their
    type, so control_music still cannot be called without an action.

    The nulls never reach the frontend: the service strips them on the way out.
    """
    tool = copy.deepcopy(tool)
    params = tool["parameters"]
    already_required = set(params["required"])

    for name, prop in params["properties"].items():
        if name in already_required:
            continue
        prop["type"] = [prop["type"], "null"]
        if "enum" in prop:
            # An enum lists every allowed value, so null has to be one of them.
            prop["enum"] = [*prop["enum"], None]

    params["required"] = list(params["properties"])
    params["additionalProperties"] = False
    tool["strict"] = True
    return tool


ASSISTANT_TOOLS = [
    _strict(tool)
    for tool in (
        SET_CLIMATE,
        SET_VEHICLE_CONTROLS,
        SET_DISPLAY,
        CONTROL_MUSIC,
        CALL_USER,
    )
]

# Names the dispatcher is allowed to act on. The route filters returned calls
# against this, so a hallucinated tool name never reaches the frontend.
TOOL_NAMES = frozenset(tool["name"] for tool in ASSISTANT_TOOLS)
