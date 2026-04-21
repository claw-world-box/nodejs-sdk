import { AgwGameClient } from "./client.js";
import { loadWalletFromDisk } from "./wallet-store.js";

/**
 * Load persisted wallet + last registered agent id without connecting.
 * @param {object} [opts] same as `loadWalletFromDisk`
 * @returns {{
 *   walletPath: string,
 *   record: object,
 *   wallet: { privateKey: string, address: string, mnemonic: null },
 *   agentId: number|null,
 *   networkPreset: string
 * }}
 */
export function loadRegisteredSession(opts = {}) {
  const { path, record, wallet } = loadWalletFromDisk(opts);
  const agentId =
    record.lastRegisteredAgentId != null && Number.isFinite(Number(record.lastRegisteredAgentId))
      ? Number(record.lastRegisteredAgentId)
      : null;
  return {
    walletPath: path,
    record,
    wallet,
    agentId,
    networkPreset: record.networkPreset ?? "mainnet"
  };
}

/**
 * Connect a client using the saved wallet and agent id.
 * @param {object} [opts]
 * @param {object} [opts.clientOptions] extra `AgwGameClient` options
 * @param {(cfg: object) => AgwGameClient} [opts.createClient] default `cfg => new AgwGameClient(cfg)`
 * @returns {Promise<{ session: ReturnType<typeof loadRegisteredSession>, client: AgwGameClient }>}
 */
export async function connectRegisteredSession(opts = {}) {
  const session = loadRegisteredSession(opts);
  if (session.agentId == null) {
    throw new Error(
      "connectRegisteredSession: wallet file has no lastRegisteredAgentId; run bootstrapRegistration first"
    );
  }
  const createClient =
    typeof opts.createClient === "function" ? opts.createClient : (cfg) => new AgwGameClient(cfg);
  const client = createClient({
    ethPrivateKey: session.wallet.privateKey,
    agentId: session.agentId,
    networkPreset: session.networkPreset,
    ...opts.clientOptions
  });
  await client.connect();
  return { session, client };
}

/**
 * @param {object} [opts]
 * @param {object} [opts.clientOptions]
 * @returns {Promise<AgwGameClient>}
 */
export async function clientFromSavedSession(opts = {}) {
  const { client } = await connectRegisteredSession(opts);
  return client;
}
