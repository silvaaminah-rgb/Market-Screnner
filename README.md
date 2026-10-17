# Bandarmologi Crypto Screener

Screener edukatif Binance Futures, dibuat dengan HTML, CSS, dan JavaScript vanilla. Folder ini adalah proyek mandiri: `index.html` berada langsung di root agar bisa dijalankan lokal atau diterbitkan sebagai root GitHub Pages.

## Menjalankan lokal

Buka `index.html` di browser modern. Jika browser membatasi request lintas origin dari `file://`, jalankan server statis dari folder ini:

```powershell
py -m http.server 8000
```

Kemudian buka <http://localhost:8000/>.

## Membuat repository baru dan menerbitkan ke GitHub Pages

1. Buat repository GitHub baru.
2. Unggah **isi folder ini** ke root repository (jangan unggah folder pembungkus `binance-futures-screener` sebagai satu folder di dalam repository).
3. Pastikan `index.html` terlihat langsung di halaman utama repository.
4. Push ke branch `main` atau `master`.
5. Di repository GitHub, buka **Settings → Pages → Build and deployment** dan pilih **GitHub Actions** sebagai source.
6. Buka tab **Actions** dan tunggu workflow **Deploy screener to GitHub Pages** selesai.
7. Buka URL Pages yang dicantumkan pada hasil deployment, biasanya `https://<akun>.github.io/<nama-repository>/`.

Workflow `.github/workflows/pages.yml` menerbitkan root repository, sehingga halaman tidak berada di subfolder dan URL utama langsung menampilkan screener. Tidak perlu API key, framework, proses build, maupun backend.

## Data dan cakupan pasar

- Mengambil daftar kontrak aktif dan ticker 24 jam dari endpoint publik USDⓈ-M (`fapi.binance.com`) dan COIN-M (`dapi.binance.com`).
- Stream ticker publik memakai `fstream.binance.com` dan `dstream.binance.com`.
- Riwayat candle, depth 20 level, dan transaksi untuk metrik detail hanya diminta untuk kontrak yang sedang dipilih. Ini menghindari polling REST klines untuk semua kontrak.
- Chart memakai widget TradingView publik dengan timeframe 5m, 15m, 1H, dan 1D. Katalog TradingView mungkin tidak memuat setiap kontrak delivery. Widget publik membatasi overlay buatan aplikasi; deteksi SMC disajikan di panel terpisah.
- Skor bandarmologi dan SMC adalah heuristik teknikal, bukan probabilitas keberhasilan atau jaminan profit.

Situs GitHub Pages hanya menyajikan file statis. Browser pengunjung tetap mengakses Binance dan TradingView secara langsung; Pages bukan proxy API. Bila koneksi gagal, periksa pesan error browser dan akses jaringan yang berlaku di wilayah Anda. Jangan gunakan VPN atau proxy untuk menghindari pembatasan hukum maupun ketentuan exchange.

## Batasan request

Endpoint Futures memakai batas request berbobot dan batas WebSocket masing-masing; nilainya dapat berubah. Aplikasi hanya memuat metadata dan ticker sekali ketika dibuka, lalu mengambil satu batch hingga 500 candle untuk kontrak aktif/perubahan timeframe. Jika Binance mengembalikan HTTP 429, hormati `Retry-After` dan jangan mengirim retry berulang. Periksa dokumentasi terbaru [USDⓈ-M REST](https://developers.binance.com/docs/derivatives/usds-margined-futures/general-info), [USDⓈ-M WebSocket](https://developers.binance.com/docs/derivatives/usds-margined-futures/websocket-market-streams), dan dokumentasi [COIN-M](https://developers.binance.com/docs/derivatives/coin-margined-futures).

## Struktur

- `index.html`: halaman root dan layout screener.
- `style.css`: tema terminal gelap dan tampilan responsif.
- `app.js`: pemuatan data Futures, pilihan kontrak, dan pembaruan UI.
- `screener.js`: tabel, pencarian, filter, dan sorting.
- `chart.js`: widget TradingView serta data candle untuk analisis SMC.
- `smc-detector.js`: heuristik BOS, CHoCH, OB, FVG, sweep, dan equal highs/lows.
- `bandarmologi.js`: skor proxy order-book, arus transaksi, spike volume, dan VWAP.
- `websocket-manager.js`: koneksi market stream USDⓈ-M/COIN-M dan stream kontrak terpilih.
