let ytEnabled = false;
let ytInitialized = false;
let ytReqId = 0;
let ytDebounceTimer = null;
let ytLastUrl = location.href;
let ytLastVideoId = "";
let ytLastDislikes = null;
let ytRetryTimer = null;
let ytRetryEndAt = 0;
let ytApplyDebounce = null;
let ytUrlWatcher = null;
let ytObserver = null;

function getVideoId() {
  let url;
  try {
    url = new URL(window.location.href);
  } catch {
    return "";
  }

  const queryId = url.searchParams.get("v");
  if (queryId) return queryId;

  const shorts = url.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{6,})/);
  if (shorts?.[1]) return shorts[1];

  const live = url.pathname.match(/^\/live\/([a-zA-Z0-9_-]{6,})/);
  if (live?.[1]) return live[1];

  return "";
}

function isDislikeLabel(label) {
  const l = String(label || "").toLowerCase();
  return l.includes("dislike") || l.includes("ne sviđa") || l.includes("ne svidja") || l.includes("didn't like");
}

function formatDislikes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "";

  try {
    return new Intl.NumberFormat(navigator.language || "sr-RS", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  } catch {
    return n.toLocaleString();
  }
}

function setWatchDislikes(dislikes) {
  const text = formatDislikes(dislikes);
  if (!text) return false;

  let written = 0;
  // Keširaj selektore
  const selectors = [
    "#segmented-dislike-button #text",
    "#segmented-dislike-button .yt-core-attributed-string",
    "#segmented-dislike-button .yt-spec-button-shape-next__button-text-content",
    "ytd-toggle-button-renderer#dislike-button #text",
    "ytd-toggle-button-renderer#dislike-button .yt-core-attributed-string"
  ];
  let elements = [];
  selectors.forEach(sel => {
    elements = elements.concat(Array.from(document.querySelectorAll(sel)));
  });
  elements.forEach((el) => {
    if (el.textContent !== text) el.textContent = text;
    written++;
  });

  // Fallback by aria-label when structural selectors miss.
  if (written === 0) {
    const btns = Array.from(document.querySelectorAll("button[aria-label]"));
    btns.forEach((btn) => {
      if (!isDislikeLabel(btn.getAttribute("aria-label") || "")) return;
      const textEl = btn.querySelector("#text, .yt-core-attributed-string, .yt-spec-button-shape-next__button-text-content");
      if (textEl) {
        if (textEl.textContent !== text) textEl.textContent = text;
      } else {
        btn.textContent = text;
      }
      written++;
    });
  }

  return written > 0;
}

function setShortsDislikes(dislikes) {
  const text = formatDislikes(dislikes);
  if (!text) return;

  // Keširaj selektore
  const selectors = [
    "ytd-reel-video-renderer[is-active] #dislike-button button",
    "ytd-reel-video-renderer #dislike-button button",
    "ytd-reel-video-renderer button[aria-label]"
  ];
  let buttons = [];
  selectors.forEach(sel => {
    buttons = buttons.concat(Array.from(document.querySelectorAll(sel)));
  });

  buttons.forEach((btn) => {
    const label = btn.getAttribute("aria-label") || "";
    const inDislikeSlot = !!btn.closest("#dislike-button");
    if (!inDislikeSlot && !isDislikeLabel(label)) return;

    let badge = btn.querySelector(".aio-ryd-short-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "aio-ryd-short-badge";
      badge.style.display = "block";
      badge.style.fontSize = "12px";
      badge.style.lineHeight = "14px";
      badge.style.fontWeight = "600";
      badge.style.marginTop = "4px";
      badge.style.color = "var(--yt-spec-text-secondary, #aaa)";
      btn.appendChild(badge);
    }

    badge.textContent = text;
  });
}

function applyDislikes(dislikes) {
  if (!ytEnabled) return;

  const isShorts = location.pathname.startsWith("/shorts/");
  if (isShorts) {
    setShortsDislikes(dislikes);
    return;
  }

  const ok = setWatchDislikes(dislikes);
  if (!ok) {
    // Safety fallback for unexpected watch layouts.
    setShortsDislikes(dislikes);
  }
}

function stopRetry() {
  if (ytRetryTimer) {
    clearInterval(ytRetryTimer);
    ytRetryTimer = null;
  }
}

function retryApplyTick() {
  if (!ytEnabled) {
    stopRetry();
    return;
  }
  if (!ytLastVideoId || !Number.isFinite(Number(ytLastDislikes))) return;

  applyDislikes(ytLastDislikes);

  if (Date.now() >= ytRetryEndAt) {
    stopRetry();
  }
}

function startRetryWindow() {
  // PERFORMANCE FIX: Reduced from 4500ms/350ms (~13 attempts) to 2000ms/400ms (~5 attempts)
  ytRetryEndAt = Date.now() + 2000;
  if (ytRetryTimer) return;
  ytRetryTimer = setInterval(retryApplyTick, 400);
}

function scheduleApplyFromDomChange() {
  if (!ytEnabled) return;
  if (!ytLastVideoId || !Number.isFinite(Number(ytLastDislikes))) return;
  if (ytApplyDebounce) clearTimeout(ytApplyDebounce);

  ytApplyDebounce = setTimeout(() => {
    applyDislikes(ytLastDislikes);
  }, 120);
}

async function fetchAndApplyDislikes() {
  if (!ytEnabled) return;

  const videoId = getVideoId();
  if (!videoId) return;

  const reqId = ++ytReqId;

  try {
    const res = await fetch(`https://returnyoutubedislikeapi.com/votes?videoId=${encodeURIComponent(videoId)}`);
    if (!res.ok) return;

    const data = await res.json();
    if (reqId !== ytReqId) return;

    const dislikes = Number(data?.dislikes);
    if (!Number.isFinite(dislikes)) return;

    ytLastVideoId = videoId;
    ytLastDislikes = dislikes;
    applyDislikes(dislikes);
    startRetryWindow();
  } catch {
    // Silent fail.
  }
}

function scheduleFetch() {
  if (!ytEnabled) return;
  if (ytDebounceTimer) clearTimeout(ytDebounceTimer);
  ytDebounceTimer = setTimeout(() => {
    fetchAndApplyDislikes();
  }, 180);
}

function initYtRyd() {
  if (ytInitialized) return;
  ytInitialized = true;

  document.addEventListener("yt-navigate-finish", scheduleFetch);
  document.addEventListener("yt-page-data-updated", scheduleFetch);

  startYtWatchers();
}

function startYtWatchers() {
  if (ytObserver) return;

  // Use requestAnimationFrame for debounced DOM updates
  let ytMutationDebounceId = null;
  let lastMutationTime = 0;
  ytObserver = new MutationObserver((mutationsList) => {
    if (!ytEnabled) return;
    // PERFORMANCE FIX: Increased throttle from 300ms to 500ms to reduce CPU usage
    const now = Date.now();
    if (now - lastMutationTime < 500) return; // throttle na 500ms
    lastMutationTime = now;
    let relevant = false;
    // PERFORMANCE FIX: Limit mutations processed to first 50
    const maxMutations = Math.min(mutationsList.length, 50);
    for (let i = 0; i < maxMutations; i++) {
      const t = mutationsList[i].target;
      if (!t || t.nodeType !== Node.ELEMENT_NODE || !t.querySelector) continue;
      if (
        t.querySelector('#segmented-dislike-button') ||
        t.querySelector('ytd-toggle-button-renderer#dislike-button')
      ) {
        relevant = true;
        break;
      }
    }
    if (relevant) {
      if (ytMutationDebounceId) cancelAnimationFrame(ytMutationDebounceId);
      ytMutationDebounceId = requestAnimationFrame(scheduleApplyFromDomChange);
    }
  });
  ytObserver.observe(document.documentElement, { childList: true, subtree: true });

  // PERFORMANCE FIX: Removed setInterval URL watcher - yt-navigate-finish event is sufficient
}

function stopYtWatchers() {
  if (ytObserver) {
    ytObserver.disconnect();
    ytObserver = null;
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes.ytToggle) return;
  ytEnabled = changes.ytToggle.newValue === true;

  if (ytEnabled) {
    initYtRyd();
    startYtWatchers();
    scheduleFetch();
  } else {
    stopRetry();
    stopYtWatchers();
    if (ytApplyDebounce) {
      clearTimeout(ytApplyDebounce);
      ytApplyDebounce = null;
    }
    if (ytDebounceTimer) {
      clearTimeout(ytDebounceTimer);
      ytDebounceTimer = null;
    }
  }
});

chrome.storage.local.get(["ytToggle"], (data) => {
  ytEnabled = data.ytToggle === true;
  initYtRyd();
  if (ytEnabled) {
    startYtWatchers();
    scheduleFetch();
  } else {
    stopYtWatchers();
  }
});