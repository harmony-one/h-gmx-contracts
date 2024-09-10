const { getTokens } = require('./tokens');

const BN = require('bn.js')

function getPriceBits(prices) {
    if (prices.length > 8) {
        throw new Error("max prices.length exceeded")
    }

    let priceBits = new BN('0')

    for (let j = 0; j < 8; j++) {
        let index = j
        if (index >= prices.length) {
            break
        }

        const price = new BN(prices[index])
        if (price.gt(new BN("2147483648"))) { // 2^31
            throw new Error(`price exceeds bit limit ${price.toString()}`)
        }

        priceBits = priceBits.or(price.shln(j * 32))
    }

    return priceBits.toString()
}

function normalizePrice(price, precision) {
    return Math.round(price * precision);
}

// const prices = {
//     ONE: 0.011627355,
//     USDT: 0.99997,
//     USDC: 0.999985,
//     WBTC: 55464.5374175,
//     ETH: 2300.6254205
//   }

const getPricesBits = (prices) => {
    const tokens = getTokens();

    const symbolsWithPrecisions = tokens.map(t => ({
        symbol: t.symbol,
        precision: t.fastPricePrecision
    }))

    const normalizedPrices = symbolsWithPrecisions
        .filter(({ symbol }) => !!prices[symbol])
        .map(({ symbol, precision }) => normalizePrice(prices[symbol], precision));

    return getPriceBits(normalizedPrices);
}

module.exports = { getPricesBits }