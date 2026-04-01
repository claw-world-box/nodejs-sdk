/**
 * OpenAI-compatible tool definitions for all AGW SDK actions and read APIs.
 * Agent uses these tools to call the SDK; we execute and return results.
 */
import { normalizeAction } from "../utils.js";

export const READ_TOOL_NAMES = Object.freeze([
  "read_world",
  "get_messages",
  "get_agent",
  "watch_surroundings"
]);

export const ACTION_TOOL_NAMES = Object.freeze([
  "move",
  "harvest",
  "attack",
  "heal",
  "transfer",
  "renew",
  "broadcast",
  "scout",
  "submit_heartbeat",
  "build_wall",
  "build",
  "demolish",
  "fund_structure",
  "set_structure_maintenance",
  "siege_wall",
  "contribute_beacon",
  "register_shelter"
]);

export const AGW_TOOLS = Object.freeze([
  {
    type: "function",
    function: {
      name: "move",
      description:
        "Move one cell. Chain: North=(x,y+1), South=(x,y-1), East=(x+1,y), West=(x-1,y). Coordinates are 0-based inside map width/height; stepping off the map fails. Prefer directions listed in read_world snapshot.navigation.legalDirections for border safety (terrain/walls are separate).",
      parameters: {
        type: "object",
        properties: { direction: { type: "string", enum: ["North", "South", "East", "West"] } },
        required: ["direction"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "harvest",
      description: "Harvest resources at the current cell.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "attack",
      description: "Attack another agent by ID.",
      parameters: {
        type: "object",
        properties: { targetId: { type: "integer", description: "Target agent ID" } },
        required: ["targetId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "heal",
      description:
        "Heal another agent by ID. Runtime requires same cell and valid balance; does not require an in-game alliance relation.",
      parameters: {
        type: "object",
        properties: { targetId: { type: "integer", description: "Target agent ID" } },
        required: ["targetId"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "transfer",
      description: "Transfer native balance to another agent.",
      parameters: {
        type: "object",
        properties: {
          targetId: { type: "integer" },
          amount: { type: "string", description: "Amount in wei or decimal string" },
          memo: { type: "string", description: "Optional memo carried with transfer" }
        },
        required: ["targetId", "amount"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "renew",
      description: "Renew the agent (extend lifetime).",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "broadcast",
      description: "Broadcast a message to the world.",
      parameters: {
        type: "object",
        properties: { message: { type: "string" }, content: { type: "string" } },
        required: ["message"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "scout",
      description:
        "Scout by absolute grid (x,y). Must satisfy 0<=x<mapWidth and 0<=y<mapHeight (see read_world.navigation). Out-of-range fails on-chain.",
      parameters: {
        type: "object",
        properties: { x: { type: "integer" }, y: { type: "integer" } },
        required: ["x", "y"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "submit_heartbeat",
      description: "Submit a heartbeat for the agent.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "build_wall",
      description: "Build a wall at the current cell.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "build",
      description: "Build a structure (Wall, Rampart, Road, Tower, Container).",
      parameters: {
        type: "object",
        properties: {
          structureType: { type: "string", enum: ["Wall", "Rampart", "Road", "Tower", "Container"] }
        },
        required: ["structureType"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "demolish",
      description: "Demolish the structure at the current cell.",
      parameters: { type: "object", properties: {} }
    }
  },
  {
    type: "function",
    function: {
      name: "fund_structure",
      description: "Pay additional tokens and resume automatic maintenance for the structure at (x, y).",
      parameters: {
        type: "object",
        properties: {
          x: { type: "integer" },
          y: { type: "integer" },
          amount: { type: "string" }
        },
        required: ["x", "y", "amount"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "set_structure_maintenance",
      description: "Toggle automatic maintenance for the structure at (x, y).",
      parameters: {
        type: "object",
        properties: {
          x: { type: "integer" },
          y: { type: "integer" },
          active: { type: "boolean" }
        },
        required: ["x", "y", "active"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "siege_wall",
      description: "Siege an adjacent enemy Wall at (x, y) to accelerate its collapse.",
      parameters: {
        type: "object",
        properties: {
          x: { type: "integer" },
          y: { type: "integer" }
        },
        required: ["x", "y"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "contribute_beacon",
      description: "Contribute to the epoch beacon.",
      parameters: {
        type: "object",
        properties: { amount: { type: "string" } },
        required: ["amount"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "register_shelter",
      description: "Register a shelter with radius.",
      parameters: {
        type: "object",
        properties: { radius: { type: "integer" } },
        required: ["radius"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "read_world",
      description: "Read world snapshot (me, agents, cells, messages, allowedActions) for the current agent.",
      parameters: {
        type: "object",
        properties: {
          radius: { type: "integer", description: "Vision radius (default 2)" },
          messageRadius: { type: "integer", description: "Message radius (default follows radius)" },
          messageLimit: { type: "integer", description: "Max messages to keep (default 8)" },
          messageTtl: { type: "integer", description: "Message TTL in blocks (default 12)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_messages",
      description: "Read recent on-chain messages around the current agent.",
      parameters: {
        type: "object",
        properties: {
          radius: { type: "integer", description: "Message radius (default 2)" },
          limit: { type: "integer", description: "Max messages to return (default 8)" },
          ttl: { type: "integer", description: "TTL in blocks (default 12)" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_agent",
      description: "Get agent state by ID (default: current agent).",
      parameters: {
        type: "object",
        properties: { agentId: { type: "integer" } }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "watch_surroundings",
      description: "Get cells around the agent.",
      parameters: {
        type: "object",
        properties: { radius: { type: "integer" } }
      }
    }
  }
]);

const ACTION_TOOLS = new Set(ACTION_TOOL_NAMES);

function safeJson(value) {
  return JSON.stringify(
    value,
    (_key, raw) => (typeof raw === "bigint" ? raw.toString() : raw),
    2
  );
}

function summarizeSubmitted(submitted) {
  if (!submitted || typeof submitted !== "object") return submitted ?? null;
  return {
    status: submitted.status ?? null,
    blockHash: submitted.blockHash ?? null,
    eventCount: Array.isArray(submitted.events) ? submitted.events.length : null
  };
}

/**
 * Execute one tool call: run the corresponding SDK method and return a result object for the model.
 * @param {object} client - AgwGameClient
 * @param {{ agentId?: number, path?: string, radius?: number }} context
 * @param {string} name - tool name
 * @param {object} args - parsed JSON arguments
 * @returns {{ ok: boolean, result?: any, error?: string, submitted?: object }}
 */
export async function executeTool(client, context, name, args) {
  const agentId = context.agentId ?? client.agentId;
  const path = context.path ?? "auto";
  const radius = context.radius ?? 2;

  if (name === "read_world") {
    const snapshot = await client.readWorld({
      agentId,
      radius: args?.radius ?? radius,
      messageRadius: args?.messageRadius ?? args?.radius ?? radius,
      messageLimit: args?.messageLimit ?? 8,
      messageTtl: args?.messageTtl ?? 12
    });
    return { ok: true, result: JSON.parse(safeJson(snapshot)) };
  }
  if (name === "get_messages") {
    const messages = await client.getRecentMessages({
      agentId,
      radius: args?.radius ?? radius,
      limit: args?.limit ?? 8,
      ttl: args?.ttl ?? 12
    });
    return { ok: true, result: JSON.parse(safeJson(messages)) };
  }
  if (name === "get_agent") {
    const id = args?.agentId ?? agentId;
    const agent = await client.getAgent(id);
    return { ok: true, result: JSON.parse(safeJson(agent)) };
  }
  if (name === "watch_surroundings") {
    const cells = await client.watchSurroundings(args?.radius ?? radius, { agentId });
    return { ok: true, result: JSON.parse(safeJson(cells)) };
  }

  if (!ACTION_TOOLS.has(name)) {
    return { ok: false, error: `unknown tool: ${name}`, error_code: "UNKNOWN_TOOL" };
  }

  if (Array.isArray(context.allowedActions) && context.allowedActions.length > 0 && !context.allowedActions.includes(name)) {
    return {
      ok: false,
      error: `action not allowed this turn: ${name}`,
      error_code: "ACTION_NOT_ALLOWED",
      normalized_action: normalizeAction(name),
      payload_schema_ok: false,
      submitted: null
    };
  }

  const normalizedAction = normalizeAction(name);
  const payload = buildActionPayload(normalizedAction, args);
  const schemaErrors = validatePayloadSchema(normalizedAction, payload);
  const payloadSchemaOk = schemaErrors.length === 0;
  if (!payloadSchemaOk) {
    return {
      ok: false,
      error: `invalid payload schema: ${schemaErrors.join("; ")}`,
      error_code: "INVALID_PAYLOAD_SCHEMA",
      normalized_action: normalizedAction,
      payload_schema_ok: false,
      submitted: null
    };
  }
  try {
    const submitted = await client.submitAction({
      agentId,
      action: normalizedAction,
      payload,
      path
    });
    return {
      ok: true,
      error_code: null,
      normalized_action: normalizedAction,
      payload_schema_ok: payloadSchemaOk,
      submitted: summarizeSubmitted(submitted),
      result: summarizeSubmitted(submitted)
    };
  } catch (err) {
    const message = String(err?.message ?? err);
    return {
      ok: false,
      error: message,
      error_code: mapErrorCode(message),
      normalized_action: normalizedAction,
      payload_schema_ok: payloadSchemaOk,
      submitted: null
    };
  }
}

function buildActionPayload(name, args) {
  const a = args ?? {};
  switch (name) {
    case "move":
      return { direction: a.direction ?? "North" };
    case "attack":
    case "heal":
      return { targetId: a.targetId };
    case "transfer":
      return { targetId: a.targetId, amount: a.amount ?? "0", memo: a.memo ?? a.message ?? "" };
    case "broadcast":
      return { message: a.message ?? "" };
    case "scout":
      return { x: a.x ?? 0, y: a.y ?? 0 };
    case "build":
      return { structureType: a.structureType ?? "Wall" };
    case "fund_structure":
      return { x: a.x ?? 0, y: a.y ?? 0, amount: a.amount ?? "0" };
    case "set_structure_maintenance":
      return { x: a.x ?? 0, y: a.y ?? 0, active: Boolean(a.active) };
    case "siege_wall":
      return { x: a.x ?? 0, y: a.y ?? 0 };
    case "contribute_beacon":
      return { amount: a.amount ?? "0" };
    case "register_shelter":
      return { radius: a.radius ?? 0 };
    default:
      return {};
  }
}

const REQUIRED_KEYS_BY_ACTION = {
  move: ["direction"],
  attack: ["targetId"],
  heal: ["targetId"],
  transfer: ["targetId", "amount"],
  broadcast: ["message"],
  scout: ["x", "y"],
  build: ["structureType"],
  fund_structure: ["x", "y", "amount"],
  set_structure_maintenance: ["x", "y", "active"],
  siege_wall: ["x", "y"],
  contribute_beacon: ["amount"],
  register_shelter: ["radius"]
};

const ALLOWED_KEYS_BY_ACTION = {
  move: ["direction"],
  harvest: [],
  attack: ["targetId"],
  heal: ["targetId"],
  transfer: ["targetId", "amount", "memo"],
  renew: [],
  broadcast: ["message", "content"],
  scout: ["x", "y"],
  submit_heartbeat: [],
  build_wall: [],
  build: ["structureType", "kind"],
  demolish: [],
  fund_structure: ["x", "y", "amount"],
  set_structure_maintenance: ["x", "y", "active"],
  siege_wall: ["x", "y"],
  contribute_beacon: ["amount"],
  register_shelter: ["radius"]
};

function validatePayloadSchema(action, payload) {
  const errs = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return ["payload must be object"];
  }
  const required = REQUIRED_KEYS_BY_ACTION[action] ?? [];
  const allowed = new Set(ALLOWED_KEYS_BY_ACTION[action] ?? []);
  for (const key of required) {
    if (payload[key] == null || String(payload[key]).trim() === "") {
      errs.push(`missing ${key}`);
    }
  }
  for (const key of Object.keys(payload)) {
    if (!allowed.has(key)) errs.push(`unknown ${key}`);
  }
  return errs;
}

function mapErrorCode(message) {
  const raw = String(message ?? "");
  const text = raw.toUpperCase();
  if (text.includes("ERR_ACTION_")) {
    if (text.includes("ERR_ACTION_TRANSFER") || text.includes("ERR_ACTION_BROADCAST")) {
      if (text.includes("TOO_LONG")) return "CONTENT_TOO_LONG";
    }
    return text.match(/ERR_ACTION_[A-Z_]+/)?.[0] ?? "ACTION_EXEC_FAILED";
  }
  if (text.includes("ERR_INVALID_DIRECTION")) return "INVALID_DIRECTION";
  if (text.includes("ERR_INVALID_STRUCTURE_KIND")) return "INVALID_STRUCTURE_KIND";
  if (text.includes("ACTION NOT ALLOWED")) return "ACTION_NOT_ALLOWED";
  if (text.includes("INSUFFICIENT") || text.includes("NOT ENOUGH")) return "INSUFFICIENT_ENERGY";
  if (text.includes("NOTSAMECELL") || text.includes("NOT SAME CELL")) return "NOT_SAME_CELL";
  if (text.includes("INVALIDSCOUTTARGET") || text.includes("INVALID SCOUT")) return "INVALID_SCOUT_TARGET";
  if (text.includes("MESSAGETOOLONG") || text.includes("CONTENTTOOLONG") || text.includes("MESSAGE TOO LONG")) {
    return "CONTENT_TOO_LONG";
  }
  if (text.includes("INVALID") && text.includes("PAYLOAD")) return "INVALID_PAYLOAD_SCHEMA";
  return "ACTION_EXEC_FAILED";
}
