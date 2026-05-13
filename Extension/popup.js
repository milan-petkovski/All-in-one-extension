document.addEventListener("DOMContentLoaded", async () => {
    // --- INICIJALIZACIJA PREVODA ---
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
        // Silent fail in production
    }
    if (window.i18nDict) {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (window.i18nDict[key]) {
                const fullMessage = window.i18nDict[key].message;
                el.textContent = fullMessage;
                    
                // Automatski dodajemo tooltip da korisnik vidi pun tekst na hover
                el.setAttribute('title', fullMessage);
            }
        });
        // 2. Prevod placeholder-a (data-i18n-placeholder)
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (window.i18nDict[key]) {
                // Za contenteditable elemente koristi data-placeholder, za inpute placeholder atribut
                if (el.isContentEditable) {
                    el.setAttribute('data-placeholder', window.i18nDict[key].message);
                } else {
                    el.setAttribute('placeholder', window.i18nDict[key].message);
                }
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
        // Silent fail
        host = null;
    }
    if (!host) {
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
        colorBtn: document.getElementById("colorBtn"),
        nightToggle: document.getElementById("nightToggle"),
        copyToggle: document.getElementById("copyToggle"),
        ytToggle: document.getElementById("ytToggle"),
        rulerBtn: document.getElementById("rulerBtn"),
        markerBtn: document.getElementById("markerBtn"),
        resetVolBtn: document.getElementById("resetVolBtn"),
        clearCacheBtn: document.getElementById("clearCacheBtn"),
        fontBtn: document.getElementById("fontBtn"),
        notesBtn: document.getElementById("notesBtn"),
        trackerBtn: document.getElementById("trackerBtn"),
        counterBtn: document.getElementById("counterBtn"),
        stopwatchBtn: document.getElementById("stopwatchBtn"),
        cookieModal: document.getElementById("cookieModal"),
        cookieToggle: document.getElementById("cookieToggle"),
        closeCookieModal: document.getElementById("closeCookieModal"),
        // Radio Import
        importRadioBtn: document.getElementById("importRadioBtn"),
        radioImportModal: document.getElementById("radioImportModal"),
        radioUrlInput: document.getElementById("radioUrlInput"),
        saveRadioUrlBtn: document.getElementById("saveRadioUrlBtn"),
        closeRadioModal: document.getElementById("closeRadioModal"),
        clearRadioInput: document.getElementById("clearRadioInput"),
        radioCardTitle: document.getElementById("radioCardTitle"),
        radioModalTitle: document.getElementById("radioModalTitle"),
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
        } else {
            // Isključi kontrole koje ne rade na sistemskim stranicama
            if (elements.copyToggle) elements.copyToggle.disabled = true;
            if (elements.masterVol) elements.masterVol.disabled = true;
        }
    });

    // Initialize radio title based on custom/default on popup load
    chrome.storage.local.get(['customRadioUrl'], (res) => {
        const url = res.customRadioUrl || "";
        const isCustom = url.trim();
        const titleText = isCustom
            ? getI18nMsg("radioTitleCustom", "Radio")
            : getI18nMsg("radioTitle", "Radio IN");
        if (elements.radioCardTitle) {
            elements.radioCardTitle.textContent = titleText;
        }
        if (elements.radioModalTitle) {
            elements.radioModalTitle.textContent = titleText;
        }
    });

    elements.copyToggle?.addEventListener("change", () => {
        trackEvent(elements.copyToggle.checked ? "enable_copy_on" : "enable_copy_off");
        if (host) {
            chrome.storage.local.set({ [host]: elements.copyToggle.checked }).catch(() => { });
        }
    });
    elements.ytToggle?.addEventListener("change", (e) => {
        const isYtEnabled = e.target.checked;
        trackEvent(isYtEnabled ? "yt_dislike_on" : "yt_dislike_off");
        chrome.storage.local.set({ ytToggle: isYtEnabled }).catch(() => { });
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
    const playSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
    const pauseSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;

    chrome.runtime.sendMessage({ action: "getRadioStatus" }, (response) => {
        if (chrome.runtime.lastError) return;
        if (response && elements.radioBtn) {
            elements.radioBtn.innerHTML = response.playing ? pauseSvg : playSvg;
            if (elements.radioVol) elements.radioVol.value = response.volume;
        }
    });
    chrome.storage.onChanged.addListener((changes) => {
        if (changes.playing && elements.radioBtn) {
            const isPlaying = changes.playing.newValue;
            elements.radioBtn.innerHTML = isPlaying ? pauseSvg : playSvg;
            if (!isPlaying && elements.radioVol) {
                elements.radioVol.value = 12;
            }
        }
    });
    elements.radioVol?.addEventListener("input", () => {
        const val = parseInt(elements.radioVol.value);
        // Ne šaljemo GA ovde jer se stalno pomera
        if (elements.radioBtn.innerHTML.includes('M6 19')) {
            chrome.runtime.sendMessage({ action: "setRadioVolume", value: val });
        }
    });
    elements.radioVol?.addEventListener("change", () => {
        const val = parseInt(elements.radioVol.value);
        trackEvent("radio_volume_change", { value: val });
        chrome.storage.local.set({ volume: val }).catch(() => { });
    });
    elements.radioBtn?.addEventListener("click", () => {
        const isPlaying = elements.radioBtn.innerHTML.includes('M6 19');
        trackEvent(isPlaying ? "radio_pause" : "radio_play");
        chrome.runtime.sendMessage({ action: "toggleRadio" }, (res) => {
            if (chrome.runtime.lastError) return;
            if (res) {
                elements.radioBtn.innerHTML = res.playing ? pauseSvg : playSvg;
                if (!res.playing) elements.radioVol.value = 12;
            }
        });
    });

    // Radio Import Logic
    elements.importRadioBtn?.addEventListener("click", () => {
        trackEvent("radio_import_click");
        chrome.storage.local.get(['customRadioUrl'], (res) => {
            if (elements.radioUrlInput) {
                elements.radioUrlInput.value = res.customRadioUrl || "";
            }
            if (elements.radioImportModal) {
                elements.radioImportModal.style.display = "flex";
            }
        });
    });

    elements.closeRadioModal?.addEventListener("click", () => {
        if (elements.radioImportModal) {
            elements.radioImportModal.style.display = "none";
        }
    });

    // Clear input button handler
    elements.clearRadioInput?.addEventListener("click", () => {
        if (elements.radioUrlInput) {
            elements.radioUrlInput.value = "";
            elements.radioUrlInput.focus();
        }
    });

    // Function to update radio card and modal title based on custom/default
    function updateRadioTitle(url) {
        const isCustom = url && url.trim();
        const titleText = isCustom
            ? getI18nMsg("radioTitleCustom", "Radio")
            : getI18nMsg("radioTitle", "Radio IN");
        if (elements.radioCardTitle) {
            elements.radioCardTitle.textContent = titleText;
        }
        if (elements.radioModalTitle) {
            elements.radioModalTitle.textContent = titleText;
        }
    }

    elements.saveRadioUrlBtn?.addEventListener("click", () => {
        const url = elements.radioUrlInput.value.trim();
        chrome.storage.local.set({ customRadioUrl: url }, () => {
            if (elements.radioImportModal) {
                elements.radioImportModal.style.display = "none";
            }
            // Update title based on custom/default
            updateRadioTitle(url);
            // Proveri da li trenutno svira
            const isPlaying = elements.radioBtn.innerHTML.includes('M6 19');
            if (isPlaying) {
                // Ako svira, pošalji direktnu komandu za promenu stanice bez gašenja/paljenja
                chrome.runtime.sendMessage({ action: "playCustomUrl", url: url });
            }
        });
    });
    //#endregion

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
        }
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
        if (!host) {
            if (elements.volText) elements.volText.textContent = getI18nMsg("volumeMasterNotSupported", "Nije podržano na ovoj stranici");
            if (elements.masterVol) elements.masterVol.disabled = true;
            return;
        }
        chrome.storage.local.set({ [host + "_vol"]: val, global_vol: val }).catch(() => { });
    };
    if (host) {
        chrome.storage.local.get([host + "_vol", "global_vol"], (data) => {
            const siteVol = Number(data[host + "_vol"]);
            const globalVol = Number(data.global_vol);
            const vol = Number.isFinite(siteVol)
                ? siteVol
                : (Number.isFinite(globalVol) ? globalVol : 100);
            if (elements.masterVol) {
                elements.masterVol.value = vol;
                if (elements.volText) elements.volText.textContent = vol + "%";
            }
        });
    }
    elements.masterVol?.addEventListener("input", (e) => {
        const val = e.target.value;
        if (elements.volText) elements.volText.textContent = val + "%";
        applyVolume(val);
    });
    elements.masterVol?.addEventListener("change", (e) => {
        const val = parseInt(e.target.value);
        trackEvent("master_volume_change", { value: val });
        applyVolume(val);
    });
    elements.resetVolBtn?.addEventListener("click", () => {
        trackEvent("master_volume_reset");
        const vol = 100;
        if (elements.masterVol) {
            elements.masterVol.value = vol;
            if (elements.volText) elements.volText.textContent = vol + "%";
            applyVolume(vol);
        }
    });
    //#endregion
    //#region COLOR PICKER, NIGHT MODE, RULLER, MARKER
    elements.colorBtn?.addEventListener("click", () => {
        trackEvent("color_picker_open");
        chrome.tabs.sendMessage(tab.id, { action: "toggleColorPicker" });
        window.close();
    });
    elements.nightToggle?.addEventListener("change", (e) => {
        const isNight = e.target.checked;
        trackEvent(isNight ? "dark_mode_on" : "dark_mode_off");
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
                        let elements = [document.body, html, document.documentElement, document.querySelector('main'), document.querySelector('[role="application"]'), document.querySelector('#root'), document.querySelector('#__next')];
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
            // Silent fail
        });
    });
    elements.rulerBtn?.addEventListener("click", () => {
        trackEvent("page_ruler_open");
        chrome.tabs.sendMessage(tab.id, { action: "toggleRuler" });
        window.close();
    });
    elements.markerBtn?.addEventListener("click", () => {
        trackEvent("page_marker_open");
        chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["marker_engine.js"] }, () => {
            if (chrome.runtime.lastError) return;
            chrome.tabs.sendMessage(tab.id, { action: "initMarker" });
            window.close();
        });
    });
    //#endregion
    //#region KOLACICI I KES
    const cookieModal = document.getElementById("cookieModal");
    const realClearBtn = document.getElementById("realClearBtn");
    const closeCookieModal = document.getElementById("closeCookieModal");
    const cookieToggle = document.getElementById("cookieToggle");
    elements.clearCacheBtn?.addEventListener("click", (e) => {
        trackEvent("cookies_cache_open");
        e.preventDefault();
        cookieModal.style.display = "flex";
    });
    closeCookieModal?.addEventListener("click", () => {
        cookieModal.style.display = "none";
    });
    realClearBtn?.addEventListener("click", async () => {
        trackEvent("clear_site_data");
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
            // Silent fail
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
        const isBlocking = e.target.checked;
        trackEvent(isBlocking ? "cookie_blocker_on" : "cookie_blocker_off");
        try {
            await chrome.storage.local.set({ cookieBlock: isBlocking });
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            const tab = tabs?.[0];
            if (tab && tab.url && tab.url.startsWith("http")) {
                chrome.tabs.reload(tab.id);
            }
        } catch (err) {
            // Silent fail
        }
    });
    //#endregion
    //#region FONT PICKER
    if (elements.fontBtn) {
        elements.fontBtn.addEventListener("click", async () => {
            trackEvent("font_finder_click");
            chrome.tabs.sendMessage(tab.id, { action: "toggleFontFinder" });
            window.close();
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
            // Silent fail
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
        let hideIndicator = () => {
            saveIndicator.style.opacity = "0";
            if (isError) {
                saveIndicator.textContent = getI18nMsg("notesSaved", "Sačuvano");
                saveIndicator.style.color = "var(--accent)";
            }
        };
        // Use requestAnimationFrame for smoother UI update
        let rafId = null;
        setTimeout(() => {
            rafId = requestAnimationFrame(hideIndicator);
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
        trackEvent("smart_notes_click");
        document.getElementById("mainView").style.display = "none";
        document.getElementById("notesView").style.display = "flex";
        updateNotesCount();
        noteArea.focus();
    });
    document.getElementById("backBtn")?.addEventListener("click", () => {
        trackEvent("notes_back");
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
        clearTimeout(saveTimeout);
        noteArea.innerHTML = "";
        persistNotesHtml("");
        updateNotesCount(); // Reset count
        clearModal.style.display = "none";
    });
    // Word count za beleške
    function updateNotesCount() {
        const text = noteArea.innerText || "";
        const words = (text.match(/[\p{L}\p{N}]+/gu) || []).length;
        const chars = text.length;
        const indicator = document.getElementById("saveIndicator");
        if (indicator) {
            const savedText = getI18nMsg("savedIndicator", "Sačuvano");
            const wordLabel = getI18nMsg("wordsLabelShort", "reči");
            indicator.textContent = `${savedText} | ${words} ${wordLabel}`;
        }
    }
    // Pomoćne funkcije za čuvanje i vraćanje kursora
    function saveSelection(container) {
        const sel = window.getSelection();
        if (sel.rangeCount === 0) return null;
        const range = sel.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(container);
        preCaretRange.setEnd(range.endContainer, range.endOffset);
        return preCaretRange.toString().length;
    }
    function restoreSelection(container, savedOffset) {
        if (savedOffset === null) return;
        let charIndex = 0;
        const range = document.createRange();
        range.setStart(container, 0);
        range.collapse(true);
        const nodeStack = [container];
        let node;
        let foundStart = false;
        while (!foundStart && (node = nodeStack.pop())) {
            if (node.nodeType === Node.TEXT_NODE) {
                const nextCharIndex = charIndex + node.length;
                if (!foundStart && savedOffset >= charIndex && savedOffset <= nextCharIndex) {
                    range.setStart(node, savedOffset - charIndex);
                    range.setEnd(node, savedOffset - charIndex);
                    foundStart = true;
                }
                charIndex = nextCharIndex;
            } else {
                let i = node.childNodes.length;
                while (i--) {
                    nodeStack.push(node.childNodes[i]);
                }
            }
        }
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
    // Pametna logika i kalkulator (FIXED CURSOR)
    noteArea.addEventListener("input", (e) => {
        const calcRegex = /(\d+(?:\.\d+)?)\s*([\+\-\*\/])\s*(\d+(?:\.\d+)?)\s*=(?!\s*<b)/g;
        // Proveravamo samo tekstualni sadržaj da ne pokvarimo HTML strukturu
        if (calcRegex.test(noteArea.innerText)) {
            const savedOffset = saveSelection(noteArea);
            let html = noteArea.innerHTML;
            let offsetAdjustment = 0;
            let newHtml = html.replace(calcRegex, (match, a, op, b) => {
                let n1 = parseFloat(a), n2 = parseFloat(b), r = 0;
                if (op === '+') r = n1 + n2;
                else if (op === '-') r = n1 - n2;
                else if (op === '*') r = n1 * n2;
                else if (op === '/') r = n2 !== 0 ? n1 / n2 : 0;
                r = Math.round(r * 100) / 100;
                offsetAdjustment += String(r).length + 2; // " " + r + "\xA0" (non-breaking space)
                return `${match} <b style="color: var(--accent);">${r}</b>&nbsp;`;
            });
            if (html !== newHtml) {
                noteArea.innerHTML = newHtml;
                restoreSelection(noteArea, savedOffset !== null ? savedOffset + offsetAdjustment : null);
            }
        }
        updateNotesCount();
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
            // Silent fail
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
            // Silent fail
        }
    });
    document.getElementById("addDateBtn")?.addEventListener("click", () => {
        trackEvent("notes_add_date");
        const now = new Date();
        const str = `${now.toLocaleDateString(currentLang)} ${now.toLocaleTimeString(currentLang, { hour: '2-digit', minute: '2-digit' })}`;
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
            // Silent fail
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
        // Use requestAnimationFrame for more responsive UI update
        renderStatsDebounceId = setTimeout(() => {
            requestAnimationFrame(renderStats);
        }, 50);
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
                } else if (parts.length === 2 && parts.every((n) => Number.isFinite(n) && n > 0)) {
                    const [yyyy, mm] = parts;
                    if (yyyy >= 2000 && yyyy <= 2100 && mm >= 1 && mm <= 12) {
                        selDate = new Date(yyyy, mm - 1, 1);
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
            let activeDaysInMonth = 0; // Aktivni dani u izabranom mesecu za prosek
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
                if (key.startsWith(selMonthPrefix)) {
                    totalMonth += daySum;
                    if (daySum > 0) activeDaysInMonth++;
                }
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
            // Ažuriranje statistike - zavisno od moda
            let secondBoxValue, avgValue;
            const statBox2 = document.getElementById("statBox2");
            const trackerDateWrapper = document.getElementById("trackerDateWrapper");
            if (mode === "all") {
                // U all modu: prvi box = ukupno, drugi = skriven, treći = prosek sve
                avgValue = Math.floor(totalAll / (activeDays || 1));
                if (statBox2) statBox2.classList.add("hidden");
                if (trackerDateWrapper) trackerDateWrapper.classList.add("hidden");
            } else if (mode === "month") {
                // U month modu: prvi box = mesec, drugi = skriven, treći = prosek mesec
                avgValue = Math.floor(totalMonth / (activeDaysInMonth || 1));
                if (statBox2) statBox2.classList.add("hidden");
                if (trackerDateWrapper) trackerDateWrapper.classList.remove("hidden");
            } else {
                // U day modu: prvi box = dan, drugi = mesec, treći = prosek mesec
                secondBoxValue = totalMonth;
                avgValue = Math.floor(totalMonth / (activeDaysInMonth || 1));
                if (statBox2) statBox2.classList.remove("hidden");
                if (trackerDateWrapper) trackerDateWrapper.classList.remove("hidden");
            }
            document.getElementById("statTotal").textContent = formatTime(listTotalSec);
            if (secondBoxValue !== undefined && statBox2) {
                document.getElementById("statMonth").textContent = formatTime(secondBoxValue);
            }
            document.getElementById("statAvg").textContent = formatTime(avgValue);
            const isCurrentMonth = selDate.getMonth() === today.getMonth() && selDate.getFullYear() === today.getFullYear();
            const isToday = selDate.toDateString() === today.toDateString();
            const label = document.getElementById("statTotalLabel");
            if (mode === "day") {
                label.textContent = isToday ? getI18nMsg("trackerToday", "Danas") : getI18nMsg("trackerThatDay", "Taj dan");
            } else if (mode === "month") {
                label.textContent = isCurrentMonth ? getI18nMsg("trackerThisMonth", "Ovaj mesec") : getI18nMsg("trackerSelectedMonth", "Izabrani mesec");
            } else {
                label.textContent = getI18nMsg("trackerTotal", "Ukupno");
            }
            const monthLabel = document.getElementById("statMonthLabel");
            if (monthLabel && mode === "day") {
                monthLabel.textContent = isCurrentMonth ? getI18nMsg("trackerThisMonthShort", "Ovaj mesec") : getI18nMsg("trackerThatMonth", "Taj mesec");
            }
            const avgLabel = document.getElementById("statAvgLabel");
            if (avgLabel) {
                if (mode === "all") {
                    avgLabel.textContent = getI18nMsg("trackerAvgTotal", "Prosek");
                } else {
                    avgLabel.textContent = getI18nMsg("trackerAvgThisMonth", "Prosek (mesec)");
                }
            }
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
        trackerDate.type = "date";
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
        if (trackerDate.type === "month") {
            trackerDatePrikaz.value = `${parts[1]}.${parts[0]}.`;
        } else {
            trackerDatePrikaz.value = `${parts[2]}.${parts[1]}.${parts[0]}.`;
        }
        debouncedRenderStats();
    });
    trackerMode?.addEventListener("change", (e) => {
        const mode = e.target.value;
        trackEvent("tracker_mode_change", { mode: mode });
        if (mode === "all") {
            debouncedRenderStats();
            return;
        }
        let currentVal = trackerDate.value;
        let parts = currentVal ? currentVal.split('-') : [];
        if (mode === "month") {
            trackerDate.type = "month";
            if (parts.length >= 2) {
                trackerDate.value = `${parts[0]}-${String(parts[1]).padStart(2, '0')}`;
                trackerDatePrikaz.value = `${String(parts[1]).padStart(2, '0')}.${parts[0]}.`;
            } else {
                const d = new Date();
                trackerDate.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                trackerDatePrikaz.value = `${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}.`;
            }
        } else {
            trackerDate.type = "date";
            if (parts.length === 2) {
                trackerDate.value = `${parts[0]}-${String(parts[1]).padStart(2, '0')}-01`;
                trackerDatePrikaz.value = `01.${String(parts[1]).padStart(2, '0')}.${parts[0]}.`;
            } else if (parts.length === 3) {
                trackerDatePrikaz.value = `${String(parts[2]).padStart(2, '0')}.${String(parts[1]).padStart(2, '0')}.${parts[0]}.`;
            } else {
                const d = new Date();
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                trackerDate.value = iso;
                trackerDatePrikaz.value = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}.`;
            }
        }
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
            // Silent fail
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
                // alert removed for production
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
                // alert removed for production
            }
        });
    });
    // IMPORT: Učitavanje podataka iz fajla
    const trackerFileInput = document.getElementById("importTrackerFile");
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
                    alert(getI18nMsg("trackerImportError", "Greška: Neispravan fajl ili nema podataka."));
                    return;
                }
                chrome.storage.local.set(data, () => {
                    // Očisti tracker keš u background skripti da se spreči pregazivanje uvezenih podataka
                    chrome.runtime.sendMessage({ action: "tracker_clear_cache" }).catch(() => { });
                    renderStats();
                    alert(getI18nMsg("trackerImportSuccess", "Podaci su uspešno uvezeni!"));
                });
            } catch (err) {
                alert(getI18nMsg("trackerImportError", "Greška: Neispravan fajl ili nema podataka."));
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
    const clearCounterModal = document.getElementById("clearCounterModal");
    // Funkcija za ažuriranje brojki
    // Najrobustniji brojač karaktera, reči i redova
    function countGraphemes(str) {
        // Broji samo vidljive karaktere - ignorise nove redove (\n, \r), tabove i space na kraju
        const cleaned = str.replace(/[\r\n\t]/g, '').trimEnd();
        if (cleaned === '') return 0;
        if (typeof Intl.Segmenter === 'function') {
            const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
            let count = 0;
            for (const seg of segmenter.segment(cleaned)) count++;
            return count;
        } else {
            return Array.from(cleaned).length;
        }
    }
    function countWords(str) {
        // Broji i brojeve i reči (Unicode friendly)
        // Primer: "Hello 123" => 2 reči
        // Broji sekvence slova ili brojeva kao reč
        return (str.match(/[\p{L}\p{N}]+/gu) || []).length;
    }
    function countLines(str) {
        // Broji samo redove koji su zaista prikazani u textarea (ignoriše prazne linije koje nisu deo value)
        if (str === "") return 0;
        // Split po novom redu, ukloni prazne linije na kraju
        const lines = str.replace(/\r\n/g, '\n').split('\n');
        // Ukloni prazne linije na kraju
        while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
        return lines.length === 0 ? 1 : lines.length;
    }
    const updateCounts = (text = "") => {
        if (!charCount || !wordCount || !lineCount) return;
        const normalized = String(text);
        // Broji sve karaktere (vizuelne, emoji, invisible, whitespace, tab, sve)
        charCount.textContent = String(countGraphemes(normalized));
        // Broji reči (Unicode friendly, robustno)
        wordCount.textContent = String(countWords(normalized));
        // Broji redove (uključuje prazne redove na kraju i između)
        lineCount.textContent = String(countLines(normalized));
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
        trackEvent("character_counter_open");
        if (!counterView) return;
        document.getElementById("mainView").style.display = "none";
        counterView.style.display = "flex";
        counterArea?.focus();
    });
    // Sigurnosna mreza - change event (kada polje izgubi fokus)
    counterArea?.addEventListener("change", (e) => {
        const val = e.target.value;
        updateCounts(val);
        setSavedCounterText(val);
    });
    // Nazad na glavno
    counterBackBtn?.addEventListener("click", () => {
        trackEvent("counter_view_back");
        counterView.style.display = "none";
        document.getElementById("mainView").style.display = "block";
    });
    // Kucanje teksta
    let counterInputDebounce;
    counterArea?.addEventListener("input", (e) => {
        if (counterInputDebounce) clearTimeout(counterInputDebounce);
        counterInputDebounce = setTimeout(() => {
            trackEvent("counter_input");
        }, 2000);
        const val = e.target.value;
        updateCounts(val);
        setSavedCounterText(val);
    });
    // Modal Logika (Brisanje)
    document.getElementById("counterClearBtn")?.addEventListener("click", () => {
        trackEvent("counter_clear_open");
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
    const swModal = document.getElementById("customModal");
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
    let swRefreshUIDebounceId = null;
    const swRefreshUI = () => {
        if (swRefreshUIDebounceId) clearTimeout(swRefreshUIDebounceId);
        swRefreshUIDebounceId = setTimeout(() => {
            requestAnimationFrame(() => {
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
                        lapsList.innerHTML = `<div class=\"empty-msg\">${getI18nMsg("swNoLaps", "Nema zabeleženih momenata")}</div>`;
                    }
                });
            });
        }, 80);
    };
    let swRenderHistoryDebounceId = null;
    const swRenderHistory = () => {
        if (swRenderHistoryDebounceId) clearTimeout(swRenderHistoryDebounceId);
        swRenderHistoryDebounceId = setTimeout(() => {
            requestAnimationFrame(() => {
                chrome.storage.local.get(["history"], (data) => {
                    const historyList = document.getElementById("history-list");
                    if (!historyList) return;
                    historyList.innerHTML = "";
                    const history = Array.isArray(data.history) ? data.history : [];
                    // Limit to last 20 sessions for performance
                    const limitedHistory = history.slice(-20);
                    if (limitedHistory.length > 0) {
                        limitedHistory.slice().reverse().forEach((session, idx) => {
                            if (!session || typeof session !== "object") return;
                            const realIdx = history.length - (limitedHistory.length - idx - 1);
                            const details = document.createElement("details");
                            const summary = document.createElement("summary");
                            const sessionTime = Number.isFinite(session.sessionStart) ? new Date(session.sessionStart) : new Date();
                            const sessionLaps = Array.isArray(session.laps) ? session.laps : [];
                            const sessionDurationMs = sessionLaps.length > 0 ? sessionLaps[sessionLaps.length - 1] : 0;
                            const endTime = new Date(sessionTime.getTime() + Math.max(0, sessionDurationMs));
                            const sessionDateStr = sessionTime.toLocaleDateString(currentLang);
                            const startTimeStr = sessionTime.toLocaleTimeString(currentLang, { hour: '2-digit', minute: '2-digit' });
                            const endTimeStr = endTime.toLocaleTimeString(currentLang, { hour: '2-digit', minute: '2-digit' });
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
                                    const sessionDateFull = Number.isFinite(session.sessionStart) ? new Date(session.sessionStart).toLocaleString(currentLang) : new Date().toLocaleString(currentLang);
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
                                    // Silent fail
                                }
                            };
                            const copyBtn = document.createElement("button");
                            copyBtn.innerText = getI18nMsg("swCopyBtn", "KOPIRAJ U KLIPBORD");
                            copyBtn.className = "export-btn-mini";
                            copyBtn.style.backgroundColor = "var(--accent)";
                            copyBtn.style.color = "#000";
                            copyBtn.onclick = () => {
                                try {
                                    const sessionDateFull = Number.isFinite(session.sessionStart) ? new Date(session.sessionStart).toLocaleString(currentLang) : new Date().toLocaleString(currentLang);
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
                                        // Silent fail
                                    });
                                } catch (err) {
                                    // Silent fail
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
            }, 100);
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
                return;
            }
            const now = Date.now();
            chrome.storage.local.set({ isRunning: true, startTime: now, currentLaps: [] }, swRefreshUI);
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
                // Silent fail
            });
            swHistoryWriteQueue.then(() => {
                swRefreshUI();
                swRenderHistory();
            });
        });
    });
    document.addEventListener("keydown", (e) => {
        if (e.altKey && e.shiftKey && (e.key.toLowerCase() === "l")) {
            const stopwatchView = document.getElementById("stopwatchView");
            const isStopwatchVisible = stopwatchView && stopwatchView.style.display !== "none";
            if (isStopwatchVisible) {
                trackEvent("stopwatch_shortcut_lap");
                chrome.runtime.sendMessage({ action: "manual_lap" }).catch(() => { });
            }
        }
    });
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
            // Silent fail
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
        trackEvent("website_click");
        chrome.tabs.create({ url: "https://allinone.milanwebportal.com" });
    });
    document.getElementById("portalBtn")?.addEventListener("click", () => {
        trackEvent("milanwebportal_click");
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
    // Uklonjen JS handler za emailBtn, koristi se samo <a href="mailto:...">
    // Kopiranje email adrese u settings footeru
    const copyEmailBtn = document.getElementById("copyEmailBtn");
    if (copyEmailBtn) {
        // Tooltip je uklonjen radi savršenog poravnanja
        copyEmailBtn.addEventListener("click", async () => {
            const email = "contact@milanwebportal.com";
            try {
                await navigator.clipboard.writeText(email);
            } catch { }
        });
    }
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
                    const techCatMap = {
                        'Osnova': getI18nMsg('techCatBase', 'Osnova'),
                        'Sistem': getI18nMsg('techCatSystem', 'Sistem'),
                        'E Trgovina': getI18nMsg('techCatEcom', 'E Trgovina'),
                        'Tehnologije': getI18nMsg('techCatTech', 'Tehnologije'),
                        'Stilovi': getI18nMsg('techCatStyles', 'Stilovi'),
                        'Baza Podataka': getI18nMsg('techCatDb', 'Baza Podataka'),
                        'Backend': getI18nMsg('techCatBackend', 'Backend'),
                        'Server': getI18nMsg('techCatServer', 'Server'),
                        'Mreža': getI18nMsg('techCatNetwork', 'Mreža'),
                        'Sigurnost': getI18nMsg('techCatSecurity', 'Sigurnost'),
                        'Keširanje': getI18nMsg('techCatCaching', 'Keširanje'),
                        'CDN': getI18nMsg('techCatCdn', 'CDN'),
                        'Analitika': getI18nMsg('techCatAnalytics', 'Analitika'),
                        'Reklame': getI18nMsg('techCatAds', 'Reklame'),
                        'Plaćanje': getI18nMsg('techCatPayment', 'Plaćanje'),
                        'Komunikacija': getI18nMsg('techCatComm', 'Komunikacija'),
                        'Mediji': getI18nMsg('techCatMedia', 'Mediji'),
                        'Build': getI18nMsg('techCatBuild', 'Build'),
                        'SEO': getI18nMsg('techCatSeo', 'SEO'),
                        'Statistika': getI18nMsg('techCatStats', 'Statistika'),
                        'Alati': getI18nMsg('techCatTools', 'Alati')
                    };
                    const techStatLabels = {
                        dom: getI18nMsg('techStatDom', 'DOM'),
                        images: getI18nMsg('techStatImages', 'Slike'),
                        scripts: getI18nMsg('techStatScripts', 'Skripte'),
                        links: getI18nMsg('techStatLinks', 'Linkovi'),
                        css: getI18nMsg('techStatCss', 'CSS'),
                        forms: getI18nMsg('techStatForms', 'Forme'),
                        tables: getI18nMsg('techStatTables', 'Tabele'),
                        svg: getI18nMsg('techStatSvg', 'SVG'),
                        video: getI18nMsg('techStatVideo', 'Video'),
                        audio: getI18nMsg('techStatAudio', 'Audio'),
                        iframes: getI18nMsg('techStatIframes', 'Iframe')
                    };
                    chrome.scripting.executeScript({
                        target: { tabId: tabId },
                        world: "MAIN",
                        func: async (foundLabel, noneFoundLabel, catMap, statLabels) => {
                            const results = [];
                            const add = (category, name, detail = "") => {
                                if (!category || !name) return;
                                const translatedCat = catMap[category] || category;
                                results.push({ category: translatedCat, name, detail });
                            };
                            const getAttr = (el, attr) => (el?.getAttribute?.(attr) || "").toLowerCase();
                            const html = document.documentElement;
                            const scriptEls = Array.from(document.scripts);
                            const scripts = scriptEls.map(s => (s.src || '').toLowerCase()).filter(Boolean);
                            const inlineScripts = scriptEls.map(s => s.textContent || '').join('\n').toLowerCase();
                            const linkEls = Array.from(document.querySelectorAll('link'));
                            const links = linkEls.map(l => (l.href || '').toLowerCase()).filter(Boolean);
                            const metas = Array.from(document.querySelectorAll('meta'));
                            const getMetaByName = (name) => {
                                const el = metas.find(m => (m.getAttribute('name') || '').toLowerCase() === name.toLowerCase());
                                return el ? (el.getAttribute('content') || '') : '';
                            };
                            // Osnova
                            add('Osnova', 'HTML5');
                            add('Osnova', 'JavaScript');
                            if (document.characterSet) add('Osnova', document.characterSet);
                            if (window.location.protocol === 'https:') add('Osnova', 'HTTPS');
                            if (getMetaByName('viewport')) add('Osnova', 'Viewport');
                            if (getMetaByName('theme-color')) add('Osnova', 'Theme Color');
                            if (html.lang) add('Osnova', html.lang.toUpperCase());
                            if (document.querySelector('link[rel="manifest"]')) add('Osnova', 'PWA');
                            if (window.speechSynthesis) add('Osnova', 'Web Speech API');
                            if (window.WebGLRenderingContext) add('Osnova', 'WebGL');
                            if (window.caches) add('Osnova', 'Cache API');
                            if (navigator.serviceWorker) add('Osnova', 'Service Workers');
                            if (window.indexedDB) add('Osnova', 'IndexedDB');
                            if (window.WebAssembly) add('Osnova', 'WebAssembly');
                            if (window.RTCPeerConnection) add('Osnova', 'WebRTC');
                            if (navigator.geolocation) add('Osnova', 'Geolocation');
                            // Mreža i IP 
                            try {
                                const siteHost = window.location.hostname;
                                const dnsRes = await fetch('https://dns.google/resolve?name=' + encodeURIComponent(siteHost) + '&type=A');
                                const dnsJson = await dnsRes.json();
                                const ip = dnsJson?.Answer?.find(a => a.type === 1)?.data;
                                if (ip) {
                                    const ipinfoRes = await fetch('https://ipinfo.io/' + ip + '/json');
                                    const ipinfo = await ipinfoRes.json();
                                    if (ipinfo.ip) add('Mreža', ipinfo.ip);
                                    if (ipinfo.hostname) add('Mreža', ipinfo.hostname);
                                    if (ipinfo.org) add('Mreža', ipinfo.org);
                                    let lokacija = [];
                                    if (ipinfo.city) lokacija.push(ipinfo.city);
                                    if (ipinfo.country) lokacija.push(ipinfo.country);
                                    if (lokacija.length) add('Mreža', lokacija.join(', '));
                                    if (ipinfo.loc) add('Mreža', ipinfo.loc);
                                    if (ipinfo.timezone) add('Mreža', ipinfo.timezone);
                                    if (ipinfo.postal) add('Mreža', ipinfo.postal);
                                }
                            } catch (e) { }
                            // CDNs
                            if (scripts.some(s => s.includes('cdnjs'))) add('CDN', 'CDNJS');
                            if (scripts.some(s => s.includes('jsdelivr'))) add('CDN', 'jsDelivr');
                            if (scripts.some(s => s.includes('unpkg'))) add('CDN', 'UNPKG');
                            if (links.some(l => l.includes('fonts.googleapis.com'))) add('CDN', 'Google Fonts');
                            if (links.some(l => l.includes('use.typekit.net'))) add('CDN', 'Adobe Fonts');
                            if (scripts.some(s => s.includes('stackpath.bootstrapcdn.com'))) add('CDN', 'BootstrapCDN');
                            if (scripts.some(s => s.includes('cloudflare'))) add('CDN', 'Cloudflare');
                            if (scripts.some(s => s.includes('fastly'))) add('CDN', 'Fastly');
                            // Statistika stranice (oznake iz prevoda / statLabels)
                            add('Statistika', document.getElementsByTagName('*').length + ' ' + statLabels.dom);
                            add('Statistika', document.images.length + ' ' + statLabels.images);
                            add('Statistika', scriptEls.length + ' ' + statLabels.scripts);
                            add('Statistika', document.links.length + ' ' + statLabels.links);
                            add('Statistika', linkEls.filter(l => getAttr(l, 'rel') === 'stylesheet').length + ' ' + statLabels.css);
                            add('Statistika', document.forms.length + ' ' + statLabels.forms);
                            if (document.getElementsByTagName('table').length > 0) add('Statistika', document.getElementsByTagName('table').length + ' ' + statLabels.tables);
                            if (document.getElementsByTagName('svg').length > 0) add('Statistika', document.getElementsByTagName('svg').length + ' ' + statLabels.svg);
                            if (document.getElementsByTagName('video').length > 0) add('Statistika', document.getElementsByTagName('video').length + ' ' + statLabels.video);
                            if (document.getElementsByTagName('audio').length > 0) add('Statistika', document.getElementsByTagName('audio').length + ' ' + statLabels.audio);
                            if (document.getElementsByTagName('iframe').length > 0) add('Statistika', document.getElementsByTagName('iframe').length + ' ' + statLabels.iframes);
                            // SEO tagovi
                            if (document.title) add('SEO', 'Title');
                            if (getMetaByName('description')) add('SEO', 'Description');
                            if (getMetaByName('keywords')) add('SEO', 'Keywords');
                            if (getMetaByName('robots')) add('SEO', 'Robots');
                            if (getMetaByName('author')) add('SEO', 'Author');
                            if (document.querySelector('link[rel="canonical"]')) add('SEO', 'Canonical');
                            if (document.querySelector('link[rel="alternate"][hreflang]')) add('SEO', 'Hreflang');
                            if (metas.some(m => m.getAttribute('property')?.startsWith('og:'))) add('SEO', 'Open Graph');
                            if (metas.some(m => getAttr(m, 'name').startsWith('twitter:'))) add('SEO', 'Twitter Cards');
                            if (document.querySelector('script[type="application/ld+json"]')) add('SEO', 'JSON LD');
                            if (document.querySelector('[itemscope]')) add('SEO', 'Microdata');
                            if (document.querySelector('h1')) add('SEO', 'H1 Tag');
                            // Backend i server headeri
                            try {
                                const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
                                const header = (name) => (response.headers.get(name) || '').toLowerCase();
                                const server = header('server');
                                const poweredBy = header('x-powered-by');
                                if (server.includes('nginx')) add('Server', 'Nginx');
                                if (server.includes('apache')) add('Server', 'Apache');
                                if (server.includes('litespeed')) add('Server', 'LiteSpeed');
                                if (server.includes('cloudflare')) add('Server', 'Cloudflare');
                                if (server.includes('varnish')) add('Server', 'Varnish');
                                if (server.includes('cowboy')) add('Server', 'Cowboy');
                                if (server.includes('iis')) add('Server', 'IIS');
                                if (server.includes('caddy')) add('Server', 'Caddy');
                                if (poweredBy.includes('php')) add('Backend', 'PHP');
                                if (poweredBy.includes('express')) add('Backend', 'Express.js');
                                if (poweredBy.includes('asp.net')) add('Backend', 'ASP.NET');
                                if (poweredBy.includes('laravel')) add('Backend', 'Laravel');
                                if (poweredBy.includes('next')) add('Backend', 'Next.js');
                                if (poweredBy.includes('django')) add('Backend', 'Django');
                                if (poweredBy.includes('ruby')) add('Backend', 'Ruby on Rails');
                                if (poweredBy.includes('python')) add('Backend', 'Python');
                                if (poweredBy.includes('java')) add('Backend', 'Java');
                                if (header('content-security-policy')) add('Sigurnost', 'CSP');
                                if (header('strict-transport-security')) add('Sigurnost', 'HSTS');
                                if (header('x-frame-options')) add('Sigurnost', 'X Frame Options');
                                if (header('x-content-type-options')) add('Sigurnost', 'X Content Type Options');
                                if (header('referrer-policy')) add('Sigurnost', 'Referrer Policy');
                                if (header('permissions-policy')) add('Sigurnost', 'Permissions Policy');
                                if (header('access-control-allow-origin')) add('Sigurnost', 'CORS');
                                if (header('cache-control')) add('Keširanje', 'Cache Control');
                                if (header('etag')) add('Keširanje', 'ETag');
                                if (header('cf-cache-status')) add('Keširanje', 'Cloudflare Cache');
                            } catch (e) { }
                            // CMS
                            const generator = getMetaByName('generator').toLowerCase();
                            if (generator.includes('wordpress') || links.some(l => l.includes('wp-content'))) add('Sistem', 'WordPress');
                            if (generator.includes('joomla')) add('Sistem', 'Joomla');
                            if (generator.includes('wix')) add('Sistem', 'Wix');
                            if (generator.includes('drupal')) add('Sistem', 'Drupal');
                            if (html.hasAttribute('data-wf-site')) add('Sistem', 'Webflow');
                            if (generator.includes('ghost')) add('Sistem', 'Ghost');
                            if (generator.includes('squarespace')) add('Sistem', 'Squarespace');
                            if (generator.includes('weebly')) add('Sistem', 'Weebly');
                            if (window.contentful) add('Sistem', 'Contentful');
                            // E Trgovina i Plaćanja
                            if (window.Shopify || scripts.some(s => s.includes('shopify'))) add('E Trgovina', 'Shopify');
                            if (document.querySelector('.woocommerce')) add('E Trgovina', 'WooCommerce');
                            if (window.Magento) add('E Trgovina', 'Magento');
                            if (generator.includes('prestashop')) add('E Trgovina', 'PrestaShop');
                            if (generator.includes('opencart')) add('E Trgovina', 'OpenCart');
                            if (window.Stripe) add('Plaćanje', 'Stripe');
                            if (window.paypal) add('Plaćanje', 'PayPal');
                            // Frameworks i njihove verzije
                            const nextBuild = window.__NEXT_DATA__?.buildId ? `Build ${window.__NEXT_DATA__.buildId}` : '';
                            if (document.querySelector('#__next') || window.next || window.__NEXT_DATA__) add('Tehnologije', 'Next.js', nextBuild);
                            if (document.querySelector('#___gatsby') || window.gatsby) add('Tehnologije', 'Gatsby');
                            const reactVer = window.React?.version ? `v${window.React.version}` : '';
                            if (window.React || window.__REACT_DEVTOOLS_GLOBAL_HOOK__ || document.querySelector('[data-reactroot]')) add('Tehnologije', 'React', reactVer);
                            const vueVer = window.Vue?.version ? `v${window.Vue.version}` : '';
                            if (window.Vue || document.querySelector('[data-v-app]') || window.__VUE__) add('Tehnologije', 'Vue.js', vueVer);
                            const angularVer = document.querySelector('[ng-version]')?.getAttribute('ng-version');
                            if (window.angular || angularVer) add('Tehnologije', 'Angular', angularVer ? `v${angularVer}` : '');
                            if (window.Svelte || document.querySelector('[data-svelte-h]')) add('Tehnologije', 'Svelte');
                            if (window.__NUXT__ || document.querySelector('#__nuxt')) add('Tehnologije', 'Nuxt.js');
                            if (window.Remix || window.__remixContext) add('Tehnologije', 'Remix');
                            if (document.querySelector('astro-island') || window.Astro) add('Tehnologije', 'Astro');
                            if (window.Preact) add('Tehnologije', 'Preact');
                            const emberVer = window.Ember?.VERSION ? `v${window.Ember.VERSION}` : '';
                            if (window.Ember) add('Tehnologije', 'Ember.js', emberVer);
                            if (window.Meteor) add('Tehnologije', 'Meteor');
                            // Biblioteke i Alati sa verzijama
                            const jqVersion = window.jQuery?.fn?.jquery ? `v${window.jQuery.fn.jquery}` : '';
                            if (window.jQuery) add('Tehnologije', 'jQuery', jqVersion);
                            if (window._) add('Tehnologije', 'Lodash', window._.VERSION ? `v${window._.VERSION}` : '');
                            if (window.moment) add('Tehnologije', 'Moment.js', window.moment.version ? `v${window.moment.version}` : '');
                            if (window.axios) add('Tehnologije', 'Axios', window.axios.VERSION ? `v${window.axios.VERSION}` : '');
                            if (window.d3) add('Tehnologije', 'D3.js', window.d3.version ? `v${window.d3.version}` : '');
                            if (window.Chart) add('Tehnologije', 'Chart.js', window.Chart.version ? `v${window.Chart.version}` : '');
                            if (window.Swiper) add('Tehnologije', 'Swiper.js');
                            if (window.gsap) add('Tehnologije', 'GSAP', window.gsap.version ? `v${window.gsap.version}` : '');
                            if (window.THREE) add('Tehnologije', 'Three.js', window.THREE.REVISION ? `r${window.THREE.REVISION}` : '');
                            if (window.anime) add('Tehnologije', 'Anime.js', window.anime.version ? `v${window.anime.version}` : '');
                            if (window.PIXI) add('Tehnologije', 'PixiJS', window.PIXI.VERSION ? `v${window.PIXI.VERSION}` : '');
                            if (window.Alpine) add('Tehnologije', 'Alpine.js', window.Alpine.version ? `v${window.Alpine.version}` : '');
                            if (window.firebase) add('Baza Podataka', 'Firebase');
                            if (window.supabase) add('Baza Podataka', 'Supabase');
                            if (window.io) add('Tehnologije', 'Socket.io');
                            // CSS 
                            if (links.some(l => l.includes('tailwindcss')) || scripts.some(s => s.includes('tailwind')) || document.querySelector('[class*="tw-"]')) add('Stilovi', 'Tailwind CSS');
                            if (document.querySelector('[class*="shadcn"]') || document.querySelector('[data-radix-collection]')) add('Stilovi', 'Shadcn UI / Radix UI');
                            if (document.querySelector('[class*="daisy"]') || document.querySelector('[data-theme]')) add('Stilovi', 'DaisyUI');
                            if (document.querySelector('[class*="mantine-"]')) add('Stilovi', 'Mantine');
                            if (window.ChakraUI || document.querySelector('[class*="chakra-"]')) add('Stilovi', 'Chakra UI');
                            if (document.querySelector('[class*="flowbite"]')) add('Stilovi', 'Flowbite');
                            if (links.some(l => l.includes('bootstrap')) || scripts.some(s => s.includes('bootstrap'))) add('Stilovi', 'Bootstrap');
                            if (links.some(l => l.includes('bulma'))) add('Stilovi', 'Bulma');
                            if (links.some(l => l.includes('foundation'))) add('Stilovi', 'Foundation');
                            if (links.some(l => l.includes('materialize'))) add('Stilovi', 'Materialize');
                            if (document.querySelector('style[data-emotion]')) add('Stilovi', 'Emotion');
                            if (document.querySelector('style[data-styled]')) add('Stilovi', 'Styled Components');
                            if (links.some(l => l.includes('font-awesome') || l.includes('fontawesome'))) add('Stilovi', 'FontAwesome');
                            if (links.some(l => l.includes('bootstrap-icons'))) add('Stilovi', 'Bootstrap Icons');
                            // Alati i Auth
                            if (window.Clerk || window.__clerk_js_version) add('Alati', 'Clerk Auth');
                            if (window.auth0) add('Alati', 'Auth0');
                            if (window.Sentry || window.__SENTRY__) add('Alati', 'Sentry');
                            if (window.posthog) add('Analitika', 'PostHog');
                            if (window.umami) add('Analitika', 'Umami');
                            if (window.fathom) add('Analitika', 'Fathom');
                            if (window.Stripe) add('Plaćanje', 'Stripe');
                            if (window.lemonSqueezy || window.LemonSqueezy) add('Plaćanje', 'Lemon Squeezy');
                            // Build
                            if (scripts.some(s => s.includes('vite') || inlineScripts.includes('@vite/client'))) add('Build', 'Vite');
                            if (scripts.some(s => s.includes('webpack') || inlineScripts.includes('webpackjsonp'))) add('Build', 'Webpack');
                            if (scripts.some(s => s.includes('parcel'))) add('Build', 'Parcel');
                            if (scripts.some(s => s.includes('rollup'))) add('Build', 'Rollup');
                            if (scripts.some(s => s.includes('babel'))) add('Build', 'Babel');
                            // Analitika
                            const gaMatch = inlineScripts.match(/(g-[a-z0-9]{4,}|ua-\d+-\d+)/i);
                            const gaId = gaMatch ? gaMatch[0].toUpperCase() : '';
                            if (window.ga || window.gtag || scripts.some(s => s.includes('google-analytics'))) add('Analitika', 'Google Analytics', gaId);
                            const fbMatch = inlineScripts.match(/fbq\s*\(\s*['"]init['"]\s*,\s*['"](\d+)['"]/i);
                            const fbId = fbMatch ? fbMatch[1] : '';
                            if (window.fbq || scripts.some(s => s.includes('fbevents.js'))) add('Analitika', 'Meta Pixel', fbId);
                            if (window.hj || scripts.some(s => s.includes('hotjar'))) add('Analitika', 'Hotjar');
                            if (window.clarity || scripts.some(s => s.includes('clarity.ms'))) add('Analitika', 'Microsoft Clarity');
                            if (scripts.some(s => s.includes('plausible.io'))) add('Analitika', 'Plausible');
                            const gtmMatch = inlineScripts.match(/gtm-[a-z0-9]+/i);
                            const gtmId = gtmMatch ? gtmMatch[0].toUpperCase() : '';
                            if (window.google_tag_manager || scripts.some(s => s.includes('googletagmanager'))) add('Analitika', 'Google Tag Manager', gtmId);
                            if (window.Matomo || scripts.some(s => s.includes('matomo'))) add('Analitika', 'Matomo');
                            if (window.mixpanel) add('Analitika', 'Mixpanel');
                            if (window.analytics) add('Analitika', 'Segment');
                            if (scripts.some(s => s.includes('tiktok.com'))) add('Analitika', 'TikTok Pixel');
                            if (scripts.some(s => s.includes('snap.licdn.com'))) add('Analitika', 'LinkedIn Insight');
                            // Komunikacija i Mediji
                            if (window.Intercom) add('Komunikacija', 'Intercom');
                            if (window.$crisp) add('Komunikacija', 'Crisp Chat');
                            if (window.Tawk_API) add('Komunikacija', 'Tawk.to');
                            if (window.zE) add('Komunikacija', 'Zendesk');
                            if (document.querySelector('iframe[src*="youtube.com"]')) add('Mediji', 'YouTube Player');
                            if (document.querySelector('iframe[src*="vimeo.com"]')) add('Mediji', 'Vimeo Player');
                            if (window.videojs) add('Mediji', 'Video.js');
                            if (scripts.some(s => s.includes('adsbygoogle'))) add('Reklame', 'Google AdSense');
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
                                const priority = [
                                    catMap['Osnova'], catMap['Sistem'], catMap['E Trgovina'],
                                    catMap['Tehnologije'], catMap['Stilovi'], catMap['Baza Podataka'],
                                    catMap['Backend'], catMap['Server'], catMap['Mreža'],
                                    catMap['Sigurnost'], catMap['Keširanje'], catMap['CDN'],
                                    catMap['Analitika'], catMap['Reklame'], catMap['Plaćanje'],
                                    catMap['Komunikacija'], catMap['Mediji'], catMap['Build'],
                                    catMap['SEO'], catMap['Statistika'], catMap['Alati']
                                ];
                                const catA = priority.indexOf(a.category);
                                const catB = priority.indexOf(b.category);
                                if (catA !== catB) return (catA === -1 ? 99 : catA) - (catB === -1 ? 99 : catB);
                                return String(a.name).localeCompare(String(b.name));
                            });
                            return unique;
                        },
                        args: [getI18nMsg("techFoundPrefix", "Pronađeno: "), getI18nMsg("techNotFound", "Nije pronađeno."), techCatMap, techStatLabels]
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
                                    summary.textContent = `${getI18nMsg("techFoundPrefix", "Pronađeno: ")} ${resultCount} ${getI18nMsg("techItemsSuffix", "stavki")}`;
                                    listContainer.appendChild(summary);
                                }
                                const grouped = {};
                                res[0].result.forEach(item => {
                                    if (!grouped[item.category]) grouped[item.category] = [];
                                    grouped[item.category].push(item);
                                });
                                Object.entries(grouped).forEach(([category, items]) => {
                                    const groupTitle = document.createElement("div");
                                    groupTitle.className = "tech-group-title";
                                    groupTitle.textContent = category;
                                    groupTitle.style.marginTop = "18px";
                                    groupTitle.style.fontWeight = "bold";
                                    groupTitle.style.fontSize = "15px";
                                    groupTitle.style.color = "var(--accent, #00ff88)";
                                    listContainer.appendChild(groupTitle);
                                    items.forEach(item => {
                                        const el = document.createElement("div");
                                        el.className = "tech-item";
                                        const icon = document.createElement("div");
                                        icon.className = "tech-icon";
                                        icon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>';
                                        const info = document.createElement("div");
                                        info.className = "tech-info";
                                        const name = document.createElement("span");
                                        name.className = "tech-name";
                                        name.textContent = String(item.name || "");
                                        info.appendChild(name);
                                        if (item.detail) {
                                            const detail = document.createElement("span");
                                            detail.className = "tech-detail";
                                            detail.textContent = String(item.detail);
                                            info.appendChild(detail);
                                        }
                                        el.appendChild(icon);
                                        el.appendChild(info);
                                        listContainer.appendChild(el);
                                    });
                                });
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
                listContainer.innerHTML = `<div style="color: var(--text-dim); text-align: center;">${getI18nMsg("techScannerFailed", "Skeniranje nije uspelo na ovoj stranici.")}</div>`;
            }
        } catch (err) {
            // Silent fail
        } finally {
            // Reset view
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