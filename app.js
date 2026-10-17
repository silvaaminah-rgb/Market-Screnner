(function () {
  "use strict";

  const API_BASE = {
    USD_M: "https://fapi.binance.com/fapi/v1",
    COIN_M: "https://dapi.binance.com/dapi/v1"
  };
  const WHALE_NOTIONAL = 50000;
  const els = {
    marketState: document.getElementById("market-state"),
    activePairs: document.getElementById("active-pairs"),
    lastUpdate: document.getElementById("last-update"),
    connection: document.getElementById("connection-label"),
    liveState: document.querySelector(".live-state"),
    search: document.getElementById("search-input"),
    quote: document.getElementById("quote-filter"),
    signal: document.getElementById("signal-filter"),
    table: document.getElementById("screener-rows"),
    count: document.getElementById("result-count"),
    note: document.getElementById("table-note")
  };
  let screener;
  let chart;
  let streams;
  let selectedSymbol = null;
  let interval = "5m";
  let depthSnapshot = null;
  let flowTrades = [];
  let noticeTimer = null;

  function notify(message) {
    const notice = document.getElementById("notice");
    notice.textContent = message;
    notice.classList.add("visible");
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => notice.classList.remove("visible"), 6000);
  }

  function setConnection(state) {
    const connected = state === "connected";
    const disconnected = state === "error";
    els.liveState.classList.toggle("connected", connected);
    els.liveState.classList.toggle("disconnected", disconnected);
    els.connection.textContent = connected ? "LIVE BINANCE" : disconnected ? "KONEKSI TERGANGGU" : "MENYAMBUNG ULANG";
    els.marketState.textContent = connected ? "LIVE" : disconnected ? "GANGGUAN" : "MENYAMBUNG";
  }

  function recentFlow() {
    const cutoff = Date.now() - 60000;
    flowTrades = flowTrades.filter((trade) => trade.time >= cutoff);
    return flowTrades.reduce((sum, trade) => {
      sum.buyVolume += trade.buy ? trade.quantity : 0;
      sum.sellVolume += trade.buy ? 0 : trade.quantity;
      sum.whaleCount += trade.whale ? 1 : 0;
      return sum;
    }, {buyVolume: 0, sellVolume: 0, whaleCount: 0});
  }

  function updateAnalysis(payload) {
    if (!payload.candles.length || !selectedSymbol) return;
    const flow = recentFlow();
    const metrics = window.Bandarmologi.calculate(payload.candles, depthSnapshot, flow);
    const combined = window.Bandarmologi.recommendation(metrics.score, payload.smc.score);
    screener.setAnalysis(selectedSymbol, metrics, payload.smc, combined);

    const scoreElement = document.getElementById("accumulation-score");
    scoreElement.textContent = `${metrics.score > 0 ? "+" : ""}${metrics.score}`;
    scoreElement.className = `mono ${metrics.score > 15 ? "positive" : metrics.score < -15 ? "negative" : ""}`;
    scoreElement.classList.toggle("glow", Math.abs(metrics.score) >= 35);
    document.getElementById("accumulation-label").textContent = metrics.flatHighVolume
      ? metrics.score >= 0 ? "Volume tinggi · harga relatif datar · indikasi akumulasi" : "Volume tinggi · harga relatif datar · indikasi distribusi"
      : metrics.score > 30 ? "Tekanan beli relatif dominan" : metrics.score < -30 ? "Tekanan jual relatif dominan" : "Belum ada dominasi yang jelas";
    document.getElementById("volume-spike").textContent = metrics.volumeSpike === null ? "—" : `${metrics.volumeSpike.toFixed(2)}x`;
    document.getElementById("volume-spike").className = `mono ${metrics.volumeSpike >= 2 ? "yellow" : ""}`;
    document.getElementById("book-imbalance").textContent = metrics.bookImbalance === null ? "—" : `${(metrics.bookImbalance * 100).toFixed(1)}%`;
    document.getElementById("book-imbalance").className = `mono ${metrics.bookImbalance > 0.08 ? "positive" : metrics.bookImbalance < -0.08 ? "negative" : ""}`;
    document.getElementById("whale-trades").textContent = String(metrics.whaleCount);
    document.getElementById("book-depth").textContent = metrics.bookImbalance === null ? "Menunggu snapshot order book" : `50 candle VWAP ${metrics.vwapDeviation >= 0 ? "+" : ""}${metrics.vwapDeviation.toFixed(2)}%`;

    const latest = payload.smc.events.slice().sort((a, b) => b.time - a.time).slice(0, 6);
    const list = document.getElementById("smc-list");
    list.replaceChildren();
    if (!latest.length) {
      const empty = document.createElement("span");
      empty.className = "empty-inline";
      empty.textContent = "Belum ada struktur terkonfirmasi";
      list.append(empty);
    } else {
      latest.forEach((event) => {
        const tag = document.createElement("span");
        tag.className = `smc-tag ${event.side === "bull" ? "bull" : "bear"}`;
        tag.textContent = event.type;
        list.append(tag);
      });
    }
    const smcValue = payload.smc.score;
    document.getElementById("smc-summary").textContent = `SMC ${smcValue > 0 ? "+" : ""}${smcValue} · Sinyal ${combined.recommendation} (${combined.confidence}% indikatif)`;
  }

  function formatPrice(value) {
    return window.ScreenerFormat.formatPrice(value);
  }

  function updateSelectedTicker() {
    if (!screener || !selectedSymbol) return;
    const row = screener.markets.get(selectedSymbol);
    if (!row) return;
    document.getElementById("selected-price").textContent = formatPrice(row.price);
    const change = document.getElementById("selected-change");
    change.textContent = `${row.change > 0 ? "+" : ""}${row.change.toFixed(2)}% 24j`;
    change.className = row.change > 0 ? "positive" : row.change < 0 ? "negative" : "";
  }

  async function selectPair(symbol) {
    selectedSymbol = symbol;
    const market = screener.markets.get(symbol);
    if (!market) return;
    depthSnapshot = null;
    flowTrades = [];
    document.getElementById("chart-symbol").firstChild.textContent = `${market.symbol} `;
    document.querySelector(".quote-tag").textContent = market.marketType === "COIN_M" ? "COIN-M" : "USDⓈ-M";
    document.getElementById("accumulation-score").textContent = "—";
    document.getElementById("accumulation-label").textContent = "Menghitung dari data live";
    document.getElementById("volume-spike").textContent = "—";
    document.getElementById("book-imbalance").textContent = "—";
    document.getElementById("whale-trades").textContent = "0";
    document.getElementById("smc-list").replaceChildren();
    updateSelectedTicker();
    streams.watchPair(market.symbol, interval, market.marketType);
    try {
      await chart.load(symbol, interval, market.marketType);
    } catch (error) {
      document.getElementById("chart-status").textContent = "DATA TIDAK TERSEDIA";
      notify(error.message);
    }
  }

  function setInterval(nextInterval, button) {
    interval = nextInterval;
    document.querySelectorAll("[data-interval]").forEach((element) => element.classList.toggle("active", element === button));
    if (selectedSymbol) {
      const market = screener.markets.get(selectedSymbol);
      if (!market) return;
      streams.watchPair(market.symbol, interval, market.marketType);
      chart.load(selectedSymbol, interval, market.marketType).catch((error) => notify(error.message));
    }
  }

  async function fetchJson(url) {
    const response = await fetch(url, {headers: {Accept: "application/json"}});
    if (!response.ok) {
      const retryAfter = response.headers.get("Retry-After");
      const waitMessage = retryAfter ? ` Coba lagi setelah ${retryAfter} detik.` : "";
      throw new Error(`Permintaan Binance gagal (${response.status}).${waitMessage}`);
    }
    const usedWeight = response.headers.get("X-MBX-USED-WEIGHT-1M");
    if (usedWeight) console.info(`Binance request weight digunakan: ${usedWeight}/menit`);
    return response.json();
  }

  async function initializeMarkets() {
    els.marketState.textContent = "MEMUAT DATA";
    try {
      const load = async (marketType) => {
        const base = API_BASE[marketType];
        const [exchangeInfo, tickers] = await Promise.all([
          fetchJson(`${base}/exchangeInfo`),
          fetchJson(`${base}/ticker/24hr`)
        ]);
        screener.setMarkets(exchangeInfo, tickers, marketType);
      };
      await load("USD_M");
      try {
        await load("COIN_M");
      } catch (error) {
        console.error("Binance COIN-M tidak tersedia:", error);
        notify(`COIN-M tidak termuat: ${error.message} USDⓈ-M tetap tersedia.`);
      }
      const preferred = screener.markets.has("USD_M:BTCUSDT")
        ? "USD_M:BTCUSDT"
        : screener.markets.keys().next().value;
      if (!preferred) throw new Error("Tidak ada kontrak Binance Futures yang dapat ditampilkan.");
      screener.select(preferred);
      els.lastUpdate.textContent = new Intl.DateTimeFormat("id-ID", {hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false}).format(new Date());
      document.getElementById("market-state").textContent = "DATA SIAP";
      document.getElementById("table-note").textContent = "Ticker USDⓈ-M + COIN-M; metrik detail dihitung untuk kontrak terpilih.";
    } catch (error) {
      els.marketState.textContent = "GAGAL MEMUAT";
      const cell = document.createElement("td");
      cell.colSpan = 8;
      cell.className = "empty-state";
      cell.textContent = `${error.message} `;
      const retry = document.createElement("button");
      retry.className = "retry-button";
      retry.textContent = "COBA LAGI";
      retry.addEventListener("click", initializeMarkets, {once: true});
      cell.append(retry);
      const row = document.createElement("tr");
      row.append(cell);
      document.getElementById("screener-rows").replaceChildren(row);
      notify(`${error.message} Pastikan Binance dapat diakses dari browser dan halaman dibuka melalui localhost/HTTPS.`);
    }
  }

  function updateTickerPulse(tickers) {
    if (!Array.isArray(tickers) || !tickers.length) return;
    const now = new Date();
    els.lastUpdate.textContent = new Intl.DateTimeFormat("id-ID", {hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false}).format(now);
    updateSelectedTicker();
  }

  function handleTrade(trade, marketType) {
    const selectedMarket = screener.markets.get(selectedSymbol);
    if (!selectedMarket || selectedMarket.marketType !== marketType || trade.s !== selectedMarket.symbol) return;
    const price = Number(trade.p);
    const quantity = Number(trade.q);
    const notional = marketType === "COIN_M" ? quantity * selectedMarket.contractSize : price * quantity;
    flowTrades.push({
      time: Number(trade.T) || Date.now(),
      quantity: notional,
      buy: !trade.m,
      whale: notional >= WHALE_NOTIONAL
    });
    flowTrades = flowTrades.filter((item) => item.time >= Date.now() - 60000);
    updateAnalysis({candles: chart.getCandles(), smc: window.SMCDetector.detect(chart.getCandles())});
  }

  function handleDepth(snapshot, marketType) {
    const market = screener.markets.get(selectedSymbol);
    if (!market || market.marketType !== marketType) return;
    depthSnapshot = {bids: snapshot.bids, asks: snapshot.asks};
    const candles = chart.getCandles();
    updateAnalysis({candles, smc: window.SMCDetector.detect(candles)});
  }

  function start() {
    screener = new window.Screener({
      search: els.search, quote: els.quote, signal: els.signal, table: els.table, count: els.count, note: els.note, pairs: els.activePairs
    }, selectPair);
    chart = new window.MarketChart(document.getElementById("price-chart"), {
      onAnalysis: updateAnalysis,
      onStatus: (status) => { document.getElementById("chart-status").textContent = status; },
      onError: (message) => notify(message),
      getMarket: (key) => screener.markets.get(key)
    });
    streams = new window.BinanceStreams({
      onTickers: (tickers, marketType) => {
        screener.updateTickers(tickers, marketType);
        updateTickerPulse(tickers);
      },
      onKline: (kline, marketType) => {
        const market = screener.markets.get(selectedSymbol);
        if (market && market.marketType === marketType && kline.s === market.symbol) chart.updateKline(kline);
      },
      onDepth: handleDepth,
      onTrade: handleTrade,
      onState: (state, error) => {
        if (state === "connected") setConnection("connected");
        else if (state === "error") {
          setConnection("error");
          if (error) console.error("Binance WebSocket:", error);
        } else setConnection("reconnecting");
      }
    });
    document.querySelectorAll("[data-interval]").forEach((button) => {
      button.addEventListener("click", () => setInterval(button.dataset.interval, button));
    });
    window.addEventListener("beforeunload", () => {
      streams.stop();
      chart.destroy();
    });
    streams.start();
    initializeMarkets();
  }

  document.addEventListener("DOMContentLoaded", start);
})();
