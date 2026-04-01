export const PRECOMPILE_WORLD = "0x0000000000000000000000000000000000000500";
export const PRECOMPILE_ACTION = "0x0000000000000000000000000000000000000501";
export const PRECOMPILE_EPOCH = "0x0000000000000000000000000000000000000502";
/** Admin / whitelist precompile (sudo key, registration whitelist reads, etc.). */
export const PRECOMPILE_ADMIN = "0x0000000000000000000000000000000000000503";
/** pallet-relations read-only: getStanding, getRelation, getGlobalReputation. */
export const PRECOMPILE_RELATIONS = "0x0000000000000000000000000000000000000504";

export const DIRECTIONS = Object.freeze({
  North: 0,
  South: 1,
  West: 2,
  East: 3
});

export const STRUCTURE_KINDS = Object.freeze({
  Wall: 0,
  Rampart: 1,
  Road: 2,
  Tower: 3,
  Container: 4
});

export const TERRAIN_NAMES = Object.freeze(["Plain", "Swamp", "Mountain", "Well", "Ruin"]);
export const WEI_PER_AGW = 1_000_000_000_000_000_000n;

export const DEFAULT_ALLOWED_ACTIONS = Object.freeze([
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
