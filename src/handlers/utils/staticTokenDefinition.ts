export interface StaticTokenDefinition {
  address: string
  symbol: string
  name: string
  decimals: BigInt
}

export const getStaticDefinition = (
  tokenAddress: string,
  staticDefinitions: Array<StaticTokenDefinition>,
): StaticTokenDefinition | null => {
  for (let i = 0; i < staticDefinitions.length; i++) {
    const staticDefinition = staticDefinitions[i]
    if (staticDefinition.address == tokenAddress) {
      return staticDefinition
    }
  }
  return null
}

export const STATIC_TOKEN_DEFINITIONS: Array<StaticTokenDefinition> = [
  {
    address: '0x14b2d3bc65e74dae1030eafd8ac30c533c976a9b',
    symbol: 'WCFX',
    name: 'Wrapped Conflux',
    decimals: BigInt(18),
  },
  {
    address: '0x6963efed0ab40f6c3d7bda44a05dcf1437c44372',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: BigInt(18),
  },
  {
    address: '0xfe97e85d13abd9c1c33384e796f10b73905637ce',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: BigInt(18),
  },
  {
    address: '0xa47f43de2f9623acb395ca4905746496d2014d57',
    symbol: 'ETH',
    name: 'Ethereum',
    decimals: BigInt(18),
  },
  {
    address: '0xaf37e8b6c9ed7f6318979f56fc287d76c30847ff',
    symbol: 'USDT0',
    name: 'Tether USD',
    decimals: BigInt(6),
  },
  {
    address: '0x70bfd7f7eadf9b9827541272589a6b2bb760ae2e',
    symbol: 'AxCNH',
    name: 'AxCNH',
    decimals: BigInt(6),
  },
  {
    address: '0x1f545487c62e5acfea45dcadd9c627361d1616d8',
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    decimals: BigInt(18),
  },
  {
    address: '0x94bd7a37d2ce24cc597e158facaa8d601083ffec',
    symbol: 'BNB',
    name: 'BNB',
    decimals: BigInt(18),
  },
  {
    address: '0x889138644274a7dc602f25a7e7d53ff40e6d0091',
    symbol: 'xCFX',
    name: 'Staked CFX',
    decimals: BigInt(18),
  },
]
