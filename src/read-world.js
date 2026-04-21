import { WEI_PER_AGW } from "./constants.js";
import { parseCell, parseEpoch, parseRuin } from "./parsers.js";
import { normalizeOwnerToAddress } from "./relations.js";
import { DIRECTION_DELTAS, legalDirectionsFromGridPosition, toBigInt } from "./utils.js";

/** Matches `rust-api-client` `game_prompt_align::PromptFsmConfig::default()` (thresholds only). */
export const PROMPT_FSM_DEFAULTS = Object.freeze({
  criticalEnergy: 150,
  criticalExitEnergy: 200,
  criticalHp: 30,
  recoverHp: 72,
  encounterDistance: 2,
  safeScoutBalance: 80
});

/** Per `AgwGameClient` instance + agent id; avoids cross-instance FSM bleed in tests. */
const fsmPrevByClient = new WeakMap();

function getFsmPrevMap(client) {
  let m = fsmPrevByClient.get(client);
  if (!m) {
    m = new Map();
    fsmPrevByClient.set(client, m);
  }
  return m;
}

function getPreviousFsm(client, agentId) {
  return getFsmPrevMap(client).get(Number(agentId));
}

function setPreviousFsm(client, agentId, state) {
  getFsmPrevMap(client).set(Number(agentId), state);
}

/** Native wei to whole-token units, matching `chain.rs` `WEI_PER_DA` / balance_da. */
function balanceDaFromMe(me) {
  if (!me) return 0;
  const wei = toBigInt(me.nativeBalance ?? me.balanceWei ?? 0);
  return Number(wei / WEI_PER_AGW);
}

function mergeFsmConfig(config) {
  return {
    criticalEnergy: Number(config.criticalEnergy ?? PROMPT_FSM_DEFAULTS.criticalEnergy),
    criticalExitEnergy: Number(config.criticalExitEnergy ?? PROMPT_FSM_DEFAULTS.criticalExitEnergy),
    criticalHp: Number(config.criticalHp ?? PROMPT_FSM_DEFAULTS.criticalHp),
    recoverHp: Number(config.recoverHp ?? PROMPT_FSM_DEFAULTS.recoverHp),
    encounterDistance: Number(config.encounterDistance ?? PROMPT_FSM_DEFAULTS.encounterDistance),
    safeScoutBalance: Number(config.safeScoutBalance ?? PROMPT_FSM_DEFAULTS.safeScoutBalance)
  };
}

/**
 * Mirrors `game_prompt_align::nearest_other_agent_distance`: center cell with >1 occupant => 0;
 * else minimum Manhattan distance to a cell with occupants > 0 and distance >= 1.
 * Falls back to `agents[].distance` when cells do not expose `occupants` (excludes `viewerAgentId`, e.g. `getNearbyAgents` includes self at distance 0).
 */
export function nearestOtherAgentDistance(cells, cx, cy, fallbackAgents, viewerAgentId) {
  const center = cells.find((c) => Number(c.x) === cx && Number(c.y) === cy);
  const centerOcc =
    center && center.occupants != null && center.occupants !== undefined
      ? Number(center.occupants)
      : null;
  if (centerOcc !== null && centerOcc > 1) {
    return 0;
  }

  const cellsDefineOccupants = cells.some((c) => c.occupants != null && c.occupants !== undefined);
  if (cellsDefineOccupants) {
    let minD = Infinity;
    for (const c of cells) {
      const o = Number(c.occupants ?? 0);
      if (o <= 0) continue;
      const d = Math.abs(Number(c.x) - cx) + Math.abs(Number(c.y) - cy);
      if (d >= 1) minD = Math.min(minD, d);
    }
    return minD === Infinity ? Infinity : minD;
  }

  if (!Array.isArray(fallbackAgents) || fallbackAgents.length === 0) return Infinity;
  const filtered =
    viewerAgentId == null
      ? fallbackAgents
      : fallbackAgents.filter((a) => Number(a.id) !== Number(viewerAgentId));
  if (filtered.length === 0) return Infinity;
  return Math.min(...filtered.map((a) => Number(a.distance ?? 99)));
}

async function buildRelationsSnapshot(client, me, agents) {
  if (!client.canUseEvm()) {
    return { relations: null, relationsError: "evmRpcUrl required" };
  }
  const meAddr = normalizeOwnerToAddress(me.owner);
  if (!meAddr) {
    return { relations: null, relationsError: "owner address is not a valid H160" };
  }
  let globalReputation;
  try {
    globalReputation = await client.getGlobalReputation(meAddr);
  } catch (e) {
    return { relations: null, relationsError: String(e?.message ?? e) };
  }

  const others = agents.filter((a) => a.id !== me.id);
  const peers = await Promise.all(
    others.map(async (a) => {
      const peerAddr = normalizeOwnerToAddress(a.owner);
      if (!peerAddr) {
        return {
          agentId: a.id,
          address: null,
          standing: null,
          attitude: null,
          error: "owner address is not a valid H160"
        };
      }
      try {
        const [standing, attitude] = await Promise.all([
          client.getStanding(meAddr, peerAddr),
          client.getRelation(meAddr, peerAddr)
        ]);
        return { agentId: a.id, address: peerAddr, standing, attitude };
      } catch (e) {
        return {
          agentId: a.id,
          address: peerAddr,
          standing: null,
          attitude: null,
          error: String(e?.message ?? e)
        };
      }
    })
  );
  return { relations: { globalReputation, peers } };
}

function buildNavigationContext(client, position) {
  const width = client.mapWidth;
  const height = client.mapHeight;
  const x = Number(position?.x ?? 0);
  const y = Number(position?.y ?? 0);
  return {
    mapSize: { width, height },
    coordinateRange: {
      xMin: 0,
      xMax: Math.max(0, width - 1),
      yMin: 0,
      yMax: Math.max(0, height - 1)
    },
    axisConvention:
      "On-chain move: North increases y, South decreases y, East increases x, West decreases x. Valid cells satisfy 0 <= x < width and 0 <= y < height. Stepping outside fails (InvalidDirection or out of bounds).",
    directionDeltas: DIRECTION_DELTAS,
    legalDirections: legalDirectionsFromGridPosition(x, y, width, height)
  };
}

export async function readWorld(client, input = {}) {
  const agentId = input.agentId ?? client.agentId;
  const radius = Number(input.radius ?? 2);
  const messageRadius = Number(input.messageRadius ?? radius);
  const messageLimit = Number(input.messageLimit ?? 8);
  const messageTtl = Number(input.messageTtl ?? 12);
  const agent = await client.getAgent(agentId);
  if (!agent) {
    throw new Error(`agent not found: ${agentId}`);
  }

  const cells = await client.watchSurroundings(radius, { agentId });
  const agents = await client.getNearbyAgents(radius, { agentId, center: agent.position });
  const messages = await client.getRecentMessages({
    agentId,
    center: agent.position,
    radius: messageRadius,
    limit: messageLimit,
    ttl: messageTtl
  });
  const ruins = [];
  for (const cell of cells) {
    if (cell.terrain === "Ruin") {
      const ruin = await client.getRuin(cell.x, cell.y);
      if (ruin) ruins.push(parseRuin(cell.x, cell.y, ruin));
    }
  }

  const epoch = parseEpoch(await client.getEpoch());
  const previousFsm = getPreviousFsm(client, agentId);
  const state = evaluateState({
    me: agent,
    cells,
    agents,
    ruins,
    messages,
    epoch,
    config: input.config ?? {},
    previousFsm
  });
  setPreviousFsm(client, agentId, state);

  const navigation = buildNavigationContext(client, agent.position);
  const snapshot = {
    blockNumber: await client.getCurrentBlockNumber(),
    me: agent,
    navigation,
    cells: cells.map((cell) => parseCell(cell.x, cell.y, cell, cell)),
    agents,
    messages,
    ruins,
    epoch,
    state,
    allowedActions: client.getAllowedActions(state),
    perception: {
      nearbyAgents: agents,
      nearbyCells: cells.map((cell) => parseCell(cell.x, cell.y, cell, cell)),
      nearbyRuins: ruins,
      filteredMessages: messages
    }
  };
  if (input.includeRelations === true) {
    const rel = await buildRelationsSnapshot(client, agent, agents);
    Object.assign(snapshot, rel);
  }
  return snapshot;
}

function evaluateState(snapshot) {
  const cfg = mergeFsmConfig(snapshot?.config ?? {});
  const me = snapshot?.me;
  const balanceDa = balanceDaFromMe(me);
  const hp = Number(me?.hp ?? 0);
  const hpMax = Math.max(1, Number(me?.hpMax ?? 1));
  const cells = snapshot?.cells ?? [];
  const cx = Number(me?.position?.x ?? 0);
  const cy = Number(me?.position?.y ?? 0);

  const centerCell = cells.find((c) => Number(c.x) === cx && Number(c.y) === cy);
  const terrain = centerCell ? String(centerCell.terrain ?? "") : "";
  if (terrain === "Ruin") {
    return "InRuin";
  }

  if (balanceDa < cfg.criticalEnergy || isCriticalHp(hp, hpMax, cfg.criticalHp)) {
    return "Critical";
  }

  const prev = snapshot?.previousFsm;
  if (
    (prev === "Critical" || prev === "Recover") &&
    (balanceDa < cfg.criticalExitEnergy || isRecoveringHp(hp, hpMax, cfg.recoverHp))
  ) {
    return "Recover";
  }

  const nearest = nearestOtherAgentDistance(cells, cx, cy, snapshot?.agents ?? [], me?.id);

  if (nearest <= 1) return "Combat";
  if (nearest <= cfg.encounterDistance) return "Encounter";
  if (hasNegotiationSignal(snapshot?.messages ?? [])) return "Negotiate";
  if (shouldScout(cells, balanceDa, hp, hpMax, cfg)) return "Scout";
  return "Explore";
}

function hasNegotiationSignal(messages) {
  return (messages ?? []).some((message) => {
    const text = String(message?.content ?? "").toUpperCase();
    return (
      text.includes("[ALLY]") ||
      text.includes("[TRUCE]") ||
      text.includes("[NEGOTIATE]") ||
      text.includes("结盟") ||
      text.includes("议和") ||
      text.includes("应和")
    );
  });
}

function shouldScout(cells, balanceDa, hp, hpMax, cfg) {
  if (balanceDa < cfg.safeScoutBalance) return false;
  if (isRecoveringHp(hp, hpMax, cfg.recoverHp)) return false;
  return !cells.some((cell) => String(cell?.terrain ?? "") === "Well");
}

function isCriticalHp(hp, hpMax, criticalHp) {
  return hp <= 1 || hp <= Math.max(1, criticalHp) || hp * 4 <= hpMax;
}

function isRecoveringHp(hp, hpMax, recoverHp) {
  return hp < Math.max(1, recoverHp) || hp * 2 < hpMax;
}
