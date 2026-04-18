// Universal event tracking function (local + Google Analytics)
const GA_MEASUREMENT_ID = "G-F52S6J4TZV";
const GA_API_SECRET = "j09W3gL-TImYVi2ZE7rHxA";
const GA_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`;


// Debounce za eventStats upis + jedinstven GA client_id (SW nema localStorage)
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
            return fetch(GA_ENDPOINT, {
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
        const data = await chrome.storage.local.get('playing');
        if (data.playing) {
            await chrome.storage.local.set({ playing: false, volume: 12 }).catch(() => { });
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
        // Event iz popup.js za GA
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

    if (action === "toggleRadio") {
        trackEvent("radio otvoren/zatvoren");
        handleToggle(sendResponse);
        return true;
    }

    if (action === "playCustomUrl") {
        const radioTitle = bgI18nDict?.radioTitle?.message || "Radio IN";
        const radioArtist = bgI18nDict?.radioArtist?.message || "Pokreće All In One ekstenzija";
        const currentVol = request.volume || 12; // Fallback to 12 if not provided

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
        trackEvent("radio pojačan/utišan", { vrednost: request.value });
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
                const currentVol = data.volume !== undefined ? data.volume : 12;

                // Dodaj prevode i ovde
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
        chrome.storage.local.set({ playing: false, volume: 12 }).then(() => {
            sendResponse({ ok: true });
        });
        return true;
    }

    if (action === "manual_lap") {
        trackEvent("krug stoperice");
        handleLapLogic();
        sendResponse({ ok: true });
        return false;
    }

    if (action === "tracker_force_tick") {
        trackEvent("tracker osvežen", { domen: request?.domain || "" });
        const run = runTrackerMutation(async () => {
            // Force flush the debounce if any
            if (addTrackedSeconds.debounce) {
                clearTimeout(addTrackedSeconds.debounce);
                addTrackedSeconds.debounce = null;
                const today = new Date();
                const dateKey = `tracker_${today.getFullYear()}_${today.getMonth() + 1}_${today.getDate()}`;
                if (addTrackedSeconds.cache && addTrackedSeconds.cache[dateKey]) {
                    await chrome.storage.local.set({ [dateKey]: addTrackedSeconds.cache[dateKey] });
                }
            }
            await trackerWriteQueue;
        });
        run.then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
        return true;
    }

    if (action === "tracker_clear_cache") {
        // Očisti keš nakon uvoza podataka da se spreči pregazivanje uvezenih podataka
        if (addTrackedSeconds.debounce) {
            clearTimeout(addTrackedSeconds.debounce);
            addTrackedSeconds.debounce = null;
        }
        addTrackedSeconds.cache = {};
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

// TRACKER LOGIKA (Samo snimanje iz content.js)
let trackerWriteQueue = Promise.resolve();
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


    // Debounce/batch upis za tracker podatke
    if (!addTrackedSeconds.cache) addTrackedSeconds.cache = {};
    if (!addTrackedSeconds.debounce) addTrackedSeconds.debounce = null;
    const today = new Date();
    const dateKey = `tracker_${today.getFullYear()}_${today.getMonth() + 1}_${today.getDate()}`;
    if (!addTrackedSeconds.cache[dateKey]) {
        const res = await chrome.storage.local.get([dateKey]);
        const rawDay = res[dateKey];
        addTrackedSeconds.cache[dateKey] = rawDay && typeof rawDay === "object" && !Array.isArray(rawDay) ? rawDay : {};
    }
    const data = addTrackedSeconds.cache[dateKey];
    const prev = Number(data[cleanDomain]) || 0;
    data[cleanDomain] = prev + seconds;
    if (addTrackedSeconds.debounce) clearTimeout(addTrackedSeconds.debounce);
    addTrackedSeconds.debounce = setTimeout(async () => {
        await chrome.storage.local.set({ [dateKey]: addTrackedSeconds.cache[dateKey] });
        addTrackedSeconds.debounce = null;
    }, 400);

    await trackerWriteQueue;
}



async function trackerHeartbeat(domain, seconds) {
    const cleanDomain = normalizeDomain(domain);
    if (!cleanDomain) return;

    const safeSeconds = Number.isFinite(Number(seconds))
        ? Math.max(1, Math.min(Math.floor(Number(seconds)), 120))
        : 0;

    if (safeSeconds <= 0) return;

    return runTrackerMutation(async () => {
        await addTrackedSeconds(cleanDomain, safeSeconds);
    });
}



// STOPERICA KOMANDA
let swLapWriteQueue = Promise.resolve();
let lastLapDedupeAt = 0;

// Glavna logika za krug (Lap)
async function handleLapLogic() {
    const now = Date.now();
    // Spreči dupli lap istovremeno sa komande + popup (isti Alt+Shift+L tick)
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

// Slušač za Alt+Shift+L
chrome.commands.onCommand.addListener((command) => {
    if (command === "mark-lap") {
        handleLapLogic();
    }
});

// KeepAlive alarm - MORA biti na top-level nivou (van onInstalled)
// jer se Service Worker restartuje svake ~30s neaktivnosti i tada
// gubi sve listenere koji su bili registrovani unutar callback-ova.
function ensureKeepAliveAlarm() {
    chrome.alarms.get('keepAlive', (alarm) => {
        if (!alarm) {
            chrome.alarms.create('keepAlive', { periodInMinutes: 0.5 });
        }
    });
}

// Bezbednosni sistem: ako content.js nije uspeo da pošalje heartbeat
// service worker-u (bio je mrtav/spavao), sekunde se čuvaju u "tracker_buffer".
// Ova funkcija ih pokupi i upiše u pravi tracker pri svakom buđenju.
async function flushTrackerBuffer() {
    try {
        const res = await chrome.storage.local.get(['tracker_buffer']);
        const buffer = res.tracker_buffer;
        if (!buffer || typeof buffer !== 'object' || Array.isArray(buffer)) return;

        const domains = Object.keys(buffer);
        if (domains.length === 0) return;

        for (const domain of domains) {
            const seconds = Math.floor(Number(buffer[domain]) || 0);
            if (seconds > 0 && seconds <= 86400) { // Max 24h zaštita od korupcije
                const cleanDomain = normalizeDomain(domain);
                if (cleanDomain) {
                    await runTrackerMutation(async () => {
                        await addTrackedSeconds(cleanDomain, seconds);
                    });
                }
            }
        }

        // Očisti bafer nakon uspešnog upisa
        await chrome.storage.local.remove('tracker_buffer');
    } catch (err) {
        console.error("Flush tracker buffer error:", err);
    }
}

// Top-level alarm listener - preživljava restartovanje service workera
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepAlive') {
        checkRealRadioStatus().catch(() => { });
        // Pokupi izgubljene sekunde iz emergency bafera
        flushTrackerBuffer().catch(() => { });
        // Dodatna zaštita: proveri da alarm i dalje postoji
        ensureKeepAliveAlarm();
    }
});

// Pokreni alarm i pokupi bafer odmah pri svakom učitavanju service workera
ensureKeepAliveAlarm();
flushTrackerBuffer().catch(() => { });

chrome.runtime.onInstalled.addListener((details) => {
    trackEvent("ekstenzija instalirana/azurirana", { razlog: details.reason });

    // Osiguraj alarm i pri instalaciji/ažuriranju
    ensureKeepAliveAlarm();

    if (details.reason === "install") {
        chrome.tabs.create({ url: "https://allinone.milanwebportal.com/hvala" });
    } else if (details.reason === "update") {
        chrome.tabs.create({ url: "https://allinone.milanwebportal.com/azurirano" });
    }
});

chrome.runtime.setUninstallURL("https://allinone.milanwebportal.com/obrisano");