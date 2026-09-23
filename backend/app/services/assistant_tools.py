"""Tool declarations for the in-car assistant.

The backend executes none of these. Gemini returns function calls, the route
passes them through as `actions`, and the frontend applies them to the Zustand
store. Headlights, signals, hazards and wipers have no backend model at all, so
there is nothing here to execute against.

Declarations are OpenAI-shaped (`{"type": "function", "name": ...}`), which is
what `client.interactions.create(tools=...)` expects — not the older Gemini
`FunctionDeclaration` objects most tutorials still show.

Every parameter is optional except the enums: the model sets only what the
driver actually mentioned. "Make it warmer" is one field, not eight.
"""

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
        "reply. Headlights and wipers are independent of everything."
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
        },
        "required": [],
    },
}


SET_THEME = {
    "type": "function",
    "name": "set_theme",
    "description": (
        "Switch the dashboard's appearance. Use 'dark' for night driving or "
        "glare, 'light' for daylight. These are the store's own values — do "
        "not send 'day' or 'night', which match no stylesheet and fail silently."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "mode": {"type": "string", "enum": ["dark", "light"]},
        },
        "required": ["mode"],
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


# The whole toolset, in the order the model sees it. Keep it at four: the tool
# count is a deliberate scope cap, and new capabilities belong as parameters on
# an existing tool wherever they fit.
ASSISTANT_TOOLS = [
    SET_CLIMATE,
    SET_VEHICLE_CONTROLS,
    SET_THEME,
    CONTROL_MUSIC,
]

# Names the dispatcher is allowed to act on. The route filters returned calls
# against this, so a hallucinated tool name never reaches the frontend.
TOOL_NAMES = frozenset(tool["name"] for tool in ASSISTANT_TOOLS)
