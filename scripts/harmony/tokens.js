function toChainlinkPrice(value) {
    return parseInt(value * Math.pow(10, 8))
}

const commonParams = {
    // maxCumulativeDeltaDiff: 0.10 * 10 * 1000 * 1000, // 10%
    maxCumulativeDeltaDiff: 100000,
}

const tokens = [
    {
        name: "Wrapped ONE",
        symbol: "WONE",
        decimals: 18,
        address: "0xcF664087a5bB0237a0BAd6742852ec6c8d69A27a",
        isWrapped: true,
        baseSymbol: "ONE",
        isV1Available: true,
        defaultPrice: toChainlinkPrice(0.0145),
        fastPricePrecision: 10000000,
        ...commonParams,
        // TODO
        chainlinkPriceFeed: false,
    },
    {
        name: "Tether",
        symbol: "USDT",
        decimals: 6,
        address: "0xF2732e8048f1a411C63e2df51d08f4f52E598005",
        isStable: true,
        isV1Available: true,
        defaultPrice: toChainlinkPrice(1),
        fastPricePrecision: 1000,
        ...commonParams,
        // TODO
        chainlinkPriceFeed: false,
    },
    {
        name: "USD Coin",
        symbol: "USDC",
        decimals: 6,
        address: "0xBC594CABd205bD993e7FfA6F3e9ceA75c1110da5",
        isStable: true,
        isV1Available: true,
        defaultPrice: toChainlinkPrice(1),
        fastPricePrecision: 1000,
        ...commonParams,
        // TODO
        chainlinkPriceFeed: false,
    },
    {
        name: "Wrapped BTC",
        symbol: "WBTC",
        assetSymbol: "WBTC",
        decimals: 8,
        address: "0x118f50d23810c5E09Ebffb42d7D3328dbF75C2c2",
        isStable: false,
        isV1Available: true,
        defaultPrice: toChainlinkPrice(63599),
        fastPricePrecision: 1000,
        ...commonParams,
        // TODO
        chainlinkPriceFeed: false,
    },
    {
        name: "Ethereum",
        symbol: "ETH",
        assetSymbol: "1ETH",
        decimals: 18,
        address: "0x4cC435d7b9557d54d6EF02d69Bbf72634905Bf11",
        isStable: false,
        isV1Available: true,
        defaultPrice: toChainlinkPrice(3405),
        fastPricePrecision: 1000,
        ...commonParams,
        // TODO
        chainlinkPriceFeed: false,
    },
]

const getTokens = () => tokens;

module.exports = { getTokens }