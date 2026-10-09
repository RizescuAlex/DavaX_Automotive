/**
 * Builds the spoken reply from the applied actions. When the model calls a tool
 * its output_text comes back empty, so there is no reply to use; the model's
 * own text is used only when there are no actions.
 */

const LEVELS = ["off", "low", "medium", "high"];

/** 23 -> "23", 22.5 -> "22.5" */
function temp(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function describeClimate(args) {
  const parts = [];

  if (args.target_temperature != null) {
    parts.push(`setting it to ${temp(args.target_temperature)} degrees`);
  }
  if (args.fan_speed != null) {
    parts.push(args.fan_speed === 0 ? "fan off" : `fan to ${args.fan_speed}`);
  }
  if (args.ac_level != null) {
    parts.push(
      args.ac_level === 0 ? "A-C off" : `A-C to ${LEVELS[args.ac_level] ?? args.ac_level}`
    );
  }
  if (args.auto_mode != null) {
    parts.push(args.auto_mode ? "auto climate on" : "auto climate off");
  }
  if (args.seat_heat_left != null) {
    parts.push(
      args.seat_heat_left === 0
        ? "your seat heater off"
        : `your seat heater to ${LEVELS[args.seat_heat_left] ?? args.seat_heat_left}`
    );
  }
  if (args.seat_heat_right != null) {
    parts.push(
      args.seat_heat_right === 0
        ? "the passenger seat heater off"
        : `the passenger seat heater to ${LEVELS[args.seat_heat_right] ?? args.seat_heat_right}`
    );
  }
  if (args.front_defrost != null) {
    parts.push(args.front_defrost ? "front defrost on" : "front defrost off");
  }
  if (args.rear_defrost != null) {
    parts.push(args.rear_defrost ? "rear defrost on" : "rear defrost off");
  }

  return parts;
}

function describeControls(args) {
  const parts = [];

  if (args.headlights_auto != null) {
    parts.push(args.headlights_auto ? "headlights on automatic" : "automatic headlights off");
  }
  if (args.headlights != null) {
    parts.push(args.headlights ? "headlights on" : "headlights off");
  }
  if (args.fog_lights != null && args.fog_lights === args.rear_fog_lights) {
    parts.push(args.fog_lights ? "fog lights on" : "fog lights off");
  } else {
    if (args.fog_lights != null) {
      parts.push(args.fog_lights ? "front fog lights on" : "front fog lights off");
    }
    if (args.rear_fog_lights != null) {
      parts.push(args.rear_fog_lights ? "rear fog light on" : "rear fog light off");
    }
  }
  if (args.wipers != null) {
    parts.push(args.wipers ? "wipers on" : "wipers off");
  }

  // Same order as the dispatcher applies them.
  if (args.left_signal != null) {
    parts.push(args.left_signal ? "signalling left" : "left signal off");
  }
  if (args.right_signal != null) {
    parts.push(args.right_signal ? "signalling right" : "right signal off");
  }
  if (args.hazards != null) {
    parts.push(args.hazards ? "hazards on" : "hazards off");
  }

  return parts;
}

function describeDisplay(args) {
  const parts = [];
  if (args.mode === "dark") parts.push("switching to the dark dashboard");
  if (args.mode === "light") parts.push("switching to the light dashboard");
  if (args.preferences_panel === "open") parts.push("opening Vehicle Preferences");
  if (args.preferences_panel === "closed") parts.push("closing Vehicle Preferences");
  return parts;
}

const MUSIC_PHRASES = {
  play: "playing the music",
  pause: "pausing the music",
  next: "skipping to the next track",
  previous: "going back a track",
};

function describeMusic(args) {
  const phrase = MUSIC_PHRASES[args.action];
  return phrase ? [phrase] : [];
}

function describeCall(args) {
  const username = typeof args.username === "string" ? args.username.trim().replace(/^@/, "") : "";
  return username ? [`calling ${username}`] : [];
}

const DESCRIBERS = {
  set_climate: describeClimate,
  set_vehicle_controls: describeControls,
  set_display: describeDisplay,
  control_music: describeMusic,
  call_user: describeCall,
};

/** "a", "a and b", "a, b and c" */
function join(parts) {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * @param {Array<{tool: string, args: object}>} actions
 * @returns {string} one sentence, or "" if there is nothing to describe
 */
export function describeActions(actions) {
  const parts = [];

  for (const action of actions ?? []) {
    const describe = DESCRIBERS[action?.tool];
    if (describe) parts.push(...describe(action.args ?? {}));
  }

  if (parts.length === 0) return "";

  const sentence = join(parts);
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}

/**
 * Our sentence when actions were applied, otherwise the model's reply.
 * @param {string} reply
 * @param {Array} actions
 */
export function replyFor(reply, actions) {
  const described = describeActions(actions);
  if (described) return described;

  const spoken = (reply ?? "").trim();
  if (spoken) return spoken;

  // Neither text nor actions: say something rather than show an empty reply.
  return "Sorry, I did not catch that.";
}
