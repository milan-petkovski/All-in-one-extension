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

if (!isSystemPage()) {
  runMainContentScript();
}

function runMainContentScript() {

  let contentI18nDict = null;
  async function loadTranslations() {
    try {
      const data = await chrome.storage.local.get(['appLang']);
      const lang = data.appLang || 'sr';
      const res = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
      contentI18nDict = await res.json();
    } catch (e) { }
  }
  loadTranslations();
  // Slušaj ako se jezik promeni u hodu
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.appLang) loadTranslations();
  });

  function getI18nMsg(key, defaultText) {
    if (contentI18nDict && contentI18nDict[key]) {
      return contentI18nDict[key].message;
    }
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
      const msg = chrome.i18n.getMessage(key);
      if (msg) return msg;
    }
    return defaultText || "";
  }

  // --- TOOL ENGINES ---
  function initColorPicker(dataUrl) {
    if (window.aioEyeDropperActive) return;
    window.aioEyeDropperActive = true;

    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement('canvas');
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    img.src = dataUrl;

    let isCleanedUp = false;
    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      overlay.remove();
      magnifier.remove();
      tooltip.remove();
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleEsc);
      window.aioEyeDropperActive = false;
    };

    const handleEsc = (e) => { if (e.key === 'Escape') cleanup(); };
    window.addEventListener('keydown', handleEsc, { once: true });
    document.body.style.overflow = 'hidden';

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483640;cursor:none;background:transparent;';
    document.body.appendChild(overlay);

    const zoom = 9;
    const CELL_SIZE = 12;
    const MAG_SIZE = zoom * CELL_SIZE;

    const magnifier = document.createElement('div');
    magnifier.style.cssText = `width:${MAG_SIZE}px;height:${MAG_SIZE}px;border:2px solid #fff;border-radius:50%;position:fixed;pointer-events:none;z-index:2147483647;overflow:hidden;box-shadow:0 0 0 1px rgba(0,0,0,0.5), 0 10px 25px rgba(0,0,0,0.4);background:#000;display:none;transform:scale(0.8);transition:transform 0.15s cubic-bezier(0.2, 0, 0.2, 1);`;

    const magCanvas = document.createElement('canvas');
    magCanvas.width = MAG_SIZE;
    magCanvas.height = MAG_SIZE;
    const magCtx = magCanvas.getContext('2d');
    magCtx.imageSmoothingEnabled = false;
    magnifier.appendChild(magCanvas);

    const crosshair = document.createElement('div');
    crosshair.style.cssText = `position:absolute;top:50%;left:50%;width:${CELL_SIZE}px;height:${CELL_SIZE}px;transform:translate(-50%, -50%);border:2px solid #ff4444;outline:1px solid #fff;box-sizing:border-box;z-index:10;box-shadow:0 0 8px rgba(255,68,68,0.4);`;
    magnifier.appendChild(crosshair);

    const tooltip = document.createElement('div');
    tooltip.style.cssText = `position:fixed;pointer-events:none;background:rgba(15, 15, 20, 0.85);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:#00ff88;padding:8px 14px;border-radius:12px;font-family:sans-serif;font-size:14px;font-weight:800;border:1px solid rgba(255, 255, 255, 0.1);z-index:2147483647;display:none;box-shadow:0 10px 25px rgba(0,0,0,0.3);align-items:center;gap:8px;`;

    document.body.appendChild(magnifier);
    document.body.appendChild(tooltip);

    requestAnimationFrame(() => {
      magnifier.style.display = 'block';
      magnifier.style.transform = 'scale(1)';
    });

    const rgbToHex = (r, g, b) => "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();

    overlay.onmousemove = (e) => {
      const x = e.clientX, y = e.clientY;
      tooltip.style.display = 'flex';
      magnifier.style.left = (x - MAG_SIZE / 2) + 'px';
      magnifier.style.top = (y - MAG_SIZE / 2) + 'px';
      tooltip.style.left = (x + 20) + 'px';
      tooltip.style.top = (y + 20) + 'px';

      try {
        const physicalX = Math.floor(x * dpr);
        const physicalY = Math.floor(y * dpr);
        const pixel = ctx.getImageData(physicalX, physicalY, 1, 1).data;
        const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
        tooltip.innerHTML = `<div style="width:12px;height:12px;border-radius:50%;background:${hex};border:1px solid rgba(255,255,255,0.2);"></div><span>${hex}</span>`;
        magCtx.clearRect(0, 0, MAG_SIZE, MAG_SIZE);
        const sourceX = physicalX - Math.floor(zoom / 2);
        const sourceY = physicalY - Math.floor(zoom / 2);
        magCtx.drawImage(canvas, sourceX, sourceY, zoom, zoom, 0, 0, MAG_SIZE, MAG_SIZE);
        magCtx.strokeStyle = 'rgba(255,255,255,0.15)';
        magCtx.lineWidth = 0.5;
        magCtx.beginPath();
        for (let i = 0; i <= MAG_SIZE; i += CELL_SIZE) {
          magCtx.moveTo(i, 0); magCtx.lineTo(i, MAG_SIZE);
          magCtx.moveTo(0, i); magCtx.lineTo(MAG_SIZE, i);
        }
        magCtx.stroke();
      } catch (err) { }
    };

    overlay.onclick = async (e) => {
      const x = e.clientX, y = e.clientY;
      try {
        const physicalX = Math.floor(x * dpr);
        const physicalY = Math.floor(y * dpr);
        const pixel = ctx.getImageData(physicalX, physicalY, 1, 1).data;
        const hex = rgbToHex(pixel[0], pixel[1], pixel[2]);
        await navigator.clipboard.writeText(hex);

        const toast = document.createElement('div');
        const copiedMsg = getI18nMsg("colorPickerCopied");
        toast.style.cssText = `position:fixed;bottom:40px;left:50%;transform:translateX(-50%) translateY(20px);background:#16161e;color:#fff;padding:12px 25px;border-radius:12px;font-family:sans-serif;font-weight:bold;border:1px solid ${hex};z-index:2147483647;opacity:0;transition:all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);box-shadow:0 10px 30px rgba(0,0,0,0.5);display:flex;align-items:center;gap:10px;`;
        toast.innerHTML = `<span style="color:#00ff88;">✓</span> ${copiedMsg} <span style="color:#00ff88;font-size:16px;">${hex}</span>`;
        document.body.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; });
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(-50%) translateY(20px)'; setTimeout(() => toast.remove(), 500); }, 2500);
      } catch (err) { }
      cleanup();
    };
  }

  function initRuler() {
    if (document.getElementById("aioRulOv")) return;
    const ov = document.createElement("div");
    const r = document.createElement("div");
    ov.id = "aioRulOv";
    r.id = "aioRul";
    ov.style = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:999998;cursor:crosshair;background:transparent;";
    r.style = "position:fixed;border:1px solid #00ff88;background:rgba(0,255,136,0.1);z-index:999999;pointer-events:none;display:flex;align-items:center;justify-content:center;font-family: 'Inter', sans-serif;box-shadow:0 0 15px rgba(0,255,136,0.2); transition: none;";
    document.body.append(ov, r);
    let sx, sy, drag = false;
    let isPointerDown = false;
    let removed = false;
    const esc = (e) => { if (e.key === "Escape") cleanup(); };
    const onGlobalMouseUp = () => {
      if (!isPointerDown) return;
      isPointerDown = false;
      if (!drag) cleanup();
    };
    const cleanup = () => {
      if (removed) return;
      removed = true;
      ov.remove();
      r.remove();
      document.removeEventListener("keydown", esc);
      window.removeEventListener("mouseup", onGlobalMouseUp, true);
    };
    ov.onmousedown = (e) => {
      isPointerDown = true;
      sx = e.clientX; sy = e.clientY;
      drag = false;
      r.style.width = "0px"; r.style.height = "0px";
      r.innerHTML = "";
    };
    ov.onmousemove = (e) => {
      if (isPointerDown && e.buttons === 1) {
        drag = true;
        const w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
        r.style.left = Math.min(e.clientX, sx) + "px";
        r.style.top = Math.min(e.clientY, sy) + "px";
        r.style.width = w + "px"; r.style.height = h + "px";
        r.innerHTML = `
          <div style="background:rgba(0,0,0,0.75); padding:6px 12px; border-radius:8px; color:#00ff88; font-size:14px; font-weight:600; backdrop-filter:blur(4px); border:1px solid rgba(0,255,136,0.3); display:flex; gap:10px; box-shadow:0 4px 15px rgba(0,0,0,0.5);">
            <span><span style="color:#fff; opacity:0.7;">W:</span> ${w}px</span>
            <span style="color:rgba(255,255,255,0.2);">|</span>
            <span><span style="color:#fff; opacity:0.7;">H:</span> ${h}px</span>
          </div>
        `;
      }
    };
    ov.onmouseup = onGlobalMouseUp;
    window.addEventListener("mouseup", onGlobalMouseUp, true);
    document.addEventListener("keydown", esc);
  }

  function initFontFinder() {
    if (window.aioFontFinderActive) return;
    window.aioFontFinderActive = true;
    const styleTag = document.createElement("style");
    styleTag.id = "aio-font-styles";
    styleTag.innerHTML = `
      * { cursor: default !important; }
      .aio-font-tooltip { position: fixed; pointer-events: none; background: #16161e; color: #00ff88; padding: 8px 12px; border-radius: 8px; font-family: 'Inter', sans-serif; font-size: 14px; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.4); border: 1px solid #00ff88; z-index: 2147483647; display: none; }
      .aio-font-toast { position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%) translateY(20px); background: #16161e; color: #00ff88; padding: 15px 25px; border-radius: 12px; font-family: 'Inter', sans-serif; font-size: 16px; font-weight: bold; box-shadow: 0 8px 20px rgba(0,0,0,0.6); border: 1px solid #00ff88; z-index: 2147483647; opacity: 0; transition: opacity 0.3s ease, transform 0.3s ease; text-align: center; }
    `;
    (document.head || document.documentElement).appendChild(styleTag);
    const tooltip = document.createElement("div");
    tooltip.className = "aio-font-tooltip";
    document.body.appendChild(tooltip);
    let currentTarget = null;
    let cleaned = false;
    const getPrimaryFont = (el) => {
      if (!el || !(el instanceof Element)) return "";
      const rawFont = window.getComputedStyle(el).fontFamily || "";
      return rawFont.split(',')[0].replace(/[\'"]/g, '').trim();
    };
    const resolveFontTarget = (startEl) => {
      let node = startEl;
      while (node && node !== document.documentElement) {
        const font = getPrimaryFont(node);
        if (font) return { node, font };
        node = node.parentElement;
      }
      return { node: startEl, font: "Unknown Font" };
    };
    const cleanup = ({ removeStyle = true } = {}) => {
      if (cleaned) return;
      cleaned = true;
      document.removeEventListener("mouseover", mouseOverHandler, true);
      document.removeEventListener("mousemove", mouseMoveHandler, true);
      document.removeEventListener("click", clickHandler, true);
      document.removeEventListener("keydown", escHandler, true);
      window.removeEventListener("beforeunload", unloadHandler, true);
      tooltip.remove();
      if (removeStyle) styleTag.remove();
      window.aioFontFinderActive = false;
    };
    const copyText = async (text) => {
      try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
    };
    const mouseOverHandler = (e) => {
      const result = resolveFontTarget(e.target);
      currentTarget = result.node;
      const cistFont = result.font || "Unknown Font";
      tooltip.style.display = 'block';
      tooltip.innerHTML = "<span style='color: #a0a0a8; font-size: 10px; display: block; margin-bottom: 2px;'>Font:</span>" + cistFont;
    };
    const mouseMoveHandler = (e) => {
      if (tooltip.style.display === 'block') {
        const offset = 15;
        const maxLeft = window.innerWidth - tooltip.offsetWidth - 8;
        const maxTop = window.innerHeight - tooltip.offsetHeight - 8;
        const left = Math.min(e.clientX + offset, Math.max(8, maxLeft));
        const top = Math.min(e.clientY + offset, Math.max(8, maxTop));
        tooltip.style.left = left + "px"; tooltip.style.top = top + "px";
      }
    };
    const clickHandler = async (e) => {
      e.preventDefault(); e.stopPropagation();
      if (!currentTarget) return;
      const cistFont = getPrimaryFont(currentTarget) || "Unknown Font";
      const copied = await copyText(cistFont);
      cleanup({ removeStyle: false });
      const toast = document.createElement("div");
      toast.className = "aio-font-toast";
      const copiedText = getI18nMsg("fontCopied", "Copied!");
      const notCopiedText = getI18nMsg("fontNotCopied", "Not copied");
      toast.innerHTML = `<span style='color: #a0a0a8; font-size: 12px; display: block; margin-bottom: 4px;'>${copied ? copiedText : notCopiedText}</span>${cistFont}`;
      document.body.appendChild(toast);
      requestAnimationFrame(() => { toast.style.opacity = "1"; toast.style.transform = "translateX(-50%) translateY(0)"; });
      setTimeout(() => {
        toast.style.opacity = "0"; toast.style.transform = "translateX(-50%) translateY(20px)";
        setTimeout(() => { toast.remove(); styleTag.remove(); }, 300);
      }, 2500);
    };
    const escHandler = (e) => { if (e.key === "Escape") cleanup(); };
    const unloadHandler = () => cleanup();
    document.addEventListener("mouseover", mouseOverHandler, true);
    document.addEventListener("mousemove", mouseMoveHandler, true);
    document.addEventListener("click", clickHandler, true);
    document.addEventListener("keydown", escHandler, true);
    window.addEventListener("beforeunload", unloadHandler, true);
  }

  // Slušač za poruke iz background/popup-a
  chrome.runtime.onMessage.addListener((request) => {
    if (request.action === "toggleColorPicker") {
      chrome.runtime.sendMessage({ action: "captureTab" }, (response) => {
        if (response && response.ok) {
          initColorPicker(response.dataUrl);
        }
      });
    } else if (request.action === "toggleRuler") {
      initRuler();
    } else if (request.action === "toggleFontFinder") {
      initFontFinder();
    }
  });

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

    debouncedCookieScan();
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
    // --- SHORTCUT ENGINE ---
    let userShortcuts = {};
    chrome.storage.local.get(['user_shortcuts'], (res) => {
      userShortcuts = res.user_shortcuts || {};
    });

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.user_shortcuts) {
        userShortcuts = changes.user_shortcuts.newValue || {};
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

      const key = e.key.toUpperCase();
      for (const [action, shortcutKey] of Object.entries(userShortcuts)) {
        if (key === shortcutKey) {
          e.preventDefault();
          chrome.runtime.sendMessage({ action: "shortcut_triggered", toolAction: action });
          break;
        }
      }
    }, true);
  }

} // kraj runMainContentScript()