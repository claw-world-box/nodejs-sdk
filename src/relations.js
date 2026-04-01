/**
 * pallet-relations 只读预编译 `0x504`：与链上 `RelationsPrecompile` 选择器一致。
 * @see agw-chain-game crates/agw-game-runtime/src/precompiles.rs
 */
export const RELATIONS_ABI = [
  "function getStanding(address,address) external view returns (int256)",
  "function getRelation(address,address) external view returns (uint256)",
  "function getGlobalReputation(address) external view returns (int256)"
];

/**
 * 将 `owner` 规范为 EVM `address`（H160）。仅接受 `0x` + 40 位 hex。
 * @returns {string|null} 小写 `0x...` 或无法解析时为 `null`
 */
export function normalizeOwnerToAddress(owner) {
  if (owner == null) return null;
  const s = String(owner).trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(s)) return null;
  return s.toLowerCase();
}

/**
 * 预编译 `getRelation` 返回值：0 Neutral / 1 Allied / 2 Hostile
 */
export function decodeRelationAttitude(n) {
  const v = Number(typeof n === "bigint" ? n : BigInt(String(n)));
  if (v === 0) return "Neutral";
  if (v === 1) return "Allied";
  if (v === 2) return "Hostile";
  throw new Error(`invalid relation attitude: ${n}`);
}

/**
 * 将 `int256` 解码结果（bigint/number）转为与链上 `i32` 一致的 number。
 */
export function int256LikeToNumber(value) {
  const x = BigInt(typeof value === "bigint" ? value : String(value));
  if (x >= -0x80000000n && x <= 0x7fffffffn) return Number(x);
  const low = x & 0xffffffffn;
  return Number(low >= 0x80000000n ? low - 0x100000000n : low);
}
