(function () {
  "use strict";

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function detect(candles) {
    if (!Array.isArray(candles) || candles.length < 8) return {events: [], score: 0};
    const events = [];
    const highs = [];
    const lows = [];
    const pivotSpan = 2;

    for (let i = pivotSpan; i < candles.length - pivotSpan; i++) {
      let isHigh = true;
      let isLow = true;
      for (let j = i - pivotSpan; j <= i + pivotSpan; j++) {
        if (j === i) continue;
        if (candles[j].high >= candles[i].high) isHigh = false;
        if (candles[j].low <= candles[i].low) isLow = false;
      }
      if (isHigh) highs.push({index: i, price: candles[i].high});
      if (isLow) lows.push({index: i, price: candles[i].low});
    }

    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const priorHigh = highs.filter((point) => point.index < candles.length - 3).slice(-1)[0];
    const priorLow = lows.filter((point) => point.index < candles.length - 3).slice(-1)[0];
    let structureSide = 0;
    let structureEvent = null;

    if (priorHigh && last.close > priorHigh.price && prev.close <= priorHigh.price) {
      structureSide = 1;
      structureEvent = {type: "BOS", side: "bull", price: priorHigh.price, time: last.time, index: candles.length - 1};
    } else if (priorLow && last.close < priorLow.price && prev.close >= priorLow.price) {
      structureSide = -1;
      structureEvent = {type: "BOS", side: "bear", price: priorLow.price, time: last.time, index: candles.length - 1};
    }

    if (structureEvent) {
      const priorStructure = findPriorStructure(candles, highs, lows, candles.length - 10);
      if (priorStructure && priorStructure.side !== structureEvent.side) structureEvent.type = "CHoCH";
      events.push(structureEvent);
      const start = Math.max(0, candles.length - 10);
      for (let i = candles.length - 2; i >= start; i--) {
        const candle = candles[i];
        const opposing = structureSide > 0 ? candle.close < candle.open : candle.close > candle.open;
        if (opposing) {
          events.push({
            type: `OB ${structureSide > 0 ? "bullish" : "bearish"}`,
            side: structureSide > 0 ? "bull" : "bear",
            price: (candle.open + candle.close) / 2,
            low: candle.low,
            high: candle.high,
            time: candle.time,
            index: i
          });
          break;
        }
      }
    }

    const fvgStart = Math.max(2, candles.length - 40);
    for (let i = fvgStart; i < candles.length; i++) {
      const left = candles[i - 2];
      const right = candles[i];
      if (right.low > left.high) {
        events.push({type: "FVG bullish", side: "bull", price: (right.low + left.high) / 2, low: left.high, high: right.low, time: right.time, index: i});
      } else if (right.high < left.low) {
        events.push({type: "FVG bearish", side: "bear", price: (left.low + right.high) / 2, low: right.high, high: left.low, time: right.time, index: i});
      }
    }

    const tolerance = last.close * 0.0015;
    if (priorHigh && Math.abs(last.high - priorHigh.price) <= tolerance && last.close < priorHigh.price) {
      events.push({type: "Sweep high", side: "bear", price: priorHigh.price, time: last.time, index: candles.length - 1});
    } else if (priorLow && Math.abs(last.low - priorLow.price) <= tolerance && last.close > priorLow.price) {
      events.push({type: "Sweep low", side: "bull", price: priorLow.price, time: last.time, index: candles.length - 1});
    }

    if (highs.length >= 2) {
      const a = highs[highs.length - 1];
      const b = highs[highs.length - 2];
      if (a.index > candles.length - 40 && Math.abs(a.price - b.price) <= tolerance) {
        events.push({type: "Equal highs", side: "bear", price: (a.price + b.price) / 2, time: candles[a.index].time, index: a.index});
      }
    }
    if (lows.length >= 2) {
      const a = lows[lows.length - 1];
      const b = lows[lows.length - 2];
      if (a.index > candles.length - 40 && Math.abs(a.price - b.price) <= tolerance) {
        events.push({type: "Equal lows", side: "bull", price: (a.price + b.price) / 2, time: candles[a.index].time, index: a.index});
      }
    }

    const recent = events.filter((event) => event.index >= candles.length - 8);
    const score = clamp(recent.reduce((total, event) => {
      const weight = event.type === "CHoCH" ? 30 : event.type === "BOS" ? 22 : event.type.startsWith("OB") ? 12 : event.type.startsWith("FVG") ? 7 : 10;
      return total + (event.side === "bull" ? weight : -weight);
    }, 0), -100, 100);
    return {events: events.slice(-12), score};
  }

  function findPriorStructure(candles, highs, lows, fromIndex) {
    const candidates = highs.map((point) => ({...point, side: "bull"}))
      .concat(lows.map((point) => ({...point, side: "bear"})))
      .filter((point) => point.index >= Math.max(0, fromIndex) && point.index < candles.length - 3)
      .sort((a, b) => b.index - a.index);
    return candidates[0] || null;
  }

  window.SMCDetector = {detect};
})();
