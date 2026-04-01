import { parseCell, parseEpoch, parseRuin } from "./parsers.js";
import { DIRECTION_DELTAS, legalDirectionsFromGridPosition } from "./utils.js";

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
  const state = evaluateState({ me: agent, cells, agents, ruins, messages, epoch, config: input.config ?? {} });
  const navigation = buildNavigationContext(client, agent.position);
  return {
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
}

function evaluateState(snapshot) {
  const config = snapshot?.config ?? {};
  const balance = Number(snapshot?.me?.energy ?? snapshot?.me?.nativeBalance ?? 0);
  const hp = Number(snapshot?.me?.hp ?? 0);
  const hpMax = Math.max(1, Number(snapshot?.me?.hpMax ?? 1));
  const nearest = Array.isArray(snapshot?.agents) && snapshot.agents.length > 0
    ? Math.min(...snapshot.agents.map((agent) => Number(agent.distance ?? 99)))
    : Number.POSITIVE_INFINITY;
  const inRuin = Array.isArray(snapshot?.ruins) && snapshot.ruins.some((ruin) => Number(ruin.distance ?? 1) === 0);
  if (inRuin) return "InRuin";
  if (balance < Number(config.criticalEnergy ?? 150) || isCriticalHp(hp, hpMax, Number(config.criticalHp ?? 30))) {
    return "Critical";
  }
  if (nearest <= 1) return "Combat";
  if (nearest <= Number(config.encounterDistance ?? 2)) return "Encounter";
  if (hasNegotiationSignal(snapshot?.messages ?? [])) return "Negotiate";
  if (shouldScout(snapshot, balance, hp, hpMax)) return "Scout";
  return "Explore";
}

function hasNegotiationSignal(messages) {
  return (messages ?? []).some((message) => {
    const text = String(message?.content ?? "").toUpperCase();
    return text.includes("[ALLY]") || text.includes("[TRUCE]") || text.includes("[NEGOTIATE]") || text.includes("结盟") || text.includes("议和") || text.includes("应和");
  });
}

function shouldScout(snapshot, balance, hp, hpMax) {
  const config = snapshot?.config ?? {};
  if (balance < Number(config.safeScoutBalance ?? 80)) return false;
  if (isRecoveringHp(hp, hpMax, Number(config.recoverHp ?? 72))) return false;
  return !(snapshot?.cells ?? []).some((cell) => String(cell?.terrain ?? "") === "Well");
}

function isCriticalHp(hp, hpMax, criticalHp) {
  return hp <= 1 || hp <= Math.max(1, criticalHp) || hp * 4 <= hpMax;
}

function isRecoveringHp(hp, hpMax, recoverHp) {
  return hp < Math.max(1, recoverHp) || hp * 2 < hpMax;
}
