const DEFAULT_STREAM_URL = "https://radioinnis-naxinacional.streaming.rs:8622/;stream.nsv";
const audio = new Audio();
let audioCtx = null;
let sfxCompressor = null;
let sfxOutput = null;

function safeRuntimeSendMessage(payload) {
  if (!chrome?.runtime?.id) return;

  try {
    const maybePromise = chrome.runtime.sendMessage(payload);
    if (maybePromise && typeof maybePromise.catch === "function") {
      maybePromise.catch(() => { });
    }
  } catch (_) {
    // Extension context can be reloading/invalidated.
  }
}

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function getSfxOutputNode(ctx) {
  if (!sfxCompressor || !sfxOutput) {
    sfxCompressor = ctx.createDynamicsCompressor();
    sfxCompressor.threshold.setValueAtTime(-20, ctx.currentTime);
    sfxCompressor.knee.setValueAtTime(24, ctx.currentTime);
    sfxCompressor.ratio.setValueAtTime(6, ctx.currentTime);
    sfxCompressor.attack.setValueAtTime(0.004, ctx.currentTime);
    sfxCompressor.release.setValueAtTime(0.16, ctx.currentTime);

    sfxOutput = ctx.createGain();
    sfxOutput.gain.setValueAtTime(1.35, ctx.currentTime);

    sfxCompressor.connect(sfxOutput);
    sfxOutput.connect(ctx.destination);
  }

  return sfxCompressor;
}

function playTone(ctx, cfg) {
  const outputNode = getSfxOutputNode(ctx);
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = cfg.type || 'sine';
  osc.frequency.setValueAtTime(cfg.fromHz, cfg.at);
  if (Number.isFinite(cfg.toHz)) {
    osc.frequency.exponentialRampToValueAtTime(cfg.toHz, cfg.at + cfg.duration);
  }

  if (Number.isFinite(cfg.detune)) {
    osc.detune.setValueAtTime(cfg.detune, cfg.at);
  }

  gain.gain.setValueAtTime(0, cfg.at);
  gain.gain.linearRampToValueAtTime(cfg.peak || 0.12, cfg.at + (cfg.attack || 0.01));
  gain.gain.exponentialRampToValueAtTime(0.0001, cfg.at + cfg.duration);

  osc.connect(gain);
  gain.connect(outputNode);
  osc.start(cfg.at);
  osc.stop(cfg.at + cfg.duration + 0.01);
}

function playSuccessSound(ctx, now) {
  playTone(ctx, {
    type: 'triangle',
    fromHz: 880,
    toHz: 988,
    at: now,
    duration: 0.09,
    attack: 0.006,
    peak: 0.16,
    detune: -2
  });

  playTone(ctx, {
    type: 'sine',
    fromHz: 1174,
    toHz: 1318,
    at: now + 0.055,
    duration: 0.11,
    attack: 0.006,
    peak: 0.14,
    detune: 2
  });
}

function playErrorSound(ctx, now) {
  playTone(ctx, {
    type: 'triangle',
    fromHz: 240,
    toHz: 160,
    at: now,
    duration: 0.16,
    attack: 0.004,
    peak: 0.18,
    detune: -2
  });
}

if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play', () => {
    safeRuntimeSendMessage({ action: "hardwarePlay" });
  });

  navigator.mediaSession.setActionHandler('pause', () => {
    safeRuntimeSendMessage({ action: "hardwarePause" });
  });
}

chrome.runtime.onMessage.addListener((request) => {
  const action = request?.action;

  if (action === "play") {
    const streamUrl = request.url && request.url.trim() ? request.url.trim() : DEFAULT_STREAM_URL;
    audio.src = streamUrl;
    audio.volume = request.volume !== undefined ? request.volume / 100 : 0.12;
    audio.play().catch(() => { });

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        // Koristimo poslate prevode jer chrome.i18n ovde ume da zakaze
        title: request.title || 'Radio IN',
        artist: request.artist || 'Pokreće All In One ekstenzija'
      });
    }
  } else if (action === "pause") {
    audio.pause();
    audio.src = "";
    audio.currentTime = 0;
    audio.volume = 0.12;
  } else if (action === "setVolume") {
    audio.volume = Math.max(0, Math.min(1, request.value / 100));
  } else if (action === "playAudio") {
    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") ctx.resume().catch(() => { });
      const now = ctx.currentTime;

      if (request.soundType === "success") {
        playSuccessSound(ctx, now);
      } else if (request.soundType === "error") {
        playErrorSound(ctx, now);
      }
    } catch (err) {
      console.error("playAudio error:", err);
    }
  }
});