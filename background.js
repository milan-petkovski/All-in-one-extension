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

    // Google Analytics Measurement Protocol
    try {
        const clientId = (typeof localStorage !== 'undefined' && localStorage.getItem("aio_ga_cid")) || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
        if (typeof localStorage !== 'undefined') localStorage.setItem("aio_ga_cid", clientId);
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
        fetch(GA_ENDPOINT, {
            method: "POST",
            body: JSON.stringify(body),
            keepalive: true,
            headers: { "Content-Type": "application/json" }
        });
    } catch (err) {
        // Ignore GA errors
    }
}
let offscreenInitPromise = null;
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
    if (offscreenInitPromise) return offscreenInitPromise;

    offscreenInitPromise = (async () => {
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
            offscreenInitPromise = null;
        }
    })();

    return offscreenInitPromise;
}

// Funkcija za puštanje sistemskih zvukova preko Offscreen-a
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
        await chrome.storage.local.set({ playing: false });
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

    if (action === "aio_track_event") {
        // Event iz popup.js za GA
        try {
            const eventName = request.eventName;
            const eventData = request.eventData || {};
            trackEvent(eventName, eventData);
        } catch (err) { }
        return true;
    }

    if (action === "toggleRadio") {
        trackEvent("radio otvoren/zatvoren");
        handleToggle(sendResponse);
        return true;
    }

    if (action === "setRadioVolume") {
        trackEvent("radio pojačan/utišan", { vrednost: request.value });
        safeSendRuntimeMessage({ action: "setVolume", value: request.value });
        return true;
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
                const currentVol = data.volume !== undefined ? data.volume : 12;

                // Dodaj prevode i ovde
                const radioTitle = bgI18nDict?.radioTitle?.message || "Radio IN";
                const radioArtist = bgI18nDict?.radioArtist?.message || "Pokreće All In One ekstenzija";

                safeSendRuntimeMessage({
                    action: "play",
                    volume: currentVol,
                    title: radioTitle,
                    artist: radioArtist
                });
                await chrome.storage.local.set({ playing: true });
                sendResponse({ ok: true });
            } catch (err) {
                try { sendResponse({ ok: false, error: err?.message || "error" }); } catch { }
            }
        })();
        return true;
    }

    if (action === "hardwarePause") {
        safeSendRuntimeMessage({ action: "pause" });
        chrome.storage.local.set({ playing: false, volume: 12 });
        return true;
    }

    if (action === "manual_lap") {
        trackEvent("krug stoperice");
        handleLapLogic();
        return true;
    }

    if (action === "tracker_force_tick") {
        trackEvent("tracker osvežen", { domen: request?.domain || "" });
        const forcedDomain = normalizeDomain(request?.domain || "") || "";
        const run = runTrackerMutation(async () => {
            trackerState.domain = forcedDomain || trackerState.domain;
            trackerState.lastUpdate = Date.now();
        });
        run.then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
        return true;
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
                    ? Math.max(1, Math.min(Math.floor(rawSeconds), 5))
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
});

async function handleToggle(sendResponse) {
    try {
        await setupOffscreen();
        const data = await chrome.storage.local.get(['playing', 'volume']);
        const newState = !data.playing;
        const currentVol = data.volume !== undefined ? data.volume : 12;

        if (newState) {
            // Izvlačenje prevoda iz tvog rečnika
            const radioTitle = bgI18nDict?.radioTitle?.message || "Radio IN";
            const radioArtist = bgI18nDict?.radioArtist?.message || "Pokreće All In One ekstenzija";

            safeSendRuntimeMessage({
                action: "play",
                volume: currentVol,
                title: radioTitle,
                artist: radioArtist
            });
        } else {
            safeSendRuntimeMessage({ action: "pause" });
            await chrome.storage.local.set({ volume: 12 });
        }

        await chrome.storage.local.set({ playing: newState });
        if (sendResponse) sendResponse({ ok: true, playing: newState });
    } catch (err) {
        console.error("toggleRadio error:", err);
        if (sendResponse) sendResponse({ ok: false, playing: false });
    }
}

// TRACKER LOGIKA (MV3-safe: event + alarm heartbeat)
chrome.idle.setDetectionInterval(150);

const trackerState = {
    domain: null,
    lastUpdate: Date.now(),
};
let trackerWriteQueue = Promise.resolve();
let trackerTickDebounceId = null;
let cachedIdleState = "active";
let trackerMutationQueue = Promise.resolve();

function getTrackableSeconds(diff) {
    if (!Number.isFinite(diff) || diff <= 0) return 0;
    return Math.min(diff, 120);
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

function isUserActive() {
    // Count only while user is actively present at OS level.
    return cachedIdleState === "active";
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

    trackerWriteQueue = trackerWriteQueue.then(async () => {
        const today = new Date();
        const dateKey = `tracker_${today.getFullYear()}_${today.getMonth() + 1}_${today.getDate()}`;
        const res = await chrome.storage.local.get([dateKey]);
        const rawDay = res[dateKey];
        const data = rawDay && typeof rawDay === "object" && !Array.isArray(rawDay) ? rawDay : {};
        const prev = Number(data[cleanDomain]) || 0;
        data[cleanDomain] = prev + seconds;
        await chrome.storage.local.set({ [dateKey]: data });
    }).catch((err) => {
        console.error("Tracker write queue error:", err);
    });

    await trackerWriteQueue;
}

async function trackerTick() {
    return runTrackerMutation(async () => {
        const now = Date.now();
        const diff = Math.floor((now - trackerState.lastUpdate) / 1000);
        trackerState.lastUpdate = now;
        const trackedSeconds = getTrackableSeconds(diff);

        let activeDomain = normalizeDomain(trackerState.domain);
        if (!activeDomain) {
            const activeTab = await getActiveTrackableTab();
            activeDomain = activeTab ? extractDomain(activeTab.url) : null;
            trackerState.domain = activeDomain;
        }

        if (!activeDomain || trackedSeconds <= 0 || !isUserActive()) return;

        await addTrackedSeconds(activeDomain, trackedSeconds);
    });
}

async function trackerTickForDomain(domain) {
    const cleanDomain = normalizeDomain(domain);
    if (!cleanDomain) return;

    return runTrackerMutation(async () => {
        const now = Date.now();
        const diff = Math.floor((now - trackerState.lastUpdate) / 1000);
        trackerState.lastUpdate = now;
        trackerState.domain = cleanDomain;
        const trackedSeconds = getTrackableSeconds(diff);

        if (trackedSeconds <= 0 || !isUserActive()) return;

        await addTrackedSeconds(cleanDomain, trackedSeconds);
    });
}

async function trackerHeartbeat(domain, seconds) {
    const cleanDomain = normalizeDomain(domain);
    if (!cleanDomain) return;

    const safeSeconds = Number.isFinite(Number(seconds))
        ? Math.max(1, Math.min(Math.floor(Number(seconds)), 120))
        : 0;

    return runTrackerMutation(async () => {
        trackerState.domain = cleanDomain;

        if (!isUserActive()) {
            trackerState.lastUpdate = Date.now();
            return;
        }

        if (safeSeconds > 0) {
            await addTrackedSeconds(cleanDomain, safeSeconds);
            trackerState.lastUpdate = Date.now();
            return;
        }

        const now = Date.now();
        const diff = Math.floor((now - trackerState.lastUpdate) / 1000);
        trackerState.lastUpdate = now;
        const trackedSeconds = getTrackableSeconds(diff);

        if (trackedSeconds <= 0) return;
        await addTrackedSeconds(cleanDomain, trackedSeconds);
    });
}

async function getActiveTrackableTab() {
    let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tabs || tabs.length === 0) {
        tabs = await chrome.tabs.query({ active: true });
    }
    if (!tabs || tabs.length === 0) return null;

    const trackableTab = tabs.find((tab) => extractDomain(tab.url));
    return trackableTab || null;
}

async function refreshTrackerDomainFromActiveTab() {
    return runTrackerMutation(async () => {
        const tab = await getActiveTrackableTab();
        trackerState.domain = tab ? extractDomain(tab.url) : null;
        trackerState.lastUpdate = Date.now();
    });
}

chrome.tabs.onActivated.addListener((activeInfo) => {
    if (!activeInfo?.tabId) return;

    // Flush time on previous domain, then switch to the newly active tab.
    clearTimeout(trackerTickDebounceId);
    trackerTickDebounceId = setTimeout(() => refreshTrackerDomainFromActiveTab().catch(() => { }), 50);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab?.active && (changeInfo.url || changeInfo.status === "complete")) {
        // Debounce to prevent racing with onActivated
        clearTimeout(trackerTickDebounceId);
        trackerTickDebounceId = setTimeout(() => refreshTrackerDomainFromActiveTab().catch(() => { }), 50);
    }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
        trackerState.domain = null;
        trackerState.lastUpdate = Date.now();
        return;
    }

    // Debounce to prevent racing with tab events
    clearTimeout(trackerTickDebounceId);
    trackerTickDebounceId = setTimeout(() => refreshTrackerDomainFromActiveTab().catch(() => { }), 50);
});

chrome.idle.onStateChanged.addListener((state) => {
    cachedIdleState = state;  // Cache for sync access in isUserActive()

    if (state !== "active") {
        trackerState.lastUpdate = Date.now();
        return;
    }

    // Debounce to prevent racing
    clearTimeout(trackerTickDebounceId);
    trackerTickDebounceId = setTimeout(() => refreshTrackerDomainFromActiveTab().catch(() => { }), 50);
});

function initTracker() {
    refreshTrackerDomainFromActiveTab().catch(() => { });
}

initTracker();
chrome.runtime.onStartup.addListener(initTracker);

// STOPERICA KOMANDA
let swLapWriteQueue = Promise.resolve();

// Glavna logika za krug (Lap)
async function handleLapLogic() {
    const now = Date.now();
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
        });
    }).catch((err) => {
        console.error("Lap write error:", err);
    });

    await swLapWriteQueue;

    playSystemSound("success");
    safeSendRuntimeMessage({ action: "update_ui" });
}

// Slušač za Alt+Shift+L
chrome.commands.onCommand.addListener((command) => {
    if (command === "mark-lap") {
        handleLapLogic();
    }
});

// Reset cooldown na START komande
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request?.action === "sw_start_session") {
        // Resetujemo cooldown u storage-u umesto u lokalnoj promenljivoj
        chrome.storage.local.set({ lastLapTime: 0 });
        sendResponse({ ok: true });
        return true;
    }
});

chrome.runtime.onInstalled.addListener((details) => {
    trackEvent("ekstenzija instalirana/azurirana", { razlog: details.reason });
    function ensureKeepAliveAlarm() {
        chrome.alarms.get('keepAlive', (alarm) => {
            if (!alarm) {
                chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
            }
        });
    }

    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'keepAlive') {
            trackerTick(); // OVO DODAJ: Da bi upisao vreme svakih 30 sekundi
            checkRealRadioStatus().catch(() => { });
        }
    });

    // Pozovi odmah pri učitavanju skripte
    ensureKeepAliveAlarm();
    initTracker();

    if (details.reason === "install") {
        chrome.tabs.create({ url: "https://allinone.milanwebportal.com/hvala" });
    } else if (details.reason === "update") {
        chrome.tabs.create({ url: "https://allinone.milanwebportal.com/azurirano" });
    }
});

chrome.runtime.setUninstallURL("https://allinone.milanwebportal.com/obrisano");