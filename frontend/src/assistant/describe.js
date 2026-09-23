/**
 * Turns the assistant's actions into the sentence the driver hears.
 *
 * The model does not write this. An interaction that ends in a function call
 * comes back with an empty output_text — true on every model tried — so there
 * is no spoken turn to use. Building the sentence here is not a workaround but
 * the better design: it is instant, costs no tokens, reads consistently, and
 * cannot claim a change that did not happen, because it is derived from the
 * actions that were actually applied.
 *
 * The model's own reply is still used for anything without actions: questions
 * about fuel or speed, and refusals like "I can't open the boot."
 */

const LEVELS = ["off", "low", "medium", "high"];

/** 23 -> "23", 22.5 -> "22.5". Avoids reading "23.0 degrees" aloud. */
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

  if (args.headlights != null) {
    parts.push(args.headlights ? "headlights on" : "headlights off");
  }
  if (args.wipers != null) {
    parts.push(args.wipers ? "wipers on" : "wipers off");
  }

  // Said in the order the dispatcher applies them, so the sentence matches
  // what actually ended up on the dashboard when the model contradicts itself.
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

function describeTheme(args) {
  if (args.mode === "dark") return ["switching to the dark dashboard"];
  if (args.mode === "light") return ["switching to the light dashboard"];
  return [];
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

const DESCRIBERS = {
  set_climate: describeClimate,
  set_vehicle_controls: describeControls,
  set_theme: describeTheme,
  control_music: describeMusic,
};

/** "a", "a and b", "a, b and c" — spoken punctuation, not a list. */
function join(parts) {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * @param {Array<{tool: string, args: object}>} actions
 * @returns {string} one sentence, or "" when there is nothing to describe
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
 * What the driver actually sees: our sentence when anything was done, the
 * model's own words when it only spoke.
 *
 * @param {string} reply    the backend's reply text
 * @param {Array}  actions  the actions that were applied
 */
export function replyFor(reply, actions) {
  const described = describeActions(actions);
  if (described) return described;

  const spoken = (reply ?? "").trim();
  if (spoken) return spoken;

  // Neither words nor actions. Rare, but an empty bubble reads as a hang, and
  // silence after a question is the worst thing a dashboard can do.
  return "Sorry, I did not catch that.";
}
