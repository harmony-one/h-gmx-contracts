const { deployContract, sendTxn, sleep, writeTmpAddresses } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")
const network = (process.env.HARDHAT_NETWORK || 'mainnet');
const { toUsd } = require("../../test/shared/units")
const { errors } = require("../../test/core/Vault/helpers");
const { ADDRESS_ZERO } = require('@uniswap/v3-sdk');

const { getTokens } = require('./tokens');
const { getConfig } = require("./config");

async function main() {
    const [deployer] = await ethers.getSigners()

    // accessConfig
    const config = await getConfig();

    // tokens
    const tokens = getTokens();

    // const weth = await deployContract('WETH', ["Wrapped Ether", "WETH", 18]);
    let weth = { address: "0xcF664087a5bB0237a0BAd6742852ec6c8d69A27a" }

    // 1 - Reader ------------------------------------------------------------------
    const reader = await deployContract("Reader", [], "Reader")
    if (network === "mainnet") {
        await sendTxn(reader.setConfig(true), "Reader.setConfig")
    }
    await sleep(1)

    // 2 - RewardReader ------------------------------------------------------------
    const rewardReader = await deployContract("RewardReader", [], "RewardReader")
    await sleep(1)

    // 3 - VaultReader -------------------------------------------------------------
    const vaultReader = await deployContract("VaultReader", [], "VaultReader")
    await sleep(1)

    // 4 - Vault --------------------------------------------------------------------
    const vault = await deployContract("Vault", [])
    await sleep(1)

    // 5 - USDG --------------------------------------------------------------------
    const usdg = await deployContract("USDG", [vault.address])
    await sleep(1)

    // 6 - Router ------------------------------------------------------------------
    const router = await deployContract("Router", [vault.address, usdg.address, weth.address])
    await sleep(1)

    // 8 - GLP
    const glp = await deployContract("GLP", [])
    await sleep(1)
    await sendTxn(glp.setInPrivateTransferMode(true), "glp.setInPrivateTransferMode")
    await sleep(1)

    // 9 - ShortsTracker -----------------------------------------------------------
    const shortsTracker = await deployContract("ShortsTracker", [vault.address], "ShortsTracker")

    const shortsTrackerTimelock = await deployContract("ShortsTrackerTimelock", [config.shortsTrackerTimelock.admin, 60, 300, 0])

    // 10 - GlpManager --------------------------------------------------------------
    const glpManager = await deployContract("GlpManager", [vault.address, usdg.address, glp.address, shortsTracker.address, 15 * 60])
    await sleep(1)
    await sendTxn(glpManager.setInPrivateMode(true), "glpManager.setInPrivateMode")
    await sleep(1)
    await sendTxn(glp.setMinter(glpManager.address, true), "glp.setMinter")
    await sleep(1)
    await sendTxn(usdg.addVault(glpManager.address), "usdg.addVault(glpManager)")
    await sleep(1)

    await sendTxn(vault.initialize(
        router.address, // router
        usdg.address, // usdg
        ADDRESS_ZERO,
        // vaultPriceFeed.address, // priceFeed
        toUsd(0.01), // liquidationFeeUsd
        100, // fundingRateFactor
        100 // stableFundingRateFactor
    ), "vault.initialize")
    await sleep(1)

    await sendTxn(vault.setFundingRate(60 * 60, 100, 100), "vault.setFundingRate")
    await sleep(1)
    await sendTxn(vault.setInManagerMode(true), "vault.setInManagerMode")
    await sleep(1)
    await sendTxn(vault.setManager(glpManager.address, true), "vault.setManager")
    await sleep(1)

    await sendTxn(vault.setFees(
        10, // _taxBasisPoints
        5, // _stableTaxBasisPoints
        20, // _mintBurnFeeBasisPoints
        20, // _swapFeeBasisPoints
        1, // _stableSwapFeeBasisPoints
        10, // _marginFeeBasisPoints
        toUsd(0.01), // _liquidationFeeUsd
        24 * 60 * 60, // _minProfitTime
        true // _hasDynamicFees
    ), "vault.setFees")
    await sleep(1)

    // 11 - VaultErrorController ---------------------------------------------------
    const vaultErrorController = await deployContract("VaultErrorController", [])
    await sleep(1)
    await sendTxn(vault.setErrorController(vaultErrorController.address), "vault.setErrorController")
    await sleep(1)
    await sendTxn(vaultErrorController.setErrors(vault.address, errors), "vaultErrorController.setErrors")
    await sleep(1)

    // 12 - VaultUtils -------------------------------------------------------------
    const vaultUtils = await deployContract("VaultUtils", [vault.address])
    await sleep(1)
    await sendTxn(vault.setVaultUtils(vaultUtils.address), "vault.setVaultUtils")
    await sleep(1)

    // 13 - Bonus GMX --------------------------------------------------------------
    const bnGmx = await deployContract("MintableBaseToken", ["Bonus GMX", "bnGMX", 0]);
    await sleep(1)

    // 14 - EsGMX --------------------------------------------------------------------
    const esGmx = await deployContract("EsGMX", []);
    await sleep(1)

    // 15 - GMX --------------------------------------------------------------------
    const gmx = await deployContract("GMX", [])
    await sleep(1)

    // 15 - RewardTracker ----------------------------------------------------------
    const stakedGmxTracker = await deployContract("RewardTracker", ["Staked GMX", "sGMX"])
    await sleep(1)

    // 15 - RewardTracker ----------------------------------------------------------
    const stakedGmxDistributor = await deployContract("RewardDistributor", [esGmx.address, stakedGmxTracker.address])
    await sleep(1)
    await sendTxn(stakedGmxTracker.initialize([gmx.address, esGmx.address], stakedGmxDistributor.address), "stakedGmxTracker.initialize")
    await sleep(1)
    await sendTxn(stakedGmxDistributor.updateLastDistributionTime(), "stakedGmxDistributor.updateLastDistributionTime")
    await sleep(1)

    // 16 - Staked + Bonus GMX --------------------------------------------------------------------
    const bonusGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus GMX", "sbGMX"])
    const bonusGmxDistributor = await deployContract("BonusDistributor", [bnGmx.address, bonusGmxTracker.address])
    await sendTxn(bonusGmxTracker.initialize([stakedGmxTracker.address], bonusGmxDistributor.address), "bonusGmxTracker.initialize")
    await sendTxn(bonusGmxDistributor.updateLastDistributionTime(), "bonusGmxDistributor.updateLastDistributionTime")

    // 17 - Staked + Bonus + Fee GMX --------------------------------------------------------------------
    const feeGmxTracker = await deployContract("RewardTracker", ["Staked + Bonus + Fee GMX", "sbfGMX"])
    await sleep(1)
    const feeGmxDistributor = await deployContract("RewardDistributor", [weth.address, feeGmxTracker.address])
    await sleep(1)
    await sendTxn(feeGmxTracker.initialize([bonusGmxTracker.address, bnGmx.address], feeGmxDistributor.address), "feeGmxTracker.initialize")
    await sleep(1)
    await sendTxn(feeGmxDistributor.updateLastDistributionTime(), "feeGmxDistributor.updateLastDistributionTime")
    await sleep(1)

    const feeGlpTracker = await deployContract("RewardTracker", ["Fee GLP", "fGLP"])
    const feeGlpDistributor = await deployContract("RewardDistributor", [weth.address, feeGlpTracker.address])
    await sendTxn(feeGlpTracker.initialize([glp.address], feeGlpDistributor.address), "feeGlpTracker.initialize")
    await sendTxn(feeGlpDistributor.updateLastDistributionTime(), "feeGlpDistributor.updateLastDistributionTime")

    const stakedGlpTracker = await deployContract("RewardTracker", ["Fee + Staked GLP", "fsGLP"])
    const stakedGlpDistributor = await deployContract("RewardDistributor", [esGmx.address, stakedGlpTracker.address])
    await sendTxn(stakedGlpTracker.initialize([feeGlpTracker.address], stakedGlpDistributor.address), "stakedGlpTracker.initialize")
    await sendTxn(stakedGlpDistributor.updateLastDistributionTime(), "stakedGlpDistributor.updateLastDistributionTime")

    ////////    

    await sendTxn(stakedGmxTracker.setInPrivateTransferMode(true), "stakedGmxTracker.setInPrivateTransferMode")
    await sleep(1)
    await sendTxn(stakedGmxTracker.setInPrivateStakingMode(true), "stakedGmxTracker.setInPrivateStakingMode")
    await sleep(1)
    await sendTxn(bonusGmxTracker.setInPrivateTransferMode(true), "bonusGmxTracker.setInPrivateTransferMode")
    await sleep(1)
    await sendTxn(bonusGmxTracker.setInPrivateStakingMode(true), "bonusGmxTracker.setInPrivateStakingMode")
    await sleep(1)
    await sendTxn(bonusGmxTracker.setInPrivateClaimingMode(true), "bonusGmxTracker.setInPrivateClaimingMode")
    await sleep(1)
    await sendTxn(feeGmxTracker.setInPrivateTransferMode(true), "feeGmxTracker.setInPrivateTransferMode")
    await sleep(1)
    await sendTxn(feeGmxTracker.setInPrivateStakingMode(true), "feeGmxTracker.setInPrivateStakingMode")
    await sleep(1)

    // 18 - Vester GMX -----------------------------------------------------------------
    const vestingDuration = 365 * 24 * 60 * 60

    const gmxVester = await deployContract("Vester", [
        "Vested GMX", // _name
        "vGMX", // _symbol
        vestingDuration, // _vestingDuration
        esGmx.address, // _esToken
        feeGmxTracker.address, // _pairToken
        gmx.address, // _claimableToken
        stakedGmxTracker.address, // _rewardTracker
    ])

    // 19 - Vester GLP --------------------------------------------------------------------
    const glpVested = await deployContract("Vester", [
        "Vested GLP", // _name
        "vGLP", // _symbol
        vestingDuration, // _vestingDuration
        esGmx.address, // _esToken
        stakedGlpTracker.address, // _pairToken
        gmx.address, // _claimableToken
        stakedGlpTracker.address, // _rewardTracker
    ])

    // 20 - RewardRouter --------------------------------------------------------------
    const govToken = await deployContract("MintableBaseToken", ["GOV", "GOV", 0])

    const rewardRouter = await deployContract("RewardRouterV2", [])

    await sleep(1)
    await sendTxn(rewardRouter.initialize(
        weth.address,
        gmx.address,
        esGmx.address,
        bnGmx.address,
        glp.address,
        stakedGmxTracker.address,
        bonusGmxTracker.address,
        feeGmxTracker.address,
        feeGlpTracker.address,
        stakedGlpTracker.address,
        glpManager.address,
        gmxVester.address,
        glpVested.address,
        govToken.address
    ), "rewardRouter.initialize")

    await sendTxn(govToken.setMinter(rewardRouter.address, true), "govToken.setMinter")

    await sendTxn(feeGlpTracker.setInPrivateTransferMode(true), "feeGlpTracker.setInPrivateTransferMode")
    await sendTxn(feeGlpTracker.setInPrivateStakingMode(true), "feeGlpTracker.setInPrivateStakingMode")

    // allow stakedGlpTracker to stake feeGlpTracker
    await sendTxn(feeGlpTracker.setHandler(stakedGlpTracker.address, true), "feeGlpTracker.setHandler(stakedGlpTracker)")
    // allow feeGlpTracker to stake glp
    await sendTxn(glp.setHandler(feeGlpTracker.address, true), "glp.setHandler(feeGlpTracker)")

    // allow rewardRouter to stake in feeGlpTracker
    await sendTxn(feeGlpTracker.setHandler(rewardRouter.address, true), "feeGlpTracker.setHandler(rewardRouter)")
    // allow rewardRouter to stake in stakedGlpTracker
    await sendTxn(stakedGlpTracker.setHandler(rewardRouter.address, true), "stakedGlpTracker.setHandler(rewardRouter)")

    // allow rewardRouter to stake in stakedGmxTracker
    await sendTxn(stakedGmxTracker.setHandler(rewardRouter.address, true), "stakedGmxTracker.setHandler(rewardRouter)")
    await sleep(1)

    // allow bonusGmxTracker to stake stakedGmxTracker
    await sendTxn(stakedGmxTracker.setHandler(bonusGmxTracker.address, true), "stakedGmxTracker.setHandler(bonusGmxTracker)")
    await sleep(1)

    // allow rewardRouter to stake in bonusGmxTracker
    await sendTxn(bonusGmxTracker.setHandler(rewardRouter.address, true), "bonusGmxTracker.setHandler(rewardRouter)")
    await sleep(1)

    // allow bonusGmxTracker to stake feeGmxTracker
    await sendTxn(bonusGmxTracker.setHandler(feeGmxTracker.address, true), "bonusGmxTracker.setHandler(feeGmxTracker)")
    await sleep(1)

    await sendTxn(bonusGmxDistributor.setBonusMultiplier(10000), "bonusGmxDistributor.setBonusMultiplier")
    await sleep(1)

    // allow rewardRouter to stake in feeGmxTracker
    await sendTxn(feeGmxTracker.setHandler(rewardRouter.address, true), "feeGmxTracker.setHandler(rewardRouter)")
    await sleep(1)

    // allow stakedGmxTracker to stake esGmx
    await sendTxn(esGmx.setHandler(stakedGmxTracker.address, true), "esGmx.setHandler(stakedGmxTracker)")
    await sleep(1)

    // allow feeGmxTracker to stake bnGmx
    await sendTxn(bnGmx.setHandler(feeGmxTracker.address, true), "bnGmx.setHandler(feeGmxTracker")
    await sleep(1)

    // allow rewardRouter to burn bnGmx
    await sendTxn(bnGmx.setMinter(rewardRouter.address, true), "bnGmx.setMinter(rewardRouter")
    await sleep(1)

    // mint esGmx for distributors
    await sendTxn(esGmx.setMinter(deployer.address, true), "esGmx.setMinter(gmxVester.address)")
    await sendTxn(esGmx.mint(stakedGmxDistributor.address, expandDecimals(50000 * 12, 18)), "esGmx.mint(stakedGmxDistributor") // ~50,000 GMX per month
    await sendTxn(esGmx.setMinter(gmxVester.address, true), "esGmx.setMinter(gmxVester.address)")

    await sendTxn(stakedGmxDistributor.setTokensPerInterval("20667989410000000"), "stakedGmxDistributor.setTokensPerInterval") // 0.02066798941 esGmx per second
    await sleep(1)

    // mint bnGmx for distributor
    await sendTxn(bnGmx.setMinter(deployer.address, true), "bnGmx.setMinter")
    await sendTxn(bnGmx.mint(bonusGmxDistributor.address, expandDecimals(15 * 1000 * 1000, 18)), "bnGmx.mint(bonusGmxDistributor)")
    await sendTxn(bnGmx.setMinter(rewardRouter.address, true), "bnGmx.setMinter")

    // 21 - OrderBook --------------------------------------------------------------    

    const orderBook = await deployContract("OrderBook", []);

    await sendTxn(orderBook.initialize(
        router.address,
        vault.address,
        weth.address, // weth
        usdg.address,
        "10000000000000000", // 0.01 AVAX
        expandDecimals(10, 30) // min purchase token amount usd
    ), "orderBook.initialize");

    // 22 - Order Book Reader --------------------------------------------------------

    const orderBookReader = await deployContract("OrderBookReader", [])

    // 23 - TokenManager --------------------------------------------------------

    const tokenManager = await deployContract("TokenManager", [4], "TokenManager")

    await sendTxn(tokenManager.initialize(config.tokenManager.signers), "tokenManager.initialize")

    // 24 - ReferralStorage --------------------------------------------------------

    const referralStorage = await deployContract("ReferralStorage", [])

    // 25 - Timelock --------------------------------------------------------

    const buffer = 24 * 60 * 60
    const maxTokenSupply = expandDecimals("13250000", 18)

    const timelock = await deployContract("Timelock", [
        config.timelock.admin, // admin
        buffer, // buffer
        tokenManager.address, // tokenManager
        tokenManager.address, // mintReceiver
        glpManager.address, // glpManager
        glpManager.address, // prevGlpManager
        rewardRouter.address, // rewardRouter
        maxTokenSupply, // maxTokenSupply
        10, // marginFeeBasisPoints 0.1%
        500 // maxMarginFeeBasisPoints 5%
    ], "Timelock")

    // await sendTxn(timelock.setContractHandler(orderExecutor.address, true), "timelock.setContractHandler(orderExecutor)")

    // 26 - PositionRouter --------------------------------------------------------

    const depositFee = "30" // 0.3%
    const minExecutionFee = "3000000000000" // 0.0003 ETH

    const positionUtils = await deployContract("PositionUtils", [])

    const positionRouterArgs = [vault.address, router.address, weth.address, shortsTracker.address, depositFee, minExecutionFee]
    const positionRouter = await deployContract("PositionRouter", positionRouterArgs, "PositionRouter", {
        libraries: {
            PositionUtils: positionUtils.address
        }
    })

    await sendTxn(positionRouter.setReferralStorage(referralStorage.address), "positionRouter.setReferralStorage")
    await sendTxn(positionRouter.setPositionKeeper(config.positionRouter.positionKeeper, true), "positionRouter.setReferralStorage")

    await sendTxn(referralStorage.setHandler(positionRouter.address, true), "referralStorage.setHandler(positionRouter)")

    await sendTxn(router.addPlugin(positionRouter.address), "router.addPlugin")
    await sendTxn(router.approvePlugin(positionRouter.address), "router.approvePlugin(positionRouter.address)")

    await sendTxn(positionRouter.setDelayValues(1, 180, 30 * 60), "positionRouter.setDelayValues")
    await sendTxn(timelock.setContractHandler(positionRouter.address, true), "timelock.setContractHandler(positionRouter)")

    // 26 - PositionManager --------------------------------------------------------

    const positionManagerArgs = [vault.address, router.address, shortsTracker.address, weth.address, depositFee, orderBook.address];
    const positionManager = await deployContract("PositionManager", positionManagerArgs, "PositionManager", {
        libraries: {
            PositionUtils: positionUtils.address
        }
    });

    await sendTxn(positionManager.setOrderKeeper(config.positionManager.orderKeeper, true), "positionManager.setOrderKeeper(orderKeeper)")
    await sendTxn(positionManager.setLiquidator(config.positionManager.liquidator, true), "positionManager.setLiquidator(liquidator)")
    await sendTxn(timelock.setContractHandler(positionManager.address, true), "timelock.setContractHandler(positionRouter)")
    // await sendTxn(timelock.setLiquidator(vault.address, positionManager.address, true), "timelock.setLiquidator(vault, positionManager, true)")
    await sendTxn(router.addPlugin(positionManager.address), "router.addPlugin(positionManager)")
    await sendTxn(router.approvePlugin(positionManager.address), "router.approvePlugin(positionManager.address)")

    await sendTxn(glpManager.setHandler(rewardRouter.address, true), 'glpManager.setHandler');

    await sendTxn(shortsTracker.setHandler(positionRouter.address, true), "shortsTracker.setContractHandler(positionManager.address, true)")

    await sendTxn(await glpManager.setInPrivateMode(true), 'glpManager.setInPrivateMode(true)')

    // 26 - VaultPriceFeed --------------------------------------------------------

    const vaultPriceFeed = await deployContract("VaultPriceFeed", [])

    // 27 - FastPriceFeed --------------------------------------------------------

    const fastPriceEvents = await deployContract("FastPriceEvents", [])

    const priceFeedTimelock = await deployContract("PriceFeedTimelock", [
        config.PriceFeedTimelock.admin,
        24 * 60 * 60,
        tokenManager.address
    ])

    const tokenArr = tokens;
    const fastPriceTokens = tokens;

    if (fastPriceTokens.find(t => !t.fastPricePrecision)) {
        throw new Error("Invalid price precision")
    }

    if (fastPriceTokens.find(t => !t.maxCumulativeDeltaDiff)) {
        throw new Error("Invalid price maxCumulativeDeltaDiff")
    }

    const secondaryPriceFeed = await deployContract("FastPriceFeed", [
        5 * 60, // _priceDuration
        60 * 60, // _maxPriceUpdateDelay
        1, // _minBlockInterval
        expandDecimals(10, 32), // _maxDeviationBasisPoints
        fastPriceEvents.address, // _fastPriceEvents
        deployer.address, // _tokenManager
    ])

    await sendTxn(vault.setPriceFeed(vaultPriceFeed.address), "vault.setPriceFeed")

    await sendTxn(vaultPriceFeed.setMaxStrictPriceDeviation(expandDecimals(1, 28)), "vaultPriceFeed.setMaxStrictPriceDeviation") // 0.01 USD
    await sendTxn(vaultPriceFeed.setPriceSampleSpace(1), "vaultPriceFeed.setPriceSampleSpace")
    await sendTxn(vaultPriceFeed.setSecondaryPriceFeed(secondaryPriceFeed.address), "vaultPriceFeed.setSecondaryPriceFeed")
    await sendTxn(vaultPriceFeed.setIsAmmEnabled(false), "vaultPriceFeed.setIsAmmEnabled")

    for (const [i, tokenItem] of tokenArr.entries()) {
        if (tokenItem.spreadBasisPoints === undefined) { continue }
        await sendTxn(vaultPriceFeed.setSpreadBasisPoints(
            tokenItem.address, // _token
            tokenItem.spreadBasisPoints // _spreadBasisPoints
        ), `vaultPriceFeed.setSpreadBasisPoints(${tokenItem.name}) ${tokenItem.spreadBasisPoints}`)
    }

    for (const token of tokenArr) {
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

    await sendTxn(secondaryPriceFeed.initialize(1, config.secondaryPriceFeed.signers, config.secondaryPriceFeed.updaters), "secondaryPriceFeed.initialize")
    await sendTxn(secondaryPriceFeed.setTokens(fastPriceTokens.map(t => t.address), fastPriceTokens.map(t => t.fastPricePrecision)), "secondaryPriceFeed.setTokens")
    await sendTxn(secondaryPriceFeed.setVaultPriceFeed(vaultPriceFeed.address), "secondaryPriceFeed.setVaultPriceFeed")
    await sendTxn(secondaryPriceFeed.setMaxTimeDeviation(60 * 60), "secondaryPriceFeed.setMaxTimeDeviation")
    await sendTxn(secondaryPriceFeed.setSpreadBasisPointsIfInactive(50), "secondaryPriceFeed.setSpreadBasisPointsIfInactive")
    await sendTxn(secondaryPriceFeed.setSpreadBasisPointsIfChainError(500), "secondaryPriceFeed.setSpreadBasisPointsIfChainError")
    await sendTxn(secondaryPriceFeed.setMaxCumulativeDeltaDiffs(fastPriceTokens.map(t => t.address), fastPriceTokens.map(t => t.maxCumulativeDeltaDiff)), "secondaryPriceFeed.setMaxCumulativeDeltaDiffs")
    await sendTxn(secondaryPriceFeed.setPriceDataInterval(1 * 60), "secondaryPriceFeed.setPriceDataInterval")

    await sendTxn(positionRouter.setPositionKeeper(secondaryPriceFeed.address, true), "positionRouter.setPositionKeeper(secondaryPriceFeed)")
    await sendTxn(fastPriceEvents.setIsPriceFeed(secondaryPriceFeed.address, true), "fastPriceEvents.setIsPriceFeed")

    await sendTxn(secondaryPriceFeed.setTokenManager(tokenManager.address), "secondaryPriceFeed.setTokenManager")

    // 28 - Set Gov to timelocks --------------------------------------------------------

    await sendTxn(vaultPriceFeed.setGov(priceFeedTimelock.address), "vaultPriceFeed.setGov")
    await sendTxn(secondaryPriceFeed.setGov(priceFeedTimelock.address), "secondaryPriceFeed.setGov")
    await sendTxn(vault.setGov(timelock.address), "vault.setGov(timelock)");
    await sendTxn(shortsTracker.setGov(shortsTrackerTimelock.address), "shortsTracker.setGov")

    //------- END

    // deployed addresses
    const addresses = {
        // Interface part
        PositionRouter: positionRouter.address,
        PositionManager: positionManager.address,
        Vault: vault.address,
        Router: router.address,
        VaultReader: vaultReader.address,
        Reader: reader.address,
        GlpManager: glpManager.address,
        RewardRouter: rewardRouter.address,
        GlpRewardRouter: rewardRouter.address,
        GovToken: govToken.address,
        NATIVE_TOKEN: weth.address,
        GLP: glp.address,
        GMX: gmx.address,
        ES_GMX: esGmx.address,
        BN_GMX: bnGmx.address,
        USDG: usdg.address,
        // ES_GMX_IOU: "0x6260101218eC4cCfFF1b778936C6f2400f95A954",
        StakedGmxTracker: stakedGmxTracker.address,
        BonusGmxTracker: bonusGmxTracker.address,
        FeeGmxTracker: feeGmxTracker.address,
        StakedGlpTracker: stakedGlpTracker.address,
        FeeGlpTracker: feeGlpTracker.address,
        OrderBook: orderBook.address,
        OrderBookReader: orderBookReader.address,
        TokenManager: tokenManager.address,
        // Interface part

        FastPriceEvents: fastPriceEvents.address,
        FastPriceFeed: secondaryPriceFeed.address,
        VaultPriceFeed: vaultPriceFeed.address,

        VaultErrorController: vaultErrorController.address,
        VaultUtils: vaultUtils.address,

        Timelock: timelock.address,
        PriceFeedTimelock: priceFeedTimelock.address,
        ShortsTrackerTimelock: shortsTrackerTimelock.address
    };

    console.log(addresses);

    writeTmpAddresses(addresses)
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error)
        process.exit(1)
    })