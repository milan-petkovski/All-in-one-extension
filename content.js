const isSystemPage = () => {
  const url = window.location.href;
  return (
    url.startsWith("chrome://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("file://") ||
    url.startsWith("devtools://") ||
    url.startsWith("view-source:")
  );
};

if (isSystemPage()) {
  const style = document.createElement('style');
  style.textContent = `
    html, body {
      background: #181818 !important;
      color: #fff !important;
      margin: 0; padding: 0; height: 100vh; width: 100vw;
      overflow: hidden !important;
    }
    #aio-system-block {
      position: fixed; z-index: 2147483647; top: 0; left: 0; width: 100vw; height: 100vh;
      background: #181818; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-family: 'Segoe UI', Arial, sans-serif; font-size: 2.2rem; letter-spacing: 1px;
    }
    #aio-system-block svg {
      width: 80px; height: 80px; margin-bottom: 32px;
      display: block;
    }
    #aio-system-block small { font-size: 1.1rem; color: #aaa; margin-top: 1.5rem; }
  `;

  try {
    document.head.appendChild(style);
  } catch (e) {
    document.documentElement.appendChild(style);
  }

  const overlay = document.createElement('div');
  overlay.id = 'aio-system-block';
  overlay.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="11" width="18" height="10" rx="2" fill="#222" stroke="#fff"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="#fff"/>
      <circle cx="12" cy="16" r="2" fill="#fff"/>
    </svg>
    <div>Sistemska stranica je blokirana</div>
    <small>Ekstenzije ne mogu raditi na ovim stranicama zbog ograničenja browsera.</small>
  `;

  if (document.body) {
    document.body.innerHTML = '';
    document.body.appendChild(overlay);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      document.body.innerHTML = '';
      document.body.appendChild(overlay);
    });
  }

} else {
  runMainContentScript();
}

function runMainContentScript() {

  function trackEvent(eventName, eventData = {}) {
    try {
      chrome.runtime.sendMessage({
        action: "aio_track_event",
        eventName,
        eventData: {
          ...eventData,
          page_location: location.href,
          page_title: document.title
        }
      });
    } catch (err) {
      // Ignore errors
    }
  }

  // i18n prevod Helper funkcija
  function getI18nMsg(key, defaultText) {
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
      const msg = chrome.i18n.getMessage(key);
      if (msg) return msg;
    }
    return defaultText;
  }

  const host = window.location.hostname;
  const copyEvents = ["contextmenu", "copy", "cut", "paste", "selectstart"];
  const stopBlockedEvent = (e) => e.stopImmediatePropagation();
  let cookieObserver = null;
  let cookieScanTimer = null;

  window.aioMediaCache = window.aioMediaCache || new WeakMap();

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

    if (clampedRaw === 100) {
      if (window.aioVolGain) {
        try {
          window.aioVolGain.gain.setTargetAtTime(1.0, window.aioVolCtx?.currentTime || 0, 0.01);
        } catch (_) { }
      }
      if (window.aioVolObserver) {
        window.aioVolObserver.disconnect();
        window.aioVolObserver = null;
      }
      return;
    }

    try {
      window.aioCurrentRawVolume = clampedRaw;

      if (!window.aioVolCtx) {
        window.aioVolCtx = new (window.AudioContext || window.webkitAudioContext)();
        window.aioVolGain = window.aioVolCtx.createGain();
        window.aioVolGain.connect(window.aioVolCtx.destination);
      }

      if (window.aioVolCtx.state === "suspended") {
        const resume = () => { if (window.aioVolCtx.state === "suspended") window.aioVolCtx.resume(); };
        ["pointerdown", "keydown", "click", "touchstart"].forEach(ev => document.addEventListener(ev, resume, { once: true, capture: true }));
      }

      window.aioVolGain.gain.setTargetAtTime(multiplier, window.aioVolCtx.currentTime, 0.01);

      const connectMedia = () => {
        document.querySelectorAll("audio, video").forEach((media) => {
          if (window.aioMediaCache.has(media)) return;

          try {
            if (media.src && media.src.startsWith('http') && media.readyState === 0) {
              try {
                const url = new URL(media.src);
                if (url.origin !== window.location.origin && !media.crossOrigin) {
                  media.crossOrigin = "anonymous";
                }
              } catch (_) { }
            }

            const source = window.aioVolCtx.createMediaElementSource(media);
            source.connect(window.aioVolGain);
            window.aioMediaCache.set(media, true);
          } catch (e) {
            window.aioMediaCache.set(media, true);
          }
        });
      };

      connectMedia();
      if (!window.aioVolObserver && document.documentElement && clampedRaw !== 100) {
        window.aioVolObserver = new MutationObserver(connectMedia);
        window.aioVolObserver.observe(document.documentElement, { childList: true, subtree: true });
      }
    } catch (e) {
      // Global failure fallback
    }
  };

  const syncVolumeFromStorage = () => {
    chrome.storage.local.get(["ytToggle", "global_vol", host + "_vol"], (res) => {
      applyMasterVolume(getEffectiveVolume(res));
    });
  };

  // Funkcija za Dark Mode
  const applyDark = (on, isToggle = false) => {
    let style = document.getElementById("aio-dark-style");
    let transitionStyle = document.getElementById("aio-dark-transition");
    const isDarkAlreadyActive = !!style;

    if (on) {
      if (isDarkAlreadyActive) return;

      let isSiteAlreadyDark = false;
      const html = document.documentElement;
      const body = document.body;

      const themeAttr = [
        html.getAttribute('data-theme'), html.getAttribute('data-color-mode'),
        html.getAttribute('data-bs-theme'), html.getAttribute('theme'),
        body?.getAttribute('data-theme'), body?.getAttribute('theme')
      ].join(' ').toLowerCase();

      const classStr = ((html.className || "") + " " + (body?.className || "")).toLowerCase();

      if (themeAttr.includes('dark') || classStr.includes('dark') || classStr.includes('night') || themeAttr.includes('night')) {
        isSiteAlreadyDark = true;
      } else {
        let bgColor = null;
        let elements = [body, html, document.querySelector('main'), document.querySelector('[role="application"]'), document.querySelector('#root'), document.querySelector('#__next')];

        for (let el of elements) {
          if (!el) continue;
          let bg = window.getComputedStyle(el).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && bg !== '') {
            bgColor = bg;
            break;
          }
        }

        if (!bgColor) bgColor = 'rgb(255, 255, 255)';

        const rgb = bgColor.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
          const luma = 0.299 * parseInt(rgb[0]) + 0.587 * parseInt(rgb[1]) + 0.114 * parseInt(rgb[2]);
          if (luma < 128) isSiteAlreadyDark = true;
        }
      }

      if (isSiteAlreadyDark) return;

      trackEvent("tamni režim uključen");

      if (isToggle && !transitionStyle) {
        transitionStyle = document.createElement("style");
        transitionStyle.id = "aio-dark-transition";
        transitionStyle.innerHTML = `
        html, body, img, video, iframe, canvas, svg, picture, [style*="background-image"] {
          transition: filter 0.3s ease, background-color 0.3s ease !important;
        }
      `;
        (document.head || document.documentElement).appendChild(transitionStyle);
      }

      if (!style) {
        style = document.createElement("style");
        style.id = "aio-dark-style";
        style.innerHTML = `
        html { 
          filter: invert(1) hue-rotate(180deg) !important; 
          background: #fff !important; 
          color-scheme: dark !important; 
        }
        /* Vracanje slika i videa u normalu */
        img, video, iframe, canvas, svg, picture, [style*="background-image"] { 
          filter: invert(1) hue-rotate(180deg) !important; 
        }
        /* Sprecavanje duplog invertovanja za ugnjezdene elemente */
        img *, video *, iframe *, canvas *, svg *, picture *, [style*="background-image"] * {
          filter: none !important;
        }
      `;
        (document.head || document.documentElement).appendChild(style);
      }
    } else {
      if (isDarkAlreadyActive) {
        trackEvent("tamni režim isključen");
      }
      if (style) style.remove();
      if (transitionStyle) transitionStyle.remove();
    }
  };

  // Funkcija za Enable Copy
  const enableCopy = () => {
    if (window.aioCopyEnabled) return;
    trackEvent("kopiranje omogućeno");
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
    trackEvent("kopiranje onemogućeno");
    window.aioCopyEnabled = false;

    copyEvents.forEach(type => {
      document.removeEventListener(type, stopBlockedEvent, true);
    });

    const style = document.getElementById("force-copy-fix");
    if (style) style.remove();
  };

  let foucStyle = document.createElement("style");
  foucStyle.id = "aio-fouc-style";
  foucStyle.innerHTML = `html { background-color: #121212 !important; } html * { visibility: hidden !important; }`;
  if (document.documentElement) {
    document.documentElement.appendChild(foucStyle);
  }

  const foucHardDeadlineTimer = setTimeout(() => {
    if (foucStyle && foucStyle.parentNode) {
      foucStyle.remove();
      foucStyle = null;
    }
  }, 2500);

  window.aioInitialized = window.aioInitialized || false;

  const initializeFeatures = () => {
    if (window.aioInitialized) return;
    window.aioInitialized = true;

    clearTimeout(foucHardDeadlineTimer);

    chrome.storage.local.get([host, "nightToggle", "ytToggle", "global_vol", host + "_vol"], (res) => {
      if (!res.nightToggle && foucStyle) {
        foucStyle.remove();
        foucStyle = null;
      }

      if (res.nightToggle) {
        if (foucStyle) {
          foucStyle.remove();
          foucStyle = null;
        }
        applyDark(true, false); // isToggle = false, bez animacije za instant ucitavanje
      }

      if (res[host]) {
        enableCopy();
      } else {
        disableCopy();
      }

      applyMasterVolume(getEffectiveVolume(res));
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeFeatures);
    
    setTimeout(() => { if (foucStyle && !window.aioInitialized) initializeFeatures(); }, 800);
  } else {
    initializeFeatures();
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.nightToggle !== undefined) {
      applyDark(changes.nightToggle.newValue, true); // isToggle = true, sa animacijom
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

  let cookieScanDebounceId = null;
  const debouncedCookieScan = () => {
    if (cookieScanDebounceId) clearTimeout(cookieScanDebounceId);
    cookieScanDebounceId = setTimeout(killCookies, 100);
  };

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

    document.querySelectorAll(selectors.join(",")).forEach(hideCookieElement);

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

    let cookieCleanupDebounceId = null;
    const debouncedCookieCleanup = () => {
      if (cookieCleanupDebounceId) clearTimeout(cookieCleanupDebounceId);
      cookieCleanupDebounceId = setTimeout(() => {
        requestAnimationFrame(killCookies);
      }, 150);
    };

    cookieObserver = new MutationObserver(debouncedCookieCleanup);
    cookieObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  };

  const enableCookieBlock = () => {
    trackEvent("kolačići blokirani");
    debouncedCookieScan();
  };

  const disableCookieBlock = () => {
    trackEvent("kolačići dozvoljeni");
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

  let systemIsIdle = false;

  chrome.runtime.onMessage.addListener((request) => {
    if (request?.action === "system_idle") {
      systemIsIdle = true;
    } else if (request?.action === "system_active") {
      systemIsIdle = false;
      if (window.top === window && location.protocol.startsWith("http")) {
      }
    }
  });

  if (window.top === window && location.protocol.startsWith("http")) {
    chrome.runtime.sendMessage({ action: "get_system_idle_state" }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res?.state === 'idle' || res?.state === 'locked') {
        systemIsIdle = true;
      }
    });
  }

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

    const saveToEmergencyBuffer = (domain, seconds) => {
      try {
        chrome.storage.local.get(['tracker_buffer'], (res) => {
          if (chrome.runtime.lastError) return;
          const buffer = (res.tracker_buffer && typeof res.tracker_buffer === 'object' && !Array.isArray(res.tracker_buffer))
            ? res.tracker_buffer : {};
          buffer[domain] = (Number(buffer[domain]) || 0) + seconds;
          chrome.storage.local.set({ tracker_buffer: buffer }).catch(() => { });
        });
      } catch (_) { }
    };

    const sendHeartbeatSeconds = (totalSeconds) => {
      const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
      if (seconds <= 0) return;

      const domain = location.hostname;

      if (chrome?.runtime?.id) {
        try {
          const p = chrome.runtime.sendMessage({
            action: "tracker_heartbeat",
            domain: domain,
            seconds: seconds
          });
          if (p && typeof p.catch === "function") {
            p.catch(() => saveToEmergencyBuffer(domain, seconds));
          }
        } catch (_) {
          saveToEmergencyBuffer(domain, seconds);
        }
      } else {
        saveToEmergencyBuffer(domain, seconds);
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

        if (systemIsIdle) {
          lastHeartbeatAt = Date.now();
          leftoverMs = 0;
          pendingSeconds = 0;
          return;
        }

        const now = Date.now();
        if (now - lastTabInteractionAt > TAB_IDLE_LIMIT_MS) {
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

    sendTrackerHeartbeat();
    trackerIntervalId = setInterval(sendTrackerHeartbeat, HEARTBEAT_INTERVAL_MS);

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

} // kraj runMainContentScript()