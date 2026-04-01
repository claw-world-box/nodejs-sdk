import { PRECOMPILE_ACTION, PRECOMPILE_EPOCH } from "./constants.js";
import { directionToU8, encodeMessage, normalizeAction, structureKindToU8 } from "./utils.js";

const ACTION_SELECTORS = {
  move: "move(uint256,uint8)",
  harvest: "harvest(uint256)",
  attack: "attack(uint256,uint256)",
  heal: "heal(uint256,uint256)",
  transfer: "transfer(uint256,uint256,uint256,bytes)",
  renew: "renew(uint256)",
  broadcast: "broadcast(uint256,bytes)",
  scout: "scout(uint256,uint256,uint256)",
  submitHeartbeat: "submitHeartbeat(uint256)",
  buildWall: "buildWall(uint256)",
  build: "build(uint256,uint8)",
  demolish: "demolish(uint256)",
  fundStructure: "fundStructure(uint256,uint256,uint256,uint256)",
  setStructureMaintenance: "setStructureMaintenance(uint256,uint256,uint256,bool)",
  siegeWall: "siegeWall(uint256,uint256,uint256)"
};

const EPOCH_SELECTORS = {
  contributeBeacon: "contributeBeacon(uint256,uint256)",
  registerShelter: "registerShelter(uint256,uint256)"
};

const ACTION_ABI = Object.values(ACTION_SELECTORS).map((signature) => `function ${signature} external returns (uint256)`);
const EPOCH_ABI = Object.values(EPOCH_SELECTORS).map((signature) => `function ${signature} external returns (uint256)`);

export async function submitAction(client, input) {
  const action = normalizeAction(input?.action);
  const agentId = Number(input?.agentId ?? client.agentId);
  if (!Number.isInteger(agentId) || agentId < 0) {
    throw new Error(`invalid agentId: ${input?.agentId}`);
  }
  const path = String(input?.path ?? "auto").toLowerCase();
  const payload = input?.payload ?? {};

  if (path === "evm") {
    return submitViaEvm(client, action, agentId, payload);
  }
  if (path === "substrate") {
    return submitViaSubstrate(client, action, agentId, payload);
  }
  if (client.canUseEvm()) {
    try {
      return await submitViaEvm(client, action, agentId, payload);
    } catch {
      return submitViaSubstrate(client, action, agentId, payload);
    }
  }
  return submitViaSubstrate(client, action, agentId, payload);
}

async function submitViaEvm(client, action, agentId, payload) {
  if (action === "move") {
    return client.callContract(PRECOMPILE_ACTION, ACTION_ABI, "move", [agentId, directionToU8(payload.direction)]);
  }
  if (action === "harvest") return client.callContract(PRECOMPILE_ACTION, ACTION_ABI, "harvest", [agentId]);
  if (action === "attack") return client.callContract(PRECOMPILE_ACTION, ACTION_ABI, "attack", [agentId, Number(payload.targetId)]);
  if (action === "heal") return client.callContract(PRECOMPILE_ACTION, ACTION_ABI, "heal", [agentId, Number(payload.targetId)]);
  if (action === "transfer") {
    const memo =
      payload.memo != null && String(payload.memo).trim() ? String(payload.memo) : "";
    return client.callContract(PRECOMPILE_ACTION, ACTION_ABI, "transfer", [
      agentId,
      Number(payload.targetId),
      BigInt(payload.amount ?? 0),
      encodeMessage(memo)
    ]);
  }
  if (action === "renew") return client.callContract(PRECOMPILE_ACTION, ACTION_ABI, "renew", [agentId]);
  if (action === "broadcast") {
    return client.callContract(PRECOMPILE_ACTION, ACTION_ABI, "broadcast", [agentId, encodeMessage(payload.message ?? payload.content ?? "")]);
  }
  if (action === "scout") {
    return client.callContract(PRECOMPILE_ACTION, ACTION_ABI, "scout", [agentId, Number(payload.x), Number(payload.y)]);
  }
  if (action === "submit_heartbeat") {
    return client.callContract(PRECOMPILE_ACTION, ACTION_ABI, "submitHeartbeat", [agentId]);
  }
  if (action === "build_wall") {
    return client.callContract(PRECOMPILE_ACTION, ACTION_ABI, "buildWall", [agentId]);
  }
  if (action === "build") {
    return client.callContract(PRECOMPILE_ACTION, ACTION_ABI, "build", [agentId, structureKindToU8(payload.structureType ?? payload.kind)]);
  }
  if (action === "demolish") {
    return client.callContract(PRECOMPILE_ACTION, ACTION_ABI, "demolish", [agentId]);
  }
  if (action === "fund_structure") {
    return client.callContract(PRECOMPILE_ACTION, ACTION_ABI, "fundStructure", [
      agentId,
      Number(payload.x),
      Number(payload.y),
      BigInt(payload.amount ?? 0)
    ]);
  }
  if (action === "set_structure_maintenance") {
    return client.callContract(PRECOMPILE_ACTION, ACTION_ABI, "setStructureMaintenance", [
      agentId,
      Number(payload.x),
      Number(payload.y),
      Boolean(payload.active)
    ]);
  }
  if (action === "siege_wall") {
    return client.callContract(PRECOMPILE_ACTION, ACTION_ABI, "siegeWall", [
      agentId,
      Number(payload.x),
      Number(payload.y)
    ]);
  }
  if (action === "contribute_beacon") {
    return client.callContract(PRECOMPILE_EPOCH, EPOCH_ABI, "contributeBeacon", [agentId, BigInt(payload.amount ?? 0)]);
  }
  if (action === "register_shelter") {
    return client.callContract(PRECOMPILE_EPOCH, EPOCH_ABI, "registerShelter", [agentId, Number(payload.radius ?? 0)]);
  }
  throw new Error(`unsupported evm action: ${action}`);
}

async function submitViaSubstrate(client, action, agentId, payload) {
  if (action === "move") return client.move(payload.direction, agentId);
  if (action === "harvest") return client.harvest(agentId);
  if (action === "attack") return client.attack(Number(payload.targetId), agentId);
  if (action === "heal") return client.heal(Number(payload.targetId), agentId);
  if (action === "transfer") {
    return client.transfer(agentId, Number(payload.targetId), payload.amount ?? 0, payload.memo);
  }
  if (action === "renew") return client.renew(agentId);
  if (action === "broadcast") return client.broadcast(String(payload.message ?? payload.content ?? ""), agentId);
  if (action === "scout") return client.scout(agentId, Number(payload.x), Number(payload.y));
  if (action === "submit_heartbeat") return client.submitHeartbeat(agentId);
  if (action === "build_wall") return client.buildWall(agentId);
  if (action === "build") return client.build(agentId, payload.structureType ?? payload.kind ?? "Wall");
  if (action === "demolish") return client.demolish(agentId);
  if (action === "fund_structure") return client.fundStructure(agentId, Number(payload.x), Number(payload.y), payload.amount ?? 0);
  if (action === "set_structure_maintenance") {
    return client.setStructureMaintenance(agentId, Number(payload.x), Number(payload.y), Boolean(payload.active));
  }
  if (action === "siege_wall") return client.siegeWall(agentId, Number(payload.x), Number(payload.y));
  if (action === "contribute_beacon") return client.contributeBeacon(agentId, payload.amount ?? 0);
  if (action === "register_shelter") return client.registerShelter(agentId, payload.radius ?? 0);
  throw new Error(`unsupported action: ${action}`);
}
