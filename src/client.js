import { ApiPromise, Keyring, WsProvider } from "@polkadot/api";
import { ScProvider } from "@polkadot/rpc-provider/substrate-connect";
import { blake2AsU8a } from "@polkadot/util-crypto";
import { Contract, Interface, JsonRpcProvider, Wallet, WebSocketProvider } from "ethers";
import { PRECOMPILE_EPOCH, PRECOMPILE_RELATIONS, TERRAIN_NAMES, WEI_PER_AGW } from "./constants.js";
import { parseAgent, parseCell, parseEpoch, parseMessage, parseRuin } from "./parsers.js";
import { createAlwaysReadyChecker, createSmoldotBridge } from "./smoldot.js";
import {
  clampPositiveInt,
  directionToU8,
  enumToString,
  normalizeBootnodes,
  normalizeConnectionMode,
  splitmix64,
  structureKindToU8,
  toBigInt,
  toNumber,
  tupleToPair,
  uint256LikeToBigInt
} from "./utils.js";
import { submitAction } from "./actions.js";
import { RELATIONS_ABI, decodeRelationAttitude, int256LikeToNumber } from "./relations.js";
import { getFsmAllowedActionsForState } from "./fsm.js";
import { AGW_MAINNET_BOOTNODES, resolveMainnetChainSpecJson } from "./mainnet-preset.js";

/** Epoch precompile static reads (address `0x502`). */
const EPOCH_VIEW_ABI = ["function getBeaconEntropy() external view returns (uint256)"];

export class AgwGameClient {
  constructor(options = {}) {
    const defaultMode = options.wsUrl ? "ws" : "smoldot";
    this.connectionMode = normalizeConnectionMode(options.connectionMode ?? defaultMode);
    this.wsUrl = options.wsUrl ?? "ws://127.0.0.1:9944";
    this.evmRpcUrl = options.evmRpcUrl ?? options.wsUrl ?? null;
    this.wsTimeoutMs = options.wsTimeoutMs ?? 10_000;
    this.smoldotChainSpec = options.smoldotChainSpec ?? null;
    this.smoldotChainSpecUrl = options.smoldotChainSpecUrl ?? null;
    /** `"mainnet"` uses embedded AGW mainnet spec when smoldot spec/url omitted. Use `"none"` to require explicit spec. */
    this.networkPreset = options.networkPreset ?? "mainnet";
    this.smoldotBootnodes = normalizeBootnodes(options.smoldotBootnodes ?? "");
    this.smoldotConfig = options.smoldotConfig ?? {};
    this.signerUri = options.signerUri ?? null;
    this.ethPrivateKey = options.ethPrivateKey ?? null;
    this.mapWidth = clampPositiveInt(options.mapWidth ?? 256, 256);
    this.mapHeight = clampPositiveInt(options.mapHeight ?? 256, 256);
    this.agentId = options.agentId ?? null;
    this.signer = options.signer ?? null;
    this.api = null;
    this.provider = null;
    this._evmProvider = null;
    this._evmSigner = null;
    this._unitWei = WEI_PER_AGW;
  }

  async connect() {
    if (this.api) return this;
    if (this.connectionMode === "ws") {
      this.provider = new WsProvider(this.wsUrl, this.wsTimeoutMs);
      this.api = await ApiPromise.create({ provider: this.provider });
    } else {
      const chainSpec = await this._resolveSmoldotChainSpec();
      this.provider = new ScProvider(createSmoldotBridge(), chainSpec);
      await this.provider.connect(this.smoldotConfig, createAlwaysReadyChecker);
      this.api = await ApiPromise.create({ provider: this.provider });
    }
    const unitWei = this.api.consts?.action?.unitWei;
    if (unitWei !== undefined && unitWei !== null) {
      this._unitWei = toBigInt(unitWei);
    }
    const width = this.api.consts?.world?.mapWidth;
    const height = this.api.consts?.world?.mapHeight;
    if (width !== undefined && width !== null) this.mapWidth = toNumber(width);
    if (height !== undefined && height !== null) this.mapHeight = toNumber(height);
    return this;
  }

  async disconnect() {
    if (this.api) {
      await this.api.disconnect();
      this.api = null;
    }
    if (this.provider && typeof this.provider.disconnect === "function") {
      try {
        await this.provider.disconnect();
      } catch {
        // ignore provider close races
      }
    }
    this._evmSigner = null;
    if (this._evmProvider) {
      const evm = this._evmProvider;
      this._evmProvider = null;
      try {
        evm.removeAllListeners?.();
      } catch {
        // ignore
      }
      try {
        const ws = evm.websocket;
        if (ws && typeof ws.close === "function") {
          ws.close();
        }
      } catch {
        // websocket getter throws after close; ignore
      }
      // Skip evm.destroy(): JsonRpcProvider rejects pending eth_unsubscribe, which surfaces as an
      // unhandled rejection in ethers v6 when the socket is torn down mid-flight.
    }
    this.provider = null;
  }

  canUseEvm() {
    return typeof this.evmRpcUrl === "string" && this.evmRpcUrl.length > 0;
  }

  /**
   * Static FSM heuristic for prompts — not on-chain or gateway authority.
   * If you use an AGW HTTP gateway, treat its allowed-actions list and validation API as authoritative.
   */
  getAllowedActions(state = null) {
    return getFsmAllowedActionsForState(state);
  }

  async getAgentIdsAtCell(x, y) {
    this._ensureConnected();
    const agentsByCell = this._findQueryOptional("agent", ["agentsByCell", "agents_by_cell"]);
    if (!agentsByCell) return [];
    const raw = await agentsByCell([Number(x), Number(y)]);
    return toVecValues(raw).map((value) => Number(value)).filter((value) => Number.isFinite(value));
  }

  async getNearbyAgents(radius, options = {}) {
    this._ensureConnected();
    const finalRadius = clampPositiveInt(radius ?? 1, 1);
    const center = options.center ?? (await this._requireAgentPosition(options.agentId ?? this.agentId));
    const agentIds = new Set();
    for (let x = center.x - finalRadius; x <= center.x + finalRadius; x += 1) {
      for (let y = center.y - finalRadius; y <= center.y + finalRadius; y += 1) {
        if (!this._inBounds(x, y)) continue;
        const ids = await this.getAgentIdsAtCell(x, y);
        for (const id of ids) agentIds.add(id);
      }
    }
    const agents = [];
    for (const id of agentIds) {
      const agent = await this.getAgent(id);
      if (!agent) continue;
      agents.push({
        ...agent,
        distance: manhattan(center, agent.position)
      });
    }
    agents.sort((a, b) => a.distance - b.distance || a.id - b.id);
    return agents;
  }

  async getRecentMessages(options = {}) {
    this._ensureConnected();
    const query = this._findQueryOptional("message", ["recentMessages", "recent_messages", "messageWindow", "message_window"]);
    if (!query) return [];
    const raw = await query();
    const items = toVecValues(raw).map((item) => parseMessage(item)).filter(Boolean);
    const currentBlock = options.blockNumber ?? (await this.getCurrentBlockNumber());
    const ttl = clampPositiveInt(options.ttl ?? 12, 1);
    const radius = clampPositiveInt(options.radius ?? 2, 0);
    const limit = clampPositiveInt(options.limit ?? 8, 1);
    const center = options.center ?? (options.agentId != null ? await this._requireAgentPosition(options.agentId) : null);
    const viewerId = options.agentId != null ? Number(options.agentId) : null;
    const filtered = items.filter((message) => {
      if (currentBlock - Number(message.block ?? 0) > ttl) return false;
      if (message.kind === "directed") {
        if (viewerId == null) return true;
        return Number(message.fromAgentId) === viewerId || Number(message.toAgentId) === viewerId;
      }
      if (!center) return true;
      return manhattan(center, message.position) <= radius;
    });
    filtered.sort((a, b) => b.block - a.block);
    return filtered.slice(0, limit);
  }

  async registerAgent(x, y, deviceKey = null) {
    this._ensureConnected();
    const tx = this._findCall("agent", ["registerAgent", "register_agent"])(deviceKey, Number(x), Number(y));
    const result = await this._submit(tx);
    const registered = findEvent(result.events, "agent", "AgentRegistered");
    if (registered) {
      this.agentId = Number(registered.data[0]);
      return { ...result, agentId: this.agentId };
    }
    return result;
  }

  async registerWithRandomSpawn(options = {}) {
    this._ensureConnected();
    const maxAttempts = clampPositiveInt(options.maxAttempts ?? 50, 50);
    const agentsByCell = this._findQuery("agent", ["agentsByCell", "agents_by_cell"]);
    const maxAgentsPerCell = this._getMaxAgentsPerCell();
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const x = Math.floor(Math.random() * this.mapWidth);
      const y = Math.floor(Math.random() * this.mapHeight);
      const occupants = await agentsByCell([x, y]);
      if (toVecLength(occupants) >= maxAgentsPerCell) {
        continue;
      }
      try {
        const tx = await this.registerAgent(x, y, options.deviceKey ?? null);
        return { agentId: tx.agentId ?? this.agentId, position: { x, y }, attempts: attempt, tx };
      } catch (error) {
        const text = String(error?.message ?? error);
        if (text.includes("CellCapacityReached") || text.includes("InvalidPosition")) {
          continue;
        }
        throw error;
      }
    }
    throw new Error(`registerWithRandomSpawn failed after ${maxAttempts} attempts`);
  }

  async getAgent(agentId = this.agentId) {
    this._ensureConnected();
    if (agentId === null || agentId === undefined) throw new Error("agentId is required");
    const query = this._findQuery("agent", ["agents"]);
    const raw = await query(agentId);
    if (!raw || raw.isNone) return null;
    const value = raw.isSome ? raw.unwrap() : raw;
    const nativeBalance = await this._readNativeBalance(value.owner, value.energy ?? 0);
    return parseAgent(agentId, value, nativeBalance);
  }

  async getCell(x, y) {
    this._ensureConnected();
    return this._getCell(Number(x), Number(y));
  }

  async getRuin(x, y) {
    this._ensureConnected();
    const cell = await this._getCell(Number(x), Number(y));
    if (!cell || cell.terrain !== "Ruin") return null;
    const query = this._findQuery("world", ["ruinsByCell", "ruins_by_cell"]);
    const raw = await query([Number(x), Number(y)]);
    if (raw && !raw.isNone) {
      const ruin = raw.isSome ? raw.unwrap() : raw;
      return parseRuin(x, y, ruin);
    }
    const level = deriveRuinLevel(Number(x), Number(y), await this._getWorldSeed());
    const now = await this.getCurrentBlockNumber();
    return parseRuin(x, y, ruinInfoForLevel(level, now));
  }

  async getEpoch() {
    this._ensureConnected();
    const currentEpoch = this._findQueryOptional("epoch", ["currentEpoch", "current_epoch"]);
    const beaconPool = this._findQueryOptional("epoch", ["beaconPool", "beacon_pool"]);
    const beaconTarget = this._findQueryOptional("epoch", ["beaconTarget", "beacon_target"]);
    const epochStartBlock = this._findQueryOptional("epoch", ["epochStartBlock", "epoch_start_block"]);
    const [index, pool, target, start] = await Promise.all([
      currentEpoch ? currentEpoch() : Promise.resolve(0),
      beaconPool ? beaconPool() : Promise.resolve(0),
      beaconTarget ? beaconTarget() : Promise.resolve(0),
      epochStartBlock ? epochStartBlock() : Promise.resolve(0)
    ]);
    return parseEpoch({
      index,
      beaconPool: String(pool?.toString?.() ?? pool ?? 0),
      beaconTarget: String(target?.toString?.() ?? target ?? 0),
      startBlock: start
    });
  }

  async watchSurroundings(radius, options = {}) {
    this._ensureConnected();
    const finalRadius = clampPositiveInt(radius ?? 1, 1);
    const center = options.center ?? (await this._requireAgentPosition(options.agentId ?? this.agentId));
    const out = [];
    for (let x = center.x - finalRadius; x <= center.x + finalRadius; x += 1) {
      for (let y = center.y - finalRadius; y <= center.y + finalRadius; y += 1) {
        if (!this._inBounds(x, y)) continue;
        out.push(await this._getCell(x, y));
      }
    }
    return out.filter(Boolean);
  }

  async move(direction, agentId = this.agentId) {
    return this._submit(this._findCall("action", ["move", "r#move", "rMove"])(agentId, directionToU8(direction)));
  }

  async harvest(agentId = this.agentId) {
    return this._submit(this._findCall("action", ["harvest"])(agentId));
  }

  async attack(targetId, agentId = this.agentId) {
    return this._submit(this._findCall("action", ["attack"])(agentId, Number(targetId)));
  }

  async heal(targetId, agentId = this.agentId) {
    return this._submit(this._findCall("action", ["heal"])(agentId, Number(targetId)));
  }

  async transfer(agentId, targetId, amount, memo) {
    const text = memo != null ? String(memo).trim() : "";
    const bytes = text ? Array.from(new TextEncoder().encode(text)) : [];
    return this._submit(
      this._findCall("action", ["transfer"])(agentId, Number(targetId), toBigInt(amount), bytes)
    );
  }

  async broadcast(message, agentId = this.agentId) {
    const bytes = Array.from(new TextEncoder().encode(String(message ?? "")));
    return this._submit(this._findCall("message", ["broadcast"])(agentId, bytes));
  }

  async scout(agentIdOrX, xOrY, maybeY) {
    const { agentId, x, y } = resolveScoutArgs(agentIdOrX, xOrY, maybeY, this.agentId);
    return this._submit(this._findCall("action", ["scout"])(agentId, x, y));
  }

  async build(agentId = this.agentId, structureType) {
    return this._submit(this._findCall("action", ["build"])(agentId, structureKindToU8(structureType)));
  }

  async buildWall(agentId = this.agentId) {
    return this._submit(this._findCall("action", ["buildWall", "build_wall"])(agentId));
  }

  async demolish(agentId = this.agentId) {
    return this._submit(this._findCall("action", ["demolish"])(agentId));
  }

  async fundStructure(agentIdOrX, xOrY, yOrAmount, maybeAmount) {
    const { agentId, x, y, amount } = resolveFundArgs(agentIdOrX, xOrY, yOrAmount, maybeAmount, this.agentId);
    return this._submit(this._findCall("action", ["fundStructure", "fund_structure"])(agentId, x, y, toBigInt(amount)));
  }

  async setStructureMaintenance(agentIdOrX, xOrY, yOrActive, maybeActive) {
    const { agentId, x, y, active } = resolveMaintenanceArgs(agentIdOrX, xOrY, yOrActive, maybeActive, this.agentId);
    return this._submit(this._findCall("action", ["setStructureMaintenance", "set_structure_maintenance"])(agentId, x, y, active));
  }

  async siegeWall(agentIdOrX, xOrY, maybeY) {
    const { agentId, x, y } = resolveSiegeArgs(agentIdOrX, xOrY, maybeY, this.agentId);
    return this._submit(this._findCall("action", ["siegeWall", "siege_wall"])(agentId, x, y));
  }

  async renew(agentId = this.agentId) {
    return this._submit(this._findCall("agent", ["renew"])(agentId));
  }

  async submitHeartbeat(agentId = this.agentId) {
    return this._submit(this._findCall("action", ["submitHeartbeat", "submit_heartbeat"])(agentId));
  }

  async contributeBeacon(agentId = this.agentId, amount) {
    return this._submit(this._findCall("epoch", ["contributeBeacon", "contribute_beacon"])(agentId, toBigInt(amount)));
  }

  async registerShelter(agentId = this.agentId, radius) {
    return this._submit(this._findCall("epoch", ["registerShelter", "register_shelter"])(agentId, Number(radius)));
  }

  async submitAction(input) {
    return submitAction(this, input);
  }

  async callContract(address, abi, method, args = [], options = {}) {
    if (!this.canUseEvm()) {
      throw new Error("evmRpcUrl is required for callContract");
    }
    const contract = new Contract(address, abi, options.send === false ? this._getEvmProvider() : this._getEvmSigner());
    const fragment = new Interface(abi).getFunction(method);
    if (!fragment) throw new Error(`abi method not found: ${method}`);
    const shouldSendTx =
      options.send === true || (fragment.stateMutability !== "view" && fragment.stateMutability !== "pure");
    if (!shouldSendTx) {
      return contract[method](...(Array.isArray(args) ? args : []));
    }
    const tx = await contract[method](...(Array.isArray(args) ? args : []));
    if (options.wait === false) {
      return { txHash: tx.hash };
    }
    const receipt = await tx.wait(options.confirmations ?? 1);
    return { txHash: tx.hash, blockNumber: receipt?.blockNumber ?? null, status: receipt?.status ?? null };
  }

  async getStanding(addressA, addressB) {
    this._ensureConnected();
    if (!this.canUseEvm()) throw new Error("evmRpcUrl is required for getStanding");
    const raw = await this.callContract(PRECOMPILE_RELATIONS, RELATIONS_ABI, "getStanding", [addressA, addressB], {
      send: false
    });
    return int256LikeToNumber(raw);
  }

  async getRelation(addressA, addressB) {
    this._ensureConnected();
    if (!this.canUseEvm()) throw new Error("evmRpcUrl is required for getRelation");
    const raw = await this.callContract(PRECOMPILE_RELATIONS, RELATIONS_ABI, "getRelation", [addressA, addressB], {
      send: false
    });
    return decodeRelationAttitude(raw);
  }

  async getGlobalReputation(address) {
    this._ensureConnected();
    if (!this.canUseEvm()) throw new Error("evmRpcUrl is required for getGlobalReputation");
    const raw = await this.callContract(PRECOMPILE_RELATIONS, RELATIONS_ABI, "getGlobalReputation", [address], {
      send: false
    });
    return int256LikeToNumber(raw);
  }

  /**
   * Beacon entropy from epoch pallet (wei, u128-backed on chain). Not the same as `getEpoch()` pool/treasury fields.
   * @returns {Promise<bigint>} full uint256; do not use `int256LikeToNumber` (lossy for large values).
   */
  async getBeaconEntropy() {
    this._ensureConnected();
    if (!this.canUseEvm()) throw new Error("evmRpcUrl is required for getBeaconEntropy");
    const raw = await this.callContract(PRECOMPILE_EPOCH, EPOCH_VIEW_ABI, "getBeaconEntropy", [], { send: false });
    return uint256LikeToBigInt(raw);
  }

  async getCurrentBlockNumber() {
    this._ensureConnected();
    const header = await this.api.rpc.chain.getHeader();
    return Number(header.number.toString());
  }

  async readWorld(input = {}) {
    const { readWorld } = await import("./read-world.js");
    return readWorld(this, input);
  }

  _ensureConnected() {
    if (!this.api) throw new Error("client not connected, call connect() first");
  }

  _ensureSigner() {
    if (this.signer) return;
    this.signer = this._buildDefaultSigner();
  }

  _buildDefaultSigner() {
    const accountIdLen = this.api.registry.createType("AccountId").toU8a().length;
    if (accountIdLen === 20) {
      if (!this.signerUri && !this.ethPrivateKey) {
        throw new Error("signerUri or ethPrivateKey is required for Ethereum account chains");
      }
      return new Keyring({ type: "ethereum" }).addFromUri(this.signerUri ?? this.ethPrivateKey);
    }
    if (!this.signerUri) {
      throw new Error("signerUri is required for Sr25519 signing (set signerUri or pass signer in constructor)");
    }
    return new Keyring({ type: "sr25519" }).addFromUri(this.signerUri);
  }

  _findCall(section, candidates) {
    const pallet = this.api.tx[section];
    if (!pallet) throw new Error(`tx pallet not found: ${section}`);
    for (const name of candidates) {
      if (typeof pallet[name] === "function") return pallet[name].bind(pallet);
    }
    throw new Error(`tx call not found: ${section}.${candidates.join("|")}`);
  }

  _findQuery(section, candidates) {
    const pallet = this.api.query[section];
    if (!pallet) throw new Error(`query pallet not found: ${section}`);
    for (const name of candidates) {
      if (typeof pallet[name] === "function") return pallet[name].bind(pallet);
    }
    throw new Error(`query not found: ${section}.${candidates.join("|")}`);
  }

  _findQueryOptional(section, candidates) {
    try {
      return this._findQuery(section, candidates);
    } catch {
      return null;
    }
  }

  async _readNativeBalance(owner, fallback = 0n) {
    const accountQuery = this._findQueryOptional("system", ["account"]);
    if (!accountQuery) return toBigInt(fallback);
    try {
      const account = await accountQuery(owner);
      const data = account?.data ?? null;
      return toBigInt(data?.free ?? fallback);
    } catch {
      return toBigInt(fallback);
    }
  }

  _getMaxAgentsPerCell() {
    const value = this.api.consts?.agent?.maxAgentsPerCell;
    return value === undefined || value === null ? 1 : toNumber(value);
  }

  async _resolveSmoldotChainSpec() {
    let spec = String(this.smoldotChainSpec ?? "").trim();
    if (!spec && this.smoldotChainSpecUrl) {
      const response = await fetch(this.smoldotChainSpecUrl);
      if (!response.ok) {
        throw new Error(`failed to fetch smoldot chain spec from ${this.smoldotChainSpecUrl}`);
      }
      spec = (await response.text()).trim();
    }
    if (!spec && this.networkPreset === "mainnet") {
      spec = (await resolveMainnetChainSpecJson()).trim();
    }
    if (!spec) {
      throw new Error(
        "smoldot mode needs chain spec json, chain spec url, or networkPreset mainnet with bundled assets"
      );
    }
    const parsed = JSON.parse(spec);
    const fromSpec = Array.isArray(parsed.bootNodes) ? parsed.bootNodes.filter(Boolean) : [];
    const presetBoot =
      this.networkPreset === "mainnet" && this.smoldotBootnodes.length === 0 ? AGW_MAINNET_BOOTNODES : [];
    parsed.bootNodes = Array.from(new Set([...fromSpec, ...this.smoldotBootnodes, ...presetBoot]));
    return JSON.stringify(parsed);
  }

  _getEvmProvider() {
    if (this._evmProvider) return this._evmProvider;
    if (!this.evmRpcUrl) throw new Error("evmRpcUrl is required");
    this._evmProvider =
      this.evmRpcUrl.startsWith("ws://") || this.evmRpcUrl.startsWith("wss://")
        ? new WebSocketProvider(this.evmRpcUrl)
        : new JsonRpcProvider(this.evmRpcUrl);
    return this._evmProvider;
  }

  _getEvmSigner() {
    if (!this.ethPrivateKey) {
      throw new Error("ethPrivateKey is required for EVM signing");
    }
    if (!this._evmSigner) {
      this._evmSigner = new Wallet(this.ethPrivateKey, this._getEvmProvider());
    }
    return this._evmSigner;
  }

  async _submit(tx) {
    this._ensureSigner();
    return new Promise((resolve, reject) => {
      let unsub = null;
      tx.signAndSend(this.signer, (result) => {
        if (result.dispatchError) {
          if (unsub) unsub();
          const dispatchError = result.dispatchError;
          if (dispatchError.isModule) {
            const decoded = this.api.registry.findMetaError(dispatchError.asModule);
            reject(new Error(`${decoded.section}.${decoded.name}`));
            return;
          }
          reject(new Error(dispatchError.toString()));
          return;
        }
        if (result.status.isInBlock || result.status.isFinalized) {
          if (unsub) unsub();
          resolve({
            status: result.status.type,
            blockHash: result.status.isInBlock ? result.status.asInBlock.toHex() : result.status.asFinalized.toHex(),
            events: (result.events ?? []).map(({ event }) => ({
              section: String(event.section),
              method: String(event.method),
              data: event.data.map((item) => item.toString())
            }))
          });
        }
      })
        .then((fn) => {
          unsub = fn;
        })
        .catch(reject);
    });
  }

  async _requireAgentPosition(agentId = this.agentId) {
    const agent = await this.getAgent(agentId);
    if (!agent) throw new Error(`agent not found: ${agentId}`);
    return agent.position;
  }

  async _getCell(x, y) {
    if (!this._inBounds(x, y)) {
      throw new Error(`cell out of bounds: (${x}, ${y})`);
    }
    const worldGrid = this._findQuery("world", ["worldGrid"]);
    const agentsByCell = this._findQueryOptional("agent", ["agentsByCell", "agents_by_cell"]);
    const debrisByCell = this._findQueryOptional("world", ["debrisByCell", "debris_by_cell"]);
    const raw = await worldGrid([x, y]);
    const blockNow = await this.getCurrentBlockNumber();
    let cellValue;
    if (!raw || raw.isNone) {
      cellValue = {
        terrain: deriveTerrain(x, y, await this._getWorldSeed()),
        lastHarvestBlock: 0,
        structure: null
      };
    } else {
      cellValue = raw.isSome ? raw.unwrap() : raw;
    }
    const occupants = agentsByCell ? toVecLength(await agentsByCell([x, y])) : 0;
    const debris = debrisByCell ? toBigInt(await debrisByCell([x, y])) : 0n;
    const lastHarvestBlock = toNumber(cellValue.lastHarvestBlock ?? cellValue.last_harvest_block ?? 0);
    const energyUnits = this._calcEnergyUnits(x, y, lastHarvestBlock, blockNow, enumToString(cellValue.terrain));
    return parseCell(x, y, cellValue, { occupants, debris, energyUnits });
  }

  _calcEnergyUnits(x, y, lastHarvestBlock, currentBlock, terrain) {
    const terrainName = terrain;
    const maxStorageBlocks = toNumber(this.api.consts?.world?.maxStorageBlocks ?? 1000);
    const maxBase = toNumber(this.api.consts?.world?.maxBase ?? 50);
    const energyCap = toNumber(this.api.consts?.world?.energyCap ?? 5000);
    const tideAmplitude = Number(this.api.consts?.world?.tideAmplitude ?? 20);
    const tideFrequency = Number(this.api.consts?.world?.tideFrequency ?? 10_000_000) / 1e9;
    const tideWx = Number(this.api.consts?.world?.tideWx ?? 64);
    const tideWy = Number(this.api.consts?.world?.tideWy ?? 64);
    const tEffective = terrainName === "Well" ? lastHarvestBlock : Math.max(lastHarvestBlock, currentBlock - maxStorageBlocks);
    const dt = Math.max(0, currentBlock - tEffective);
    const base = deriveBaseRate(x, y, maxBase);
    let yieldValue = base * dt;
    if (tideFrequency > 0) {
      const phase = x / tideWx + y / tideWy;
      const tideIntegral =
        (tideAmplitude / tideFrequency) *
        (Math.cos(phase - tideFrequency * tEffective) - Math.cos(phase - tideFrequency * currentBlock));
      yieldValue += Math.trunc(tideIntegral);
    }
    return Math.max(0, Math.min(energyCap, yieldValue));
  }

  async _getWorldSeed() {
    if (this._worldSeed !== undefined) return this._worldSeed;
    const query = this._findQuery("world", ["worldSeed"]);
    this._worldSeed = toNumber(await query());
    return this._worldSeed;
  }

  _inBounds(x, y) {
    return x >= 0 && y >= 0 && x < this.mapWidth && y < this.mapHeight;
  }
}

export function createAgwClient(options = {}) {
  return new AgwGameClient(options);
}

function findEvent(events, section, method) {
  return (events ?? []).find((event) => event.section === section && event.method === method) ?? null;
}

function toVecLength(value) {
  if (!value) return 0;
  if (Array.isArray(value)) return value.length;
  if (typeof value.length === "number") return value.length;
  const json = value.toJSON ? value.toJSON() : null;
  return Array.isArray(json) ? json.length : 0;
}

function toVecValues(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value.toArray === "function") return value.toArray();
  if (typeof value.toJSON === "function") {
    const json = value.toJSON();
    return Array.isArray(json) ? json : [];
  }
  return [];
}

function manhattan(a, b) {
  return Math.abs(Number(a?.x ?? 0) - Number(b?.x ?? 0)) + Math.abs(Number(a?.y ?? 0) - Number(b?.y ?? 0));
}

function deriveTerrain(x, y, seed) {
  const h = BigInt(x) * 31n + BigInt(y) + BigInt(seed);
  const h2 = h * 2654435761n;
  const noise = Number(h2 % 100n) - 50;
  const xI = Number(x);
  const yI = Number(y);
  const dist2Lm = (xI - 0) ** 2 + (yI - 100) ** 2;
  if (dist2Lm < 2500 + noise * 30) return TERRAIN_NAMES[2];
  const dist2Rm = (xI - 256) ** 2 + (yI - 140) ** 2;
  if (dist2Rm < 3600 + noise * 40) return TERRAIN_NAMES[2];
  const coordKey = (BigInt(x) << 32n) ^ BigInt(y) ^ BigInt(seed) * 0x9e3779b97f4a7c15n;
  const wellHash = splitmix64(coordKey) % 10000n;
  if (wellHash < 15n) return TERRAIN_NAMES[3];
  const ruinHash = splitmix64(coordKey ^ 0xa5a5a5a55a5a5a5an) % 10000n;
  if (ruinHash < 2n) return TERRAIN_NAMES[4];
  const dist2Ts = (xI - 150) ** 2 + (yI - 50) ** 2 * 2;
  if (dist2Ts < 2500 + noise * 30) return TERRAIN_NAMES[1];
  const dist2Bs = (xI - 50) ** 2 * 2 + (yI - 210) ** 2;
  if (dist2Bs < 2500 + noise * 30) return TERRAIN_NAMES[1];
  return TERRAIN_NAMES[0];
}

function deriveRuinLevel(x, y, seed) {
  const coordKey = (BigInt(x) << 32n) ^ BigInt(y) ^ BigInt(seed) * 0xc2b2ae3d27d4eb4fn;
  const roll = Number(splitmix64(coordKey) % 100n);
  if (roll < 50) return 1;
  if (roll < 80) return 2;
  return 3;
}

function ruinInfoForLevel(level, now) {
  const configs = {
    1: { hp: 30, damagePerTick: 8, rewardGas: 500, dropRate: 12, minAgents: 5, respawnDelay: 80 },
    2: { hp: 90, damagePerTick: 20, rewardGas: 1800, dropRate: 22, minAgents: 10, respawnDelay: 160 },
    3: { hp: 220, damagePerTick: 45, rewardGas: 6000, dropRate: 38, minAgents: 20, respawnDelay: 320 }
  };
  const cfg = configs[level] ?? configs[1];
  return {
    level,
    hp: cfg.hp,
    maxHp: cfg.hp,
    damagePerTick: cfg.damagePerTick,
    rewardGas: cfg.rewardGas,
    dropRate: cfg.dropRate,
    minAgents: cfg.minAgents,
    respawnDelay: cfg.respawnDelay,
    lastSettledBlock: now
  };
}

function deriveBaseRate(x, y, maxBase) {
  if (maxBase <= 0) return 0;
  const bytes = new Uint8Array(8);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, x, true);
  view.setUint32(4, y, true);
  const hash = blake2AsU8a(bytes, 256);
  const first64 =
    BigInt(hash[0]) |
    (BigInt(hash[1]) << 8n) |
    (BigInt(hash[2]) << 16n) |
    (BigInt(hash[3]) << 24n) |
    (BigInt(hash[4]) << 32n) |
    (BigInt(hash[5]) << 40n) |
    (BigInt(hash[6]) << 48n) |
    (BigInt(hash[7]) << 56n);
  return Number(first64 % BigInt(maxBase));
}

function resolveScoutArgs(agentIdOrX, xOrY, maybeY, fallbackAgentId) {
  if (maybeY === undefined) {
    return {
      agentId: Number(fallbackAgentId),
      x: Number(agentIdOrX),
      y: Number(xOrY)
    };
  }
  return { agentId: Number(agentIdOrX), x: Number(xOrY), y: Number(maybeY) };
}

function resolveFundArgs(agentIdOrX, xOrY, yOrAmount, maybeAmount, fallbackAgentId) {
  if (maybeAmount === undefined) {
    return {
      agentId: Number(fallbackAgentId),
      x: Number(agentIdOrX),
      y: Number(xOrY),
      amount: yOrAmount
    };
  }
  return {
    agentId: Number(agentIdOrX),
    x: Number(xOrY),
    y: Number(yOrAmount),
    amount: maybeAmount
  };
}

function resolveMaintenanceArgs(agentIdOrX, xOrY, yOrActive, maybeActive, fallbackAgentId) {
  if (maybeActive === undefined) {
    return {
      agentId: Number(fallbackAgentId),
      x: Number(agentIdOrX),
      y: Number(xOrY),
      active: Boolean(yOrActive)
    };
  }
  return {
    agentId: Number(agentIdOrX),
    x: Number(xOrY),
    y: Number(yOrActive),
    active: Boolean(maybeActive)
  };
}

function resolveSiegeArgs(agentIdOrX, xOrY, maybeY, fallbackAgentId) {
  if (maybeY === undefined) {
    return {
      agentId: Number(fallbackAgentId),
      x: Number(agentIdOrX),
      y: Number(xOrY)
    };
  }
  return { agentId: Number(agentIdOrX), x: Number(xOrY), y: Number(maybeY) };
}
