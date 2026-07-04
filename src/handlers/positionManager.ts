// NonfungiblePositionManager events — tokenId-level position lifecycle.
//
// Pool-level Mint/Burn/Collect events see only the Position Manager as the
// owner, so per-tokenId history (age, deposits, withdrawals, collected fees)
// is only observable here. Amounts are kept as RAW BigInt token units on
// purpose: these events carry no token metadata, and the frontend already
// knows each position's tokens/decimals from its on-chain reads.
import { indexer } from "envio";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ZERO = BigInt(0);

function positionId(chainId: number, tokenId: bigint): string {
  return `${chainId}-${tokenId.toString()}`;
}

function eventId(chainId: number, txHash: string, logIndex: number): string {
  return `${chainId}-${txHash}-${logIndex}`;
}

indexer.onEvent(
  { contract: "NonfungiblePositionManager", event: "Transfer" },
  async ({ event, context }) => {
    const id = positionId(event.chainId, event.params.tokenId);
    const timestamp = BigInt(event.block.timestamp);
    const isMint = event.params.from.toLowerCase() === ZERO_ADDRESS;
    const isBurn = event.params.to.toLowerCase() === ZERO_ADDRESS;

    const existing = await context.Position.get(id);
    if (isMint) {
      context.Position.set({
        id,
        tokenId: event.params.tokenId,
        owner: event.params.to.toLowerCase(),
        createdAtTimestamp: timestamp,
        createdAtBlockNumber: BigInt(event.block.number),
        liquidity: ZERO,
        depositedAmount0: ZERO,
        depositedAmount1: ZERO,
        withdrawnAmount0: ZERO,
        withdrawnAmount1: ZERO,
        collectedAmount0: ZERO,
        collectedAmount1: ZERO,
        lastUpdatedTimestamp: timestamp,
      });
    } else if (existing) {
      context.Position.set({
        ...existing,
        owner: event.params.to.toLowerCase(),
        lastUpdatedTimestamp: timestamp,
      });
    }

    context.PositionEvent.set({
      id: eventId(event.chainId, event.transaction.hash, event.logIndex),
      tokenId: event.params.tokenId,
      eventType: isMint ? "MINT" : isBurn ? "BURN" : "TRANSFER",
      amount0: undefined,
      amount1: undefined,
      liquidity: undefined,
      fromAddress: event.params.from.toLowerCase(),
      toAddress: event.params.to.toLowerCase(),
      origin: event.transaction.from?.toLowerCase(),
      timestamp,
      blockNumber: BigInt(event.block.number),
      transactionHash: event.transaction.hash,
    });
  },
);

indexer.onEvent(
  { contract: "NonfungiblePositionManager", event: "IncreaseLiquidity" },
  async ({ event, context }) => {
    const id = positionId(event.chainId, event.params.tokenId);
    const timestamp = BigInt(event.block.timestamp);

    const existing = await context.Position.get(id);
    if (existing) {
      context.Position.set({
        ...existing,
        liquidity: existing.liquidity + event.params.liquidity,
        depositedAmount0: existing.depositedAmount0 + event.params.amount0,
        depositedAmount1: existing.depositedAmount1 + event.params.amount1,
        lastUpdatedTimestamp: timestamp,
      });
    }

    context.PositionEvent.set({
      id: eventId(event.chainId, event.transaction.hash, event.logIndex),
      tokenId: event.params.tokenId,
      eventType: "INCREASE",
      amount0: event.params.amount0,
      amount1: event.params.amount1,
      liquidity: event.params.liquidity,
      fromAddress: undefined,
      toAddress: undefined,
      origin: event.transaction.from?.toLowerCase(),
      timestamp,
      blockNumber: BigInt(event.block.number),
      transactionHash: event.transaction.hash,
    });
  },
);

indexer.onEvent(
  { contract: "NonfungiblePositionManager", event: "DecreaseLiquidity" },
  async ({ event, context }) => {
    const id = positionId(event.chainId, event.params.tokenId);
    const timestamp = BigInt(event.block.timestamp);

    const existing = await context.Position.get(id);
    if (existing) {
      const newLiquidity = existing.liquidity - event.params.liquidity;
      context.Position.set({
        ...existing,
        liquidity: newLiquidity < ZERO ? ZERO : newLiquidity,
        withdrawnAmount0: existing.withdrawnAmount0 + event.params.amount0,
        withdrawnAmount1: existing.withdrawnAmount1 + event.params.amount1,
        lastUpdatedTimestamp: timestamp,
      });
    }

    context.PositionEvent.set({
      id: eventId(event.chainId, event.transaction.hash, event.logIndex),
      tokenId: event.params.tokenId,
      eventType: "DECREASE",
      amount0: event.params.amount0,
      amount1: event.params.amount1,
      liquidity: event.params.liquidity,
      fromAddress: undefined,
      toAddress: undefined,
      origin: event.transaction.from?.toLowerCase(),
      timestamp,
      blockNumber: BigInt(event.block.number),
      transactionHash: event.transaction.hash,
    });
  },
);

indexer.onEvent(
  { contract: "NonfungiblePositionManager", event: "Collect" },
  async ({ event, context }) => {
    const id = positionId(event.chainId, event.params.tokenId);
    const timestamp = BigInt(event.block.timestamp);

    const existing = await context.Position.get(id);
    if (existing) {
      context.Position.set({
        ...existing,
        collectedAmount0: existing.collectedAmount0 + event.params.amount0,
        collectedAmount1: existing.collectedAmount1 + event.params.amount1,
        lastUpdatedTimestamp: timestamp,
      });
    }

    context.PositionEvent.set({
      id: eventId(event.chainId, event.transaction.hash, event.logIndex),
      tokenId: event.params.tokenId,
      eventType: "COLLECT",
      amount0: event.params.amount0,
      amount1: event.params.amount1,
      liquidity: undefined,
      fromAddress: undefined,
      toAddress: event.params.recipient.toLowerCase(),
      origin: event.transaction.from?.toLowerCase(),
      timestamp,
      blockNumber: BigInt(event.block.number),
      transactionHash: event.transaction.hash,
    });
  },
);
