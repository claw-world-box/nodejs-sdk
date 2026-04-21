/**
 * Rule-based NPC: choose one legal action from `fsmAllowedActions` / snapshot.
 * Conservative survival bias; not chain-authoritative.
 */

/**
 * @param {object} snapshot from `readWorld`
 * @param {string[]} allowedActions
 * @param {object} [_opts]
 * @returns {Promise<{ action: string, payload: object, path?: string }>}
 */
export async function defaultNpcPolicy(snapshot, allowedActions, _opts = {}) {
  const allowed =
    Array.isArray(allowedActions) && allowedActions.length > 0 ? allowedActions : ["harvest"];
  const state = snapshot?.fsmState ?? snapshot?.state ?? "Explore";
  const legal = snapshot?.navigation?.legalDirections;

  const pickDir = () => {
    if (Array.isArray(legal) && legal.length > 0) return String(legal[0]);
    return "North";
  };

  const otherAgent = () => {
    const meId = snapshot?.me?.id;
    const agents = Array.isArray(snapshot?.agents) ? snapshot.agents : [];
    const foe = agents.find((a) => Number(a.id) !== Number(meId) && Number(a.distance ?? 99) <= 2);
    return foe ? Number(foe.id) : null;
  };

  if (state === "Critical" || state === "Recover") {
    if (allowed.includes("harvest")) return { action: "harvest", payload: {} };
    if (allowed.includes("move")) return { action: "move", payload: { direction: pickDir() } };
    if (allowed.includes("submit_heartbeat")) return { action: "submit_heartbeat", payload: {} };
  }

  if (state === "Combat" || state === "Encounter") {
    const tid = otherAgent();
    if (state === "Combat" && tid != null && allowed.includes("attack")) {
      return { action: "attack", payload: { targetId: tid } };
    }
    if (tid != null && allowed.includes("heal")) {
      return { action: "heal", payload: { targetId: tid } };
    }
    if (allowed.includes("move")) return { action: "move", payload: { direction: pickDir() } };
    if (allowed.includes("broadcast")) return { action: "broadcast", payload: { message: "." } };
  }

  if (state === "InRuin") {
    if (allowed.includes("harvest")) return { action: "harvest", payload: {} };
    if (allowed.includes("move")) return { action: "move", payload: { direction: pickDir() } };
  }

  if (state === "Scout" && allowed.includes("scout")) {
    const me = snapshot?.me?.position;
    const cells = Array.isArray(snapshot?.cells) ? snapshot.cells : [];
    const first = cells.find((c) => c && Number(c.x) !== Number(me?.x) && Number(c.y) !== Number(me?.y));
    if (first) {
      return { action: "scout", payload: { x: Number(first.x), y: Number(first.y) } };
    }
  }

  if (allowed.includes("harvest")) return { action: "harvest", payload: {} };
  if (allowed.includes("submit_heartbeat")) return { action: "submit_heartbeat", payload: {} };
  if (allowed.includes("move")) return { action: "move", payload: { direction: pickDir() } };
  if (allowed.includes("broadcast")) return { action: "broadcast", payload: { message: "ping" } };

  return { action: allowed[0], payload: {} };
}
