import type { Address } from "viem";

export type TokenCategory =
  | "wrapped"
  | "stablecoin"
  | "liquid-staking"
  | "blue-chip-defi"
  | "defi-infrastructure"
  | "l2-infrastructure"
  | "oracle-data"
  | "ai-data"
  | "gaming-metaverse"
  | "meme"
  | "rwa"
  | "other";

export interface TokenMeta {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  category: TokenCategory;
  isDefault: boolean;
}

export const TOKEN_REGISTRY: TokenMeta[] = [
  // ── Wrapped (2) ────────────────────────────────────────────
  {
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    category: "wrapped",
    isDefault: true,
  },
  {
    address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    decimals: 8,
    category: "wrapped",
    isDefault: true,
  },

  // ── Stablecoins (9) ────────────────────────────────────────
  {
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    category: "stablecoin",
    isDefault: true,
  },
  {
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    category: "stablecoin",
    isDefault: true,
  },
  {
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    category: "stablecoin",
    isDefault: true,
  },
  {
    address: "0x853d955aCEf822Db058eb8505911ED77F175b99e",
    symbol: "FRAX",
    name: "Frax",
    decimals: 18,
    category: "stablecoin",
    isDefault: false,
  },
  {
    address: "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0",
    symbol: "LUSD",
    name: "Liquity USD",
    decimals: 18,
    category: "stablecoin",
    isDefault: false,
  },
  {
    address: "0x57Ab1ec28D129707052df4dF418D58a2D46d5f51",
    symbol: "sUSD",
    name: "Synth sUSD",
    decimals: 18,
    category: "stablecoin",
    isDefault: false,
  },
  {
    address: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8",
    symbol: "PYUSD",
    name: "PayPal USD",
    decimals: 6,
    category: "stablecoin",
    isDefault: false,
  },
  {
    address: "0x056Fd409E1d7A124BD7017459dFEa2F387b6d5Cd",
    symbol: "GUSD",
    name: "Gemini Dollar",
    decimals: 2,
    category: "stablecoin",
    isDefault: false,
  },
  {
    address: "0xdC035D45d973E3EC169d2276DDab16f1e407384F",
    symbol: "USDS",
    name: "USDS",
    decimals: 18,
    category: "stablecoin",
    isDefault: false,
  },

  // ── Liquid Staking (6) ─────────────────────────────────────
  {
    address: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    symbol: "stETH",
    name: "Lido Staked Ether",
    decimals: 18,
    category: "liquid-staking",
    isDefault: true,
  },
  {
    address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    symbol: "wstETH",
    name: "Wrapped stETH",
    decimals: 18,
    category: "liquid-staking",
    isDefault: true,
  },
  {
    address: "0xBe9895146f7AF43049ca1c1AE358B0541Ea49704",
    symbol: "cbETH",
    name: "Coinbase Wrapped Staked ETH",
    decimals: 18,
    category: "liquid-staking",
    isDefault: false,
  },
  {
    address: "0xae78736Cd615f374D3085123A210448E74Fc6393",
    symbol: "rETH",
    name: "Rocket Pool ETH",
    decimals: 18,
    category: "liquid-staking",
    isDefault: false,
  },
  {
    address: "0xFe0c30065B384F05761f15d0CC899D4F9F9Cc0eB",
    symbol: "ETHFI",
    name: "ether.fi",
    decimals: 18,
    category: "liquid-staking",
    isDefault: false,
  },
  {
    address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
    symbol: "cbBTC",
    name: "Coinbase Wrapped BTC",
    decimals: 8,
    category: "liquid-staking",
    isDefault: false,
  },

  // ── Blue-Chip DeFi (10) ────────────────────────────────────
  {
    address: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
    symbol: "UNI",
    name: "Uniswap",
    decimals: 18,
    category: "blue-chip-defi",
    isDefault: true,
  },
  {
    address: "0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9",
    symbol: "AAVE",
    name: "Aave",
    decimals: 18,
    category: "blue-chip-defi",
    isDefault: true,
  },
  {
    address: "0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2",
    symbol: "MKR",
    name: "Maker",
    decimals: 18,
    category: "blue-chip-defi",
    isDefault: true,
  },
  {
    address: "0xC011a73ee8576Fb46F5E1c5751cA3B9Fe0af2a6F",
    symbol: "SNX",
    name: "Synthetix",
    decimals: 18,
    category: "blue-chip-defi",
    isDefault: true,
  },
  {
    address: "0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32",
    symbol: "LDO",
    name: "Lido DAO",
    decimals: 18,
    category: "blue-chip-defi",
    isDefault: true,
  },
  {
    address: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    symbol: "LINK",
    name: "Chainlink",
    decimals: 18,
    category: "blue-chip-defi",
    isDefault: true,
  },
  {
    address: "0xc944E90C64B2c07662A292be6244BDf05Cda44a7",
    symbol: "GRT",
    name: "The Graph",
    decimals: 18,
    category: "blue-chip-defi",
    isDefault: true,
  },
  {
    address: "0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72",
    symbol: "ENS",
    name: "Ethereum Name Service",
    decimals: 18,
    category: "blue-chip-defi",
    isDefault: true,
  },
  {
    address: "0x808507121B80c02388fAd14726482e061B8da827",
    symbol: "PENDLE",
    name: "Pendle",
    decimals: 18,
    category: "blue-chip-defi",
    isDefault: true,
  },
  {
    address: "0x57e114B691Db790C35207b2e685D4A43181e6061",
    symbol: "ENA",
    name: "Ethena",
    decimals: 18,
    category: "blue-chip-defi",
    isDefault: true,
  },

  // ── DeFi Infrastructure (20) ───────────────────────────────
  {
    address: "0xD533a949740bb3306d119CC777fa900bA034cd52",
    symbol: "CRV",
    name: "Curve DAO",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B",
    symbol: "CVX",
    name: "Convex Finance",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0xc00e94Cb662C3520282E6f5717214004A7f26888",
    symbol: "COMP",
    name: "Compound",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0xba100000625a3754423978a60c9317c58a424e3D",
    symbol: "BAL",
    name: "Balancer",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0x6B3595068778DD592e39A122f4f5a5cF09C90fE2",
    symbol: "SUSHI",
    name: "SushiSwap",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0x111111111117dC0aa78b770fA6A738034120C302",
    symbol: "1INCH",
    name: "1inch",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0x92D6C1e31e14520e676a687F0a93788B716BEff5",
    symbol: "DYDX",
    name: "dYdX",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0",
    symbol: "FXS",
    name: "Frax Share",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0x6DEA81C8171D0bA574754EF6F8b412F2Ed88c54D",
    symbol: "LQTY",
    name: "Liquity",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e",
    symbol: "YFI",
    name: "yearn.finance",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0x090185f2135308BaD17527004364eBcC2D37e5F6",
    symbol: "SPELL",
    name: "Spell Token",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0xdBdb4d16EdA451D0503b854CF79D55697F90c8DF",
    symbol: "ALCX",
    name: "Alchemix",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0x3472A5A71965499acd81997a54BBA8D852C6E53d",
    symbol: "BADGER",
    name: "Badger DAO",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0xbC396689893D065F41bc2C6EcbeE5e0085233447",
    symbol: "PERP",
    name: "Perpetual Protocol",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0xAf5191B0De278C7286d6C7CC6ab6BB8A73bA2Cd6",
    symbol: "STG",
    name: "Stargate Finance",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0xDEf1CA1fb7FBcDC777520aa7f396b4E015F497aB",
    symbol: "COW",
    name: "CoW Protocol",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0x9994E35Db50125E0DF82e4c2dde62496CE330999",
    symbol: "MORPHO",
    name: "Morpho",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0xfAbA6f8e4a5E8Ab82F62fe7C39859FA577269BE3",
    symbol: "ONDO",
    name: "Ondo Finance",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0x56072C95FAA7f9E7775E16db4f88fC96C79b77De",
    symbol: "SKY",
    name: "Sky",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },
  {
    address: "0xec53bF9167f50cDEB3Ae105f56099aaaB9061F83",
    symbol: "EIGEN",
    name: "EigenLayer",
    decimals: 18,
    category: "defi-infrastructure",
    isDefault: false,
  },

  // ── L2/Infrastructure (10) ─────────────────────────────────
  {
    address: "0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1",
    symbol: "ARB",
    name: "Arbitrum",
    decimals: 18,
    category: "l2-infrastructure",
    isDefault: false,
  },
  {
    address: "0x4200000000000000000000000000000000000042",
    symbol: "OP",
    name: "Optimism",
    decimals: 18,
    category: "l2-infrastructure",
    isDefault: false,
  },
  {
    address: "0x455e53CBB86018Ac2B8092FdCd39d8444aFFC3F6",
    symbol: "POL",
    name: "Polygon",
    decimals: 18,
    category: "l2-infrastructure",
    isDefault: false,
  },
  {
    address: "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0",
    symbol: "MATIC",
    name: "Polygon (Legacy)",
    decimals: 18,
    category: "l2-infrastructure",
    isDefault: false,
  },
  {
    address: "0x3c3a81e81dc49A522A592e7622A7E711c06bf354",
    symbol: "MNT",
    name: "Mantle",
    decimals: 18,
    category: "l2-infrastructure",
    isDefault: false,
  },
  {
    address: "0xF57e7e7C23978C3cAEC3C3548E3D615c346e79fF",
    symbol: "IMX",
    name: "Immutable X",
    decimals: 18,
    category: "l2-infrastructure",
    isDefault: false,
  },
  {
    address: "0x4E15361FD6b4BB609Fa63C81A2be19d873717870",
    symbol: "FTM",
    name: "Fantom",
    decimals: 18,
    category: "l2-infrastructure",
    isDefault: false,
  },
  {
    address: "0x9E32b13ce7f2E80A01932B42553652E053D6ed8e",
    symbol: "METIS",
    name: "Metis",
    decimals: 18,
    category: "l2-infrastructure",
    isDefault: false,
  },
  {
    address: "0x00c83aeCC790e8a4453e5dD3B0B4b3680501a7A7",
    symbol: "SKL",
    name: "SKALE",
    decimals: 18,
    category: "l2-infrastructure",
    isDefault: false,
  },
  {
    address: "0x4F9254C83EB525f9FCf346490bbb3ed28a81C667",
    symbol: "CELR",
    name: "Celer Network",
    decimals: 18,
    category: "l2-infrastructure",
    isDefault: false,
  },

  // ── Oracle/Data (3) ────────────────────────────────────────
  {
    address: "0xBA11D00c5f74255f56a5E366F4F77f5A186d7f55",
    symbol: "BAND",
    name: "Band Protocol",
    decimals: 18,
    category: "oracle-data",
    isDefault: false,
  },
  {
    address: "0x0b38210ea11411557c13457D4dA7dC6ea731B88a",
    symbol: "API3",
    name: "API3",
    decimals: 18,
    category: "oracle-data",
    isDefault: false,
  },
  {
    address: "0x88dF592F8eb5D7Bd38bFeF7dEb0fBc02cf3778a0",
    symbol: "TRB",
    name: "Tellor",
    decimals: 18,
    category: "oracle-data",
    isDefault: false,
  },

  // ── AI/Data (6) ────────────────────────────────────────────
  {
    address: "0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85",
    symbol: "FET",
    name: "Fetch.ai",
    decimals: 18,
    category: "ai-data",
    isDefault: false,
  },
  {
    address: "0x6De037ef9aD2725EB40118Bb1702EBb27e4Aeb24",
    symbol: "RNDR",
    name: "Render",
    decimals: 18,
    category: "ai-data",
    isDefault: false,
  },
  {
    address: "0x967da4048cD07aB37855c090aAF366e4ce1b9F48",
    symbol: "OCEAN",
    name: "Ocean Protocol",
    decimals: 18,
    category: "ai-data",
    isDefault: false,
  },
  {
    address: "0x6E2a43be0B1d33b726f0CA3b8de60b3482b8b050",
    symbol: "ARKM",
    name: "Arkham",
    decimals: 18,
    category: "ai-data",
    isDefault: false,
  },
  {
    address: "0x6B0b3a982b4634aC68dD83a4DBF02311cE324181",
    symbol: "ALI",
    name: "Artificial Liquid Intelligence",
    decimals: 18,
    category: "ai-data",
    isDefault: false,
  },
  {
    address: "0xbe0Ed4138121EcFC5c0E56B40517da27E6c5226B",
    symbol: "ATH",
    name: "Aethir",
    decimals: 18,
    category: "ai-data",
    isDefault: false,
  },

  // ── Gaming/Metaverse (10) ──────────────────────────────────
  {
    address: "0xBB0E17EF65F82Ab018d8EDd776e8DD940327B28b",
    symbol: "AXS",
    name: "Axie Infinity",
    decimals: 18,
    category: "gaming-metaverse",
    isDefault: false,
  },
  {
    address: "0x3845badAde8e6dFF049820680d1F14bD3903a5d0",
    symbol: "SAND",
    name: "The Sandbox",
    decimals: 18,
    category: "gaming-metaverse",
    isDefault: false,
  },
  {
    address: "0x0F5D2fB29fb7d3CFeE444a200298f468908cC942",
    symbol: "MANA",
    name: "Decentraland",
    decimals: 18,
    category: "gaming-metaverse",
    isDefault: false,
  },
  {
    address: "0xd1d2Eb1B1e90B638588728b4130137D262C87cae",
    symbol: "GALA",
    name: "Gala",
    decimals: 8,
    category: "gaming-metaverse",
    isDefault: false,
  },
  {
    address: "0xF629cBd94d3791C9250152BD8dfBDF380E2a3B9c",
    symbol: "ENJ",
    name: "Enjin",
    decimals: 18,
    category: "gaming-metaverse",
    isDefault: false,
  },
  {
    address: "0x767FE9EDC9E0dF98E07454847909b5E959D7ca0E",
    symbol: "ILV",
    name: "Illuvium",
    decimals: 18,
    category: "gaming-metaverse",
    isDefault: false,
  },
  {
    address: "0xb23d80f5FefcDDaa212212F028021B41DEd428CF",
    symbol: "PRIME",
    name: "Echelon Prime",
    decimals: 18,
    category: "gaming-metaverse",
    isDefault: false,
  },
  {
    address: "0x4d224452801ACEd8B2F0aebE155379bb5D594381",
    symbol: "APE",
    name: "ApeCoin",
    decimals: 18,
    category: "gaming-metaverse",
    isDefault: false,
  },
  {
    address: "0xccC8cb5229B0ac8069C51fd58367Fd1e622aFD97",
    symbol: "GODS",
    name: "Gods Unchained",
    decimals: 18,
    category: "gaming-metaverse",
    isDefault: false,
  },
  {
    address: "0xAC51066d7bEC65Dc4589368da368b212745d63E8",
    symbol: "ALICE",
    name: "My Neighbor Alice",
    decimals: 6,
    category: "gaming-metaverse",
    isDefault: false,
  },

  // ── Meme (8) ───────────────────────────────────────────────
  {
    address: "0x6982508145454Ce325dDbE47a25d4ec3d2311933",
    symbol: "PEPE",
    name: "Pepe",
    decimals: 18,
    category: "meme",
    isDefault: false,
  },
  {
    address: "0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE",
    symbol: "SHIB",
    name: "Shiba Inu",
    decimals: 18,
    category: "meme",
    isDefault: false,
  },
  {
    address: "0xcf0C122c6b73ff809C693DB761e7BaeBe62b6a2E",
    symbol: "FLOKI",
    name: "Floki",
    decimals: 9,
    category: "meme",
    isDefault: false,
  },
  {
    address: "0xA35923162C49cF95e6BF26623385eb431ad920D3",
    symbol: "TURBO",
    name: "Turbo",
    decimals: 18,
    category: "meme",
    isDefault: false,
  },
  {
    address: "0xaaeE1A9723aaDB7afA2810263653A34bA2C21C7a",
    symbol: "MOG",
    name: "Mog Coin",
    decimals: 18,
    category: "meme",
    isDefault: false,
  },
  {
    address: "0x761D38e5ddf6ccf6Cf7c55759d5210750B5D60F3",
    symbol: "ELON",
    name: "Dogelon Mars",
    decimals: 18,
    category: "meme",
    isDefault: false,
  },
  {
    address: "0xb131f4A55907B10d1F0A50d8ab8FA09EC342cd74",
    symbol: "MEME",
    name: "Memecoin",
    decimals: 18,
    category: "meme",
    isDefault: false,
  },
  {
    address: "0xE0f63A424a4439cBE457D80E4f4b51aD25b2c56C",
    symbol: "SPX",
    name: "SPX6900",
    decimals: 8,
    category: "meme",
    isDefault: false,
  },

  // ── RWA (3) ────────────────────────────────────────────────
  {
    address: "0x45804880De22913dAFE09f4980848ECE6EcbAf78",
    symbol: "PAXG",
    name: "Pax Gold",
    decimals: 18,
    category: "rwa",
    isDefault: false,
  },
  {
    address: "0xdab396cCF3d84Cf2D07C4Ccc0027ECdd34D7eF1F",
    symbol: "GFI",
    name: "Goldfinch",
    decimals: 18,
    category: "rwa",
    isDefault: false,
  },
  {
    address: "0x33349B282065b0284d756F0577FB39c158F935e6",
    symbol: "MPL",
    name: "Maple",
    decimals: 18,
    category: "rwa",
    isDefault: false,
  },

  // ── Other (16) ─────────────────────────────────────────────
  {
    address: "0xBBbbCA6A901c926F240b89EacB641d8Aec7AEafD",
    symbol: "LRC",
    name: "Loopring",
    decimals: 18,
    category: "other",
    isDefault: false,
  },
  {
    address: "0x58b6A8A3302369DAEc383334672404Ee733aB239",
    symbol: "LPT",
    name: "Livepeer",
    decimals: 18,
    category: "other",
    isDefault: false,
  },
  {
    address: "0x6810e776880C02933D47DB1b9fc05908e5386b96",
    symbol: "GNO",
    name: "Gnosis",
    decimals: 18,
    category: "other",
    isDefault: false,
  },
  {
    address: "0x4a220E6096B25EADb88358cb44068A3248254675",
    symbol: "QNT",
    name: "Quant",
    decimals: 18,
    category: "other",
    isDefault: false,
  },
  {
    address: "0x5283D291DBCF85356A21bA090E6db59121208b44",
    symbol: "BLUR",
    name: "Blur",
    decimals: 18,
    category: "other",
    isDefault: false,
  },
  {
    address: "0xe28b3B32B6c345A34Ff64674606124Dd5Aceca30",
    symbol: "INJ",
    name: "Injective",
    decimals: 18,
    category: "other",
    isDefault: false,
  },
  {
    address: "0x8290333ceF9e6D528dD5618Fb97a76f268f3EDD4",
    symbol: "ANKR",
    name: "Ankr",
    decimals: 18,
    category: "other",
    isDefault: false,
  },
  {
    address: "0x69af81e73A73B40adF4f3d4223Cd9b1ECE623074",
    symbol: "MASK",
    name: "Mask Network",
    decimals: 18,
    category: "other",
    isDefault: false,
  },
  {
    address: "0x3506424F91fD33084466F402d5D97f05F8e3b4AF",
    symbol: "CHZ",
    name: "Chiliz",
    decimals: 18,
    category: "other",
    isDefault: false,
  },
  {
    address: "0x5aFE3855358E112B5647B952709E6165e1c1eEEe",
    symbol: "SAFE",
    name: "Safe",
    decimals: 18,
    category: "other",
    isDefault: false,
  },
  {
    address: "0xd26114cd6EE289AccF82350c8d8487fedB8A0C07",
    symbol: "OMG",
    name: "OMG Network",
    decimals: 18,
    category: "other",
    isDefault: false,
  },
  {
    address: "0x0D8775F648430679A709E98d2b0Cb6250d2887EF",
    symbol: "BAT",
    name: "Basic Attention Token",
    decimals: 18,
    category: "other",
    isDefault: false,
  },
  {
    address: "0xB64ef51C888972c908CFacf59B47C1AfBC0Ab8aC",
    symbol: "STORJ",
    name: "Storj",
    decimals: 8,
    category: "other",
    isDefault: false,
  },
  {
    address: "0x7DD9c5Cba05E151C895FDe1CF355C9A1D5DA6429",
    symbol: "GLM",
    name: "Golem",
    decimals: 18,
    category: "other",
    isDefault: false,
  },
  {
    address: "0x320623b8E4fF03373931769A31Fc52A4E78B5d70",
    symbol: "RSR",
    name: "Reserve Rights",
    decimals: 18,
    category: "other",
    isDefault: false,
  },
  {
    address: "0x7420B4b9a0110cdC71fB720908340C03F9Bc03EC",
    symbol: "JASMY",
    name: "JasmyCoin",
    decimals: 18,
    category: "other",
    isDefault: false,
  },
];

// ── Backward-compatible exports ──────────────────────────────

/** Backward-compatible TOKENS record (symbol -> address) */
export const TOKENS: Record<string, Address> = Object.fromEntries(
  TOKEN_REGISTRY.map((t) => [t.symbol, t.address]),
) as Record<string, Address>;

export const WETH_ADDRESS: Address =
  "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

export const USDT_ADDRESS: Address =
  "0xdAC17F958D2ee523a2206206994597C13D831ec7";

export const USDT_DECIMALS = 6;

export function getTokensByCategory(category: TokenCategory): TokenMeta[] {
  return TOKEN_REGISTRY.filter((t) => t.category === category);
}

export function getDefaultTokens(): TokenMeta[] {
  return TOKEN_REGISTRY.filter((t) => t.isDefault);
}

export function getTokenMeta(address: Address): TokenMeta | undefined {
  return TOKEN_REGISTRY.find(
    (t) => t.address.toLowerCase() === address.toLowerCase(),
  );
}

export function getTokenBySymbol(symbol: string): TokenMeta | undefined {
  return TOKEN_REGISTRY.find(
    (t) => t.symbol.toLowerCase() === symbol.toLowerCase(),
  );
}
