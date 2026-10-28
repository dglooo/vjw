# Audio capture feasibility on macOS (ad-hoc research)

## TL;DR
- Browser-only works on macOS. Chrome/Edge capture **tab audio**, and Chrome 141+ on macOS 14.2+ also captures **system audio**, both via `getDisplayMedia`. Firefox and Safari return **no audio** from `getDisplayMedia`.
- Works in every browser: `getUserMedia` on a USB interface or a loopback device (BlackHole/Loopback). Chrome/Firefox can turn off all voice processing; Safari can turn off only echoCancellation and records mono only.
- `<audio>` streams without CORS give silence (the spec requires it). Safari's native HLS gives silence to Web Audio with or without CORS (bug open since 2017).
- DRM tabs (Spotify/Apple Music): the spec lets browsers hide protected audio from Web Audio. Whether Chrome tab capture of a Spotify tab gives real data is ⚠️ unverified and needs a spike.
- Desktop: Electron 39+ captures system audio through a CoreAudio tap (macOS 14.2+); if permission is missing it gives silence with no error. Tauri runs on WKWebView, so it needs a custom native plugin; no maintained one was found.

## Freshness
2026-10-27. Host: macOS 26 / Darwin 25. Checked live today: MDN browser-compat-data `main`, Electron docs `main`, Chromium commit ad17e8f (2025-09-30), Mozilla bug 1541425 (changed 2026-10-14), WebKit bugs 180696 (2026-06-19) and 227388, addpipe posts (2026-02-19, 2026-05-28). Nothing was tested in a browser. Current stable version numbers are ⚠️ unverified.

## §1 getUserMedia: device selection and clean signal
- `enumerateDevices` exposes deviceIds and labels only after a capture permission has been granted. https://developer.chrome.com/blog/media-devices/
- Loopback drivers are ordinary input devices. BlackHole: "pass audio to other applications with zero additional latency"; GPLv3; 2–256 channel builds. https://github.com/ExistentialAudio/BlackHole. Electron's docs name BlackHole + `getUserMedia` as the macOS system-audio route. https://github.com/electron/electron/blob/main/docs/api/desktop-capturer.md. Rogue Amoeba Loopback: ⚠️ unverified (same mechanism assumed).
- Constraint support (BCD, `applyConstraints.*_constraint`): echoCancellation in Chrome 59, Firefox 50, Safari 11. noiseSuppression and autoGainControl in Chrome 67 and Firefox 55; **not in Safari**. channelCount in Chrome 59; **not in Firefox or Safari** (webkit.org/b/169871 still NEW). https://github.com/mdn/browser-compat-data/blob/main/api/MediaStreamTrack.json
- Stereo: Chrome gave true stereo only with EC, NS and AGC all off. Safari "currently supports only 1-channel audio". addpipe says Firefox supports channelCount, which conflicts with BCD (⚠️). https://blog.addpipe.com/recording-true-stereo-audio-using-getusermedia/. Safari quirk: with EC off, a mono device returns 2 channels, with audio on the left only. https://bugs.webkit.org/show_bug.cgi?id=281978
- Implication: line-in and loopback devices work in every browser. Clean stereo needs Chrome or Firefox.

## §2 getDisplayMedia with audio
- Spec: `video:false` is rejected with a TypeError, so video must always be requested. Audio is optional and the returned stream may have no audio track. https://w3c.github.io/mediacapture-screen-share/ and https://developer.mozilla.org/en-US/docs/Web/API/Screen_Capture_API/Using_Screen_Capture
- Chrome/Edge: tab audio since 74. The BCD note still says "macOS: tab only". Options: `systemAudio` since 105, `windowAudio` since 141 (partial). https://github.com/mdn/browser-compat-data/blob/main/api/MediaDevices.json
- Chrome on macOS: a manual test found the system-audio toggle from Chrome 141 on macOS 14.2+, for both window and screen shares. https://blog.addpipe.com/getdisplaymedia-allows-capturing-the-screen-with-system-sounds-on-chrome-on-macos/. Chromium switched on CoreAudio-tap loopback by default (`MacCatapLoopbackAudioForScreenShare`, together with `GetDisplayMediaIgnoreAudioPermissionFailures`). https://chromium.googlesource.com/chromium/src/+/ad17e8f8b93d5f34891b06085d373a668918255e
- Firefox: no audio. Bug 1541425 "Implement audio capture for getDisplayMedia" is still NEW. https://bugzilla.mozilla.org/show_bug.cgi?id=1541425. Safari: has `getDisplayMedia` (13+), but `audio_capture_support` is false (BCD, above).
- Implication: tab and system audio capture only work in Chromium. Firefox and Safari users need the §1 route.

## §3 DRM (Spotify / Apple Music / YouTube)
- EME §7.6 (non-normative): media processed by a CDM "MAY be unavailable" to MediaElementAudioSourceNode, and the node "MAY behave as if no media data was present". https://w3c.github.io/encrypted-media/
- Safari: FairPlay HLS → Web Audio has no effect. The reporter says "Chrome works". Bug still NEW. https://bugs.webkit.org/show_bug.cgi?id=227388. Firefox throws on `captureStream()` of encrypted media. https://lists.w3.org/Archives/Public/public-webrtc-logs/2026Jan/0003.html
- Chrome tab capture of a Spotify or Apple Music tab feeding an AnalyserNode with real data: ⚠️ unverified, no primary source. Visualizer sites advertise it: https://jasperbernaers.com/music-visualizer/. Regular (non-DRM) YouTube is not affected by EME.
- Implication: test "visualize a Spotify tab" in a spike before the design depends on it.

## §4 Network streams via `<audio>` + MediaElementAudioSourceNode
- The spec says the node "MUST output silence" when the resource is CORS-cross-origin. It needs `crossorigin="anonymous"` plus `Access-Control-Allow-Origin` from the server. https://webaudio.github.io/web-audio-api/#MediaElementAudioSourceOptions-security
- Icecast 2.5.0 ships CORS headers in its default config; 2.4.x needs a manual `<http-headers>` entry. https://wiki.xiph.org/Icecast_Server/Custom_HTTP_Headers and https://fossies.org/linux/icecast/win32/icecast.xml. Shoutcast: ⚠️ unverified.
- Safari native HLS gives zeros to `createMediaElementSource`. Workaround: an MSE player (hls.js or Shaka). https://bugs.webkit.org/show_bug.cgi?id=180696
- Implication: stations without CORS headers need a proxy, which means a server component.

## §5 Desktop shells
- Electron: the handler accepts `audio: 'loopback' | 'loopbackWithMute'`. `session.md` still says this works on "Windows only", which is stale next to `desktop-capturer.md`. https://github.com/electron/electron/blob/main/docs/api/session.md
- Electron desktopCapturer docs, macOS:
  - Electron 39+ uses a CoreAudio tap on macOS 14.2+.
  - Needs `NSAudioCaptureUsageDescription` in Info.plist; when running unpackaged, the terminal/IDE needs the permission instead.
  - If the permission is denied, the audio track starts `ended` and no error is raised.
  - The opt-out flag was removed in Electron 45.
  - Screen video needs Screen Recording consent (macOS 10.15+).
  - https://www.electronjs.org/docs/latest/api/desktop-capturer
- Apple: `AudioHardwareCreateProcessTap` requires macOS 14.2+ and `NSAudioCaptureUsageDescription`; macOS shows a "system audio recording" prompt on first use. https://developer.apple.com/documentation/coreaudio/capturing-system-audio-with-core-audio-taps. ScreenCaptureKit audio requires macOS 13+ and Screen Recording permission; Rust crate `screencapturekit` 11.1.1. https://docs.rs/screencapturekit/latest/screencapturekit/
- Tauri runs on WKWebView on macOS, so it has Safari's capture limits. https://tauri.app/reference/webview-versions/. `tauri-plugin-system-audio` 0.1.1 is microphone-only on macOS. https://docs.rs/tauri-plugin-system-audio
- Implication: Electron gives the same capability as Chrome without the picker. Tauri needs custom Rust code plus IPC.

## §6 Analysis latency
- The AnalyserNode uses the most recent `fftSize` frames. Smoothing is `τ·prev + (1−τ)·current` and is applied on each `get*FrequencyData` call; calls in the same render quantum return the same data. https://webaudio.github.io/web-audio-api/#AnalyserNode. Derived from this: a 2048-frame window at 48 kHz spans 42.7 ms; τ=0.8 read at 60 fps lags about 75 ms.
- `latencyHint`: the default `"interactive"` gives the "lowest latency without glitching"; `"balanced"` and `"playback"` trade latency for power; a value in seconds is also accepted (§1.2, URL above).
- Measured on a 2016 MacBook Pro, macOS 11.1, in 2021, speaker to mic: Chrome about 67 ms and Firefox about 55 ms with defaults; about 19 ms and 14 ms with `latencyHint:0` and EC/NS/AGC off. https://www.jefftk.com/p/browser-audio-latency. No measurements found for macOS 26 or current browsers (⚠️).
- Implication: the FFT window and smoothing add more lag than capture does. Both are settings we control.
