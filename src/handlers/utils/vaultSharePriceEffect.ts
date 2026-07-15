import { createEffect, S } from "envio";
import { createPublicClient, http, getContract, type PublicClient } from "viem";
import * as dotenv from "dotenv";

dotenv.config();

const VAULT_ABI = [
  { inputs: [], name: "totalAssets", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "totalSupply", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

const getRpcUrl = (chainId: number): string => {
  switch (chainId) {
    case 1030:
      return process.env.ENVIO_CONFLUX_RPC_URL || "https://evm.confluxrpc.com";
    default:
      throw new Error(`No RPC URL configured for chainId ${chainId}`);
  }
};

const clients: Record<number, PublicClient> = {};

/**
 * Read the vault's NAV/shares at a given block so we can snapshot the share
 * price (USDT0 per share, 6-dec) on each value-changing event. Cached by input
 * (vault, block, chain), so each block is read at most once.
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
    try {
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

      const [assets, supply] = await Promise.all([
        contract.read.totalAssets({ blockNumber: BigInt(block) }),
        contract.read.totalSupply({ blockNumber: BigInt(block) }),
      ]);

      const a = assets as bigint;
      const s = supply as bigint;
      const sp = s === 0n ? 0n : (a * 10n ** 12n) / s; // USDT0 (6-dec) per whole share
      return { totalAssets: a.toString(), totalSupply: s.toString(), sharePriceE6: sp.toString() };
    } catch (e) {
      context.log.info(`vault share-price read failed at block ${block}: ${String(e)}`);
      return { totalAssets: "0", totalSupply: "0", sharePriceE6: "0" };
    }
  }
);
