const host = window.location.hostname;
const copyEvents = ["contextmenu", "copy", "cut", "paste", "selectstart", "mousedown", "mouseup"];
const stopBlockedEvent = (e) => e.stopImmediatePropagation();
let cookieObserver = null;
let cookieScanTimer = null;

const hideCookieElement = (el) => {
  if (!el || el.dataset?.aioCookieHidden === "1") return;
  el.dataset.aioCookieHidden = "1";
  el.setAttribute("aria-hidden", "true");
  el.style.setProperty("display", "none", "important");
  el.style.setProperty("visibility", "hidden", "important");
  el.style.setProperty("pointer-events", "none", "important");
};

const getEffectiveVolume = (res) => {
  const siteRaw = Number(res[host + "_vol"]);
  if (Number.isFinite(siteRaw)) return siteRaw;

  const globalRaw = Number(res.global_vol);
  if (Number.isFinite(globalRaw)) return globalRaw;

  return 100;
};

const applyMasterVolume = (rawValue) => {
  const safeRaw = Number.isFinite(Number(rawValue)) ? Number(rawValue) : 100;
  const clampedRaw = Math.max(0, Math.min(safeRaw, 1000));
  const multiplier = Math.max(0, clampedRaw / 100);
  const gainValue = clampedRaw > 100 ? Math.max(1, Math.min(clampedRaw / 100, 10)) : 1;

  try {
    if (!window.aioBaseMediaVolumes) {
      window.aioBaseMediaVolumes = new WeakMap();
    }

    const ensureBaseline = (media) => {
      if (!window.aioBaseMediaVolumes.has(media)) {
        const initialVol = Number.isFinite(media.volume) ? media.volume : 1;
        const safeInitial = Math.max(0, Math.min(initialVol, 1));
        window.aioBaseMediaVolumes.set(media, safeInitial);
      }

      if (!media.aioVolBaselineListenerAttached) {
        media.aioVolBaselineListenerAttached = true;
        media.addEventListener("volumechange", () => {
          if (window.aioVolInternalWrite) return;
          if (window.aioCurrentRawVolume !== 100) return;
          const liveVol = Number(media.volume);
          if (!Number.isFinite(liveVol)) return;
          window.aioBaseMediaVolumes.set(media, Math.max(0, Math.min(liveVol, 1)));
        }, true);
      }

      return window.aioBaseMediaVolumes.get(media);
    };

    window.aioCurrentRawVolume = clampedRaw;
    window.aioVolInternalWrite = true;
    document.querySelectorAll("audio, video").forEach((media) => {
      try {
        const baseVol = ensureBaseline(media);
        const targetVol = clampedRaw > 100 ? baseVol : Math.max(0, Math.min(baseVol * multiplier, 1));
        media.volume = targetVol;
      } catch (e) {
        // Ignore element-level failures.
      }
    });
    window.aioVolInternalWrite = false;

    // In regular range, do not initialize/resume WebAudio context.
    if (clampedRaw <= 100) {
      if (window.aioVolObserver) {
        window.aioVolObserver.disconnect();
        window.aioVolObserver = null;
      }
      if (window.aioVolGain) window.aioVolGain.gain.value = 1;
      return;
    }

    if (!window.aioVolCtx) {
      window.aioVolCtx = new (window.AudioContext || window.webkitAudioContext)();
      window.aioVolGain = window.aioVolCtx.createGain();
      window.aioVolGain.connect(window.aioVolCtx.destination);
      window.aioConnectedMedias = new Set();
    }

    const registerUnlock = () => {
      if (window.aioVolUnlockRegistered) return;
      window.aioVolUnlockRegistered = true;

      const unlock = () => {
        if (window.aioVolCtx && window.aioVolCtx.state === "suspended") {
          window.aioVolCtx.resume().catch(() => { });
        }
        window.aioVolUnlockRegistered = false;
      };

      document.addEventListener("pointerdown", unlock, { once: true, capture: true });
      document.addEventListener("keydown", unlock, { once: true, capture: true });
      document.addEventListener("touchstart", unlock, { once: true, capture: true });
    };

    if (window.aioVolCtx.state === "suspended") {
      registerUnlock();
    }

    window.aioVolGain.gain.value = gainValue;

    const connectAllMedia = () => {
      document.querySelectorAll("audio, video").forEach((media) => {
        if (window.aioConnectedMedias.has(media)) return;
        try {
          const source = window.aioVolCtx.createMediaElementSource(media);
          source.connect(window.aioVolGain);
          window.aioConnectedMedias.add(media);
        } catch (e) {
          // Element can fail if already wired by browser/page internals.
        }
      });
    };

    connectAllMedia();

    if (!window.aioVolObserver && document.documentElement) {
      window.aioVolObserver = new MutationObserver(connectAllMedia);
      window.aioVolObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
  } catch (e) {
    window.aioVolInternalWrite = false;
    try {
      document.querySelectorAll("audio, video").forEach((media) => {
        media.volume = Math.max(0, Math.min(media.volume * multiplier, 1));
      });
    } catch (_) { }
  }
};

const syncVolumeFromStorage = () => {
  chrome.storage.local.get(["ytToggle", "global_vol", host + "_vol"], (res) => {
    if (!res.ytToggle) {
      applyMasterVolume(100);
      return;
    }

    applyMasterVolume(getEffectiveVolume(res));
  });
};

// Funkcija za Dark Mode preko CSS injekcije (najbrži i najčistiji način)
const applyDark = (on) => {
  let style = document.getElementById("aio-dark-style");
  let transitionStyle = document.getElementById("aio-dark-transition");
  const isDarkAlreadyActive = !!style;

  if (on) {
    // Ako je već active, ne radi ništa (duplo-zaštita)
    if (isDarkAlreadyActive) return;

    // Provera da li je sajt već u dark modu
    let isSiteAlreadyDark = false;
    const html = document.documentElement;

    // Eksplicitne dark mode klase/atributi
    if (html.classList.contains('dark') ||
      html.getAttribute('data-theme') === 'dark' ||
      document.body.classList.contains('dark-mode') ||
      html.getAttribute('data-color-mode') === 'dark') {
      isSiteAlreadyDark = true;
    } else {
      // Probaj da detektuješ background boju sa fallback opcijama
      let bgColor = null;
      let elements = [document.body, html, document.documentElement, document.querySelector('main'), document.querySelector('[role="application"]')];

      for (let el of elements) {
        if (!el) continue;
        let bg = window.getComputedStyle(el).backgroundColor;
        if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== '') {
          bgColor = bg;
          break;
        }
      }

      // Ako nije pronašao nigdje, koristi bijelu kao fallback (za light sajtove)
      if (!bgColor) {
        bgColor = 'rgb(255, 255, 255)'; // Pretpostavi bijelu stranicu
      }

      const rgb = bgColor.match(/\d+/g);
      if (rgb && rgb.length >= 3) {
        // Luminocity formula (ITU-R BT.601)
        const luma = 0.299 * parseInt(rgb[0]) + 0.587 * parseInt(rgb[1]) + 0.114 * parseInt(rgb[2]);
        if (luma < 128) isSiteAlreadyDark = true;
      }
    }

    // Ako je site vec dark, ne primenjuj filter
    if (isSiteAlreadyDark) return;

    // Dodaj transition za smooth prelaz
    if (!transitionStyle) {
      transitionStyle = document.createElement("style");
      transitionStyle.id = "aio-dark-transition";
      transitionStyle.innerHTML = `
        * { transition: filter 0.4s ease, background-color 0.4s ease !important; }
      `;
      (document.head || document.documentElement).appendChild(transitionStyle);
    }

    if (!style) {
      style = document.createElement("style");
      style.id = "aio-dark-style";
      style.innerHTML = `
        html { filter: invert(1) hue-rotate(180deg) !important; background: #fff; }
        img, video, iframe, canvas { filter: invert(1) hue-rotate(180deg) !important; }
      `;
      (document.head || document.documentElement).appendChild(style);
    }
  } else {
    if (style) style.remove();
    if (transitionStyle) transitionStyle.remove();
  }
};

// Funkcija za Enable Copy
const enableCopy = () => {
  if (window.aioCopyEnabled) return;
  window.aioCopyEnabled = true;

  copyEvents.forEach(type => {
    document.addEventListener(type, stopBlockedEvent, true);
  });

  if (!document.getElementById("force-copy-fix")) {
    const s = document.createElement("style");
    s.id = "force-copy-fix";
    s.innerHTML = "*{user-select:text!important;-webkit-user-select:text!important;}";
    document.documentElement.appendChild(s);
  }
};

const disableCopy = () => {
  if (!window.aioCopyEnabled) return;
  window.aioCopyEnabled = false;

  copyEvents.forEach(type => {
    document.removeEventListener(type, stopBlockedEvent, true);
  });

  const style = document.getElementById("force-copy-fix");
  if (style) style.remove();
};

// Inicijalna provera pri učitavanju stranice
const initializeFeatures = () => {
  chrome.storage.local.get([host, "nightToggle", "ytToggle", "global_vol", host + "_vol"], (res) => {
    if (res.nightToggle) applyDark(true);

    if (res[host]) {
      enableCopy();
    } else {
      disableCopy();
    }

    if (res.ytToggle) {
      applyMasterVolume(getEffectiveVolume(res));
    }
  });
};

// Pokreni kad je DOM spreman
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeFeatures);
} else {
  initializeFeatures();
}

// Slušanje promena u realnom vremenu (da odmah reaguje na klik u popupu)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.nightToggle !== undefined) {
    applyDark(changes.nightToggle.newValue);
  }

  if (changes[host] !== undefined) {
    if (changes[host].newValue) enableCopy();
    else disableCopy();
  }

  if (changes.cookieBlock !== undefined) {
    if (changes.cookieBlock.newValue) enableCookieBlock();
    else disableCookieBlock();
  }

  if (changes.ytToggle !== undefined || changes.global_vol !== undefined || changes[host + "_vol"] !== undefined) {
    syncVolumeFromStorage();
  }
});

const killCookies = () => {
  const selectors = [
    '[id*="cookie"]', '[class*="cookie"]',
    '[id*="consent"]', '[class*="consent"]',
    '[id*="onetrust"]', '[class*="onetrust"]',
    '[id*="trustarc"]', '[class*="trustarc"]',
    '[id*="gdpr"]', '[class*="gdpr"]',
    '[id*="cmp"]', '[class*="cmp"]',
    '[data-testid*="cookie"]', '[data-testid*="consent"]',
    '[aria-label*="cookie" i]', '[aria-label*="consent" i]',
    '.fc-consent-root', '.qc-cmp2-container', '.qc-cmp2-ui'
  ];

  selectors.forEach((s) => {
    document.querySelectorAll(s).forEach((el) => hideCookieElement(el));
  });

  // Heuristic fallback for banners/modals that use generic class names (example: z-modal style wrappers).
  const textRe = /(cookie|cookies|consent|gdpr|accept all|allow all|cookie settings|privacy settings)/i;
  const actionRe = /(cookie|consent|privacy|settings|onetrust|cmp|gdpr)/i;
  const candidates = document.querySelectorAll('div, section, aside, [role="dialog"], [aria-modal="true"]');

  candidates.forEach((el) => {
    const text = (el.innerText || "").trim();
    if (text.length < 20 || text.length > 3000) return;
    if (!textRe.test(text)) return;

    const style = window.getComputedStyle(el);
    const z = Number.parseInt(style.zIndex || "0", 10);
    const isOverlayLike = style.position === "fixed" || style.position === "sticky" || Number.isFinite(z) && z >= 900;
    if (!isOverlayLike) return;

    const actions = el.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], a');
    if (!actions.length) return;

    const hasCookieAction = Array.from(actions).some((node) => {
      const txt = [
        node.textContent || "",
        node.getAttribute?.("aria-label") || "",
        node.getAttribute?.("data-testid") || ""
      ].join(" ");
      return actionRe.test(txt);
    });

    if (hasCookieAction) {
      hideCookieElement(el);
    }
  });
};

const enableCookieBlock = () => {
  killCookies();

  if (!document.getElementById("aio-cookie-hide-style")) {
    const style = document.createElement("style");
    style.id = "aio-cookie-hide-style";
    style.textContent = `
      [id*="cookie"], [class*="cookie"],
      [id*="consent"], [class*="consent"],
      [id*="onetrust"], [class*="onetrust"],
      [id*="trustarc"], [class*="trustarc"],
      [id*="gdpr"], [class*="gdpr"],
      [data-testid*="cookie"], [data-testid*="consent"] {
        display: none !important;
        visibility: hidden !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  if (cookieObserver) return;

  const scheduleCookieCleanup = () => {
    if (cookieScanTimer) return;
    cookieScanTimer = setTimeout(() => {
      cookieScanTimer = null;
      killCookies();
    }, 120);
  };

  cookieObserver = new MutationObserver(scheduleCookieCleanup);
  cookieObserver.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
};

const disableCookieBlock = () => {
  if (cookieScanTimer) {
    clearTimeout(cookieScanTimer);
    cookieScanTimer = null;
  }

  if (!cookieObserver) return;
  cookieObserver.disconnect();
  cookieObserver = null;

  const style = document.getElementById("aio-cookie-hide-style");
  if (style) style.remove();
};

chrome.storage.local.get("cookieBlock", (res) => {
  const shouldEnable = res.cookieBlock === true;
  if (shouldEnable) enableCookieBlock();
  else disableCookieBlock();
});

// Tracker heartbeat: keeps counting time on long single-tab sessions.
if (window.top === window && location.protocol.startsWith("http")) {
  const TAB_IDLE_LIMIT_MS = 150000;
  const HEARTBEAT_INTERVAL_MS = 5000;
  const MAX_HEARTBEAT_CHUNK_SEC = 5;
  let lastHeartbeatAt = Date.now();
  let lastTabInteractionAt = Date.now();
  let trackerIntervalId = null;
  let leftoverMs = 0;
  let pendingSeconds = 0;

  const isContextInvalidatedError = (err) => {
    const msg = String(err?.message || err || "").toLowerCase();
    return msg.includes("extension context invalidated");
  };

  const stopTrackerHeartbeat = () => {
    if (trackerIntervalId) {
      clearInterval(trackerIntervalId);
      trackerIntervalId = null;
    }
  };

  const safeRuntimeSendMessage = (payload) => {
    if (!chrome?.runtime?.id) return;
    try {
      const maybePromise = chrome.runtime.sendMessage(payload);
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(() => { });
      }
    } catch (_) {
      // Extension context can be invalidated after reload/update.
    }
  };

  const sendHeartbeatSeconds = (totalSeconds) => {
    let remaining = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    while (remaining > 0) {
      const chunk = Math.min(remaining, MAX_HEARTBEAT_CHUNK_SEC);
      safeRuntimeSendMessage({
        action: "tracker_heartbeat",
        domain: location.hostname,
        seconds: chunk
      });
      remaining -= chunk;
    }
  };

  const consumeElapsedSeconds = (elapsedMs) => {
    const safeElapsed = Math.max(0, Math.floor(Number(elapsedMs) || 0));
    const combinedMs = leftoverMs + safeElapsed;
    const wholeSeconds = Math.floor(combinedMs / 1000);
    leftoverMs = combinedMs % 1000;
    return wholeSeconds;
  };

  const flushTrackedTime = (now, maxSeconds = Number.POSITIVE_INFINITY) => {
    const elapsedMs = now - lastHeartbeatAt;
    lastHeartbeatAt = now;
    const wholeSeconds = consumeElapsedSeconds(elapsedMs);
    pendingSeconds += wholeSeconds;
    const boundedSeconds = Math.max(0, Math.min(pendingSeconds, maxSeconds));
    if (boundedSeconds > 0) {
      sendHeartbeatSeconds(boundedSeconds);
      pendingSeconds -= boundedSeconds;
    }
  };

  const markTabInteraction = () => {
    const now = Date.now();
    const wasIdle = now - lastTabInteractionAt > TAB_IDLE_LIMIT_MS;
    lastTabInteractionAt = now;

    if (wasIdle) {
      // Resume cleanly from fresh interaction without creating idle backlog.
      lastHeartbeatAt = now;
    }
  };

  ["pointerdown", "keydown", "wheel", "scroll", "touchstart", "mousemove"].forEach((eventName) => {
    document.addEventListener(eventName, markTabInteraction, { passive: true });
  });

  document.addEventListener("visibilitychange", () => {
    try {
      const now = Date.now();
      if (document.visibilityState === "hidden") {
        flushTrackedTime(now);
      }
      lastHeartbeatAt = now;
      leftoverMs = 0;
      pendingSeconds = 0;
      if (document.visibilityState === "visible") {
        lastTabInteractionAt = now;
      }
    } catch (err) {
      if (isContextInvalidatedError(err)) {
        stopTrackerHeartbeat();
      }
    }
  });

  const sendTrackerHeartbeat = () => {
    try {
      if (document.visibilityState !== "visible") {
        lastHeartbeatAt = Date.now();
        leftoverMs = 0;
        pendingSeconds = 0;
        return;
      }

      const now = Date.now();
      if (now - lastTabInteractionAt > TAB_IDLE_LIMIT_MS) {
        // Count only usage up to the idle threshold, not past it.
        const idleCutoff = lastTabInteractionAt + TAB_IDLE_LIMIT_MS;
        const boundedNow = Math.max(lastHeartbeatAt, Math.min(now, idleCutoff));
        if (boundedNow > lastHeartbeatAt) {
          const boundedElapsedMs = boundedNow - lastHeartbeatAt;
          lastHeartbeatAt = boundedNow;
          const wholeSeconds = consumeElapsedSeconds(boundedElapsedMs);
          if (wholeSeconds > 0) {
            sendHeartbeatSeconds(wholeSeconds);
          }
        }

        lastHeartbeatAt = now;
        leftoverMs = 0;
        pendingSeconds = 0;
        return;
      }

      flushTrackedTime(now, MAX_HEARTBEAT_CHUNK_SEC);
    } catch (err) {
      if (isContextInvalidatedError(err)) {
        stopTrackerHeartbeat();
      }
    }
  };

  // Initial ping + periodic heartbeat while user stays on same tab.
  sendTrackerHeartbeat();
  trackerIntervalId = setInterval(sendTrackerHeartbeat, HEARTBEAT_INTERVAL_MS);

  // Cleanup on page navigation to prevent memory leak
  window.addEventListener("pagehide", () => {
    try {
      flushTrackedTime(Date.now());
    } catch (_) { }
    stopTrackerHeartbeat();
  }, false);

  window.addEventListener("beforeunload", () => {
    try {
      flushTrackedTime(Date.now());
    } catch (_) { }
    stopTrackerHeartbeat();
  }, false);
}