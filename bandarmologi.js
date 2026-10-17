(function () {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function calculate(candles, depth, flow) {
    const latest = candles && candles.length ? candles[candles.length - 1] : null;
    const prior = candles && candles.length > 1 ? candles.slice(-21, -1) : [];
    const averageVolume = prior.length ? prior.reduce((sum, candle) => sum + candle.volume, 0) / prior.length : 0;
    const volumeSpike = latest && averageVolume ? latest.volume / averageVolume : null;
    const movementPct = latest && prior.length
      ? Math.abs((latest.close - prior[prior.length - 1].close) / prior[prior.length - 1].close) * 100
      : 0;
    const flatHighVolume = volumeSpike !== null && volumeSpike >= 1.5 && movementPct < 0.8;

    let bookImbalance = null;
    if (depth && depth.bids.length && depth.asks.length) {
      const bidSize = depth.bids.slice(0, 20).reduce((sum, level) => sum + Number(level[1]), 0);
      const askSize = depth.asks.slice(0, 20).reduce((sum, level) => sum + Number(level[1]), 0);
      const total = bidSize + askSize;
      if (total) bookImbalance = (bidSize - askSize) / total;
    }

    let vwapDeviation = null;
    if (candles && candles.length) {
      const window = candles.slice(-50);
      const volumeTotal = window.reduce((sum, candle) => sum + candle.volume, 0);
      if (volumeTotal) {
        const vwap = window.reduce((sum, candle) => sum + ((candle.high + candle.low + candle.close) / 3) * candle.volume, 0) / volumeTotal;
        vwapDeviation = ((latest.close - vwap) / vwap) * 100;
      }
    }

    const takerDelta = flow && flow.buyVolume + flow.sellVolume
      ? (flow.buyVolume - flow.sellVolume) / (flow.buyVolume + flow.sellVolume)
      : 0;
    const accumulation = clamp(
      (bookImbalance === null ? 0 : bookImbalance * 35) +
      takerDelta * 35 +
      (flatHighVolume ? (takerDelta >= 0 ? 20 : -20) : 0) +
      (vwapDeviation === null ? 0 : clamp(vwapDeviation * 4, -10, 10)),
      -100,
      100
    );

    return {
      score: Math.round(accumulation),
      volumeSpike,
      bookImbalance,
      vwapDeviation,
      flatHighVolume,
      buyRatio: takerDelta,
      whaleCount: flow ? flow.whaleCount : 0
    };
  }

  function recommendation(accumulationScore, smcScore) {
    const combined = Math.round(accumulationScore * 0.6 + smcScore * 0.4);
    const recommendation = combined >= 30 ? "BUY" : combined <= -30 ? "SELL" : "NEUTRAL";
    return {score: combined, recommendation, confidence: Math.min(90, Math.round(Math.abs(combined) * 0.75 + 20))};
  }

  window.Bandarmologi = {calculate, recommendation};
})();
