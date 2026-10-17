(function () {
  "use strict";

  const intervals = { "5m": "5", "15m": "15", "1h": "60", "1d": "D" };

  class MarketChart {
    constructor(element, handlers) {
      this.element = element;
      this.handlers = handlers;
      this.candles = [];
      this.interval = "5m";
      this.symbol = null;
      this.marketType = "USD_M";
      this.contractType = "PERPETUAL";
      this.loadSequence = 0;
      this.frame = document.createElement("iframe");
      this.frame.title = "Grafik harga TradingView";
      this.frame.loading = "lazy";
      this.frame.allow = "clipboard-write; fullscreen";
      this.frame.referrerPolicy = "origin";
      this.frame.src = "about:blank";
      this.element.replaceChildren(this.frame);
    }

    tradingViewSymbol() {
      const market = this.handlers.getMarket(this.symbol);
      if (!market) return "";
      const tvSymbol = this.marketType === "USD_M"
        ? `${market.symbol}${market.contractType === "PERPETUAL" ? ".P" : ""}`
        : market.symbol.replace(/_PERP$/, ".P");
      return `BINANCE:${tvSymbol}`;
    }

    updateWidget() {
      const symbol = this.tradingViewSymbol();
      if (!symbol) return;
      const query = new URLSearchParams({
        symbol,
        interval: intervals[this.interval] || "5",
        theme: "dark",
        style: "1",
        locale: "id",
        timezone: "Etc/UTC",
        hide_top_toolbar: "false",
        hide_side_toolbar: "false",
        allow_symbol_change: "false",
        save_image: "false",
        calendar: "false",
        studies: "[]",
        support_host: "https://www.tradingview.com"
      });
      this.frame.src = `https://www.tradingview.com/widgetembed/?${query.toString()}`;
    }

    async load(symbol, interval, marketType) {
      this.symbol = symbol;
      this.interval = interval;
      this.marketType = marketType;
      const sequence = ++this.loadSequence;
      const market = this.handlers.getMarket(symbol);
      if (!market) throw new Error("Metadata kontrak futures tidak ditemukan.");
      this.handlers.onStatus("MEMUAT FUTURES");
      this.updateWidget();
      const endpoint = marketType === "COIN_M" ? "https://dapi.binance.com/dapi/v1/klines" : "https://fapi.binance.com/fapi/v1/klines";
      const url = `${endpoint}?symbol=${encodeURIComponent(market.symbol)}&interval=${encodeURIComponent(interval)}&limit=500`;
      const response = await fetch(url, {headers: {Accept: "application/json"}});
      if (!response.ok) throw new Error(`Binance Futures klines menolak permintaan (${response.status}).`);
      const rows = await response.json();
      if (sequence !== this.loadSequence) return;
      this.candles = rows.map((row) => ({
        time: Math.floor(row[0] / 1000),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5])
      }));
      this.handlers.onStatus("KLINE SIAP · " + interval.toUpperCase());
      this.analyze();
    }

    updateKline(kline) {
      if (!kline || !this.symbol) return;
      const candle = {
        time: Math.floor(kline.t / 1000),
        open: Number(kline.o),
        high: Number(kline.h),
        low: Number(kline.l),
        close: Number(kline.c),
        volume: Number(kline.v)
      };
      const last = this.candles[this.candles.length - 1];
      if (!last || candle.time > last.time) this.candles.push(candle);
      else if (candle.time === last.time) this.candles[this.candles.length - 1] = candle;
      else return;
      if (this.candles.length > 500) this.candles.shift();
      this.handlers.onStatus("LIVE · " + this.interval.toUpperCase());
      this.analyze();
    }

    analyze() {
      this.handlers.onAnalysis({candles: this.candles, smc: window.SMCDetector.detect(this.candles)});
    }

    getCandles() {
      return this.candles.slice();
    }

    destroy() {
      this.loadSequence++;
      this.frame.src = "about:blank";
      this.candles = [];
    }
  }

  window.MarketChart = MarketChart;
})();
