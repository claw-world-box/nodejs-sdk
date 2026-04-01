import { clampPositiveInt, toNumber } from "./utils.js";

export async function enableRegistrationWhitelist(client, enabled, options = {}) {
  const call = buildAgentCall(client, ["setRegistrationWhitelistEnabled", "set_registration_whitelist_enabled"], [
    Boolean(enabled)
  ]);
  const tx = wrapSudoIfNeeded(client, call, options);
  return submitTx(client, tx);
}

export async function addWhitelistBatch(client, addresses, options = {}) {
  const normalized = normalizeAddresses(client, addresses);
  enforceBatchLimit(client, normalized);
  const call = buildAgentCall(client, ["whitelistAddBatch", "whitelist_add_batch"], [normalized]);
  const tx = wrapSudoIfNeeded(client, call, options);
  return submitTx(client, tx);
}

export async function removeWhitelistBatch(client, addresses, options = {}) {
  const normalized = normalizeAddresses(client, addresses);
  enforceBatchLimit(client, normalized);
  const call = buildAgentCall(client, ["whitelistRemoveBatch", "whitelist_remove_batch"], [normalized]);
  const tx = wrapSudoIfNeeded(client, call, options);
  return submitTx(client, tx);
}

export async function addWhitelistInChunks(client, addresses, chunkSize, options = {}) {
  const normalized = normalizeAddresses(client, addresses);
  if (normalized.length === 0) {
    return { totalAddresses: 0, chunkSize: resolveBatchLimit(client), chunks: 0, results: [] };
  }
  const maxBatch = resolveBatchLimit(client);
  const finalChunkSize = Math.min(clampPositiveInt(chunkSize ?? maxBatch, maxBatch), maxBatch);
  const results = [];
  for (let i = 0; i < normalized.length; i += finalChunkSize) {
    const chunk = normalized.slice(i, i + finalChunkSize);
    results.push(await addWhitelistBatch(client, chunk, options));
  }
  return {
    totalAddresses: normalized.length,
    chunkSize: finalChunkSize,
    chunks: results.length,
    results
  };
}

function ensureConnected(client) {
  if (!client || !client.api) {
    throw new Error("client not connected, call connect() first");
  }
}

function resolveBatchLimit(client) {
  ensureConnected(client);
  const maxWhitelistBatch = client.api.consts?.agent?.maxWhitelistBatch;
  const fallback = 1000;
  if (maxWhitelistBatch === undefined || maxWhitelistBatch === null) return fallback;
  return clampPositiveInt(toNumber(maxWhitelistBatch), fallback);
}

function enforceBatchLimit(client, addresses) {
  const maxBatch = resolveBatchLimit(client);
  if (addresses.length > maxBatch) {
    throw new Error(`batch too large: ${addresses.length} > ${maxBatch}`);
  }
}

function normalizeAddresses(client, addresses) {
  ensureConnected(client);
  if (!Array.isArray(addresses)) {
    throw new Error("addresses must be an array");
  }
  return addresses
    .map((address) => String(address ?? "").trim())
    .filter(Boolean)
    .map((address) => client.api.registry.createType("AccountId", address).toString());
}

function buildAgentCall(client, methodCandidates, args) {
  ensureConnected(client);
  const pallet = client.api.tx?.agent;
  if (!pallet) {
    throw new Error("tx pallet not found: agent");
  }
  for (const methodName of methodCandidates) {
    if (typeof pallet[methodName] === "function") {
      return pallet[methodName](...args);
    }
  }
  throw new Error(`tx call not found: agent.${methodCandidates.join("|")}`);
}

function wrapSudoIfNeeded(client, call, options) {
  const useSudo = options.useSudo ?? true;
  if (!useSudo) return call;
  const sudo = client.api.tx?.sudo;
  if (!sudo || typeof sudo.sudo !== "function") {
    throw new Error("sudo pallet not found, pass { useSudo: false } if signer is root");
  }
  return sudo.sudo(call);
}

function submitTx(client, tx) {
  if (typeof client._submit === "function") {
    return client._submit(tx);
  }
  if (!client.signer || typeof tx?.signAndSend !== "function") {
    throw new Error("client signer or tx submission method unavailable");
  }
  return new Promise((resolve, reject) => {
    let unsub = null;
    tx.signAndSend(client.signer, (result) => {
      if (result.dispatchError) {
        if (unsub) unsub();
        reject(new Error(result.dispatchError.toString()));
        return;
      }
      if (result.status.isInBlock || result.status.isFinalized) {
        if (unsub) unsub();
        resolve({
          status: result.status.type,
          blockHash: result.status.isInBlock ? result.status.asInBlock.toHex() : result.status.asFinalized.toHex()
        });
      }
    })
      .then((fn) => {
        unsub = fn;
      })
      .catch(reject);
  });
}
