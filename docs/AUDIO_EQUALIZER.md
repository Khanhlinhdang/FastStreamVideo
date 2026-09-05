# Equalizer âm thanh trong player (LiveStream)

Tài liệu kỹ thuật ngắn về EQ trên trang xem (`HlsPlayer`), nhằm tăng cảm giác bass/presence kiểu rạp khi xem trên loa/tai nghe thông thường.

## Cách trình duyệt xử lý

Trình duyệt **không** chỉnh EQ bằng CSS hay thuộc tính `<video>`. Cách chuẩn:

1. Tạo `AudioContext` (hoặc `webkitAudioContext`) **sau cử chỉ người dùng** (play / unmute / mở panel EQ) — tránh bị chặn bởi autoplay policy.
2. `createMediaElementSource(video)` — lấy luồng audio từ phần tử `<video>` (chỉ được gọi **một lần** trên mỗi element).
3. Chuỗi `BiquadFilterNode` **10 band** (octave-ish):
   - `lowshelf` — 31 Hz
   - `peaking` — 62 / 125 / 250 / 500 / 1k / 2k / 4k / 8k (Q toàn cục chỉnh được)
   - `highshelf` — 16 kHz
4. `DynamicsCompressorNode` soft limiter chống clipping khi boost bass.
5. `GainNode` preamp/master → `AudioContext.destination`.
6. `AnalyserNode` (fftSize 1024) tap từ master → canvas spectrum bars (tuỳ chọn).

`HTMLMediaElement.volume` và `muted` vẫn ảnh hưởng output của `MediaElementAudioSourceNode`.

Module: `web/src/lib/audioEqualizer.ts` · UI: panel trên `HlsPlayer`.

## Preset “rạp chiếu / cinema”

| Preset | Ý tưởng |
|---|---|
| **Tắt (Flat/Off)** | Bypass — source → master → destination |
| **Rạp chiếu** | Bass/low-shelf + presence mid-high (10 band) |
| **Bass mạnh** | Boost 31–125 Hz rõ, hơi cắt treble |
| **Thoại rõ** | Cắt rumble, nâng 1–4 kHz |
| **Custom** | 10 fader dọc ±12 dB + Q peaking |

Persist key `livestream.audio.eq`: preset, customGains, masterGainDb, peakingQ, spectrumEnabled. Legacy 5-band (`bass`/`lowMid`/…) được migrate sang 10-band khi đọc.

## Giới hạn quan trọng

- **Không** tái tạo được theatrical Atmos / LFE / phòng rạp thật — chỉ EQ stereo trên thiết bị người xem.
- Kết quả phụ thuộc mạnh vào **loa / tai nghe / DSP hệ thống**.
- Autoplay: `AudioContext` thường `suspended` tới khi có user gesture.
- Chỉ **một** `MediaElementSource` mỗi `<video>` — module dùng `WeakMap` để không gọi lại sau remount (React Strict Mode).
- EQ không thay thế encode / loudness chuẩn hóa phía server.

## Xung đột với multi-audio

Selector **Âm thanh** (hls.js `audioTracks`) đổi track trên **cùng** `<video>`. Graph EQ gắn vào element đó nên **vẫn áp dụng sau khi đổi track**. Không tạo `MediaElementSource` mới khi đổi audio track / quality / seek.

Label UI:

- Track selector: **Âm thanh** (giữ nguyên)
- EQ panel: **Equalizer** / tiêu đề “Âm thanh / Equalizer”

## Đã triển khai

- [x] Module `VideoEqualizer` + preset Tắt / Rạp chiếu / Bass mạnh / Thoại rõ / Custom
- [x] Panel 10-band graphic faders, preamp, Q peaking, soft limiter, spectrum canvas
- [x] Persist `localStorage`; khởi tạo `AudioContext` khi play / mở EQ
- [x] Bypass khi Tắt; giữ graph khi đổi quality / seek / audio track
- [x] Ẩn EQ + thông báo nếu Web Audio không hỗ trợ
- [x] Không đụng HoverPreview / `MutedPreviewPlayer`

## Nghiên cứu ReEQ & react-dynamic-equalizer

Nghiên cứu ngày 2026-09-05 — **chỉ lấy ý tưởng / pattern**, reimplement trong codebase StreamSqueeze. Không vendor GPL/copy nguyên repo.

### [addavriance/ReEQ](https://github.com/addavriance/ReEQ) (MIT)

Chrome MV3 extension: React + Web Audio, xử lý audio tab qua OffscreenDocument.

| Khía cạnh | Pattern hữu ích | Áp dụng ở ta |
|---|---|---|
| **Bands** | 11 filter: lowshelf @20 → peaking octave → highshelf @~20k; mỗi band có freq / gain / Q | 10-band graphic (31…16k) gọn hơn cho panel player; Q peaking toàn cục |
| **UI** | Canvas parametric: kéo chấm filter, Shift+kéo chỉnh Q; đường cong response | Không copy canvas parametric; dùng **fader dọc** + double-click reset + slider Q |
| **Web Audio graph** | `preGain → [biquads] → postGain → destination`; skip filter gain=0 khi reconnect; FFT tap sau chain | `source → filters → compressor → master → destination` + analyser tap; bypass path; **không** skip-reconnect mỗi tick (tránh glitch khi kéo slider) |
| **Visualization** | `AnalyserNode` (FFT 2k–8k), float frequency data, vẽ bars/curve ~30fps | Spectrum nhẹ: fftSize 1024, `getByteFrequencyData`, 32 bars log-ish trên canvas |
| **Khác** | Preset import/export, multi-tab, master gain limit | localStorage preset + preamp ±6 dB + soft limiter sẵn có |

### [jsfather/react-dynamic-equalizer](https://github.com/jsfather/react-dynamic-equalizer) (ISC)

Thư viện UI React — **không** gắn Web Audio thật: bars/blocks animate bằng CSS `scaleY` random.

| Khía cạnh | Pattern hữu ích | Áp dụng ở ta |
|---|---|---|
| **Bands / viz** | Nhiều cột, gap, màu theo palette, pause/visible | Spectrum thật từ Analyser (không fake CSS bounce khi đang phát) |
| **Interactivity** | Props `paused` / `visible`; animation config | Toggle **Spectrum** trong panel; RAF dừng khi đóng panel hoặc tắt viz |
| **License** | ISC — an toàn nếu muốn phụ thuộc npm | **Không** cài package: viz của ta cần data audio thật, không decorative-only |

### License-safe checklist

- ReEQ = **MIT**, react-dynamic-equalizer = **ISC** → ý tưởng OK; vẫn **reimplement** để khớp stack HLS/`<video>` và tránh kéo extension code.
- Không copy asset/UI proprietary (Netflix, Ears thương mại, v.v.).
- Không vendoring nguyên source ReEQ vào `web/`.
