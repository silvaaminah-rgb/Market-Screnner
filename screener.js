(function () {
  "use strict";

  class Screener {
    constructor(elements, onSelect) {
      this.elements = elements;
      this.onSelect = onSelect;
      this.markets = new Map();
      this.analysis = new Map();
      this.quote = elements.quote.value;
      this.search = "";
      this.signal = "ALL";
      this.sortKey = "volume";
      this.sortDirection = -1;
      this.selected = null;
      this.renderTimer = null;
      elements.search.addEventListener("input", () => {
        this.search = elements.search.value.trim().toUpperCase();
        this.render();
      });
      elements.quote.addEventListener("change", () => {
        this.quote = elements.quote.value;
        this.render();
        this.updatePulse();
      });
      elements.signal.addEventListener("change", () => {
        this.signal = elements.signal.value;
        this.render();
      });
      elements.table.addEventListener("click", (event) => {
        const row = event.target.closest("tr[data-market-key]");
        if (row) this.select(row.dataset.marketKey);
      });
      document.querySelectorAll("[data-sort]").forEach((button) => {
        button.addEventListener("click", () => this.sort(button.dataset.sort));
      });
    }

    setMarkets(exchangeInfo, tickers, marketType) {
      const tickerMap = new Map(tickers.map((ticker) => [ticker.symbol, ticker]));
      exchangeInfo.symbols.forEach((market) => {
        if (market.status !== "TRADING" || !tickerMap.has(market.symbol)) return;
        const ticker = tickerMap.get(market.symbol);
        if (market.contractType && market.contractType !== "PERPETUAL" && !market.deliveryDate) return;
        const key = `${marketType}:${market.symbol}`;
        this.markets.set(key, this.fromTicker(market, ticker, marketType, key));
      });
      this.elements.count.textContent = `${this.markets.size.toLocaleString("id-ID")} PAIR`;
      this.elements.pairs.textContent = this.markets.size.toLocaleString("id-ID");
      this.render();
      this.updatePulse();
    }

    fromTicker(market, ticker, marketType, key) {
      return {
        key,
        symbol: market.symbol,
        base: market.baseAsset,
        quote: market.quoteAsset,
        marketType,
        contractType: market.contractType || "PERPETUAL",
        contractSize: Number(market.contractSize) || 1,
        price: Number(ticker.lastPrice),
        change: Number(ticker.priceChangePercent),
        volume: Number(ticker.quoteVolume),
        spike: null,
        score: null,
        smc: "—",
        recommendation: null,
        confidence: null
      };
    }

    updateTickers(tickers, marketType) {
      let changed = false;
      const changedSymbols = [];
      tickers.forEach((ticker) => {
        const row = this.markets.get(`${marketType}:${ticker.s}`);
        if (!row) return;
        const price = Number(ticker.c);
        const change = Number(ticker.P);
        const volume = Number(ticker.q);
        if (price !== row.price || change !== row.change || volume !== row.volume) {
          const significant = row.price > 0 && Math.abs((price - row.price) / row.price) >= 0.0015;
          row.price = price;
          row.change = change;
          row.volume = volume;
          changed = true;
          if (significant) changedSymbols.push(row.key);
        }
      });
      if (changed) {
        this.scheduleRender();
        this.updatePulse();
        changedSymbols.forEach((symbol) => {
          const element = this.elements.table.querySelector(`[data-market-key="${CSS.escape(symbol)}"]`);
          if (element) {
            element.classList.remove("flash");
            void element.offsetWidth;
            element.classList.add("flash");
          }
        });
      }
    }

    setAnalysis(symbol, metrics, smc, combined) {
      const row = this.markets.get(symbol);
      if (!row) return;
      row.spike = metrics.volumeSpike;
      row.score = combined.score;
      row.smc = smc.events[0] ? smc.events[0].type : "—";
      row.recommendation = combined.recommendation;
      row.confidence = combined.confidence;
      this.scheduleRender();
    }

    select(symbol) {
      if (!this.markets.has(symbol)) return;
      this.selected = symbol;
      this.render();
      this.onSelect(symbol);
    }

    sort(key) {
      if (this.sortKey === key) this.sortDirection *= -1;
      else {
        this.sortKey = key;
        this.sortDirection = key === "symbol" || key === "smc" || key === "recommendation" ? 1 : -1;
      }
      document.querySelectorAll("[data-sort] span").forEach((element) => { element.textContent = ""; });
      const indicator = document.querySelector(`[data-sort="${key}"] span`);
      if (indicator) indicator.textContent = this.sortDirection > 0 ? "↑" : "↓";
      this.render();
    }

    scheduleRender() {
      if (this.renderTimer) return;
      this.renderTimer = setTimeout(() => {
        this.renderTimer = null;
        this.render();
      }, 800);
    }

    visibleMarkets() {
      return Array.from(this.markets.values()).filter((row) => {
        const quoteMatch = this.quote === "ALL" || row.quote === this.quote;
        const searchMatch = !this.search || row.symbol.includes(this.search) || row.base.includes(this.search);
        const signalMatch = this.signal === "ALL" || row.recommendation === this.signal;
        return quoteMatch && searchMatch && signalMatch;
      }).sort((a, b) => {
        const left = a[this.sortKey];
        const right = b[this.sortKey];
        if (left === null || left === undefined) return right === null || right === undefined ? a.symbol.localeCompare(b.symbol) : 1;
        if (right === null || right === undefined) return -1;
        if (typeof left === "string") return left.localeCompare(right) * this.sortDirection;
        return (left - right) * this.sortDirection;
      });
    }

    render() {
      const rows = this.visibleMarkets();
      this.elements.count.textContent = `${rows.length.toLocaleString("id-ID")} / ${this.markets.size.toLocaleString("id-ID")} PAIR`;
      const fragment = document.createDocumentFragment();
      rows.forEach((row) => {
        const tr = document.createElement("tr");
        tr.dataset.marketKey = row.key;
        if (row.key === this.selected) tr.classList.add("selected");
        const symbol = document.createElement("td");
        symbol.className = "symbol-cell";
        symbol.append(document.createTextNode(row.base));
        const quote = document.createElement("small");
        quote.textContent = `${row.quote} · ${row.marketType === "COIN_M" ? "COIN-M" : "USDⓈ-M"}`;
        symbol.append(quote);
        tr.append(symbol);
        this.cell(tr, formatPrice(row.price), "align-right");
        this.cell(tr, `${row.change > 0 ? "+" : ""}${row.change.toFixed(2)}%`, `align-right ${row.change > 0 ? "positive" : row.change < 0 ? "negative" : ""}`);
        this.cell(tr, formatCompact(row.volume), "align-right muted-cell");
        this.cell(tr, row.spike === null ? "—" : `${row.spike.toFixed(2)}x`, "align-right muted-cell");
        this.cell(tr, row.score === null ? "—" : `${row.score > 0 ? "+" : ""}${row.score}`, `align-right score ${row.score > 0 ? "positive" : row.score < 0 ? "negative" : ""}`);
        this.cell(tr, row.smc, "muted-cell");
        const recCell = document.createElement("td");
        const chip = document.createElement("span");
        chip.className = `signal-chip ${row.recommendation === "BUY" ? "buy" : row.recommendation === "SELL" ? "sell" : "watch"}`;
        chip.textContent = row.confidence === null
          ? "PILIH PAIR"
          : row.recommendation === "NEUTRAL"
            ? `NETRAL ${row.confidence}%`
            : `WATCH ${row.recommendation} ${row.confidence}%`;
        recCell.append(chip);
        tr.append(recCell);
        fragment.append(tr);
      });
      this.elements.table.replaceChildren(fragment);
      this.elements.note.textContent = rows.some((row) => row.score !== null)
        ? "Skor dan sinyal dihitung hanya untuk pair yang sedang dianalisis."
        : "Pilih pair untuk memuat candle, order book, dan sinyal analisis.";
    }

    cell(row, text, className) {
      const td = document.createElement("td");
      td.className = className;
      td.textContent = text;
      row.append(td);
    }

    updatePulse() {
      const rows = Array.from(this.markets.values()).filter((row) => this.quote === "ALL" || row.quote === this.quote);
      const sorted = rows.slice().sort((a, b) => b.change - a.change);
      const top = sorted[0];
      const bottom = sorted[sorted.length - 1];
      const gainer = document.getElementById("pulse-gainer");
      const loser = document.getElementById("pulse-loser");
      gainer.textContent = top ? `${top.base} ${top.change > 0 ? "+" : ""}${top.change.toFixed(2)}%` : "—";
      loser.textContent = bottom ? `${bottom.base} ${bottom.change.toFixed(2)}%` : "—";
      gainer.className = top && top.change > 0 ? "positive" : "";
      loser.className = bottom && bottom.change < 0 ? "negative" : "";
      document.getElementById("pulse-volume-label").textContent = this.quote === "ALL" ? "VOLUME 24J · QUOTE CAMPUR" : `VOLUME 24J · ${this.quote}`;
      document.getElementById("pulse-volume").textContent = this.quote === "ALL" ? "—" : formatCompact(rows.reduce((sum, row) => sum + row.volume, 0));
      document.getElementById("pulse-pairs").textContent = rows.length.toLocaleString("id-ID");
    }
  }

  function formatPrice(value) {
    if (!Number.isFinite(value)) return "—";
    const decimals = value >= 1000 ? 2 : value >= 1 ? 4 : value >= 0.01 ? 6 : 8;
    return value.toLocaleString("en-US", {minimumFractionDigits: Math.min(decimals, 2), maximumFractionDigits: decimals});
  }

  function formatCompact(value) {
    if (!Number.isFinite(value)) return "—";
    return new Intl.NumberFormat("en-US", {notation: "compact", maximumFractionDigits: 2}).format(value);
  }

  window.Screener = Screener;
  window.ScreenerFormat = {formatPrice, formatCompact};
})();
