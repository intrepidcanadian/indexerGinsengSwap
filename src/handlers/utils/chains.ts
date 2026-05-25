import { BigDecimal } from "envio";

export enum ChainId {
  CONFLUX_ESPACE = 1030,
}

export interface NativeTokenDetails {
  symbol: string;
  name: string;
  decimals: bigint;
}

export interface ChainConfig {
  factoryAddress: string;
  stablecoinWrappedNativePoolId: string;
  stablecoinIsToken0: boolean;
  wrappedNativeAddress: string;
  minimumNativeLocked: BigDecimal;
  stablecoinAddresses: string[];
  whitelistTokens: string[];
  tokenOverrides: StaticTokenDefinition[];
  poolsToSkip: string[];
  poolMappings: string[];
  nativeTokenDetails: NativeTokenDetails;
}

export interface StaticTokenDefinition {
  address: string;
  symbol: string;
  name: string;
  decimals: bigint;
}

export const CHAIN_CONFIGS: { [chainId: number]: ChainConfig } = {
  [ChainId.CONFLUX_ESPACE]: {
    factoryAddress: "0x62aa0294cb42aae39b7772313eadfa5d489146ec",
    stablecoinWrappedNativePoolId: "0xcbed98f0066f5f3d60b28f4bd241a6ea302c2023",
    stablecoinIsToken0: false,
    wrappedNativeAddress: "0x14b2d3bc65e74dae1030eafd8ac30c533c976a9b",
    minimumNativeLocked: new BigDecimal("1"),
    stablecoinAddresses: [
      "0x6963efed0ab40f6c3d7bda44a05dcf1437c44372", // USDC
      "0xfe97e85d13abd9c1c33384e796f10b73905637ce", // USDT
      "0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff", // USDT0
    ],
    whitelistTokens: [
      "0x14b2d3bc65e74dae1030eafd8ac30c533c976a9b", // WCFX
      "0x6963efed0ab40f6c3d7bda44a05dcf1437c44372", // USDC
      "0xfe97e85d13abd9c1c33384e796f10b73905637ce", // USDT
      "0xa47f43de2f9623acb395ca4905746496d2014d57", // ETH
      "0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff", // USDT0
      "0x70bfd7f7eadf9b9827541272589a6b2bb760ae2e", // AxCNH
      "0x1f545487c62e5acfea45dcadd9c627361d1616d8", // WBTC
      "0x94bd7a37d2ce24cc597e158facaa8d601083ffec", // BNB
      "0x889138644274a7dc602f25a7e7d53ff40e6d0091", // xCFX
    ],
    tokenOverrides: [
      {
        address: "0x14b2d3bc65e74dae1030eafd8ac30c533c976a9b",
        symbol: "WCFX",
        name: "Wrapped Conflux",
        decimals: BigInt(18),
      },
      {
        address: "0x6963efed0ab40f6c3d7bda44a05dcf1437c44372",
        symbol: "USDC",
        name: "USD Coin",
        decimals: BigInt(18),
      },
      {
        address: "0xfe97e85d13abd9c1c33384e796f10b73905637ce",
        symbol: "USDT",
        name: "Tether USD",
        decimals: BigInt(18),
      },
      {
        address: "0xa47f43de2f9623acb395ca4905746496d2014d57",
        symbol: "ETH",
        name: "Ethereum",
        decimals: BigInt(18),
      },
      {
        address: "0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff",
        symbol: "USDT0",
        name: "Tether USD",
        decimals: BigInt(6),
      },
      {
        address: "0x70bfd7f7eadf9b9827541272589a6b2bb760ae2e",
        symbol: "AxCNH",
        name: "AxCNH",
        decimals: BigInt(6),
      },
      {
        address: "0x1f545487c62e5acfea45dcadd9c627361d1616d8",
        symbol: "WBTC",
        name: "Wrapped Bitcoin",
        decimals: BigInt(18),
      },
      {
        address: "0x94bd7a37d2ce24cc597e158facaa8d601083ffec",
        symbol: "BNB",
        name: "BNB",
        decimals: BigInt(18),
      },
      {
        address: "0x889138644274a7dc602f25a7e7d53ff40e6d0091",
        symbol: "xCFX",
        name: "Staked CFX",
        decimals: BigInt(18),
      },
    ],
    poolsToSkip: [],
    poolMappings: [],
    nativeTokenDetails: {
      symbol: "CFX",
      name: "Conflux",
      decimals: BigInt(18),
    },
  },
};

export function getChainConfig(chainId: number): ChainConfig {
  const config = CHAIN_CONFIGS[chainId];
  if (!config) {
    throw new Error(`No configuration found for chain ID ${chainId}`);
  }
  return config;
}
