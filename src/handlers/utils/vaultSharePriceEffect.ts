import { createEffect, S } from "envio";
import { createPublicClient, http, getContract, type PublicClient } from "viem";
import * as dotenv from "dotenv";

dotenv.config();

const VAULT_ABI = [
  { inputs: [], name: "totalAssets", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "totalSupply", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

// Historical NAV reads require archive state. Default to the same Tenderly
// archive gateway the indexer uses to sync events (config.yaml) — NOT the public
// node, which prunes state and rate-limits burst reads during a re-sync. Those
// failures used to be swallowed as 0/0/0 and cached forever, poisoning the
// share-price series. Override with ENVIO_CONFLUX_RPC_URL if needed.
const getRpcUrl = (chainId: number): string => {
  switch (chainId) {
    case 1030:
      return (
        process.env.ENVIO_CONFLUX_RPC_URL ||
        "https://cfx-espace.gateway.tenderly.co/2TURbvW4WvM602DuxdqT4y"
      );
    default:
      throw new Error(`No RPC URL configured for chainId ${chainId}`);
  }
};

const clients: Record<number, PublicClient> = {};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Read the vault's NAV/shares at a given block so we can snapshot the share
 * price (USDT0 per share, 6-dec) on each value-changing event. Cached by input
 * (vault, block, chain), so each block is read at most once.
 *
 * Reads are retried with backoff; if every attempt fails we THROW rather than
 * return a degenerate 0/0/0. A thrown effect is not cached and the event is
 * retried by the indexer, so a transient RPC hiccup can never persist a poison
 * "empty vault" snapshot the way it did before.
 */
export const getVaultSharePriceEffect = createEffect(
  {
    name: "getVaultSharePrice",
    input: {
      vault: S.string,
      block: S.number,
      chainId: S.number,
    },
    output: {
      totalAssets: S.string,
      totalSupply: S.string,
      sharePriceE6: S.string,
    },
    rateLimit: false,
    cache: true,
  },
  async ({ input, context }) => {
    const { vault, block, chainId } = input;
    if (!clients[chainId]) {
      clients[chainId] = createPublicClient({
        transport: http(getRpcUrl(chainId), { batch: true }),
      });
    }
    const contract = getContract({
      address: vault as `0x${string}`,
      abi: VAULT_ABI,
      client: clients[chainId],
    });

    const ATTEMPTS = 4;
    let lastErr: unknown;
    for (let i = 0; i < ATTEMPTS; i++) {
      try {
        const [assets, supply] = await Promise.all([
          contract.read.totalAssets({ blockNumber: BigInt(block) }),
          contract.read.totalSupply({ blockNumber: BigInt(block) }),
        ]);
        const a = assets as bigint;
        const s = supply as bigint;
        const sp = s === 0n ? 0n : (a * 10n ** 12n) / s; // USDT0 (6-dec) per whole share
        return { totalAssets: a.toString(), totalSupply: s.toString(), sharePriceE6: sp.toString() };
      } catch (e) {
        lastErr = e;
        if (i < ATTEMPTS - 1) await sleep(250 * 2 ** i); // 250ms, 500ms, 1s
      }
    }
    // Every attempt failed — surface it so the event is retried instead of
    // writing (and caching) a poison 0/0/0 point.
    context.log.error(`vault share-price read failed at block ${block} after ${ATTEMPTS} attempts: ${String(lastErr)}`);
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
);
