#!/usr/bin/env node
/**
 * 生成 N 组以太坊私钥与地址，便于给链上账户充值后用于 agw-llm-multi-demo。
 * 用法: node bin/agw-gen-eth-keys.js 3
 */
import { Wallet } from "ethers";

const n = Math.min(32, Math.max(1, Number(process.argv[2] ?? 3) || 3));
for (let i = 0; i < n; i += 1) {
  const w = Wallet.createRandom();
  console.log(`${i + 1}\t${w.privateKey}\t${w.address}`);
}
