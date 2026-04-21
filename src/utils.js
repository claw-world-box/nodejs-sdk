import { DIRECTIONS, STRUCTURE_KINDS } from "./constants.js";

export function normalizeConnectionMode(mode) {
  const text = String(mode ?? "smoldot").trim().toLowerCase();
  if (text !== "smoldot" && text !== "ws") {
    throw new Error(`invalid connectionMode: ${mode}`);
  }
  return text;
}

export function normalizeAction(action) {
  const text = String(action ?? "").trim().toLowerCase();
  if (!text) throw new Error("action is required");
  if (text === "transfer_with_msg" || text === "transferwithmsg" || text === "transfer-msg") return "transfer";
  if (text === "probe_target" || text === "probetarget" || text === "probe") return "scout";
  if (text === "logic_shock" || text === "logicshock") return "attack";
  if (text === "atomic_swap" || text === "atomicswap") return "transfer";
  if (text === "submitheartbeat") return "submit_heartbeat";
  if (text === "buildwall") return "build_wall";
  if (text === "fundstructure") return "fund_structure";
  if (text === "setstructuremaintenance" || text === "set_structure_maintenance" || text === "set_maintenance") {
    return "set_structure_maintenance";
  }
  if (text === "siegerwall" || text === "siegewall" || text === "siege_wall") return "siege_wall";
  if (text === "contributebeacon") return "contribute_beacon";
  if (text === "registershelter") return "register_shelter";
  return text;
}

export function normalizeCorpusAction(action) {
  return normalizeAction(action);
}

export function directionToU8(direction) {
  if (typeof direction === "number" && Number.isInteger(direction) && direction >= 0 && direction <= 3) {
    return direction;
  }
  const text = String(direction ?? "").trim().toLowerCase();
  if (text === "north" || text === "n") return DIRECTIONS.North;
  if (text === "south" || text === "s") return DIRECTIONS.South;
  if (text === "west" || text === "w") return DIRECTIONS.West;
  if (text === "east" || text === "e") return DIRECTIONS.East;
  throw new Error(`invalid direction: ${direction}`);
}

export function structureKindToU8(kind) {
  if (typeof kind === "number" && Number.isInteger(kind) && kind >= 0 && kind <= 4) {
    return kind;
  }
  const text = String(kind ?? "").trim().toLowerCase();
  if (text === "wall") return STRUCTURE_KINDS.Wall;
  if (text === "rampart") return STRUCTURE_KINDS.Rampart;
  if (text === "road") return STRUCTURE_KINDS.Road;
  if (text === "tower") return STRUCTURE_KINDS.Tower;
  if (text === "container") return STRUCTURE_KINDS.Container;
  throw new Error(`invalid structure kind: ${kind}`);
}

export function encodeMessage(message) {
  if (message instanceof Uint8Array) return message;
  if (message instanceof ArrayBuffer) return new Uint8Array(message);
  if (Array.isArray(message)) return Uint8Array.from(message.map((value) => Number(value)));
  return new TextEncoder().encode(String(message ?? ""));
}

export function toBigInt(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.trunc(value));
  if (typeof value === "string") return BigInt(value);
  if (value && typeof value.toString === "function") return BigInt(value.toString());
  return 0n;
}

/**
 * uint256 / u128 from EVM `view`/`pure` returns (e.g. epoch precompile). No i32-style truncation.
 * @param {bigint|number|string|unknown} value
 * @returns {bigint}
 */
export function uint256LikeToBigInt(value) {
  if (typeof value === "bigint") return value;
  if (value == null) return 0n;
  return BigInt(String(value));
}

export function toNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint") return Number(value);
  if (value && typeof value.toString === "function") return Number(value.toString());
  return Number(value ?? 0);
}

export function tupleToPair(value) {
  if (Array.isArray(value)) return [Number(value[0] ?? 0), Number(value[1] ?? 0)];
  if (value && typeof value.toJSON === "function") {
    const json = value.toJSON();
    if (Array.isArray(json)) return [Number(json[0] ?? 0), Number(json[1] ?? 0)];
  }
  if (value && typeof value.toArray === "function") {
    const arr = value.toArray();
    return [Number(arr[0] ?? 0), Number(arr[1] ?? 0)];
  }
  return [0, 0];
}

export function enumToString(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.toString === "function") return value.toString();
  return String(value ?? "");
}

export function normalizeBootnodes(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toGameUnits(value) {
  return toBigInt(value) / 1_000_000_000_000_000_000n;
}

export function clampPositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export function splitmix64(input) {
  let z = BigInt.asUintN(64, BigInt(input));
  z = BigInt.asUintN(64, (z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n);
  z = BigInt.asUintN(64, (z ^ (z >> 27n)) * 0x94d049bb133111ebn);
  return BigInt.asUintN(64, z ^ (z >> 31n));
}

/** Matches `pallet-action` `step`: North=y+1, South=y-1, East=x+1, West=x-1. */
export const DIRECTION_DELTAS = Object.freeze({
  North: { dx: 0, dy: 1 },
  South: { dx: 0, dy: -1 },
  East: { dx: 1, dy: 0 },
  West: { dx: -1, dy: 0 }
});

/**
 * Directions that keep the agent inside the map rectangle (same boundary check as `ensure_walkable`).
 * @param {number} x
 * @param {number} y
 * @param {number} mapWidth
 * @param {number} mapHeight
 * @returns {("North"|"South"|"East"|"West")[]}
 */
export function legalDirectionsFromGridPosition(x, y, mapWidth, mapHeight) {
  const xi = Math.trunc(Number(x));
  const yi = Math.trunc(Number(y));
  const w = Math.trunc(Number(mapWidth));
  const h = Math.trunc(Number(mapHeight));
  const out = [];
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    if (yi + 1 < h) out.push("North");
    if (yi > 0) out.push("South");
    if (xi > 0) out.push("West");
    if (xi + 1 < w) out.push("East");
  }
  return out;
}
