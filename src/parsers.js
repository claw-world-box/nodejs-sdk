import { TERRAIN_NAMES, WEI_PER_AGW } from "./constants.js";
import { enumToString, toBigInt, toGameUnits, toNumber, tupleToPair } from "./utils.js";

export function parseAgent(agentId, value, nativeBalance = null) {
  if (!value) return null;
  const [x, y] = tupleToPair(value.position);
  const balance = nativeBalance === null ? toBigInt(value.energy ?? 0) : toBigInt(nativeBalance);
  return {
    id: Number(agentId),
    owner: String(value.owner),
    energy: toGameUnits(balance),
    nativeBalance: balance,
    balanceWei: balance.toString(),
    hp: toNumber(value.hp),
    hpMax: toNumber(value.hpMax ?? value.hp_max ?? value.hp),
    position: { x, y },
    status: enumToString(value.status),
    tier: enumToString(value.tier),
    bornAtBlock: toNumber(value.bornAtBlock ?? value.born_at_block ?? 0),
    lastHeartbeat: toNumber(value.lastHeartbeat ?? value.last_heartbeat ?? 0),
    lastSettledBlock: toNumber(value.lastSettledBlock ?? value.last_settled_block ?? 0),
    lastEpochSeen: toNumber(value.lastEpochSeen ?? value.last_epoch_seen ?? 0),
    sleepUntilBlock: toNumber(value.sleepUntilBlock ?? value.sleep_until_block ?? 0),
    epochBadges: toNumber(value.epochBadges ?? value.epoch_badges ?? 0)
  };
}

export function parseCell(x, y, value, context = {}) {
  if (!value) return null;
  const terrainRaw = typeof value.terrain === "number" ? TERRAIN_NAMES[value.terrain] : enumToString(value.terrain);
  const energyUnits = context.energyUnits ?? 0;
  const energyWei = BigInt(energyUnits) * WEI_PER_AGW;
  return {
    x: Number(x),
    y: Number(y),
    terrain: terrainRaw,
    lastHarvestBlock: toNumber(value.lastHarvestBlock ?? value.last_harvest_block ?? 0),
    structure: parseStructure(value.structure),
    occupants: Number(context.occupants ?? 0),
    debris: String(context.debris ?? 0),
    energyUnits: Number(energyUnits),
    energyWei: energyWei.toString(),
    energy: (energyWei / WEI_PER_AGW).toString()
  };
}

export function parseRuin(x, y, value) {
  if (!value) return null;
  return {
    x: Number(x),
    y: Number(y),
    level: toNumber(value.level),
    hp: toNumber(value.hp),
    maxHp: toNumber(value.maxHp ?? value.max_hp ?? value.hp),
    damagePerTick: toNumber(value.damagePerTick ?? value.damage_per_tick),
    rewardGas: String(value.rewardGas ?? value.reward_gas ?? 0),
    dropRate: toNumber(value.dropRate ?? value.drop_rate),
    minAgents: toNumber(value.minAgents ?? value.min_agents),
    respawnDelay: toNumber(value.respawnDelay ?? value.respawn_delay)
  };
}

export function parseEpoch(value) {
  if (!value) return null;
  return {
    index: toNumber(value.index ?? value.currentEpoch ?? value.current_epoch ?? 0),
    beaconPool: String(value.beaconPool ?? value.beacon_pool ?? 0),
    beaconTarget: String(value.beaconTarget ?? value.beacon_target ?? 0),
    startBlock: toNumber(value.startBlock ?? value.epochStartBlock ?? value.epoch_start_block ?? 0)
  };
}

export function parseMessage(value) {
  if (!value) return null;
  const position = value.position ?? value.pos ?? null;
  const [x, y] = tupleToPair(position);
  const contentRaw = value.content ?? value.message ?? value.memo ?? "";
  const content = decodeMessageContent(contentRaw);
  const kindRaw = value.kind ?? value.messageKind ?? value.message_kind ?? "broadcast";
  const toRaw = value.toAgentId ?? value.to_agent_id ?? value.to ?? null;
  return {
    block: toNumber(value.block ?? value.blockNumber ?? value.block_number ?? 0),
    kind: String(enumToString(kindRaw) || "broadcast").toLowerCase(),
    fromAgentId: toNumber(value.fromAgentId ?? value.from_agent_id ?? value.from ?? 0),
    toAgentId: toRaw === null || toRaw === undefined ? null : toNumber(toRaw),
    position: { x, y },
    content
  };
}

function decodeMessageContent(value) {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  if (Array.isArray(value)) return new TextDecoder().decode(Uint8Array.from(value.map((item) => Number(item) || 0)));
  if (value && typeof value.toU8a === "function") return new TextDecoder().decode(value.toU8a(true));
  if (value && typeof value.toJSON === "function") {
    const json = value.toJSON();
    if (typeof json === "string") return json;
    if (Array.isArray(json)) {
      return new TextDecoder().decode(Uint8Array.from(json.map((item) => Number(item) || 0)));
    }
  }
  return enumToString(value);
}

export function parseStructure(value) {
  if (!value) return null;
  const inner = value.isSome && typeof value.unwrap === "function" ? value.unwrap() : value;
  if (inner === null || inner === undefined || inner.isNone) return null;
  return {
    kind: enumToString(inner.kind),
    owner: String(inner.owner),
    fundedUntilBlock: toNumber(inner.fundedUntilBlock ?? inner.funded_until_block ?? 0)
  };
}
