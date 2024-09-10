const { deployContract, sendTxn, sleep, writeTmpAddresses, contractAt } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const { toUsd } = require("../../test/shared/units")
const { errors } = require("../../test/core/Vault/helpers");
const { ADDRESS_ZERO } = require('@uniswap/v3-sdk');

const { getTokens } = require('./tokens');
const { getConfig } = require("./config");
const { getPricesBits } = require("./utils");

const deployFastPriceFeed = async ({ vaultPriceFeedAddress }) => {
    const [deployer] = await ethers.getSigners()

    const fastPriceEvents = await deployContract("FastPriceEvents", [])

    const secondaryPriceFeed = await deployContract("FastPriceFeed", [
        5 * 60, // _priceDuration
        60 * 60, // _maxPriceUpdateDelay
        1, // _minBlockInterval
        expandDecimals(10, 32), // _maxDeviationBasisPoints
        fastPriceEvents.address, // _fastPriceEvents
        deployer.address, // _tokenManager
    ])

    const fastPriceTokens = getTokens().filter(t => t.symbol === 'ETH');

    await sendTxn(secondaryPriceFeed.initialize(1, [deployer.address], [deployer.address]), "secondaryPriceFeed.initialize")
    await sendTxn(secondaryPriceFeed.setTokens(fastPriceTokens.map(t => t.address), fastPriceTokens.map(t => t.fastPricePrecision)), "secondaryPriceFeed.setTokens")
    await sendTxn(secondaryPriceFeed.setVaultPriceFeed(vaultPriceFeedAddress), "secondaryPriceFeed.setVaultPriceFeed")
    await sendTxn(secondaryPriceFeed.setMaxTimeDeviation(60 * 60), "secondaryPriceFeed.setMaxTimeDeviation")
    await sendTxn(secondaryPriceFeed.setSpreadBasisPointsIfInactive(50), "secondaryPriceFeed.setSpreadBasisPointsIfInactive")
    await sendTxn(secondaryPriceFeed.setSpreadBasisPointsIfChainError(500), "secondaryPriceFeed.setSpreadBasisPointsIfChainError")
    await sendTxn(secondaryPriceFeed.setMaxCumulativeDeltaDiffs(fastPriceTokens.map(t => t.address), fastPriceTokens.map(t => t.maxCumulativeDeltaDiff)), "secondaryPriceFeed.setMaxCumulativeDeltaDiffs")
    await sendTxn(secondaryPriceFeed.setPriceDataInterval(1 * 60), "secondaryPriceFeed.setPriceDataInterval")

    await sendTxn(fastPriceEvents.setIsPriceFeed(secondaryPriceFeed.address, true), "fastPriceEvents.setIsPriceFeed")

    return secondaryPriceFeed;
}

const gasLimit = 30000000

async function main() {
    const [deployer] = await ethers.getSigners()

    // accessConfig
    const config = await getConfig();

    // tokens
    const tokens = getTokens();

    const tokenAddress = tokens.find(t => t.symbol === 'ETH').address;

    const vaultAddress = "0x7e70D900174eFb234CC133aD05194b277884190e"; //vault - call method getMinPrice and getMaxPrice
    const vaultPriceFeedAddress = "0x3F6E2f859639af5253c3bA027Be3716099fF1490"; // wrapper for first and second price feeds

    const BandOracleReaderAddress = "0xeb0c1fd8973e5a612def46f7a2a3b1e8047a7c20"; // BandOracleReader ETH
    const UniswapV3MedianOracleAddress = "0x5ef3c032b4d97b8fb3955a86abfa4de1bf29783f"; // UniswapV3MedianOracle for 1ETH/ONE
    const UniswapV3SpotOracleAddress = "0xA9e789DD2fa287Cd8341eBd5247eD14f42f8DDff"; // UniswapV3MedianOracle for 1ETH/ONE

    const UniswapV3MedianOracle = await contractAt("PriceFeed", UniswapV3MedianOracleAddress);
    const BandOracleReader = await contractAt("PriceFeed", BandOracleReaderAddress);

    const firstPriceFeedAddress = BandOracleReaderAddress;

    const vault = await contractAt("Vault", vaultAddress);
    const vaultPriceFeed = await contractAt("VaultPriceFeed", vaultPriceFeedAddress);

    const displayPrices = async () => {
        console.log('BandOracleReader: ', Number(await BandOracleReader.latestAnswer()) / 1e18);
        console.log('UniswapV3MedianOracle: ', Number(await UniswapV3MedianOracle.latestAnswer()) / 1e18);
        console.log('Vault getMaxPrice: ', Number(await vault.getMaxPrice(tokenAddress)) / 1e18);
        console.log('Vault getMinPrice: ', Number(await vault.getMinPrice(tokenAddress)) / 1e18);
    }

    const setPrice = async (price) => {
        // set prices to secondaryPriceFeed
        const priceBits = getPricesBits({
            ETH: price
        });
        const timestamp = Math.floor(Date.now() / 1000);

        await sendTxn(secondaryPriceFeed.setPricesWithBits(priceBits, timestamp, { gasLimit }), 'secondaryPriceFeed.setPricesWithBits');
    }

    const secondaryPriceFeed = await deployFastPriceFeed({ vaultPriceFeedAddress }); // deploy new fastPriceFeed
    await sendTxn(vaultPriceFeed.setSecondaryPriceFeed(secondaryPriceFeed.address), "vaultPriceFeed.setSecondaryPriceFeed")

    // await sendTxn(vaultPriceFeed.setSecondaryPriceFeed(ADDRESS_ZERO), "vaultPriceFeed.setSecondaryPriceFeed")

    await sendTxn(vaultPriceFeed.setTokenConfig(
        tokenAddress,
        firstPriceFeedAddress,
        18,
        true
    ), 'vaultPriceFeed.setTokenConfig');

    await sendTxn(vault.setPriceFeed(vaultPriceFeed.address), "vault.setPriceFeed");

    await sendTxn(vault.setTokenConfig(
        tokenAddress, // _token
        18, // _tokenDecimals
        10000, // _tokenWeight
        75, // _minProfitBps
        0, // _maxUsdgAmount
        true, // _isStable
        false // _isShortable
    ), 'vaultContract.setTokenConfig');

    await sendTxn(vault.setTokenConfig(
        tokenAddress, // _token
        18, // _tokenDecimals
        10000, // _tokenWeight
        75, // _minProfitBps
        0, // _maxUsdgAmount
        true, // _isStable
        false // _isShortable
    ), 'vaultContract.setTokenConfig');

    console.log('--------- 1 ---------');
    await displayPrices();

    console.log('--------- Set correct price to secondPriceFeed ---------')
    await setPrice(2300.6254205);    

    console.log('--------- 2 ---------');
    await displayPrices();

    console.log('--------- Set incorrect price to secondPriceFeed ---------')
    await setPrice(44);    

    console.log('--------- 3 ---------');
    await displayPrices();
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })
