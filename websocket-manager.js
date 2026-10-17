(function () {
  "use strict";

  class BinanceStreams {
    constructor(handlers) {
      this.handlers = handlers;
      this.tickerSockets = new Map();
      this.detailSocket = null;
      this.detailIntent = null;
      this.reconnectTimers = new Map();
      this.reconnectAttempts = new Map();
      this.closed = false;
    }

    start() {
      this.closed = false;
      this.connectTicker("USD_M");
      this.connectTicker("COIN_M");
    }

    host(marketType) {
      return marketType === "COIN_M" ? "dstream.binance.com" : "fstream.binance.com";
    }

    connectTicker(marketType) {
      if (this.closed) return;
      const host = this.host(marketType);
      this.openSocket(`wss://${host}/ws/!ticker@arr`, `ticker:${marketType}`, (message) => {
        if (Array.isArray(message)) this.handlers.onTickers(message, marketType);
      }, () => this.connectTicker(marketType));
    }

    watchPair(symbol, interval, marketType) {
      this.detailIntent = {symbol: symbol.toLowerCase(), interval, marketType};
      this.clearTimer("detail");
      if (this.detailSocket) {
        const old = this.detailSocket;
        this.detailSocket = null;
        old.onclose = null;
        old.close();
      }
      this.connectDetails();
    }

    connectDetails() {
      if (this.closed || !this.detailIntent) return;
      const {symbol, interval, marketType} = this.detailIntent;
      const streams = [
        `${symbol}@kline_${interval}`,
        `${symbol}@depth20@100ms`,
        `${symbol}@aggTrade`
      ].join("/");
      const url = `wss://${this.host(marketType)}/stream?streams=${streams}`;
      this.openSocket(url, "detailSocket", (message) => {
        if (!message || !message.stream || !message.data) return;
        const payload = message.data;
        if (message.stream.endsWith(`@kline_${interval}`) && payload.k) this.handlers.onKline(payload.k, marketType);
        else if (message.stream.includes("@depth20@") && (payload.b || payload.bids) && (payload.a || payload.asks)) {
          this.handlers.onDepth({bids: payload.bids || payload.b, asks: payload.asks || payload.a}, marketType);
        }
        else if (message.stream.endsWith("@aggTrade")) this.handlers.onTrade(payload, marketType);
      }, () => this.connectDetails());
    }

    openSocket(url, property, onMessage, reconnect) {
      const reconnectKey = property === "detailSocket" ? "detail" : property;
      let socket;
      try {
        socket = new WebSocket(url);
      } catch (error) {
        this.handlers.onState("error", error);
        this.scheduleReconnect(reconnectKey, reconnect);
        return;
      }
      if (property === "detailSocket") this.detailSocket = socket;
      else this.tickerSockets.set(property.slice("ticker:".length), socket);
      socket.onopen = () => {
        this.reconnectAttempts.set(reconnectKey, 0);
        this.handlers.onState("connected");
      };
      socket.onmessage = (event) => {
        try {
          const envelope = JSON.parse(event.data);
          onMessage(envelope);
        } catch (error) {
          this.handlers.onState("error", error);
        }
      };
      socket.onerror = () => this.handlers.onState("error", new Error("Koneksi WebSocket Binance bermasalah."));
      socket.onclose = () => {
        const currentSocket = property === "detailSocket"
          ? this.detailSocket
          : this.tickerSockets.get(property.slice("ticker:".length));
        if (!this.closed && currentSocket === socket) {
          this.handlers.onState("reconnecting");
          this.scheduleReconnect(reconnectKey, reconnect);
        }
      };
    }

    scheduleReconnect(key, callback) {
      const attempts = this.reconnectAttempts.get(key) || 0;
      const delay = Math.min(60000, 2000 * (2 ** attempts)) + Math.random() * 500;
      this.reconnectAttempts.set(key, attempts + 1);
      this.schedule(key, callback, delay);
    }

    schedule(key, callback, delay) {
      this.clearTimer(key);
      const timer = setTimeout(() => {
        this.reconnectTimers.delete(key);
        callback();
      }, delay);
      this.reconnectTimers.set(key, timer);
    }

    clearTimer(key) {
      const timer = this.reconnectTimers.get(key);
      if (timer) clearTimeout(timer);
      this.reconnectTimers.delete(key);
    }

    stop() {
      this.closed = true;
      this.detailIntent = null;
      this.reconnectTimers.forEach((timer) => clearTimeout(timer));
      this.reconnectTimers.clear();
      this.reconnectAttempts.clear();
      [...this.tickerSockets.values(), this.detailSocket].forEach((socket) => {
        if (socket) {
          socket.onclose = null;
          socket.close();
        }
      });
      this.tickerSockets.clear();
      this.detailSocket = null;
    }
  }

  window.BinanceStreams = BinanceStreams;
})();
