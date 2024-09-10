const { deployContract, sendTxn, sleep, writeTmpAddresses, contractAt } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const { toUsd } = require("../../test/shared/units")

const { getTokens, toChainlinkPrice } = require('./tokens');

const newToken = {
    name: "Ethereum",
    symbol: "ETH",
    assetSymbol: "1ETH",
    decimals: 18,
    address: "0x4cC435d7b9557d54d6EF02d69Bbf72634905Bf11",
    isStable: false,
    isV1Available: true,
    defaultPrice: toChainlinkPrice(3405),
    fastPricePrecision: 1000,
    maxCumulativeDeltaDiff: 100000,
    // UniswapV3MedianOracleAddress
    // chainlinkPriceFeed: "0x86d4f0c0613ae231131106acb4ee9bbcf90f247f",
    chainlinkPriceFeed: false
};

async function main() {
    const [deployer] = await ethers.getSigners()

    // tokens
    const currentTokens = getTokens();

    // add new token to current array
    const tokens = [...currentTokens, newToken];
    
    if (tokens.find(t => !t.fastPricePrecision)) {
        throw new Error("Invalid price precision")
    }

    if (tokens.find(t => !t.maxCumulativeDeltaDiff)) {
        throw new Error("Invalid price maxCumulativeDeltaDiff")
    }

    const vaultPriceFeed = await contractAt("VaultPriceFeed", "0x447BD0BB67F40a4ceeF14BC0945e440d5858F443");
    const vault = await contractAt("Vault", "0x78cD8463Ff91e3E7f2AC6fdd0d0d0e3124B50bCa");
    const secondaryPriceFeed = await contractAt("FastPriceFeed", "0xC5A123C9F98cb21859F49Df6AD3f57E428607C8E");

    for (const [i, tokenItem] of tokens.entries()) {
        if (tokenItem.spreadBasisPoints === undefined) { continue }
        await sendTxn(vaultPriceFeed.setSpreadBasisPoints(
            tokenItem.address, // _token
            tokenItem.spreadBasisPoints // _spreadBasisPoints
        ), `vaultPriceFeed.setSpreadBasisPoints(${tokenItem.name}) ${tokenItem.spreadBasisPoints}`)
    }

    for (const token of tokens) {
        let tokenPriceFeed;

        if (token.chainlinkPriceFeed) {
            tokenPriceFeed = { address: token.chainlinkPriceFeed }
        } else {
            tokenPriceFeed = await deployContract("PriceFeed", []);
            await sendTxn(tokenPriceFeed.setLatestAnswer(token.defaultPrice), 'tokenPriceFeed.setLatestAnswer');
        }

        await sendTxn(vaultPriceFeed.setTokenConfig(
            token.address, // _token
            tokenPriceFeed.address, // _priceFeed
            8, // _priceDecimals
            !!token.isStable, // _table
        ), `vaultPriceFeed.setTokenConfig(${token.name}) ${token.address} ${tokenPriceFeed.address}`)

        await sendTxn(vault.setTokenConfig(
            token.address, // _token
            token.decimals, // _tokenDecimals
            10000, // _tokenWeight
            75, // _minProfitBps
            expandDecimals(120 * 1000 * 1000, 18),
            !!token.isStable, // _table
            true, // _isShortable
        ), `vault.setTokenConfig(${token.name}) ${token.address}`)
    }

    await sendTxn(secondaryPriceFeed.setTokens(tokens.map(t => t.address), tokens.map(t => t.fastPricePrecision)), "secondaryPriceFeed.setTokens")
    await sendTxn(secondaryPriceFeed.setMaxCumulativeDeltaDiffs(tokens.map(t => t.address), tokens.map(t => t.maxCumulativeDeltaDiff)), "secondaryPriceFeed.setMaxCumulativeDeltaDiffs")
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })