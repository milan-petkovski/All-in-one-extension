document.addEventListener("DOMContentLoaded", async () => {
    // --- INICIJALIZACIJA PREVODA ---

    // Universal event tracking function (local + Google Analytics)
    const GA_MEASUREMENT_ID = "G-F52S6J4TZV";
    const GA_API_SECRET = "j09W3gL-TImYVi2ZE7rHxA";
    const GA_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;

    function trackEvent(eventName, eventData = {}) {
        // Local stats (for future UI)
        chrome.storage.local.get(["eventStats"], (res) => {
            const stats = res.eventStats || {};
            stats[eventName] = (stats[eventName] || 0) + 1;
            chrome.storage.local.set({ eventStats: stats });
        });

        // Google Analytics event - šalji poruku background-u
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
    const appLangData = await chrome.storage.local.get(['appLang']);
    const currentLang = appLangData.appLang || 'sr';

    const langSelect = document.getElementById('langSelect');
    if (langSelect) {
        langSelect.value = currentLang;
        langSelect.addEventListener('change', async (e) => {
            await chrome.storage.local.set({ appLang: e.target.value });
            window.location.reload();
        });
    }

    try {
        const res = await fetch(chrome.runtime.getURL(`_locales/${currentLang}/messages.json`));
        window.i18nDict = await res.json();
    } catch (e) {
        console.warn("Prevod nije učitan", e);
    }

    if (window.i18nDict) {
        // 1. Prevod običnog teksta (data-i18n)
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (window.i18nDict[key]) {
                el.textContent = window.i18nDict[key].message;
            }
        });

        // 2. Prevod placeholder-a (data-i18n-placeholder)
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (window.i18nDict[key]) {
                el.setAttribute('placeholder', window.i18nDict[key].message);
            }
        });

        // 3. Prevod tooltips-a / hover teksta (data-i18n-title)
        document.querySelectorAll('[data-i18n-title]').forEach(el => {
            const key = el.getAttribute('data-i18n-title');
            if (window.i18nDict[key]) {
                el.setAttribute('title', window.i18nDict[key].message);
            }
        });
    }
    // -------------------------------

    let tab = null;
    let host = null;
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        tab = tabs?.[0];
        const url = tab?.url || "";

        // Detektuj sistenske stranice (chrome://, chrome-extension://, about:, etc)
        if (url && url.startsWith("http")) {
            try {
                host = new URL(url).hostname;
            } catch (e) {
                host = null;
            }
        }
    } catch (err) {
        console.error("Error querying active tab:", err);
        host = null;
    }

    if (!host) {
        console.log("[SYSTEM PAGE DETECTED]");
        document.body.classList.add("restricted-session");

        const mainView = document.getElementById("mainView");
        const overlay = document.createElement("div");
        overlay.className = "restricted-overlay";
        overlay.innerHTML = `
            <div class="overlay-content">
                <div class="lock-glow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                </div>
                <p>${getI18nMsg("systemPageTitle", "SISTEMSKA STRANICA")}</p>
                <span>${getI18nMsg("systemPageDesc", "Alati za modifikaciju su onemogućeni")}</span>
            </div>
        `;
        mainView.appendChild(overlay);
    }

    //#region DOM ELEMENATI
    const elements = {
        radioBtn: document.getElementById("radioBtn"),
        radioVol: document.getElementById("radioVol"),
        masterVol: document.getElementById("masterVol"),
        volText: document.getElementById("volText"),
        colorBtn: document.getElementById("colorBtn"),
        nightToggle: document.getElementById("nightToggle"),
        copyToggle: document.getElementById("copyToggle"),
        ytToggle: document.getElementById("ytToggle"),
        rulerBtn: document.getElementById("rulerBtn"),
        markerBtn: document.getElementById("markerBtn"),
        screenBtn: document.getElementById("screenBtn"),
        resetVolBtn: document.getElementById("resetVolBtn"),
        clearCacheBtn: document.getElementById("clearCacheBtn"),
        fontBtn: document.getElementById("fontBtn"),
        notesBtn: document.getElementById("notesBtn"),
        trackerBtn: document.getElementById("trackerBtn"),
        counterBtn: document.getElementById("counterBtn"),
        stopwatchBtn: document.getElementById("stopwatchBtn"),
        cookieModal: document.getElementById("cookieModal"),
        cookieToggle: document.getElementById("cookieToggle"),
        confirmClearCache: document.getElementById("confirmClearCache"),
        closeCookieModal: document.getElementById("closeCookieModal"),
    };

    const mainView = document.getElementById("mainView");
    const trackerView = document.getElementById("trackerView");
    const notesView = document.getElementById("notesView");
    const noteArea = document.getElementById("noteArea");
    const saveIndicator = document.getElementById("saveIndicator");
    //#endregion

    //#region INICIJALNO STANJE
    const stateIds = ["nightToggle", "ytToggle"];
    const keysToGet = [...stateIds];

    if (host) {
        keysToGet.push(host);
        keysToGet.push(host + "_vol");
        keysToGet.push("global_vol");
    }

    chrome.storage.local.get(keysToGet, (res) => {
        if (chrome.runtime.lastError) return;

        stateIds.forEach(id => {
            if (elements[id] && res[id] !== undefined) elements[id].checked = res[id];
        });

        if (host) {
            if (elements.copyToggle) elements.copyToggle.checked = Boolean(res[host]);
            const siteVol = Number(res[host + "_vol"]);
            const globalVol = Number(res.global_vol);
            const savedVol = Number.isFinite(siteVol)
                ? siteVol
                : (Number.isFinite(globalVol) ? globalVol : 100);
            if (elements.masterVol) elements.masterVol.value = savedVol;
            if (elements.volText) elements.volText.textContent = savedVol + "%";
        } else {
            // Isključi kontrole koje ne rade na sistemskim stranicama
            if (elements.copyToggle) elements.copyToggle.disabled = true;
            if (elements.masterVol) elements.masterVol.disabled = true;
        }
    });

    elements.copyToggle?.addEventListener("change", () => {
        trackEvent(elements.copyToggle.checked ? "kopiranje omogućeno" : "kopiranje onemogućeno");
        if (host) {
            chrome.storage.local.set({ [host]: elements.copyToggle.checked });
        }
    });

    elements.ytToggle?.addEventListener("change", (e) => {
        const isYtEnabled = e.target.checked;
        trackEvent(isYtEnabled ? "youtube omogućeno" : "youtube onemogućeno");
        chrome.storage.local.set({ ytToggle: isYtEnabled });

        // Auto-apply only for boost mode to avoid overriding site/player volume at 100%.
        if (isYtEnabled && host && elements.masterVol) {
            const currentVol = Number(elements.masterVol.value);
            if (Number.isFinite(currentVol) && currentVol > 100) {
                applyVolume(currentVol);
            }
        }
    });
    //#endregion

    //#region RADIO
    chrome.runtime.sendMessage({ action: "getRadioStatus" }, (response) => {
        if (response && elements.radioBtn) {
            elements.radioBtn.innerText = response.playing ? getI18nMsg("radioPause", "Pause") : getI18nMsg("radioPlay", "Play");
            if (elements.radioVol) elements.radioVol.value = response.volume;
        }
    });

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.playing && elements.radioBtn) {
            const isPlaying = changes.playing.newValue;
            elements.radioBtn.textContent = isPlaying ? getI18nMsg("radioPause", "Pause") : getI18nMsg("radioPlay", "Play");

            if (!isPlaying && elements.radioVol) {
                elements.radioVol.value = 12;
            }
        }
    });

    elements.radioVol?.addEventListener("input", () => {
        const val = parseInt(elements.radioVol.value);
        trackEvent("radio pojačan", { vrednost: val });
        if (elements.radioBtn.textContent === getI18nMsg("radioPause", "Pause")) {
            chrome.runtime.sendMessage({ action: "setRadioVolume", value: val });
        }
    });

    elements.radioVol?.addEventListener("change", () => {
        const val = parseInt(elements.radioVol.value);
        trackEvent("radio utišan", { vrednost: val });
        chrome.storage.local.set({ volume: val });
    });

    elements.radioBtn?.addEventListener("click", () => {
        trackEvent(elements.radioBtn.textContent === getI18nMsg("radioPause", "Pause") ? "radio zatvoren" : "radio otvoren");
        chrome.runtime.sendMessage({ action: "toggleRadio" }, (res) => {
            if (res) {
                elements.radioBtn.textContent = res.playing ? getI18nMsg("radioPause", "Pause") : getI18nMsg("radioPlay", "Play");
                if (!res.playing) elements.radioVol.value = 12;
            }
        });
    });

    // Kreiramo jedan globalni tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'sliderTooltip';
    document.body.appendChild(tooltip);

    const sliders = document.querySelectorAll('.range-slider');

    sliders.forEach(slider => {
        const azuriraj = (e) => {
            const val = slider.value;
            const min = slider.min || 0;
            const max = slider.max || 100;
            const percent = (val - min) / (max - min);

            const rect = slider.getBoundingClientRect();
            const thumbWidth = 12;
            const offset = (rect.width - thumbWidth) * percent;
            const thumbCenter = rect.left + (thumbWidth / 2) + offset;

            // Provera da li je miš blizu centra kružića (unutar 15px levo/desno)
            const isOverThumb = e ? Math.abs(e.clientX - thumbCenter) < 15 : false;

            if (isOverThumb || (e && e.type === 'input')) {
                tooltip.textContent = val + '%';
                tooltip.style.opacity = '1';
                tooltip.style.left = thumbCenter + 'px';
                tooltip.style.top = (rect.top - 30) + 'px'; // Visina tačno 30px
            } else {
                tooltip.style.opacity = '0';
            }
        };

        // Prati pomeranje miša preko slajdera bez klika
        slider.addEventListener('mousemove', azuriraj);

        // Radi dok se pomera (klik i drag)
        slider.addEventListener('input', azuriraj);

        // Sakrij čim miš skroz izađe sa slajdera
        slider.addEventListener('mouseleave', () => {
            tooltip.style.opacity = '0';
        });
    });

    //#endregion

    //#region VOLUME MASTER

    const applyVolume = (val) => {
        if (!host || !tab?.id) return;
        const raw = Number(val);
        const safeRaw = Number.isFinite(raw) ? raw : 100;
        const clampedRaw = Math.max(0, Math.min(safeRaw, 1000));

        // 100% is neutral (current tab volume), below attenuates, above boosts.
        const multiplier = Math.max(0, clampedRaw / 100);
        const gainValue = clampedRaw > 100 ? Math.max(1, Math.min(clampedRaw / 100, 10)) : 1;

        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            world: "MAIN",
            func: (gain, rawLevel, mult) => {
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

                    window.aioCurrentRawVolume = rawLevel;
                    window.aioVolInternalWrite = true;
                    document.querySelectorAll("audio, video").forEach((media) => {
                        try {
                            const baseVol = ensureBaseline(media);
                            const targetVol = rawLevel > 100 ? baseVol : Math.max(0, Math.min(baseVol * mult, 1));
                            media.volume = targetVol;
                        } catch (e) {
                            // Ignore element-level failures.
                        }
                    });
                    window.aioVolInternalWrite = false;

                    // For 0-100 mode, avoid touching AudioContext (prevents autoplay warnings).
                    if (rawLevel <= 100) {
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

                    window.aioVolGain.gain.value = gain;

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
                    // WebAudio can fail on some pages; keep base volume control alive.
                    try {
                        document.querySelectorAll("audio, video").forEach((media) => {
                            media.volume = Math.max(0, Math.min(media.volume * mult, 1));
                        });
                    } catch (_) { }
                    console.error("Vol:", e.message);
                }
            },
            args: [gainValue, clampedRaw, multiplier]
        }).catch((e) => console.error("Volume script error:", e));
    };

    if (host) {
        chrome.storage.local.get([host + "_vol", "global_vol", "ytToggle"], (data) => {
            const siteVol = Number(data[host + "_vol"]);
            const globalVol = Number(data.global_vol);
            const vol = Number.isFinite(siteVol)
                ? siteVol
                : (Number.isFinite(globalVol) ? globalVol : 100);
            if (elements.masterVol) {
                elements.masterVol.value = vol;
                if (elements.volText) elements.volText.textContent = vol + "%";
                // On popup open, apply only when boost is active (>100), otherwise preserve current player volume.
                if (data.ytToggle && vol > 100) {
                    applyVolume(vol);
                }
            }
        });
    }

    elements.masterVol?.addEventListener("input", (e) => {
        const val = e.target.value;
        trackEvent("zvuk pojačan", { vrednost: val });
        if (elements.volText) elements.volText.textContent = val + "%";
        applyVolume(val);
    });

    elements.masterVol?.addEventListener("change", (e) => {
        const val = e.target.value;
        trackEvent("zvuk utišan", { vrednost: val });
        if (host) chrome.storage.local.set({ [host + "_vol"]: val, global_vol: val });
    });

    elements.resetVolBtn?.addEventListener("click", () => {
        trackEvent("zvuk resetovan");
        const vol = 100;
        if (elements.masterVol) {
            elements.masterVol.value = vol;
            if (elements.volText) elements.volText.textContent = vol + "%";

            if (host) chrome.storage.local.set({ [host + "_vol"]: vol, global_vol: vol });

            applyVolume(vol);
        }
    });

    //#endregion

    //#region COLOR PICKER, NIGHT MODE, RULLER, MARKER
    elements.colorBtn?.addEventListener("click", async () => {
        trackEvent("boja izabrana");
        const textSpan = elements.colorBtn.querySelector("span");
        const iconSpan = elements.colorBtn.querySelector(".icon");
        const originalText = getI18nMsg("colorPickerBtn", "Color Picker");

        try {
            textSpan.textContent = getI18nMsg("colorPickerPicking", "Biranje...");
            const ed = new EyeDropper();
            const res = await ed.open();

            const hexColor = res.sRGBHex;
            await navigator.clipboard.writeText(hexColor);

            textSpan.textContent = getI18nMsg("colorPickerCopied", "Kopirano: ") + hexColor;

            const originalIconColor = iconSpan.style.color;
            const originalBorder = elements.colorBtn.style.borderColor;

            iconSpan.style.color = hexColor;
            elements.colorBtn.style.borderColor = hexColor;
            elements.colorBtn.style.boxShadow = `0 0 10px ${hexColor}44`;

            setTimeout(() => {
                textSpan.textContent = originalText;
                iconSpan.style.color = originalIconColor;
                elements.colorBtn.style.borderColor = originalBorder;
                elements.colorBtn.style.boxShadow = "";
            }, 2000);

        } catch (err) {
            textSpan.textContent = originalText;
        }
    });

    elements.nightToggle?.addEventListener("change", (e) => {
        const isNight = e.target.checked;
        trackEvent(isNight ? "tamni režim uključen" : "tamni režim isključen");
        chrome.storage.local.set({ nightToggle: isNight });

        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: (on) => {
                let styleNode = document.getElementById("aio-dark-style");
                let transitionNode = document.getElementById("aio-dark-transition");
                const isDarkAlreadyActive = !!styleNode;

                if (on) {
                    // Duplo-zaštita: ako je već active, ne radi
                    if (isDarkAlreadyActive) return;

                    // Provera: da li je sajt već u dark modu
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

                    // Ako je sajt već dark, ne invertuj
                    if (isSiteAlreadyDark) return;

                    // Dodaj transition za smooth prelaz
                    if (!transitionNode) {
                        transitionNode = document.createElement("style");
                        transitionNode.id = "aio-dark-transition";
                        transitionNode.textContent = `
                            * { transition: filter 0.4s ease, background-color 0.4s ease !important; }
                        `;
                        document.head.appendChild(transitionNode);
                    }

                    if (!styleNode) {
                        styleNode = document.createElement("style");
                        styleNode.id = "aio-dark-style";
                        styleNode.textContent = `
                            html { filter: invert(1) hue-rotate(180deg) !important; background: #fff; }
                            img, video, iframe, canvas { filter: invert(1) hue-rotate(180deg) !important; }
                        `;
                        document.head.appendChild(styleNode);
                    }
                } else {
                    if (styleNode) styleNode.remove();
                    if (transitionNode) transitionNode.remove();
                }
            },
            args: [isNight]
        }).catch((err) => {
            console.error("Dark mode toggle failed:", err);
        });
    });

    elements.rulerBtn?.addEventListener("click", () => {
        trackEvent("lenjir otvoren");
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
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
                    sx = e.clientX;
                    sy = e.clientY;
                    drag = false;
                    r.style.width = "0px";
                    r.style.height = "0px";
                    r.innerHTML = "";
                };
                ov.onmousemove = (e) => {
                    if (isPointerDown && e.buttons === 1) {
                        drag = true;
                        const w = Math.abs(e.clientX - sx), h = Math.abs(e.clientY - sy);
                        r.style.left = Math.min(e.clientX, sx) + "px";
                        r.style.top = Math.min(e.clientY, sy) + "px";
                        r.style.width = w + "px";
                        r.style.height = h + "px";

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
        }, () => {
            if (chrome.runtime.lastError) return;
            window.close();
        });
    });

    elements.markerBtn?.addEventListener("click", () => {
        trackEvent("marker otvoren");
        chrome.storage.local.get(['selectedColor'], (data) => {
            const color = data.selectedColor || "#00ff88";
            chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["marker_engine.js"] }, () => {
                if (chrome.runtime.lastError) return;
                chrome.tabs.sendMessage(tab.id, { action: "initMarkerColor", color });
                window.close();
            });
        });
    });
    //#endregion

    //#region KOLACICI I KES
    const cookieModal = document.getElementById("cookieModal");
    const realClearBtn = document.getElementById("realClearBtn");
    const closeCookieModal = document.getElementById("closeCookieModal");
    const cookieToggle = document.getElementById("cookieToggle");

    elements.clearCacheBtn?.addEventListener("click", (e) => {
        trackEvent("brisanje keša otvoreno");
        e.preventDefault();
        cookieModal.style.display = "flex";
    });

    closeCookieModal?.addEventListener("click", () => {
        trackEvent("brisanje keša zatvoreno");
        cookieModal.style.display = "none";
    });

    realClearBtn?.addEventListener("click", async () => {
        trackEvent("keš obrisan");
        let tab = null;
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            tab = tabs?.[0];
            if (!tab || !tab.url || !tab.url.startsWith("http")) {
                realClearBtn.innerText = getI18nMsg("cacheNotSupported", "Nije podržano");
                setTimeout(() => realClearBtn.innerText = getI18nMsg("cacheClearConfirm", "Obriši sve podatke sa ovog sajta"), 1500);
                return;
            }
        } catch (err) {
            console.error("Tab query error:", err);
            realClearBtn.innerText = getI18nMsg("cacheError", "Greška");
            setTimeout(() => realClearBtn.innerText = getI18nMsg("cacheClearConfirm", "Obriši sve podatke sa ovog sajta"), 1500);
            return;
        }

        const originalText = realClearBtn.innerText;
        realClearBtn.innerText = getI18nMsg("cacheClearing", "Brisanje...");

        chrome.runtime.sendMessage({ action: "clearSiteData", url: tab.url }, (response) => {
            if (chrome.runtime.lastError || !response?.ok) {
                realClearBtn.innerText = getI18nMsg("cacheError", "Greška");
                setTimeout(() => {
                    realClearBtn.innerText = originalText;
                }, 1200);
                return;
            }

            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: async () => {
                    try { sessionStorage.clear(); } catch (_) { }
                    try { localStorage.clear(); } catch (_) { }

                    try {
                        if (window.indexedDB && indexedDB.databases) {
                            const dbs = await indexedDB.databases();
                            await Promise.all((dbs || []).map((db) => new Promise((resolve) => {
                                if (!db?.name) return resolve();
                                try {
                                    const req = indexedDB.deleteDatabase(db.name);
                                    req.onsuccess = () => resolve();
                                    req.onerror = () => resolve();
                                    req.onblocked = () => resolve();
                                } catch (_) {
                                    resolve();
                                }
                            })));
                        }
                    } catch (_) { }

                    try {
                        if (window.caches && caches.keys) {
                            const keys = await caches.keys();
                            await Promise.all(keys.map((key) => caches.delete(key)));
                        }
                    } catch (_) { }

                    try {
                        if (navigator.serviceWorker?.getRegistrations) {
                            const regs = await navigator.serviceWorker.getRegistrations();
                            await Promise.all(regs.map((r) => r.unregister()));
                        }
                    } catch (_) { }
                }
            }).catch(() => { });

            realClearBtn.innerText = getI18nMsg("cacheCleared", "Obrisano!");
            setTimeout(() => {
                realClearBtn.innerText = originalText;
                if (cookieModal) cookieModal.style.display = "none";
                chrome.tabs.reload(tab.id);
            }, 700);
        });
    });

    chrome.storage.local.get(["cookieBlock"], (res) => {
        if (cookieToggle) cookieToggle.checked = res.cookieBlock || false;
    });

    cookieToggle?.addEventListener("change", async (e) => {
        trackEvent(e.target.checked ? "kolačići blokirani" : "kolačići dozvoljeni");
        try {
            const isChecked = e.target.checked;
            await chrome.storage.local.set({ cookieBlock: isChecked });

            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs?.[0];
            if (tab && tab.url && tab.url.startsWith("http")) {
                chrome.tabs.reload(tab.id);
            }
        } catch (err) {
            console.error("Cookie toggle error:", err);
        }
    });
    //#endregion

    //#region FONT PICKER
    if (elements.fontBtn) {
        elements.fontBtn.addEventListener("click", async () => {
            trackEvent("font izabran");
            try {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                const tab = tabs?.[0];
                if (!tab?.id || !tab.url || !tab.url.startsWith("http")) {
                    window.close();
                    return;
                }

                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    func: (copiedText, notCopiedText) => {
                        if (window.aioFontFinderActive) {
                            return;
                        }
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
                            try {
                                await navigator.clipboard.writeText(text);
                                return true;
                            } catch (err) {
                                try {
                                    const ta = document.createElement("textarea");
                                    ta.value = text;
                                    ta.style.position = "fixed";
                                    ta.style.opacity = "0";
                                    ta.style.pointerEvents = "none";
                                    document.body.appendChild(ta);
                                    ta.focus();
                                    ta.select();
                                    const ok = document.execCommand("copy");
                                    ta.remove();
                                    return !!ok;
                                } catch {
                                    return false;
                                }
                            }
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
                                tooltip.style.left = left + "px";
                                tooltip.style.top = top + "px";
                            }
                        };

                        const clickHandler = async (e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            if (!currentTarget) return;

                            const cistFont = getPrimaryFont(currentTarget) || "Unknown Font";

                            const copied = await copyText(cistFont);

                            cleanup({ removeStyle: false });

                            const toast = document.createElement("div");
                            toast.className = "aio-font-toast";
                            toast.innerHTML = `<span style='color: #a0a0a8; font-size: 12px; display: block; margin-bottom: 4px;'>${copied ? copiedText : notCopiedText}</span>${cistFont}`;
                            document.body.appendChild(toast);

                            requestAnimationFrame(() => {
                                toast.style.opacity = "1";
                                toast.style.transform = "translateX(-50%) translateY(0)";
                            });

                            setTimeout(() => {
                                toast.style.opacity = "0";
                                toast.style.transform = "translateX(-50%) translateY(20px)";
                                setTimeout(() => { toast.remove(); styleTag.remove(); }, 300);
                            }, 2500);
                        };

                        const escHandler = (e) => {
                            if (e.key === "Escape") cleanup();
                        };

                        const unloadHandler = () => cleanup();

                        document.addEventListener("mouseover", mouseOverHandler, true);
                        document.addEventListener("mousemove", mouseMoveHandler, true);
                        document.addEventListener("click", clickHandler, true);
                        document.addEventListener("keydown", escHandler, true);
                        window.addEventListener("beforeunload", unloadHandler, true);
                    },
                    args: [getI18nMsg("fontCopied", "Kopirano!"), getI18nMsg("fontNotCopied", "Nije kopirano")]
                });

                // Match previous behavior: close popup while selecting font on page.
                window.close();
            } catch (err) {
                console.error("Font picker error:", err);
            }
        });
    }
    //#endregion

    //#region PAMETNE BELEŠKE
    const clearModal = document.getElementById("clearNotesModal");
    const MAX_NOTES_BYTES = 2 * 1024 * 1024;
    let saveTimeout;
    let notesSaveQueue = Promise.resolve();

    function escapeHtml(str = "") {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function getSafeHttpUrl(rawUrl = "") {
        try {
            const u = new URL(rawUrl);
            return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
        } catch {
            return null;
        }
    }

    function sanitizeNotesHtml(rawHtml = "") {
        const template = document.createElement("template");
        template.innerHTML = rawHtml;

        const allowedTags = new Set(["b", "i", "a", "br", "div", "span", "ul", "ol", "li", "p"]);

        const sanitizeNode = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                return document.createTextNode(node.textContent || "");
            }

            if (node.nodeType !== Node.ELEMENT_NODE) {
                return document.createTextNode("");
            }

            const tag = node.tagName.toLowerCase();
            if (!allowedTags.has(tag)) {
                return document.createTextNode(node.textContent || "");
            }

            const clean = document.createElement(tag);

            if (tag === "a") {
                const safeHref = getSafeHttpUrl(node.getAttribute("href") || "");
                if (safeHref) {
                    clean.setAttribute("href", safeHref);
                    clean.setAttribute("target", "_blank");
                    clean.setAttribute("rel", "noopener noreferrer");
                }
            }

            if (tag === "b") {
                const styleVal = (node.getAttribute("style") || "").replace(/\s+/g, "").toLowerCase();
                if (styleVal === "color:var(--accent);" || styleVal === "color:var(--accent)") {
                    clean.setAttribute("style", "color: var(--accent);");
                }
            }

            Array.from(node.childNodes).forEach((child) => {
                clean.appendChild(sanitizeNode(child));
            });

            return clean;
        };

        const root = document.createElement("div");
        Array.from(template.content.childNodes).forEach((child) => {
            root.appendChild(sanitizeNode(child));
        });

        return root.innerHTML;
    }

    function persistNotesHtml(safeHtml) {
        notesSaveQueue = notesSaveQueue.then(async () => {
            await chrome.storage.local.set({ "mojeBeleske": safeHtml });
        }).catch((err) => {
            console.error("Notes save error:", err);
        });

        return notesSaveQueue;
    }

    function getUtf8ByteLength(value) {
        try {
            return new TextEncoder().encode(String(value || "")).length;
        } catch {
            return unescape(encodeURIComponent(String(value || ""))).length;
        }
    }

    function showSaveIndicator(text = getI18nMsg("notesSaved", "Sačuvano"), isError = false) {
        if (!saveIndicator) return;
        saveIndicator.textContent = text;
        saveIndicator.style.color = isError ? "#ff7a7a" : "var(--accent)";
        saveIndicator.style.opacity = "1";
        setTimeout(() => {
            saveIndicator.style.opacity = "0";
            if (isError) {
                saveIndicator.textContent = getI18nMsg("notesSaved", "Sačuvano");
                saveIndicator.style.color = "var(--accent)";
            }
        }, 1200);
    }

    function saveNotes(immediate = false) {
        const commit = () => {
            const safeHtml = sanitizeNotesHtml(noteArea.innerHTML || "");
            if (noteArea.innerHTML !== safeHtml) {
                noteArea.innerHTML = safeHtml;
            }

            const payloadBytes = getUtf8ByteLength(safeHtml);
            if (payloadBytes > MAX_NOTES_BYTES) {
                showSaveIndicator(getI18nMsg("notesTooLarge", "Prevelika beleška"), true);
                return;
            }

            persistNotesHtml(safeHtml);
            showSaveIndicator();
        };

        clearTimeout(saveTimeout);
        if (immediate) {
            commit();
            return;
        }

        saveTimeout = setTimeout(commit, 300);
    }

    function appendToNotes(content, isHTML = false) {
        noteArea.focus();
        if (isHTML) {
            document.execCommand('insertHTML', false, sanitizeNotesHtml(content));
        } else {
            document.execCommand('insertText', false, content + " ");
        }
        saveNotes();
    }

    // Učitavanje beleški
    chrome.storage.local.get("mojeBeleske", (res) => {
        if (res.mojeBeleske) {
            const safeHtml = sanitizeNotesHtml(res.mojeBeleske);
            noteArea.innerHTML = safeHtml;
            if (safeHtml !== res.mojeBeleske) {
                chrome.storage.local.set({ "mojeBeleske": safeHtml });
            }
        }
    });

    // Navigacija
    document.getElementById("notesBtn")?.addEventListener("click", () => {
        trackEvent("beleške otvorene");
        document.getElementById("mainView").style.display = "none";
        document.getElementById("notesView").style.display = "flex";
        noteArea.focus();
    });

    document.getElementById("backBtn")?.addEventListener("click", () => {
        trackEvent("beleške nazad");
        saveNotes(true);
        document.getElementById("notesView").style.display = "none";
        document.getElementById("mainView").style.display = "block";
    });

    // Modal logika za brisanje
    document.getElementById("notesClearBtn")?.addEventListener("click", () => {
        trackEvent("brisanje beleški otvoreno");
        clearModal.style.display = "flex";
    });

    document.getElementById("cancelClearNotes")?.addEventListener("click", () => {
        trackEvent("brisanje beleški otkazano");
        clearModal.style.display = "none";
    });

    document.getElementById("confirmClearNotes")?.addEventListener("click", () => {
        trackEvent("beleške obrisane");
        noteArea.innerHTML = "";
        chrome.storage.local.set({ "mojeBeleske": "" });
        clearModal.style.display = "none";
    });

    // Pametna logika i kalkulator (FIXED CURSOR)
    noteArea.addEventListener("input", (e) => {
        const calcRegex = /(\d+(?:\.\d+)?)\s*([\+\-\*\/])\s*(\d+(?:\.\d+)?)\s*=(?!\s*<b)/;

        // Proveravamo samo tekstualni sadržaj da ne pokvarimo HTML strukturu
        if (calcRegex.test(noteArea.innerText)) {
            let html = noteArea.innerHTML;
            let newHtml = html.replace(calcRegex, (match, a, op, b) => {
                let n1 = parseFloat(a), n2 = parseFloat(b), r = 0;
                if (op === '+') r = n1 + n2;
                else if (op === '-') r = n1 - n2;
                else if (op === '*') r = n1 * n2;
                else if (op === '/') r = n2 !== 0 ? n1 / n2 : 0;

                r = Math.round(r * 100) / 100;
                return `${match} <b style="color: var(--accent);">${r}</b>&nbsp;`;
            });

            if (html !== newHtml) {
                noteArea.innerHTML = newHtml;
                // Vraćamo kursor na kraj (fokus na contentEditable nakon innerHTML reseta)
                const range = document.createRange();
                const sel = window.getSelection();
                range.selectNodeContents(noteArea);
                range.collapse(false);
                sel.removeAllRanges();
                sel.addRange(range);
            }
        }
        saveNotes();
    });

    noteArea.addEventListener("blur", () => {
        saveNotes(true);
    });

    // Čist paste
    noteArea.addEventListener("paste", (e) => {
        e.preventDefault();
        const text = (e.clipboardData || window.clipboardData).getData("text/plain");
        const currentHtmlBytes = getUtf8ByteLength(noteArea.innerHTML || "");
        const incomingBytes = getUtf8ByteLength(text);
        if (currentHtmlBytes + incomingBytes > MAX_NOTES_BYTES) {
            showSaveIndicator(getI18nMsg("notesTooLarge", "Prevelika beleška"), true);
            return;
        }
        document.execCommand("insertText", false, text);
    });

    // Otvaranje linkova
    noteArea.addEventListener("click", (e) => {
        if (e.target.tagName === "A") {
            e.preventDefault();
            const safeHref = getSafeHttpUrl(e.target.href || "");
            if (safeHref) chrome.tabs.create({ url: safeHref });
        }
    });

    // Akciona dugmad (Grab Text, URL, Date)
    document.getElementById("grabTextBtn")?.addEventListener("click", async () => {
        trackEvent("notes_grab_text");
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs?.[0];
            if (!tab?.url || !tab.url.startsWith("http")) return;

            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => window.getSelection().toString()
            }, (res) => {
                if (res?.[0]?.result) {
                    appendToNotes(`<i>"${escapeHtml(res[0].result.trim())}"</i>`, true);
                }
            });
        } catch (err) {
            console.error("Grab text error:", err);
        }
    });

    document.getElementById("addUrlBtn")?.addEventListener("click", async () => {
        trackEvent("notes_add_url");
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs?.[0];
            if (tab) {
                const safeHref = getSafeHttpUrl(tab.url || "");
                const safeTitle = escapeHtml(tab.title || safeHref || getI18nMsg("notesLinkText", "Link"));
                if (safeHref) appendToNotes(`<a href="${safeHref}">${safeTitle}</a>`, true);
            }
        } catch (err) {
            console.error("Add URL error:", err);
        }
    });

    document.getElementById("addDateBtn")?.addEventListener("click", () => {
        trackEvent("notes_add_date");
        const now = new Date();
        const str = `${now.toLocaleDateString("sr-RS")} ${now.toLocaleTimeString("sr-RS", { hour: '2-digit', minute: '2-digit' })}`;
        appendToNotes(`<b>${str}</b>`, true);
    });

    // EXPORT i IMPORT
    document.getElementById("exportNotesBtn")?.addEventListener("click", () => {
        trackEvent("notes_export");
        const blob = new Blob([noteArea.innerHTML], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `beleske_backup.html`;
        a.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById("importNotesBtn")?.addEventListener("click", () => {
        trackEvent("notes_import_open");
        document.getElementById("importFileInput")?.click();
    });

    document.getElementById("importFileInput")?.addEventListener("change", (e) => {
        trackEvent("notes_import_confirm");
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            noteArea.innerHTML = sanitizeNotesHtml(String(event.target.result || ""));
            saveNotes();
            e.target.value = "";
        };
        reader.readAsText(file);
    });
    //#endregion

    //#region TIME TRACKER
    const trackerList = document.getElementById("trackerList");
    const trackerDate = document.getElementById("trackerDate");
    const trackerMode = document.getElementById("trackerMode");
    const trackerDatePrikaz = document.getElementById("trackerDatePrikaz");
    let trackerRefreshQueue = Promise.resolve();
    let renderStatsDebounceId = null;

    async function forceTrackerTickAndRender() {
        trackerRefreshQueue = trackerRefreshQueue.then(async () => {
            let domain = "";
            try {
                const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (activeTab?.url?.startsWith("http")) {
                    domain = new URL(activeTab.url).hostname;
                }
            } catch {
                domain = "";
            }

            try {
                await chrome.runtime.sendMessage({ action: "tracker_force_tick", domain });
            } catch {
                // Ako background ne odgovori, i dalje osveži prikaz iz storage-a.
            }

            renderStats();
        }).catch((err) => {
            console.error("Tracker refresh error:", err);
        });

        return trackerRefreshQueue;
    }

    function formatTime(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    }

    function debouncedRenderStats() {
        clearTimeout(renderStatsDebounceId);
        renderStatsDebounceId = setTimeout(renderStats, 50);
    }

    function renderStats() {
        chrome.storage.local.get(null, (items) => {
            const today = new Date();
            let selDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            if (trackerDate?.value && typeof trackerDate.value === "string") {
                const parts = trackerDate.value.split('-').map(Number);
                if (parts.length === 3 && parts.every((n) => Number.isFinite(n) && n > 0)) {
                    const [yyyy, mm, dd] = parts;
                    // Validate date bounds
                    if (yyyy >= 2000 && yyyy <= 2100 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
                        selDate = new Date(yyyy, mm - 1, dd);
                    }
                }
            }

            const selKey = `tracker_${selDate.getFullYear()}_${selDate.getMonth() + 1}_${selDate.getDate()}`;
            const selMonthPrefix = `tracker_${selDate.getFullYear()}_${selDate.getMonth() + 1}_`;
            const mode = trackerMode.value;

            let listTotals = {};
            let listTotalSec = 0;
            let totalMonth = 0;
            let totalAll = 0;
            let activeDays = 0;

            // Jedan prolaz kroz podatke umesto više filtera (brže)
            for (const key in items) {
                if (!key.startsWith("tracker_")) continue;
                if (!items[key] || typeof items[key] !== "object") continue;

                let daySum = 0;
                for (const dom in items[key]) {
                    const sec = Number(items[key][dom]);
                    if (Number.isFinite(sec) && sec > 0) daySum += sec;
                }

                if (daySum > 0) {
                    activeDays++;
                }

                totalAll += daySum;

                // Provera za trenutno izabrani mesec
                if (key.startsWith(selMonthPrefix)) totalMonth += daySum;

                // Logika prikaza za listu
                let shouldInclude = (mode === "day" && key === selKey) ||
                    (mode === "month" && key.startsWith(selMonthPrefix)) ||
                    (mode === "all");

                if (shouldInclude) {
                    listTotalSec += daySum;
                    for (const dom in items[key]) {
                        const sec = Number(items[key][dom]);
                        if (!Number.isFinite(sec) || sec <= 0) continue;
                        listTotals[dom] = (listTotals[dom] || 0) + sec;
                    }
                }
            }

            // Ažuriranje statistike
            document.getElementById("statTotal").textContent = formatTime(listTotalSec);
            document.getElementById("statMonth").textContent = formatTime(totalMonth);
            document.getElementById("statAvg").textContent = formatTime(Math.floor(totalAll / (activeDays || 1)));

            // Labela za glavni box
            const label = document.getElementById("statTotalLabel");
            const isToday = selDate.toDateString() === today.toDateString();
            if (mode === "day") label.textContent = isToday ? getI18nMsg("trackerToday", "Danas") : getI18nMsg("trackerThatDay", "Taj dan");
            else if (mode === "month") label.textContent = getI18nMsg("trackerSelectedMonth", "Izabrani mesec");
            else label.textContent = getI18nMsg("trackerTotal", "Ukupno");

            // Render liste sa progres barovima
            const sorted = Object.entries(listTotals).sort((a, b) => b[1] - a[1]);
            trackerList.innerHTML = sorted.length ? "" : `<div class='empty-msg'>${getI18nMsg("trackerNoData", "Nema podataka za ovaj period")}</div>`;

            sorted.forEach(([domain, sec]) => {
                const percent = ((sec / listTotalSec) * 100).toFixed(1);
                const item = document.createElement("div");
                item.className = "tracker-item";
                item.innerHTML = `
                    <div style="display:flex; justify-content:space-between; position:relative; z-index:2;">
                        <span style="font-weight:bold; max-width:70%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${domain}</span>
                        <span style="color:var(--accent); font-family:monospace;">${formatTime(sec)}</span>
                    </div>
                    <div class="tracker-bar" style="width: ${percent}%"></div>
                `;
                trackerList.appendChild(item);
            });
        });
    }

    // Otvaranje trackera
    elements.trackerBtn?.addEventListener("click", () => {
        trackEvent("tracker_open");
        if (!trackerView) return;
        mainView.style.display = "none";
        trackerView.style.display = "flex";

        const d = new Date();
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        trackerDate.value = iso;
        trackerDate.max = iso;
        trackerDatePrikaz.value = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}.`;

        trackerMode.value = "day";
        forceTrackerTickAndRender();
    });

    // Eventi za kontrole
    trackerDate?.addEventListener("change", (e) => {
        trackEvent("tracker_date_change", { value: e.target.value });
        const parts = e.target.value.split("-");
        trackerDatePrikaz.value = `${parts[2]}.${parts[1]}.${parts[0]}.`;
        debouncedRenderStats();
    });

    trackerMode?.addEventListener("change", debouncedRenderStats);
    trackerMode?.addEventListener("change", (e) => {
        trackEvent("tracker_mode_change", { value: e.target.value });
        debouncedRenderStats();
    });
    trackerDatePrikaz?.addEventListener("click", () => {
        trackEvent("tracker_date_picker_open");
        if (trackerDate?.showPicker) trackerDate.showPicker();
        else trackerDate?.click();
    });

    document.getElementById("trackerRefreshBtn")?.addEventListener("click", async () => {
        trackEvent("tracker_refresh");
        try {
            await forceTrackerTickAndRender();
            const icon = document.getElementById("trackerRefreshBtn");
            icon.style.color = "var(--accent)";
            setTimeout(() => icon.style.color = "", 500);
        } catch (err) {
            console.error("Tracker refresh error:", err);
        }
    });

    document.getElementById("trackerBackBtn")?.addEventListener("click", () => {
        trackEvent("tracker_back");
        if (!trackerView) return;
        trackerView.style.display = "none";
        mainView.style.display = "block";
    });

    // EXPORT: Čuvanje svih tracker podataka u JSON
    document.getElementById("exportTrackerBtn")?.addEventListener("click", () => {
        trackEvent("tracker_export");
        chrome.storage.local.get(null, (items) => {
            const trackerData = {};
            const MAX_TRACKER_EXPORT_BYTES = 10 * 1024 * 1024;
            let accumulatedBytes = 0;
            let wasTruncated = false;

            for (const key in items) {
                if (key.startsWith("tracker_")) {
                    const jsonChunk = JSON.stringify(items[key]);
                    const chunkBytes = getUtf8ByteLength(jsonChunk);
                    if (accumulatedBytes + chunkBytes > MAX_TRACKER_EXPORT_BYTES) {
                        wasTruncated = true;
                        break;
                    }

                    trackerData[key] = items[key];
                    accumulatedBytes += chunkBytes;
                }
            }

            if (Object.keys(trackerData).length === 0) {
                alert(getI18nMsg("trackerExportEmpty", "Nema tracker podataka za izvoz."));
                return;
            }

            const blob = new Blob([JSON.stringify(trackerData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `AllInOne_Tracker_Backup.json`;
            a.click();
            URL.revokeObjectURL(url);

            if (wasTruncated) {
                alert(getI18nMsg("trackerExportTruncated", "Izvoz je skraćen na 10MB da popup ostane stabilan."));
            }
        });
    });

    // IMPORT: Učitavanje podataka iz fajla
    const trackerFileInput = document.getElementById("importTrackerFile");
    document.getElementById("importTrackerBtn")?.addEventListener("click", () => trackerFileInput.click());
    document.getElementById("importTrackerBtn")?.addEventListener("click", () => {
        trackEvent("tracker_import_open");
        trackerFileInput.click();
    });

    trackerFileInput?.addEventListener("change", (e) => {
        trackEvent("tracker_import_confirm");
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const raw = String(event.target?.result || "{}");
                const parsed = JSON.parse(raw);
                const data = {};
                Object.keys(parsed || {}).forEach((key) => {
                    if (key.startsWith("tracker_") && parsed[key] && typeof parsed[key] === "object") {
                        const cleanDay = {};
                        Object.keys(parsed[key]).forEach((domain) => {
                            const sec = Number(parsed[key][domain]);
                            const normalizedDomain = String(domain || "").trim().toLowerCase();
                            const isValidDomain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(normalizedDomain)
                                && normalizedDomain.length <= 255;
                            if (isValidDomain && Number.isFinite(sec) && sec > 0) {
                                cleanDay[normalizedDomain] = Math.floor(sec);
                            }
                        });
                        if (Object.keys(cleanDay).length > 0) {
                            data[key] = cleanDay;
                        }
                    }
                });

                if (Object.keys(data).length === 0) {
                    alert(getI18nMsg("trackerImportEmpty", "Nema validnih tracker podataka za uvoz."));
                    return;
                }

                chrome.storage.local.set(data, () => {
                    renderStats();
                    alert(getI18nMsg("trackerImportSuccess", "Podaci su uspešno uvezeni!"));
                });
            } catch (err) {
                alert(getI18nMsg("trackerImportError", "Greška pri čitanju fajla."));
            }
        };
        reader.readAsText(file);
    });
    //#endregion

    //#region BROJAČ KARAKTERA
    const counterView = document.getElementById("counterView");
    const counterBackBtn = document.getElementById("counterBackBtn");
    const counterArea = document.getElementById("counterArea");
    const charCount = document.getElementById("charCount");
    const wordCount = document.getElementById("wordCount");
    const lineCount = document.getElementById("lineCount");
    const clearCounterModal = document.getElementById("clearCounterModal"); // Ključna promenljiva!

    // Funkcija za ažuriranje brojki
    const updateCounts = (text = "") => {
        if (!charCount || !wordCount || !lineCount) return;
        const normalized = String(text);

        charCount.textContent = String(normalized.length);
        wordCount.textContent = normalized.trim() === "" ? "0" : String(normalized.trim().split(/\s+/).length);

        // Brojanje redova
        const lines = normalized === "" ? 0 : normalized.split(/\r\n|\r|\n/).length;
        lineCount.textContent = String(lines);
    };

    // Storage funkcije
    const getSavedCounterText = () => localStorage.getItem("aio_counter_text") || "";
    const setSavedCounterText = (text) => localStorage.setItem("aio_counter_text", text);
    const clearSavedCounterText = () => localStorage.removeItem("aio_counter_text");

    // Inicijalizacija pri učitavanju
    if (counterArea) {
        const savedText = getSavedCounterText();
        counterArea.value = savedText;
        updateCounts(savedText);
    }

    // Dugme na glavnom meniju koje otvara brojač
    // Napomena: Proveri da li se dugme zove counterBtn ili openCounter u tvom HTML-u
    document.getElementById("counterBtn")?.addEventListener("click", () => {
        trackEvent("counter_open");
        if (!counterView) return;
        document.getElementById("mainView").style.display = "none";
        counterView.style.display = "flex";
        counterArea?.focus();
    });

    // Nazad na glavno
    counterBackBtn?.addEventListener("click", () => {
        trackEvent("counter_back");
        counterView.style.display = "none";
        document.getElementById("mainView").style.display = "block";
    });

    // Kucanje teksta
    counterArea?.addEventListener("input", (e) => {
        trackEvent("counter_input");
        const val = e.target.value;
        updateCounts(val);
        setSavedCounterText(val);
    });

    // Modal Logika (Brisanje)
    document.getElementById("counterClearBtn")?.addEventListener("click", () => {
        trackEvent("counter_clear_modal_open");
        if (clearCounterModal) clearCounterModal.style.display = "flex";
    });

    document.getElementById("cancelClearCounter")?.addEventListener("click", () => {
        trackEvent("counter_clear_modal_cancel");
        if (clearCounterModal) clearCounterModal.style.display = "none";
    });

    document.getElementById("confirmClearCounter")?.addEventListener("click", () => {
        trackEvent("counter_clear_confirm");
        if (counterArea) {
            counterArea.value = "";
            updateCounts("");
            clearSavedCounterText();
        }
        if (clearCounterModal) clearCounterModal.style.display = "none";
    });
    //#endregion

    //#region STOPERICA
    let swInterval;
    let swHistoryWriteQueue = Promise.resolve();

    const swFormat = (ms) => {
        if (!Number.isFinite(ms)) return "00:00:00";
        const total = Math.floor(Math.max(0, ms) / 1000);
        const h = Math.floor(total / 3600).toString().padStart(2, '0');
        const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
        const s = (total % 60).toString().padStart(2, '0');
        return `${h}:${m}:${s}`;
    };

    const swRefreshUI = () => {
        chrome.storage.local.get(["isRunning", "startTime", "currentLaps"], (data) => {
            const timerEl = document.getElementById("timer");
            const statusEl = document.getElementById("status");
            const lapsList = document.getElementById("laps");
            if (!timerEl || !statusEl || !lapsList) return;

            const isRunning = data.isRunning === true;
            const startTime = Number.isFinite(data.startTime) ? data.startTime : 0;
            const currentLaps = Array.isArray(data.currentLaps) ? data.currentLaps : [];

            if (isRunning) {
                timerEl.innerText = swFormat(Date.now() - startTime);
                statusEl.innerText = getI18nMsg("swStatusLive", "LAJV U TOKU");
                statusEl.style.color = "red";
            } else {
                timerEl.innerText = "00:00:00";
                statusEl.innerText = getI18nMsg("swStatusReady", "SPREMAN");
                statusEl.style.color = "var(--text-dim)";
            }

            lapsList.innerHTML = "";
            if (currentLaps.length > 0) {
                currentLaps.slice().reverse().forEach((lapMs, index) => {
                    const originalIndex = currentLaps.length - 1 - index;
                    const lapContainer = document.createElement("div");
                    lapContainer.style.display = "flex";
                    lapContainer.style.width = "100%";
                    lapContainer.style.alignItems = "center";
                    lapContainer.style.justifyContent = "space-between";
                    lapContainer.style.padding = "2px 0";

                    const lapLi = document.createElement("span");
                    const lapTime = Number.isFinite(lapMs) ? lapMs : 0;
                    const lapIndex = originalIndex + 1;
                    lapLi.style.flex = "1";
                    lapLi.innerHTML = `<span>${lapIndex}: </span> <b>${swFormat(lapTime)}</b>`;
                    lapContainer.appendChild(lapLi);

                    const undoBtn = document.createElement("button");
                    undoBtn.innerText = "✕";
                    undoBtn.className = "secondary icon-btn lap-undo-btn";
                    undoBtn.title = getI18nMsg("swUndoTitle", "Obriši ovaj momenat");
                    undoBtn.onclick = () => {
                        const newLaps = currentLaps.filter((_, i) => i !== originalIndex);
                        chrome.storage.local.set({ currentLaps: newLaps }, () => {
                            swRefreshUI();
                        });
                    };
                    lapContainer.appendChild(undoBtn);

                    const li = document.createElement("li");
                    li.appendChild(lapContainer);
                    lapsList.appendChild(li);
                });
            } else {
                lapsList.innerHTML = `<div class="empty-msg">${getI18nMsg("swNoLaps", "Nema zabeleženih momenata")}</div>`;
            }
        });
    };

    const swRenderHistory = () => {
        chrome.storage.local.get(["history"], (data) => {
            const historyList = document.getElementById("history-list");
            if (!historyList) return;
            historyList.innerHTML = "";

            const history = Array.isArray(data.history) ? data.history : [];
            if (history.length > 0) {
                history.slice().reverse().forEach((session, idx) => {
                    if (!session || typeof session !== "object") return;
                    const realIdx = history.length - idx;
                    const details = document.createElement("details");
                    const summary = document.createElement("summary");

                    const sessionTime = Number.isFinite(session.sessionStart) ? new Date(session.sessionStart) : new Date();
                    const sessionLaps = Array.isArray(session.laps) ? session.laps : [];
                    const sessionDurationMs = sessionLaps.length > 0 ? sessionLaps[sessionLaps.length - 1] : 0;
                    const endTime = new Date(sessionTime.getTime() + Math.max(0, sessionDurationMs));
                    const sessionDateStr = sessionTime.toLocaleDateString('sr-RS');
                    const startTimeStr = sessionTime.toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' });
                    const endTimeStr = endTime.toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' });
                    summary.innerHTML = `<span>${getI18nMsg("swLiveTitlePrefix", "Lajv #")}${realIdx}</span> <small style="color:var(--text-dim); font-weight:normal;">${sessionDateStr} ${startTimeStr} - ${endTimeStr} | ${getI18nMsg("swDurationLabel", "Trajanje: ")}${swFormat(sessionDurationMs)}</small>`;

                    details.addEventListener("click", function () {
                        if (!this.open) {
                            document.querySelectorAll("#history-list details").forEach(d => {
                                if (d !== this) d.removeAttribute("open");
                            });
                        }
                    });

                    const contentDiv = document.createElement("div");
                    contentDiv.className = "session-content";

                    const ul = document.createElement("ul");
                    ul.style.listStyle = "none";
                    ul.style.padding = "0";
                    sessionLaps.forEach((lap, i) => {
                        const li = document.createElement("li");
                        li.style.display = "flex";
                        li.style.justifyContent = "space-between";
                        li.style.fontSize = "11px";
                        li.style.padding = "4px 0";
                        li.style.borderBottom = "1px solid rgba(255,255,255,0.03)";
                        const lapTime = Number.isFinite(lap) ? lap : 0;
                        li.innerHTML = `<span style="color:var(--text-dim)">${getI18nMsg("swMomentLabel", "Momenat ")}${i + 1}</span> <b>${swFormat(lapTime)}</b>`;
                        ul.appendChild(li);
                    });

                    const downloadBtn = document.createElement("button");
                    downloadBtn.innerText = getI18nMsg("swExportTxtBtn", "EKSPORTUJ KAO .TXT");
                    downloadBtn.className = "export-btn-mini";
                    downloadBtn.onclick = () => {
                        try {
                            const sessionDateFull = Number.isFinite(session.sessionStart) ? new Date(session.sessionStart).toLocaleString('sr-RS') : new Date().toLocaleString('sr-RS');
                            let txt = `${getI18nMsg("swLiveTitlePrefix", "LAJV #").toUpperCase()}${realIdx} | ${sessionDateFull}\n--------------------------\n`;
                            const exportLaps = Array.isArray(session.laps) ? session.laps : [];
                            txt += `${getI18nMsg("swTotalDurationPrefix", "UKUPNO TRAJANJE: ")}${swFormat(exportLaps.length > 0 ? exportLaps[exportLaps.length - 1] : 0)}\n\n`;
                            exportLaps.forEach((l, i) => {
                                const lapTime = Number.isFinite(l) ? l : 0;
                                txt += `${i + 1}. ${swFormat(lapTime)}\n`;
                            });
                            const blob = new Blob([txt], { type: "text/plain" });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `lajv_${realIdx}.txt`;
                            a.click();
                            URL.revokeObjectURL(url);
                        } catch (err) {
                            console.error("Export error:", err);
                        }
                    };

                    const copyBtn = document.createElement("button");
                    copyBtn.innerText = getI18nMsg("swCopyBtn", "KOPIRAJ U KLIPBORD");
                    copyBtn.className = "export-btn-mini";
                    copyBtn.style.backgroundColor = "var(--accent)";
                    copyBtn.style.color = "#000";
                    copyBtn.onclick = () => {
                        try {
                            const sessionDateFull = Number.isFinite(session.sessionStart) ? new Date(session.sessionStart).toLocaleString('sr-RS') : new Date().toLocaleString('sr-RS');
                            let txt = `${getI18nMsg("swLiveTitlePrefix", "LAJV #").toUpperCase()}${realIdx} | ${sessionDateFull}\n`;
                            const exportLaps = Array.isArray(session.laps) ? session.laps : [];
                            txt += `${getI18nMsg("swTotalDurationPrefix", "UKUPNO TRAJANJE: ")}${swFormat(exportLaps.length > 0 ? exportLaps[exportLaps.length - 1] : 0)}\n\n`;
                            exportLaps.forEach((l, i) => {
                                const lapTime = Number.isFinite(l) ? l : 0;
                                txt += `${i + 1}. ${swFormat(lapTime)}\n`;
                            });
                            navigator.clipboard.writeText(txt).then(() => {
                                copyBtn.innerText = getI18nMsg("swCopiedBtn", "✓ KOPIRANO");
                                setTimeout(() => { copyBtn.innerText = getI18nMsg("swCopyBtn", "KOPIRAJ U KLIPBORD"); }, 2000);
                            }).catch(() => {
                                console.error("Clipboard error");
                            });
                        } catch (err) {
                            console.error("Copy error:", err);
                        }
                    };

                    contentDiv.appendChild(ul);
                    const actionButtons = document.createElement("div");
                    actionButtons.className = "session-actions";
                    actionButtons.appendChild(downloadBtn);
                    actionButtons.appendChild(copyBtn);
                    contentDiv.appendChild(actionButtons);
                    details.appendChild(summary);
                    details.appendChild(contentDiv);
                    historyList.appendChild(details);
                });
            } else {
                historyList.innerHTML = `<div class='no-history'>${getI18nMsg("swNoHistory", "Nema istorije lajvova")}</div>`;
            }
        });
    };

    elements.stopwatchBtn?.addEventListener("click", () => {
        trackEvent("stopwatch_open");
        const mainView = document.getElementById("mainView");
        const stopwatchView = document.getElementById("stopwatchView");
        if (!mainView || !stopwatchView) return;
        mainView.style.display = "none";
        stopwatchView.style.display = "flex";
        if (swInterval) clearInterval(swInterval);
        swInterval = setInterval(swRefreshUI, 1000);
        swRenderHistory();
        swRefreshUI();
    });

    document.getElementById("swBackBtn")?.addEventListener("click", () => {
        trackEvent("stopwatch_back");
        const stopwatchView = document.getElementById("stopwatchView");
        const mainView = document.getElementById("mainView");
        if (!stopwatchView || !mainView) return;
        stopwatchView.style.display = "none";
        mainView.style.display = "block";
        if (swInterval) clearInterval(swInterval);
    });

    window.addEventListener("beforeunload", () => {
        if (swInterval) clearInterval(swInterval);
    });

    document.getElementById("start")?.addEventListener("click", () => {
        trackEvent("stopwatch_start");
        chrome.storage.local.get(["isRunning"], (data) => {
            if (data.isRunning === true) {
                // Sesija je već pokrenuta, ignoriši
                return;
            }
            const now = Date.now();
            chrome.storage.local.set({ isRunning: true, startTime: now, currentLaps: [] }, swRefreshUI);
            // Resetuj cooldown timer u background-u
            chrome.runtime.sendMessage({ action: "sw_start_session" }).catch(() => { });
        });
    });

    document.getElementById("lap")?.addEventListener("click", () => {
        trackEvent("stopwatch_lap");
        chrome.runtime.sendMessage({ action: "manual_lap" });
    });

    document.getElementById("stop")?.addEventListener("click", () => {
        trackEvent("stopwatch_stop");
        chrome.storage.local.get(["isRunning", "startTime", "currentLaps", "history"], (data) => {
            if (data.isRunning !== true) return;
            const startTime = Number.isFinite(data.startTime) ? data.startTime : Date.now();
            const currentLaps = Array.isArray(data.currentLaps) ? data.currentLaps : [];
            const session = { sessionStart: startTime, laps: currentLaps };

            swHistoryWriteQueue = swHistoryWriteQueue.then(async () => {
                const latest = await chrome.storage.local.get(["isRunning", "history"]);
                if (latest.isRunning !== true) return;
                const latestHistory = Array.isArray(latest.history) ? latest.history : [];
                await chrome.storage.local.set({ isRunning: false, history: [...latestHistory, session], startTime: 0, currentLaps: [] });
            }).catch((err) => {
                console.error("Stopwatch stop error:", err);
            });

            swHistoryWriteQueue.then(() => {
                swRefreshUI();
                swRenderHistory();
            });
        });
    });
    // Alt+Shift+L shortcut - samo dok je stopwatch view vidljiv
    document.addEventListener("keydown", (e) => {
        if (e.altKey && e.shiftKey && (e.key.toLowerCase() === "l")) {
            trackEvent("stopwatch_shortcut_lap");
        }
        const stopwatchView = document.getElementById("stopwatchView");
        const isStopwatchVisible = stopwatchView && stopwatchView.style.display !== "none";
        if (isStopwatchVisible && e.altKey && e.shiftKey && (e.key.toLowerCase() === "l")) {
            chrome.runtime.sendMessage({ action: "manual_lap" }).catch(() => { });
        }
    });
    const swModal = document.getElementById("customModal");
    document.getElementById("clear-history")?.addEventListener("click", () => {
        trackEvent("stopwatch_clear_history_modal_open");
        if (!swModal) return;
        swModal.style.display = "flex";
    });

    document.getElementById("cancelClear")?.addEventListener("click", () => {
        trackEvent("stopwatch_clear_history_modal_cancel");
        if (!swModal) return;
        swModal.style.display = "none";
    });

    document.getElementById("confirmClear")?.addEventListener("click", () => {
        trackEvent("stopwatch_clear_history_confirm");
        if (!swModal) return;
        swHistoryWriteQueue = swHistoryWriteQueue.then(async () => {
            await chrome.storage.local.set({ history: [] });
        }).catch((err) => {
            console.error("Clear history error:", err);
        });

        swHistoryWriteQueue.then(() => {
            swRenderHistory();
            swModal.style.display = "none";
        });
    });

    // Pravilno izolovan slušalac poruka za osvežavanje UI-ja
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "update_ui") {
            swRefreshUI();
            swRenderHistory();
        } else if (msg.playing !== undefined && elements.radioBtn) {
            elements.radioBtn.innerText = msg.playing ? getI18nMsg("radioPause", "Pause") : getI18nMsg("radioPlay", "Play");
        }
    });
    //#endregion

    //#region SETTINGS
    document.getElementById("settingsBtn")?.addEventListener("click", () => {
        trackEvent("settings_open");
        document.getElementById("mainView").style.display = "none";
        document.getElementById("settingsView").style.display = "flex";
    });

    document.getElementById("settingsBackBtn")?.addEventListener("click", () => {
        trackEvent("settings_back");
        document.getElementById("settingsView").style.display = "none";
        document.getElementById("mainView").style.display = "block";
    });
    const verNum = document.getElementById("verNum");
    if (verNum && typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getManifest) {
        verNum.innerText = chrome.runtime.getManifest().version;
    }

    document.getElementById("donateBtn")?.addEventListener("click", () => {
        trackEvent("donate_click");
        chrome.tabs.create({ url: "https://paypal.me/milanpetkovski1" });
    });

    document.getElementById("webBtn")?.addEventListener("click", () => {
        trackEvent("web_click");
        chrome.tabs.create({ url: "https://allinone.milanwebportal.com" });
    });

    document.getElementById("portalBtn")?.addEventListener("click", () => {
        trackEvent("portal_click");
        chrome.tabs.create({ url: "https://milanwebportal.com" });
    });

    document.getElementById("rateBtn")?.addEventListener("click", () => {
        trackEvent("rate_click");
        chrome.tabs.create({ url: "https://chromewebstore.google.com/detail/all-in-one/hmkcbieabcldlndhjeemggokhlebjoem/reviews" });
    });

    document.getElementById("privacyLink")?.addEventListener("click", (e) => {
        trackEvent("privacy_click");
        e.preventDefault();
        chrome.tabs.create({ url: "https://allinone.milanwebportal.com/privacy" });
    });

    document.getElementById("emailBtn")?.addEventListener("click", (e) => {
        trackEvent("email_click");
        e.preventDefault();
        chrome.tabs.create({ url: "mailto:contact@milanwebportal.com" });
    });
    //#endregion

    //#region TEHNOLOGIJE SAJTA

    document.getElementById("techBtn")?.addEventListener("click", async () => {
        try {
            document.getElementById("mainView").style.display = "none";
            document.getElementById("techView").style.display = "flex";

            const listContainer = document.getElementById("techResultList");
            const loading = document.getElementById("techLoading");

            listContainer.innerHTML = "";
            loading.style.display = "block";

            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs?.[0];
            if (!tab?.id || !tab.url || !tab.url.startsWith("http")) {
                loading.style.display = "none";
                listContainer.innerHTML = `<div style="color: var(--text-dim); text-align: center;">${getI18nMsg("techScannerUnavailable", "Skener nije dostupan na ovoj stranici.")}</div>`;
                return;
            }

            const executeWithTimeout = (tabId) => {
                return new Promise((resolve, reject) => {
                    let isResolved = false;
                    const timeoutId = setTimeout(() => {
                        if (!isResolved) {
                            isResolved = true;
                            reject(new Error("Scanner timeout: stranica je presporo odgovorila"));
                        }
                    }, 8000);

                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        world: "MAIN",
                        func: async (foundLabel, noneFoundLabel) => {
                            const results = [];
                            const add = (category, name, detail = "") => {
                                if (!category || !name) return;
                                results.push({ category, name, detail });
                            };
                            const getAttr = (el, attr) => (el?.getAttribute?.(attr) || "").toLowerCase();

                            // 1. DOM SKENIRANJE
                            const html = document.documentElement;
                            const scriptEls = Array.from(document.scripts);
                            const scripts = scriptEls.map(s => (s.src || '').toLowerCase()).filter(Boolean);
                            const inlineScripts = scriptEls.map(s => s.textContent || '').join('\n').toLowerCase();
                            const linkEls = Array.from(document.querySelectorAll('link'));
                            const links = linkEls.map(l => (l.href || '').toLowerCase()).filter(Boolean);
                            const metas = Array.from(document.querySelectorAll('meta'));
                            const hasScript = (needle) => scripts.some(s => s.includes(needle));
                            const getMetaByName = (name) => {
                                const el = metas.find(m => (m.getAttribute('name') || '').toLowerCase() === name.toLowerCase());
                                return el ? (el.getAttribute('content') || '') : '';
                            };

                            add('Page Stats', 'DOM Snapshot', `Scripts: ${scriptEls.length} | Links: ${linkEls.length} | Meta: ${metas.length} | Images: ${document.images.length}`);

                            // 2. ČITANJE SERVER HEADERA (Backend, Security, Caching)
                            try {
                                const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
                                const header = (name) => (response.headers.get(name) || '').toLowerCase();

                                const server = header('server');
                                const poweredBy = header('x-powered-by');

                                if (server.includes('nginx')) add('Web Server', 'Nginx', server);
                                if (server.includes('apache')) add('Web Server', 'Apache', server);
                                if (server.includes('litespeed')) add('Web Server', 'LiteSpeed', server);
                                if (server.includes('cloudflare')) add('CDN / Security', 'Cloudflare', server);
                                if (server.includes('cloudfront')) add('CDN', 'Amazon CloudFront', server);
                                if (server.includes('fastly')) add('CDN', 'Fastly', server);
                                if (server.includes('akamai')) add('CDN', 'Akamai', server);
                                if (server.includes('varnish')) add('Caching', 'Varnish', server);

                                if (poweredBy.includes('php')) add('Backend Language', 'PHP', poweredBy);
                                if (poweredBy.includes('express')) add('Backend Framework', 'Express.js', poweredBy);
                                if (poweredBy.includes('asp.net')) add('Backend Framework', 'ASP.NET', poweredBy);
                                if (poweredBy.includes('node')) add('Backend Runtime', 'Node.js', poweredBy);
                                if (poweredBy.includes('laravel')) add('Backend Framework', 'Laravel', poweredBy);

                                if (header('content-security-policy')) add('Security Header', 'Content-Security-Policy', 'present');
                                if (header('strict-transport-security')) add('Security Header', 'Strict-Transport-Security', 'present');
                                if (header('x-frame-options')) add('Security Header', 'X-Frame-Options', 'present');
                                if (header('x-content-type-options')) add('Security Header', 'X-Content-Type-Options', 'present');
                                if (header('referrer-policy')) add('Security Header', 'Referrer-Policy', 'present');
                                if (header('permissions-policy')) add('Security Header', 'Permissions-Policy', 'present');
                                if (header('cross-origin-opener-policy')) add('Security Header', 'COOP', 'present');
                                if (header('cross-origin-embedder-policy')) add('Security Header', 'COEP', 'present');

                                if (header('cache-control')) add('Caching', 'Cache-Control', 'present');
                                if (header('etag')) add('Caching', 'ETag', 'present');
                                if (header('age')) add('Caching', 'Age Header', 'present');
                                if (header('cf-cache-status')) add('CDN / Cache', 'Cloudflare Cache Status', header('cf-cache-status'));
                                if (header('x-cache')) add('CDN / Cache', 'X-Cache Header', header('x-cache'));
                            } catch (e) { }

                            // Jezik i Domen
                            if (html.lang) add('Content Language', html.lang.toUpperCase(), 'html[lang]');
                            const hostname = window.location.hostname || '';
                            const isLocalhost = hostname === 'localhost';
                            const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
                            const isIPv6 = hostname.includes(':');
                            if (!isLocalhost && !isIPv4 && !isIPv6) {
                                const tld = hostname.split('.').pop();
                                if (tld && tld !== hostname) add('Domain', '.' + tld, hostname);
                            }

                            // CMS i E-commerce
                            const generator = getMetaByName('generator').toLowerCase();
                            if (generator.includes('wordpress') || links.some(l => l.includes('wp-content'))) add('CMS / Builder', 'WordPress', generator || 'wp-content detected');
                            if (generator.includes('joomla')) add('CMS / Builder', 'Joomla', generator);
                            if (generator.includes('drupal')) add('CMS / Builder', 'Drupal', generator);
                            if (generator.includes('wix')) add('CMS / Builder', 'Wix', generator);
                            if (html.hasAttribute('data-wf-site')) add('CMS / Builder', 'Webflow', 'data-wf-site');
                            if (window.Shopify || scripts.some(s => s.includes('shopify'))) add('ECommerce', 'Shopify', 'window.Shopify or script match');
                            if (document.querySelector('.woocommerce')) add('ECommerce', 'WooCommerce', '.woocommerce');
                            if (window.Magento) add('ECommerce', 'Magento', 'window.Magento');

                            // Frameworks & Biblioteke
                            if (document.querySelector('#__next') || window.next || window.__NEXT_DATA__) add('Framework', 'Next.js', window.__NEXT_DATA__?.buildId ? `build: ${window.__NEXT_DATA__.buildId}` : '#__next');
                            if (document.querySelector('#___gatsby') || window.gatsby) add('Framework', 'Gatsby', '#___gatsby/window.gatsby');
                            if (window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || document.querySelector('[data-reactroot]')) add('Framework', 'React', window.React?.version ? `v${window.React.version}` : 'React signal');
                            if (window.Vue || document.querySelector('[data-v-app]') || window.__VUE__) add('Framework', 'Vue.js', window.Vue?.version ? `v${window.Vue.version}` : 'Vue signal');
                            if (window.angular || document.querySelector('[ng-version]')) add('Framework', 'Angular', document.querySelector('[ng-version]')?.getAttribute('ng-version') || 'Angular signal');
                            if (window.Svelte || document.querySelector('[data-svelte-h]')) add('Framework', 'Svelte', 'Svelte marker');
                            if (window.__NUXT__ || document.querySelector('#__nuxt')) add('Framework', 'Nuxt.js', '#__nuxt/window.__NUXT__');
                            if (window.jQuery) add('JavaScript Library', 'jQuery', window.jQuery?.fn?.jquery ? `v${window.jQuery.fn.jquery}` : 'window.jQuery');
                            if (window._ && window._.VERSION) add('JavaScript Library', 'Lodash', `v${window._.VERSION}`);
                            if (window.gsap) add('Animations', 'GSAP', window.gsap?.version ? `v${window.gsap.version}` : 'window.gsap');
                            if (window.THREE) add('3D Graphics', 'Three.js', window.THREE?.REVISION ? `r${window.THREE.REVISION}` : 'window.THREE');
                            if (window.Alpine) add('JavaScript Library', 'Alpine.js', window.Alpine?.version ? `v${window.Alpine.version}` : 'window.Alpine');

                            // Build / Tooling
                            if (hasScript('vite') || inlineScripts.includes('@vite/client')) add('Build Tool', 'Vite', 'script/@vite/client');
                            if (hasScript('webpack') || inlineScripts.includes('webpackjsonp')) add('Build Tool', 'Webpack', 'script/webpackjsonp');
                            if (hasScript('parcel')) add('Build Tool', 'Parcel', 'script match');
                            if (hasScript('/_next/static/')) add('Bundling', 'Next.js Build Chunks', '/_next/static/');
                            if (scripts.some(s => s.includes('astro'))) add('Framework', 'Astro', 'script match');

                            // Analitika i Marketing
                            if (window.ga || window.gtag || scripts.some(s => s.includes('google-analytics'))) add('Analytics', 'Google Analytics', 'ga/gtag/script');
                            if (window.fbq || scripts.some(s => s.includes('fbevents.js'))) add('Marketing', 'Meta Pixel', 'fbq/fbevents');
                            if (window.hj || scripts.some(s => s.includes('hotjar'))) add('Analytics', 'Hotjar', 'hj/hotjar script');
                            if (window.google_tag_manager || scripts.some(s => s.includes('googletagmanager'))) add('Tag Manager', 'Google Tag Manager', 'gtm signal');
                            if (scripts.some(s => s.includes('adsbygoogle'))) add('Monetization', 'Google AdSense', 'adsbygoogle script');

                            const gtmMatch = inlineScripts.match(/gtm-[a-z0-9]+/i);
                            if (gtmMatch?.[0]) add('Tag Manager ID', gtmMatch[0].toUpperCase(), 'inline script');

                            const ga4Match = inlineScripts.match(/g-[a-z0-9]{4,}/i);
                            if (ga4Match?.[0]) add('Analytics ID', ga4Match[0].toUpperCase(), 'inline script');

                            const fbqMatch = inlineScripts.match(/fbq\s*\(\s*['\"]init['\"]\s*,\s*['\"](\d+)['\"]/i);
                            if (fbqMatch?.[1]) add('Marketing ID', `Meta Pixel ${fbqMatch[1]}`, 'inline script');

                            // CDN mreže
                            if (scripts.some(s => s.includes('cdnjs'))) add('CDN', 'CDNJS', 'script source');
                            if (scripts.some(s => s.includes('jsdelivr'))) add('CDN', 'jsDelivr', 'script source');
                            if (links.some(l => l.includes('fonts.googleapis.com'))) add('Fonts', 'Google Fonts', 'fonts.googleapis.com');
                            if (links.some(l => l.includes('use.typekit.net'))) add('Fonts', 'Adobe Fonts', 'use.typekit.net');

                            // Strukturirani podaci
                            if (metas.some(m => m.getAttribute('property')?.startsWith('og:'))) add('Structured Data', 'Open Graph', 'meta[property^="og:"]');
                            if (metas.some(m => getAttr(m, 'name').startsWith('twitter:'))) add('Structured Data', 'Twitter Cards', 'meta[name^="twitter:"]');
                            if (document.querySelector('script[type="application/ld+json"]')) add('Structured Data', 'JSON-LD', `${document.querySelectorAll('script[type="application/ld+json"]').length} script tag(ova)`);
                            if (document.querySelector('[itemscope]')) add('Structured Data', 'Microdata', `${document.querySelectorAll('[itemscope]').length} itemscope element(a)`);

                            // SEO
                            const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
                            if (canonical) add('SEO', 'Canonical URL', canonical);
                            const hreflangCount = document.querySelectorAll('link[hreflang]').length;
                            if (hreflangCount > 0) add('SEO', 'Hreflang', `${hreflangCount} link(ova)`);
                            const robotsMeta = getMetaByName('robots');
                            if (robotsMeta) add('SEO', 'Robots Meta', robotsMeta);
                            const metaDesc = document.querySelector('meta[name="description"]')?.getAttribute('content') || '';
                            if (metaDesc) add('SEO', 'Meta Description', `${metaDesc.length} karaktera`);

                            // Izgled i Stilovi
                            if (links.some(l => l.includes('tailwindcss')) || scripts.some(s => s.includes('tailwind'))) add('CSS Framework', 'Tailwind CSS', 'link/script match');
                            if (links.some(l => l.includes('bootstrap')) || scripts.some(s => s.includes('bootstrap'))) add('CSS Framework', 'Bootstrap', 'link/script match');
                            const cssCount = linkEls.filter(l => getAttr(l, 'rel').includes('stylesheet')).length;
                            if (cssCount > 0) add('Site Elements', 'External CSS', `${cssCount} stylesheet link(ova)`);
                            const inlineStyleCount = document.querySelectorAll('[style]').length;
                            if (inlineStyleCount > 0) add('Site Elements', 'Inline CSS', `${inlineStyleCount} element(a)`);

                            // Performance hints
                            const preconnectCount = document.querySelectorAll('link[rel="preconnect"]').length;
                            const preloadCount = document.querySelectorAll('link[rel="preload"]').length;
                            const dnsPrefetchCount = document.querySelectorAll('link[rel="dns-prefetch"]').length;
                            const lazyImageCount = document.querySelectorAll('img[loading="lazy"]').length;
                            if (preconnectCount > 0) add('Performance', 'Preconnect', `${preconnectCount} link(ova)`);
                            if (preloadCount > 0) add('Performance', 'Preload', `${preloadCount} link(ova)`);
                            if (dnsPrefetchCount > 0) add('Performance', 'DNS Prefetch', `${dnsPrefetchCount} link(ova)`);
                            if (lazyImageCount > 0) add('Performance', 'Lazy-loaded Images', `${lazyImageCount} slika`);

                            // Standardi
                            add('Markup Language', 'HTML5', document.doctype?.name ? `doctype: ${document.doctype.name}` : 'doctype unknown');
                            add('Encoding', document.characterSet || 'UTF-8', 'document.characterSet');
                            add('Client Script', 'JavaScript', `${scriptEls.length} script tag(ova)`);
                            if (window.location.protocol === 'https:') add('Security', 'SSL/HTTPS', window.location.protocol.toUpperCase());

                            // PWA
                            const manifestHref = document.querySelector('link[rel="manifest"]')?.getAttribute('href') || '';
                            if (manifestHref) add('PWA', 'Web App Manifest', manifestHref);
                            if ('serviceWorker' in navigator) add('PWA', 'Service Worker API', 'navigator.serviceWorker available');
                            const themeColor = document.querySelector('meta[name="theme-color"]')?.getAttribute('content') || '';
                            if (themeColor) add('PWA', 'Theme Color', themeColor);

                            // Slike
                            const images = Array.from(document.images).map(i => i.src.toLowerCase());
                            const pngCount = images.filter(s => s.includes('.png')).length;
                            const jpgCount = images.filter(s => s.includes('.jpg') || s.includes('.jpeg')).length;
                            const svgCount = images.filter(s => s.includes('.svg') || s.includes('data:image/svg')).length;
                            const webpCount = images.filter(s => s.includes('.webp')).length;
                            if (pngCount > 0) add('Image Format', 'PNG', `${pngCount} slika`);
                            if (jpgCount > 0) add('Image Format', 'JPEG', `${jpgCount} slika`);
                            if (svgCount > 0) add('Image Format', 'SVG', `${svgCount} slika`);
                            if (webpCount > 0) add('Image Format', 'WebP', `${webpCount} slika`);

                            // Filtriranje duplikata (izbacuje ako se nešto 2x nadje)
                            const unique = [];
                            const seen = new Set();
                            results.forEach(r => {
                                const key = r.category + '|' + r.name;
                                if (!seen.has(key)) {
                                    seen.add(key);
                                    unique.push(r);
                                }
                            });

                            unique.sort((a, b) => {
                                const byCat = String(a.category).localeCompare(String(b.category), 'sr', { sensitivity: 'base' });
                                if (byCat !== 0) return byCat;
                                return String(a.name).localeCompare(String(b.name), 'sr', { sensitivity: 'base' });
                            });

                            return unique;
                        },
                        args: [getI18nMsg("techFoundPrefix", "Pronađeno: "), getI18nMsg("techNotFound", "Nije pronađeno.")]
                    }, (res) => {
                        if (!isResolved) {
                            isResolved = true;
                            clearTimeout(timeoutId);

                            loading.style.display = "none";
                            if (chrome.runtime.lastError) {
                                listContainer.innerHTML = `<div style="color: var(--text-dim); text-align: center;">${getI18nMsg("techScannerFailed", "Skeniranje nije uspelo na ovoj stranici.")}</div>`;
                                resolve();
                                return;
                            }

                            if (res && res[0] && Array.isArray(res[0].result)) {
                                const resultCount = res[0].result.length;
                                if (resultCount > 0) {
                                    const summary = document.createElement("div");
                                    summary.style.color = "var(--text-dim)";
                                    summary.style.fontSize = "11px";
                                    summary.style.marginBottom = "8px";
                                    summary.style.textAlign = "center";
                                    // It uses the passed arg `foundLabel` indirectly through dynamic logic if needed, but here's direct string interpolation
                                    summary.textContent = `${getI18nMsg("techFoundPrefix", "Pronađeno: ")} ${resultCount} ${getI18nMsg("techItemsSuffix", "stavki")}`;
                                    listContainer.appendChild(summary);
                                }

                                res[0].result.forEach(item => {
                                    const el = document.createElement("div");
                                    el.className = "tech-item";

                                    const icon = document.createElement("div");
                                    icon.className = "tech-icon";
                                    icon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>';

                                    const info = document.createElement("div");
                                    info.className = "tech-info";

                                    const cat = document.createElement("span");
                                    cat.className = "tech-cat";
                                    cat.textContent = String(item.category || "");

                                    const name = document.createElement("span");
                                    name.className = "tech-name";
                                    const baseName = String(item.name || "");
                                    name.textContent = baseName;

                                    info.appendChild(cat);
                                    info.appendChild(name);
                                    el.appendChild(icon);
                                    el.appendChild(info);
                                    listContainer.appendChild(el);
                                });

                                if (res[0].result.length === 0) {
                                    listContainer.innerHTML = `<div style="color: var(--text-dim); text-align: center;">${getI18nMsg("techNotFound", "Nije pronađeno.")}</div>`;
                                }
                            } else {
                                listContainer.innerHTML = `<div style="color: var(--text-dim); text-align: center;">${getI18nMsg("techNotFound", "Nije pronađeno.")}</div>`;
                            }

                            resolve();
                        }
                    });
                });
            };

            try {
                await executeWithTimeout(tab.id);
            } catch (err) {
                loading.style.display = "none";
                console.error("Tech scanner error:", err);
                listContainer.innerHTML = `<div style="color: var(--text-dim); text-align: center;">${getI18nMsg("techScannerFailed", "Skeniranje nije uspelo na ovoj stranici.")} - ${err.message || "greška"}</div>`;
            }
        } catch (err) {
            console.error("Tech scanner outer error:", err);
        } finally {
            // Reset view after tech scan completes
        }
    });

    document.getElementById("techBackBtn")?.addEventListener("click", () => {
        document.getElementById("techView").style.display = "none";
        document.getElementById("mainView").style.display = "block";
    });

    //#endregion
});

// i18n prevod Helper funkcija
function getI18nMsg(key, defaultText) {
    if (window.i18nDict && window.i18nDict[key] && window.i18nDict[key].message) {
        return window.i18nDict[key].message;
    }
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
        const msg = chrome.i18n.getMessage(key);
        if (msg) return msg;
    }
    return defaultText;
}