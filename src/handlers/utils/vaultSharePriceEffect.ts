import { createEffect, S } from "envio";
import {
  createPublicClient,
  http,
  getContract,
  encodeFunctionData,
  decodeAbiParameters,
  type PublicClient,
} from "viem";
import * as dotenv from "dotenv";

dotenv.config();

const VAULT_ABI = [
  { inputs: [], name: "totalAssets", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "totalSupply", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

// strategy.sync() — poke (burn 0) to materialize accrued swap fees into
// tokensOwed so totalAssets is fee-current. No liquidity moves.
const STRAT_ABI = [
  { inputs: [], name: "sync", outputs: [], stateMutability: "nonpayable", type: "function" },
] as const;

// aggregate3 bundles N calls in one tx; each sub-call sees the prior's state
// changes, so [sync(), totalAssets()] yields the poked NAV in a single read.
const MULTICALL3_ABI = [
  {
    inputs: [
      {
        components: [
          { internalType: "address", name: "target", type: "address" },
          { internalType: "bool", name: "allowFailure", type: "bool" },
          { internalType: "bytes", name: "callData", type: "bytes" },
        ],
        internalType: "struct Multicall3.Call3[]",
        name: "calls",
        type: "tuple[]",
      },
    ],
    name: "aggregate3",
    outputs: [
      {
        components: [
          { internalType: "bool", name: "success", type: "bool" },
          { internalType: "bytes", name: "returnData", type: "bytes" },
        ],
        internalType: "struct Multicall3.Result[]",
        name: "returnData",
        type: "tuple[]",
      },
    ],
    stateMutability: "payable",
    type: "function",
  },
] as const;

// Multicall3 is deployed on Conflux eSpace.
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

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
 * (vault, strategy, block, chain), so each block is read at most once.
 *
 * The totalAssets read is FEE-CURRENT: it pokes the strategy first (via a
 * Multicall3 bundle of [strategy.sync(), vault.totalAssets()] in one atomic
 * eth_call) so accrued-but-unmaterialized swap fees are reflected. Without the
 * poke, totalAssets would only show fees materialized since the last
 * harvest/rebalance, leaving the share-price series flat at 1.0 while fees
 * accrue. If the poke bundle fails it falls back to an un-poked read within the
 * same attempt (degraded accuracy beats a failed snapshot).
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
      strategy: S.string,
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
    const { vault, strategy, block, chainId } = input;
    if (!clients[chainId]) {
      clients[chainId] = createPublicClient({
        transport: http(getRpcUrl(chainId), { batch: true }),
      });
    }
    const client = clients[chainId];
    const contract = getContract({
      address: vault as `0x${string}`,
      abi: VAULT_ABI,
      client,
    });

    // totalAssets is read FEE-CURRENT: poke the strategy, then read totalAssets
    // in one atomic eth_call via Multicall3. Falls back to the plain (un-poked)
    // read on any failure so a multicall hiccup never blanks the snapshot.
    const readAssetsFeeCurrent = async (): Promise<bigint> => {
      try {
        const syncData = encodeFunctionData({ abi: STRAT_ABI, functionName: "sync" });
        const taData = encodeFunctionData({ abi: VAULT_ABI, functionName: "totalAssets" });
        const data = encodeFunctionData({
          abi: MULTICALL3_ABI,
          functionName: "aggregate3",
          args: [
            [
              { target: strategy as `0x${string}`, allowFailure: false, callData: syncData },
              { target: vault as `0x${string}`, allowFailure: false, callData: taData },
            ],
          ],
        });
        const res = await client.call({
          to: MULTICALL3,
          data,
          blockNumber: BigInt(block),
        });
        // Decode aggregate3's return: Result[](success,returnData)[]; take the
        // 2nd result's returnData as a uint256.
        const results = decodeAbiParameters(
          [
            {
              components: [
                { name: "success", type: "bool" },
                { name: "returnData", type: "bytes" },
              ],
              name: "returnData",
              type: "tuple[]",
            },
          ],
          (res.data ?? "0x") as `0x${string}`,
        )[0];
        return BigInt(results[1].returnData);
      } catch {
        return contract.read.totalAssets({ blockNumber: BigInt(block) }) as Promise<bigint>;
      }
    };

    const ATTEMPTS = 4;
    let lastErr: unknown;
    for (let i = 0; i < ATTEMPTS; i++) {
      try {
        const [assets, supply] = await Promise.all([
          readAssetsFeeCurrent(),
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
