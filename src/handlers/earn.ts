import { indexer } from "envio";
import { getVaultSharePriceEffect } from "./utils/vaultSharePriceEffect";

// Ginseng Earn v1.1 canary — vault 0x1152…, strategy 0x29c5…
const VAULT = "0x11525A77768746917570a1ccD5c72651fD5fcba0";
const STAT_ID = "v2";

const evId = (event: any) => `${event.chainId}-${event.block.number}-${event.logIndex}`;

function emptyStat() {
  return {
    id: STAT_ID,
    cumulativeFees0: 0n,
    cumulativeFees1: 0n,
    harvestCount: 0,
    totalDepositedAssets: 0n,
    totalWithdrawnAssets: 0n,
    totalSupply: 0n,
    depositCount: 0,
    withdrawCount: 0,
    lastCrossE18: 0n,
    lastCrossTs: 0n,
    lastTickLower: 0,
    lastTickUpper: 0,
    lastLiquidity: 0n,
    lastSharePriceE6: 0n,
    updatedAt: 0n,
  };
}

/** Snapshot the vault share price at this event's block and store the point. */
async function snapshotSharePrice(event: any, context: any): Promise<bigint> {
  const res = await context.effect(getVaultSharePriceEffect, {
    vault: VAULT,
    block: Number(event.block.number),
    chainId: event.chainId,
  });
  const spE6 = BigInt(res.sharePriceE6);
  context.EarnSharePricePoint.set({
    id: event.block.number.toString(),
    sharePriceE6: spE6,
    totalAssets: BigInt(res.totalAssets),
    totalSupply: BigInt(res.totalSupply),
    timestamp: BigInt(event.block.timestamp),
    block: Number(event.block.number),
  });
  return spE6;
}

/** Common fields every earn entity carries (id + block/tx metadata). */
const meta = (event: any) => ({
  id: evId(event),
  timestamp: BigInt(event.block.timestamp),
  block: Number(event.block.number),
  txHash: event.transaction.hash,
});

// ── Vault: ERC-4626 flows ────────────────────────────────────────────────────
indexer.onEvent({ contract: "GinsengEarnVault", event: "Deposit" }, async ({ event, context }) => {
  const sp = await snapshotSharePrice(event, context);
  context.EarnDeposit.set({
    id: evId(event),
    sender: event.params.sender,
    owner: event.params.owner,
    assets: event.params.assets,
    shares: event.params.shares,
    sharePriceE6: sp,
    timestamp: BigInt(event.block.timestamp),
    block: Number(event.block.number),
    txHash: event.transaction.hash,
  });
  const stat = (await context.EarnVaultStat.get(STAT_ID)) ?? emptyStat();
  context.EarnVaultStat.set({
    ...stat,
    totalDepositedAssets: stat.totalDepositedAssets + event.params.assets,
    totalSupply: stat.totalSupply + event.params.shares,
    depositCount: stat.depositCount + 1,
    lastSharePriceE6: sp,
    updatedAt: BigInt(event.block.timestamp),
  });
});

indexer.onEvent({ contract: "GinsengEarnVault", event: "Withdraw" }, async ({ event, context }) => {
  const sp = await snapshotSharePrice(event, context);
  context.EarnWithdraw.set({
    id: evId(event),
    sender: event.params.sender,
    receiver: event.params.receiver,
    owner: event.params.owner,
    assets: event.params.assets,
    shares: event.params.shares,
    sharePriceE6: sp,
    timestamp: BigInt(event.block.timestamp),
    block: Number(event.block.number),
    txHash: event.transaction.hash,
  });
  const stat = (await context.EarnVaultStat.get(STAT_ID)) ?? emptyStat();
  context.EarnVaultStat.set({
    ...stat,
    totalWithdrawnAssets: stat.totalWithdrawnAssets + event.params.assets,
    totalSupply: stat.totalSupply > event.params.shares ? stat.totalSupply - event.params.shares : 0n,
    withdrawCount: stat.withdrawCount + 1,
    lastSharePriceE6: sp,
    updatedAt: BigInt(event.block.timestamp),
  });
});

// In-kind redemption burns shares WITHOUT a standard Withdraw — must adjust supply.
indexer.onEvent({ contract: "GinsengEarnVault", event: "RedeemedInKind" }, async ({ event, context }) => {
  const sp = await snapshotSharePrice(event, context);
  context.EarnRedeemInKind.set({
    id: evId(event),
    owner: event.params.owner,
    receiver: event.params.receiver,
    shares: event.params.shares,
    usdc: event.params.usdc,
    usdt0: event.params.usdt0,
    sharePriceE6: sp,
    timestamp: BigInt(event.block.timestamp),
    block: Number(event.block.number),
    txHash: event.transaction.hash,
  });
  const stat = (await context.EarnVaultStat.get(STAT_ID)) ?? emptyStat();
  // Value the in-kind USDC leg in USDT0 (6-dec) terms: usdc is 18-dec → /1e12.
  const usdcAsUsdt0 = event.params.usdc / 10n ** 12n;
  context.EarnVaultStat.set({
    ...stat,
    totalWithdrawnAssets: stat.totalWithdrawnAssets + event.params.usdt0 + usdcAsUsdt0,
    totalSupply: stat.totalSupply > event.params.shares ? stat.totalSupply - event.params.shares : 0n,
    withdrawCount: stat.withdrawCount + 1,
    lastSharePriceE6: sp,
    updatedAt: BigInt(event.block.timestamp),
  });
});

indexer.onEvent({ contract: "GinsengEarnVault", event: "Invested" }, async ({ event, context }) => {
  context.EarnInvested.set({
    id: evId(event),
    assets: event.params.assets,
    timestamp: BigInt(event.block.timestamp),
    block: Number(event.block.number),
    txHash: event.transaction.hash,
  });
});

// ── Vault: gUSDT0 share token (ERC-20) ───────────────────────────────────────
indexer.onEvent({ contract: "GinsengEarnVault", event: "Transfer" }, async ({ event, context }) => {
  context.EarnShareTransfer.set({
    id: evId(event),
    from: event.params.from,
    to: event.params.to,
    value: event.params.value,
    timestamp: BigInt(event.block.timestamp),
    block: Number(event.block.number),
    txHash: event.transaction.hash,
  });
});

indexer.onEvent({ contract: "GinsengEarnVault", event: "Approval" }, async ({ event, context }) => {
  context.EarnShareApproval.set({
    id: evId(event),
    owner: event.params.owner,
    spender: event.params.spender,
    value: event.params.value,
    timestamp: BigInt(event.block.timestamp),
    block: Number(event.block.number),
    txHash: event.transaction.hash,
  });
});

// ── Vault: governance / config / status (one typed entity each) ──────────────
indexer.onEvent({ contract: "GinsengEarnVault", event: "StrategySet" }, async ({ event, context }) => {
  context.EarnStrategySet.set({ ...meta(event), strategy: event.params.strategy });
});
indexer.onEvent({ contract: "GinsengEarnVault", event: "DepositCapSet" }, async ({ event, context }) => {
  context.EarnDepositCapSet.set({ ...meta(event), cap: event.params.cap });
});
indexer.onEvent({ contract: "GinsengEarnVault", event: "PerformanceFeeSet" }, async ({ event, context }) => {
  context.EarnPerformanceFeeSet.set({ ...meta(event), bps: Number(event.params.bps) });
});
indexer.onEvent({ contract: "GinsengEarnVault", event: "FeeQueued" }, async ({ event, context }) => {
  context.EarnFeeQueued.set({ ...meta(event), bps: Number(event.params.bps), eta: event.params.eta });
});
indexer.onEvent({ contract: "GinsengEarnVault", event: "FeeCancelled" }, async ({ event, context }) => {
  context.EarnFeeCancelled.set({ ...meta(event) });
});
indexer.onEvent({ contract: "GinsengEarnVault", event: "TreasuryQueued" }, async ({ event, context }) => {
  context.EarnTreasuryQueued.set({ ...meta(event), treasury: event.params.treasury, eta: event.params.eta });
});
indexer.onEvent({ contract: "GinsengEarnVault", event: "TreasurySet" }, async ({ event, context }) => {
  context.EarnTreasurySet.set({ ...meta(event), treasury: event.params.treasury });
});
indexer.onEvent({ contract: "GinsengEarnVault", event: "TreasuryCancelled" }, async ({ event, context }) => {
  context.EarnTreasuryCancelled.set({ ...meta(event) });
});
indexer.onEvent({ contract: "GinsengEarnVault", event: "GuardianSet" }, async ({ event, context }) => {
  context.EarnGuardianSet.set({ ...meta(event), source: "vault", guardian: event.params.guardian });
});
indexer.onEvent({ contract: "GinsengEarnVault", event: "Paused" }, async ({ event, context }) => {
  context.EarnPaused.set({ ...meta(event), account: event.params.account });
});
indexer.onEvent({ contract: "GinsengEarnVault", event: "Unpaused" }, async ({ event, context }) => {
  context.EarnUnpaused.set({ ...meta(event), account: event.params.account });
});
indexer.onEvent({ contract: "GinsengEarnVault", event: "OwnershipTransferStarted" }, async ({ event, context }) => {
  context.EarnOwnershipTransferStarted.set({ ...meta(event), previousOwner: event.params.previousOwner, newOwner: event.params.newOwner });
});
indexer.onEvent({ contract: "GinsengEarnVault", event: "OwnershipTransferred" }, async ({ event, context }) => {
  context.EarnOwnershipTransferred.set({ ...meta(event), previousOwner: event.params.previousOwner, newOwner: event.params.newOwner });
});

// ── Strategy: position lifecycle + stats ─────────────────────────────────────
indexer.onEvent({ contract: "GinsengEarnStrategy", event: "Harvested" }, async ({ event, context }) => {
  context.EarnHarvest.set({
    id: evId(event),
    fees0: event.params.fees0,
    fees1: event.params.fees1,
    skim0: event.params.skim0,
    skim1: event.params.skim1,
    timestamp: BigInt(event.block.timestamp),
    block: Number(event.block.number),
    txHash: event.transaction.hash,
  });
  const stat = (await context.EarnVaultStat.get(STAT_ID)) ?? emptyStat();
  context.EarnVaultStat.set({
    ...stat,
    cumulativeFees0: stat.cumulativeFees0 + event.params.fees0,
    cumulativeFees1: stat.cumulativeFees1 + event.params.fees1,
    harvestCount: stat.harvestCount + 1,
    updatedAt: BigInt(event.block.timestamp),
  });
});

indexer.onEvent({ contract: "GinsengEarnStrategy", event: "Rebalanced" }, async ({ event, context }) => {
  context.EarnRebalance.set({
    id: evId(event),
    tickLower: Number(event.params.tickLower),
    tickUpper: Number(event.params.tickUpper),
    liquidity: event.params.liquidity,
    crossE18: event.params.crossE18,
    timestamp: BigInt(event.block.timestamp),
    block: Number(event.block.number),
    txHash: event.transaction.hash,
  });
  const stat = (await context.EarnVaultStat.get(STAT_ID)) ?? emptyStat();
  context.EarnVaultStat.set({
    ...stat,
    lastTickLower: Number(event.params.tickLower),
    lastTickUpper: Number(event.params.tickUpper),
    lastLiquidity: event.params.liquidity,
    lastCrossE18: event.params.crossE18,
    updatedAt: BigInt(event.block.timestamp),
  });
});

indexer.onEvent({ contract: "GinsengEarnStrategy", event: "CrossRefreshed" }, async ({ event, context }) => {
  context.EarnCrossRefresh.set({
    id: evId(event),
    crossE18: event.params.crossE18,
    timestamp: event.params.timestamp,
    block: Number(event.block.number),
    txHash: event.transaction.hash,
  });
  const stat = (await context.EarnVaultStat.get(STAT_ID)) ?? emptyStat();
  context.EarnVaultStat.set({
    ...stat,
    lastCrossE18: event.params.crossE18,
    lastCrossTs: event.params.timestamp,
    updatedAt: BigInt(event.block.timestamp),
  });
});

indexer.onEvent({ contract: "GinsengEarnStrategy", event: "Exited" }, async ({ event, context }) => {
  context.EarnExited.set({
    id: evId(event),
    liquidity: event.params.liquidity,
    amount0: event.params.amount0,
    amount1: event.params.amount1,
    timestamp: BigInt(event.block.timestamp),
    block: Number(event.block.number),
    txHash: event.transaction.hash,
  });
});

indexer.onEvent({ contract: "GinsengEarnStrategy", event: "WithdrewToVault" }, async ({ event, context }) => {
  context.EarnWithdrewToVault.set({
    id: evId(event),
    requested: event.params.requested,
    sent: event.params.sent,
    timestamp: BigInt(event.block.timestamp),
    block: Number(event.block.number),
    txHash: event.transaction.hash,
  });
});

indexer.onEvent({ contract: "GinsengEarnStrategy", event: "WithdrewInKind" }, async ({ event, context }) => {
  context.EarnWithdrewInKind.set({
    id: evId(event),
    receiver: event.params.receiver,
    amount0: event.params.amount0,
    amount1: event.params.amount1,
    timestamp: BigInt(event.block.timestamp),
    block: Number(event.block.number),
    txHash: event.transaction.hash,
  });
});

// ── Strategy: governance / status (one typed entity each) ────────────────────
indexer.onEvent({ contract: "GinsengEarnStrategy", event: "SkimFailed" }, async ({ event, context }) => {
  context.EarnSkimFailed.set({ ...meta(event), token: event.params.token, to: event.params.to, amount: event.params.amount });
});
indexer.onEvent({ contract: "GinsengEarnStrategy", event: "GuardianSet" }, async ({ event, context }) => {
  context.EarnGuardianSet.set({ ...meta(event), source: "strategy", guardian: event.params.guardian });
});
indexer.onEvent({ contract: "GinsengEarnStrategy", event: "KeeperSet" }, async ({ event, context }) => {
  context.EarnKeeperSet.set({ ...meta(event), keeper: event.params.keeper });
});
indexer.onEvent({ contract: "GinsengEarnStrategy", event: "ETHSwept" }, async ({ event, context }) => {
  context.EarnEthSwept.set({ ...meta(event), to: event.params.to, amount: event.params.amount });
});
indexer.onEvent({ contract: "GinsengEarnStrategy", event: "ParamsQueued" }, async ({ event, context }) => {
  context.EarnParamsQueued.set({
    ...meta(event),
    maxPythAge: event.params.maxPythAge, maxDeviationBps: event.params.maxDeviationBps,
    maxBandBps: event.params.maxBandBps, maxConfBps: event.params.maxConfBps, eta: event.params.eta,
  });
});
indexer.onEvent({ contract: "GinsengEarnStrategy", event: "ParamsExecuted" }, async ({ event, context }) => {
  context.EarnParamsExecuted.set({
    ...meta(event),
    maxPythAge: event.params.maxPythAge, maxDeviationBps: event.params.maxDeviationBps,
    maxBandBps: event.params.maxBandBps, maxConfBps: event.params.maxConfBps,
  });
});
indexer.onEvent({ contract: "GinsengEarnStrategy", event: "ParamsCancelled" }, async ({ event, context }) => {
  context.EarnParamsCancelled.set({ ...meta(event) });
});
