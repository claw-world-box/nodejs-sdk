import { DEFAULT_ALLOWED_ACTIONS } from "./constants.js";

const ACTIONS_BY_STATE = {
  Explore: ["move", "harvest", "scout", "broadcast", "renew"],
  InRuin: ["attack", "heal", "move", "broadcast", "transfer"],
  Encounter: ["broadcast", "move", "heal", "attack", "transfer", "renew"],
  Critical: ["harvest", "move", "heal", "broadcast", "renew"],
  Recover: ["harvest", "move", "heal", "broadcast", "renew"],
  Negotiate: ["broadcast", "transfer", "heal", "move"],
  Combat: ["attack", "heal", "move", "broadcast", "transfer"],
  Scout: ["scout", "move", "harvest", "broadcast"]
};

/**
 * Prompt-layer FSM: allowed actions for a given inferred state (not on-chain authority).
 * @param {string|null|undefined} state
 * @returns {string[]}
 */
export function getFsmAllowedActionsForState(state) {
  if (state && ACTIONS_BY_STATE[state]) {
    return [...ACTIONS_BY_STATE[state]];
  }
  return [...DEFAULT_ALLOWED_ACTIONS];
}
