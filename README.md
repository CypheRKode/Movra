# Movra PWA

Movra ialah PWA mobile-first untuk rider, runner dan dispatch yang mahu treat kerja harian macam business.

Tagline cadangan:
**Every Move Counts.**

## Fungsi utama
- Start Shift / End Shift
- Job entry: fare, tip, pickup, drop, KM, masa job
- Operating cost: minyak, makan, parking/tol, maintenance, telefon/data, motor fund, lain-lain
- Preview Job Meter sebelum simpan job
- Job Meter untuk setiap job
- Daily Shift Meter selepas End Shift
- Dashboard target RM3k / RM4k
- Export CSV termasuk score job
- Offline-first PWA
- Homescreen icon, favicon dan manifest sudah siap

## Formula ringkas meter
Job Meter kira berdasarkan:
- RM per KM
- RM per hour
- total fare/tip

Shift Meter kira berdasarkan:
- net profit vs target harian
- RM per hour
- average job quality
- cost per KM

## Deploy GitHub Pages
1. Create repo GitHub bernama `movra`.
2. Upload semua file dalam folder ini.
3. Pergi **Settings > Pages**.
4. Source: **Deploy from branch**.
5. Branch: **main**, folder: **root**.
6. Save.

## Nota data
Data disimpan dalam browser device yang sama menggunakan localStorage. Export CSV secara berkala.
