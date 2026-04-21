/**
 * pallet-relations read-only precompile at `0x504` (ABI matches runtime `RelationsPrecompile`).
 */
export const RELATIONS_ABI = [
  "function getStanding(address,address) external view returns (int256)",
  "function getRelation(address,address) external view returns (uint256)",
  "function getGlobalReputation(address) external view returns (int256)"
];

/**
 * Normalize `owner` to an EVM `address` (H160). Only accepts `0x` + 40 hex chars.
 * @returns {string|null} Lowercase `0x...`, or `null` if invalid.
 */
export function normalizeOwnerToAddress(owner) {
  if (owner == null) return null;
  const s = String(owner).trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(s)) return null;
  return s.toLowerCase();
}

/**
 * Decode `getRelation` precompile result: 0 Neutral / 1 Allied / 2 Hostile.
 */
export function decodeRelationAttitude(n) {
  const v = Number(typeof n === "bigint" ? n : BigInt(String(n)));
  if (v === 0) return "Neutral";
  if (v === 1) return "Allied";
  if (v === 2) return "Hostile";
  throw new Error(`invalid relation attitude: ${n}`);
}

/**
 * Coerce an `int256`-like value (bigint/number) to a JS number matching on-chain `i32` semantics.
 */
export function int256LikeToNumber(value) {
  const x = BigInt(typeof value === "bigint" ? value : String(value));
  if (x >= -0x80000000n && x <= 0x7fffffffn) return Number(x);
  const low = x & 0xffffffffn;
  return Number(low >= 0x80000000n ? low - 0x100000000n : low);
}
