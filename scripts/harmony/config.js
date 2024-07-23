
const getConfig = async () => {
    const [deployer] = await ethers.getSigners()

    const config = {
        timelock: {
            admin: deployer.address,
        },
        shortsTrackerTimelock: {
            admin: deployer.address,
        },
        PriceFeedTimelock: {
            admin: deployer.address,
        },
        tokenManager: {
            signers: [
                deployer.address,
            ]
        },
        positionManager: {
            orderKeeper: deployer.address,
            liquidator: deployer.address,
        },
        positionRouter: {
            positionKeeper: deployer.address,
        },
        secondaryPriceFeed: {
            signers: [deployer.address],
            updaters: [deployer.address]
        }
    }

    return config;
}

module.exports = { getConfig }