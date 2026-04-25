const AIO_API_ENDPOINT = "https://allinone.milanwebportal.com/api/track";
const MAX_HEARTBEAT_SECONDS = 5;

let eventStatsCache = null;
let eventStatsLoadPromise = null;
let eventStatsDebounce = null;
let gaClientIdPromise = null;

function ensureEventStatsCache() {
    if (eventStatsCache !== null) return Promise.resolve(eventStatsCache);
    if (!eventStatsLoadPromise) {
        eventStatsLoadPromise = chrome.storage.local.get(["eventStats"]).then((res) => {
            eventStatsCache = res.eventStats || {};
            return eventStatsCache;
        });
    }
    return eventStatsLoadPromise;
}

function ensureGaClientId() {
    if (!gaClientIdPromise) {
        gaClientIdPromise = chrome.storage.local.get(["aio_ga_cid"]).then(async (res) => {
            const existing = res.aio_ga_cid;
            if (existing && typeof existing === "string") return existing;
            const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
            await chrome.storage.local.set({ aio_ga_cid: id });
            return id;
        });
    }
    return gaClientIdPromise;
}

function trackEvent(eventName, eventData = {}) {
    ensureEventStatsCache().then(() => {
        eventStatsCache[eventName] = (eventStatsCache[eventName] || 0) + 1;
        if (eventStatsDebounce) clearTimeout(eventStatsDebounce);
        eventStatsDebounce = setTimeout(() => {
            chrome.storage.local.set({ eventStats: eventStatsCache });
            eventStatsDebounce = null;
        }, 300);
    }).catch(() => { });

    ensureGaClientId()
        .then((clientId) => {
            const body = {
                client_id: clientId,
                events: [
                    {
                        name: eventName,
                        params: {
                            ...eventData
                        }
                    }
                ]
            };
            return fetch(AIO_API_ENDPOINT, {
                method: "POST",
                body: JSON.stringify(body),
                keepalive: true,
                headers: { "Content-Type": "application/json" }
            });
        })
        .then((response) => {
            if (response && !response.ok) {
                console.warn("GA fetch failed:", response.status, response.statusText);
            }
        })
        .catch((err) => {
            console.warn("GA fetch error:", err);
        });
}

// --- OFFSCREEN ---
let offscreenCreating = false;
let offscreenCreatePromise = null;
let bgI18nDict = null;

chrome.storage.onChanged.addListener((changes) => {
    if (changes.appLang) {
        loadBgTranslations(changes.appLang.newValue);
    }
});

async function loadBgTranslations(lang) {
    try {
        const res = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
        bgI18nDict = await res.json();
    } catch (e) { }
}
chrome.storage.local.get(['appLang'], (data) => {
    loadBgTranslations(data.appLang || 'sr');
});

function getI18nMsg(key, defaultText) {
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
        const msg = chrome.i18n.getMessage(key);
        if (msg) return msg;
    }
    return defaultText;
}

function safeSendRuntimeMessage(payload) {
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

async function setupOffscreen() {
    if (await chrome.offscreen.hasDocument()) return;

    if (offscreenCreating) return offscreenCreatePromise;

    offscreenCreating = true;
    offscreenCreatePromise = (async () => {
        try {
            await chrome.offscreen.createDocument({
                url: 'offscreen.html',
                reasons: ['AUDIO_PLAYBACK'],
                justification: getI18nMsg("offscreenJustification", "Radio streaming and system sounds")
            });
        } catch (err) {
            const msg = String(err?.message || err || "").toLowerCase();
            const alreadyExists = msg.includes("only a single offscreen") || msg.includes("already exists");
            if (!alreadyExists) throw err;
        } finally {
            offscreenCreating = false;
            offscreenCreatePromise = null;
        }
    })();

    return offscreenCreatePromise;
}

async function playSystemSound(type) {
    try {
        await setupOffscreen();
        safeSendRuntimeMessage({ action: "playAudio", soundType: type });
    } catch (e) {
        console.error("Audio error:", e);
    }
}

async function checkRealRadioStatus() {
    const hasDocument = await chrome.offscreen.hasDocument();
    if (!hasDocument) {
        const data = await chrome.storage.local.get('playing');
        if (data.playing) {
            await chrome.storage.local.set({ playing: false }).catch(() => { });
        }
        return false;
    }
    const data = await chrome.storage.local.get('playing');
    return data.playing || false;
}

function toOriginSet(urlString) {
    try {
        const url = new URL(urlString);
        const host = url.hostname.toLowerCase();
        if (!host) return [];

        const set = new Set([`https://${host}`, `http://${host}`]);

        if (host.startsWith("www.") && host.length > 4) {
            const bareHost = host.slice(4);
            set.add(`https://${bareHost}`);
            set.add(`http://${bareHost}`);
        } else if (host.includes(".")) {
            set.add(`https://www.${host}`);
            set.add(`http://www.${host}`);
        }

        return Array.from(set);
    } catch {
        return [];
    }
}

function browsingDataRemovePromise(options, dataToRemove) {
    return new Promise((resolve) => {
        chrome.browsingData.remove(options, dataToRemove, () => resolve());
    });
}

async function clearSiteDataEverywhere(urlString) {
    const origins = toOriginSet(urlString);
    if (origins.length === 0) throw new Error("invalid-origin");

    await browsingDataRemovePromise(
        { origins },
        {
            cache: true,
            cacheStorage: true,
            cookies: true,
            fileSystems: true,
            indexedDB: true,
            localStorage: true,
            serviceWorkers: true,
            webSQL: true
        }
    );
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const action = request?.action;

    if (action === "sw_start_session") {
        chrome.storage.local.set({ lastLapTime: 0 }).catch(() => { });
        sendResponse({ ok: true });
        return true;
    }

    if (action === "aio_track_event") {
        try {
            const eventName = request.eventName;
            const eventData = request.eventData || {};
            trackEvent(eventName, eventData);
            sendResponse({ ok: true });
        } catch (err) {
            sendResponse({ ok: false, error: err?.message || "error" });
        }
        return false;
    }

    if (action === "shortcut_triggered") {
        const toolAction = request.toolAction;
        if (toolAction === "dark_mode_toggle") {
            chrome.storage.local.get(['darkMode'], (res) => {
                chrome.storage.local.set({ darkMode: !res.darkMode });
            });
        } else if (toolAction === "enable_copy_toggle") {
            chrome.storage.local.get(['copyEnabled'], (res) => {
                chrome.storage.local.set({ copyEnabled: !res.copyEnabled });
            });
        } else if (toolAction === "page_marker_open") {
            chrome.scripting.executeScript({
                target: { tabId: sender.tab.id },
                files: ['marker_engine.js']
            }).then(() => {
                chrome.tabs.sendMessage(sender.tab.id, { action: "initMarker" });
            }).catch(() => { });
        } else if (toolAction === "page_ruler_open") {
            chrome.tabs.sendMessage(sender.tab.id, { action: "toggleRuler" });
        } else if (toolAction === "font_finder_open") {
            chrome.tabs.sendMessage(sender.tab.id, { action: "toggleFontFinder" });
        } else if (toolAction === "color_picker_open") {
            chrome.tabs.sendMessage(sender.tab.id, { action: "toggleColorPicker" });
        }
        return false;
    }

    if (action === "toggleRadio") {
        trackEvent("radio_toggle");
        handleToggle(sendResponse);
        return true;
    }

    if (action === "playCustomUrl") {
        const radioTitle = bgI18nDict?.radioTitle?.message || "Radio IN";
        const radioArtist = bgI18nDict?.radioArtist?.message || "Pokreće All In One ekstenzija";
        const currentVol = request.volume ?? 12;

        safeSendRuntimeMessage({
            action: "play",
            volume: currentVol,
            title: radioTitle,
            artist: radioArtist,
            url: request.url
        });
        sendResponse({ ok: true });
        return false;
    }

    if (action === "setRadioVolume") {
        trackEvent("radio_volume_change", { value: request.value });
        safeSendRuntimeMessage({ action: "setVolume", value: request.value });
        sendResponse({ ok: true });
        return false;
    }

    if (action === "getRadioStatus") {
        (async () => {
            try {
                const isActuallyPlaying = await checkRealRadioStatus();
                const data = await chrome.storage.local.get(['volume']);
                sendResponse({
                    playing: isActuallyPlaying,
                    volume: data.volume !== undefined ? data.volume : 12
                });
            } catch (err) {
                try { sendResponse({ playing: false, volume: 12, error: err?.message || "error" }); } catch { }
            }
        })();
        return true;
    }

    if (action === "hardwarePlay") {
        (async () => {
            try {
                const data = await chrome.storage.local.get(['volume']);
                const currentVol = data.volume ?? 12;

                const radioTitle = bgI18nDict?.radioTitle?.message || "Radio IN";
                const radioArtist = bgI18nDict?.radioArtist?.message || "Pokreće All In One ekstenzija";
                const storage = await chrome.storage.local.get(['customRadioUrl']);
                const customUrl = storage.customRadioUrl;

                safeSendRuntimeMessage({
                    action: "play",
                    volume: currentVol,
                    title: radioTitle,
                    artist: radioArtist,
                    url: customUrl
                });
                await chrome.storage.local.set({ playing: true }).catch(() => { });
                sendResponse({ ok: true });
            } catch (err) {
                try { sendResponse({ ok: false, error: err?.message || "error" }); } catch { }
            }
        })();
        return true;
    }

    if (action === "hardwarePause") {
        safeSendRuntimeMessage({ action: "pause" });
        chrome.storage.local.set({ playing: false }).then(() => {
            sendResponse({ ok: true });
        });
        return true;
    }

    if (action === "manual_lap") {
        trackEvent("stopwatch_lap");
        handleLapLogic();
        sendResponse({ ok: true });
        return false;
    }

    if (action === "tracker_force_tick") {
        trackEvent("tracker_refresh", { domain: request?.domain || "" });
        const run = runTrackerMutation(async () => {
            if (trackerDebounce) {
                clearTimeout(trackerDebounce);
                trackerDebounce = null;
                const today = new Date();
                const dateKey = `tracker_${today.getFullYear()}_${today.getMonth() + 1}_${today.getDate()}`;
                if (trackerCache && trackerCache[dateKey]) {
                    await chrome.storage.local.set({ [dateKey]: trackerCache[dateKey] });
                }
            }
            await trackerWriteQueue;
        });
        run.then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
        return true;
    }

    if (action === "tracker_clear_cache") {
        if (trackerDebounce) {
            clearTimeout(trackerDebounce);
            trackerDebounce = null;
        }
        trackerCache = {};
        sendResponse({ ok: true });
        return false;
    }

    if (action === "tracker_heartbeat") {
        (async () => {
            try {
                const senderDomain = extractDomain(sender?.tab?.url || "");
                const domain = normalizeDomain(senderDomain || request?.domain || "");
                if (!domain) {
                    sendResponse({ ok: false });
                    return;
                }

                const rawSeconds = Number(request.seconds);
                const seconds = Number.isFinite(rawSeconds)
                    ? Math.max(1, Math.min(Math.floor(rawSeconds), MAX_HEARTBEAT_SECONDS))
                    : 0;

                await trackerHeartbeat(domain, seconds);
                sendResponse({ ok: true });
            } catch (err) {
                try { sendResponse({ ok: false, error: err?.message || "error" }); } catch { }
            }
        })();
        return true;
    }

    if (action === "clearSiteData") {
        const targetUrl = typeof request.url === "string" ? request.url : "";
        clearSiteDataEverywhere(targetUrl)
            .then(() => sendResponse({ ok: true }))
            .catch((err) => {
                console.error("clearSiteData error:", err);
                sendResponse({ ok: false });
            });
        return true;
    }

    if (action === "captureTab") {
        chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
            if (chrome.runtime.lastError) {
                sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ ok: true, dataUrl: dataUrl });
            }
        });
        return true;
    }
});

async function handleToggle(sendResponse) {
    try {
        await setupOffscreen();
        const data = await chrome.storage.local.get(['playing', 'volume']);
        const newState = !data.playing;
        const currentVol = data.volume ?? 12;

        if (newState) {
            const radioTitle = bgI18nDict?.radioTitle?.message || "Radio IN";
            const radioArtist = bgI18nDict?.radioArtist?.message || "Pokreće All In One ekstenzija";
            const storage = await chrome.storage.local.get(['customRadioUrl']);
            const customUrl = storage.customRadioUrl;

            safeSendRuntimeMessage({
                action: "play",
                volume: currentVol,
                title: radioTitle,
                artist: radioArtist,
                url: customUrl
            });
        } else {
            safeSendRuntimeMessage({ action: "pause" });
            await chrome.storage.local.set({ volume: 12 });
        }

        await chrome.storage.local.set({ playing: newState }).catch(() => { });
        if (sendResponse) sendResponse({ ok: true, playing: newState });
    } catch (err) {
        console.error("toggleRadio error:", err);
        if (sendResponse) sendResponse({ ok: false, playing: false });
    }
}

let trackerWriteQueue = Promise.resolve();
let trackerMutationQueue = Promise.resolve();
let trackerCache = null;
let trackerCacheLoadPromise = null;
let trackerDebounce = null;

function getTrackableSeconds(diff) {
    if (!Number.isFinite(diff) || diff <= 0) return 0;
    return Math.min(diff, MAX_HEARTBEAT_SECONDS);
}

function extractDomain(url) {
    if (!url || !url.startsWith("http")) return null;
    try {
        const host = (new URL(url).hostname || "").toLowerCase();
        return host || null;
    } catch {
        return null;
    }
}

function normalizeDomain(domain) {
    const clean = String(domain || "").trim().toLowerCase();
    if (!clean) return null;
    if (clean.length > 255) return null;
    if (clean.includes("/") || clean.includes("\\") || /\s/.test(clean)) return null;
    return clean;
}

function runTrackerMutation(task) {
    trackerMutationQueue = trackerMutationQueue
        .then(task)
        .catch((err) => {
            console.error("Tracker mutation error:", err);
        });

    return trackerMutationQueue;
}

async function addTrackedSeconds(domain, seconds) {
    const cleanDomain = normalizeDomain(domain);
    if (!cleanDomain || seconds <= 0) return;

    const today = new Date();
    const dateKey = `tracker_${today.getFullYear()}_${today.getMonth() + 1}_${today.getDate()}`;

    if (!trackerCache) trackerCache = {};
    if (!trackerCache[dateKey]) {
        if (!trackerCacheLoadPromise) {
            trackerCacheLoadPromise = chrome.storage.local.get([dateKey]).then((res) => {
                const rawDay = res[dateKey];
                if (!trackerCache) trackerCache = {};
                trackerCache[dateKey] = rawDay && typeof rawDay === "object" && !Array.isArray(rawDay) ? rawDay : {};
                trackerCacheLoadPromise = null;
            });
        }
        await trackerCacheLoadPromise;
    }

    const data = trackerCache[dateKey];
    const prev = Number(data[cleanDomain]) || 0;
    data[cleanDomain] = prev + seconds;

    if (trackerDebounce) clearTimeout(trackerDebounce);
    trackerDebounce = setTimeout(async () => {
        await chrome.storage.local.set({ [dateKey]: trackerCache[dateKey] });
        trackerDebounce = null;
    }, 400);

    await trackerWriteQueue;
}

async function trackerHeartbeat(domain, seconds) {
    const cleanDomain = normalizeDomain(domain);
    if (!cleanDomain) return;

    const safeSeconds = Number.isFinite(Number(seconds))
        ? Math.max(1, Math.min(Math.floor(Number(seconds)), MAX_HEARTBEAT_SECONDS))
        : 0;

    if (safeSeconds <= 0) return;

    return runTrackerMutation(async () => {
        await addTrackedSeconds(cleanDomain, safeSeconds);
    });
}

// STOPERICA KOMANDA
let swLapWriteQueue = Promise.resolve();
let lastLapDedupeAt = 0;

async function handleLapLogic() {
    const now = Date.now();
    if (now - lastLapDedupeAt < 350) return;
    lastLapDedupeAt = now;
    const store = await chrome.storage.local.get(["isRunning", "startTime", "currentLaps", "lastLapTime"]);

    const lastLap = store.lastLapTime || 0;
    if (store.isRunning !== true) {
        playSystemSound("error");
        return;
    }

    // Provera cooldown-a od 5 sekundi
    if (now - lastLap < 5000) return;

    const startTime = Number.isFinite(store.startTime) ? store.startTime : now;
    const diff = now - startTime;
    if (diff <= 0) return;

    swLapWriteQueue = swLapWriteQueue.then(async () => {
        const latest = await chrome.storage.local.get(["isRunning", "currentLaps"]);
        if (latest.isRunning !== true) return;

        const currentLaps = Array.isArray(latest.currentLaps) ? latest.currentLaps : [];

        await chrome.storage.local.set({
            currentLaps: [...currentLaps, diff],
            lastLapTime: now
        }).catch(() => { });

    }).catch((err) => {
        console.error("Lap write error:", err);
    });

    await swLapWriteQueue;

    playSystemSound("success");
    safeSendRuntimeMessage({ action: "update_ui" });
}

// Slusac za Alt+Shift+L
chrome.commands.onCommand.addListener((command) => {
    if (command === "mark-lap") {
        handleLapLogic();
    }
});

function ensureKeepAliveAlarm() {
    chrome.alarms.get('keepAlive', (alarm) => {
        if (!alarm) {
            chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
        }
    });
}

async function flushTrackerBuffer() {
    try {
        const res = await chrome.storage.local.get(['tracker_buffer']);
        const buffer = res.tracker_buffer;
        if (!buffer || typeof buffer !== 'object' || Array.isArray(buffer)) return;

        const domains = Object.keys(buffer);
        if (domains.length === 0) return;

        for (const domain of domains) {
            const seconds = Math.floor(Number(buffer[domain]) || 0);
            if (seconds > 0 && seconds <= 86400) { // Max 24h zastita od korupcije
                const cleanDomain = normalizeDomain(domain);
                if (cleanDomain) {
                    await runTrackerMutation(async () => {
                        await addTrackedSeconds(cleanDomain, seconds);
                    });
                }
            }
        }

        await chrome.storage.local.remove('tracker_buffer');
    } catch (err) {
        console.error("Flush tracker buffer error:", err);
    }
}

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        checkRealRadioStatus().catch(() => { });
        flushTrackerBuffer().catch(() => { });
        ensureKeepAliveAlarm();
    }
});

const IDLE_DETECTION_INTERVAL_SEC = 60;

chrome.idle.setDetectionInterval(IDLE_DETECTION_INTERVAL_SEC);

let systemIdleState = 'active'; // 'active' | 'idle' | 'locked'

chrome.idle.onStateChanged.addListener((newState) => {
    systemIdleState = newState;

    if (newState === 'idle' || newState === 'locked') {
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach((tab) => {
                if (!tab.id || !tab.url || !tab.url.startsWith('http')) return;
                chrome.tabs.sendMessage(tab.id, { action: "system_idle" }).catch(() => { });
            });
        });
    } else if (newState === 'active') {
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach((tab) => {
                if (!tab.id || !tab.url || !tab.url.startsWith('http')) return;
                chrome.tabs.sendMessage(tab.id, { action: "system_active" }).catch(() => { });
            });
        });
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request?.action === "get_system_idle_state") {
        sendResponse({ state: systemIdleState });
        return false;
    }
});

ensureKeepAliveAlarm();
flushTrackerBuffer().catch(() => { });

chrome.runtime.onInstalled.addListener((details) => {
    trackEvent("extension_install_uninstall", { reason: details.reason });


    ensureKeepAliveAlarm();

    if (details.reason === "install") {
        chrome.tabs.create({ url: "https://allinone.milanwebportal.com/hvala" });
    } else if (details.reason === "update") {
        chrome.tabs.create({ url: "https://allinone.milanwebportal.com/azurirano" });
    }
});

chrome.runtime.setUninstallURL("https://allinone.milanwebportal.com/obrisano");