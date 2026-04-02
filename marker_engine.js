function pokreniMarker() {
    if (!document.head || !document.body) {
        setTimeout(pokreniMarker, 50);
        return;
    }

    if (!window.markerInjected) {
        window.markerInjected = true;
        window.markerCurrentColor = "#00ff88";

        const style = document.createElement('style');
        style.id = 'marker-styles';
        style.innerHTML = `
            .marker-menu { position: fixed; right: 25px; top: 50%; transform: translateY(-50%); background: rgba(15, 15, 15, 0.9); backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px); padding: 18px; border-radius: 24px; display: flex; flex-direction: column; align-items: center; gap: 15px; z-index: 2147483647; border: 1px solid rgba(255, 255, 255, 0.15); box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4); transition: all 0.3s ease; }
            .marker-btns { display: flex; flex-direction: column; gap: 12px; }
            .marker-menu button, .marker-color-picker-wrapper { width: 48px; height: 48px; border: none; border-radius: 14px; background: rgba(255, 255, 255, 0.1); cursor: pointer; color: white; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); display: flex; align-items: center; justify-content: center; position: relative; box-sizing: border-box; }
            .marker-menu button:hover { background: #00ff88; color: #000; box-shadow: 0 4px 15px rgba(0, 255, 136, 0.3); }
            .marker-menu button.active { background: #00ff88; color: #000; box-shadow: 0 0 20px rgba(0, 255, 136, 0.5); }
            .marker-menu button svg { width: 22px; height: 22px; pointer-events: none; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
            .marker-color-picker-wrapper { border: 2px solid rgba(255, 255, 255, 0.2); background: #00ff88; }
            .marker-color-picker-wrapper:hover { transform: scale(1.08); border-color: white; }
            #markerColorPicker { position: absolute; opacity: 0; width: 100%; height: 100%; cursor: pointer; inset: 0; }
            
            .marker-menu input[type="range"] { -webkit-appearance: none !important; appearance: none !important; width: 50px !important; height: 6px !important; background: rgba(255, 255, 255, 0.3) !important; border-radius: 4px !important; outline: none !important; cursor: pointer !important; margin-top: 5px !important; opacity: 0.8 !important; }
            .marker-menu input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none !important; appearance: none !important; width: 14px !important; height: 14px !important; border-radius: 50% !important; background: #00ff88 !important; }
            .marker-menu input[type="range"]::-moz-range-thumb { width: 14px !important; height: 14px !important; border-radius: 50% !important; background: #00ff88 !important; border: none !important; }
            .marker-menu input[type="range"]:hover { opacity: 1 !important; }
            
            .close-btn { background: rgba(255, 68, 68, 0.2) !important; color: #ff4444 !important; border: 1px solid rgba(255, 68, 68, 0.3) !important; }
            .close-btn:hover { background: #ff4444 !important; color: white !important; box-shadow: 0 4px 15px rgba(255, 68, 68, 0.4) !important; }
            .marker-text-input { position: fixed; background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(5px); border: 2px dashed #00ff88; color: #00ff88; outline: none; padding: 8px 12px; z-index: 2147483647; font-family: 'Segoe UI', sans-serif; font-weight: bold; border-radius: 8px; white-space: nowrap; box-shadow: 0 5px 15px rgba(0,0,0,0.3); }
            #markerCanvas { background: transparent !important; user-select: none !important; -webkit-user-select: none !important; }
            #markerCanvas * { user-select: none !important; -webkit-user-select: none !important; }
        `;
        document.head.appendChild(style);

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.id = "markerCanvas";
        Object.assign(svg.style, {
            position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
            zIndex: "2147483646", pointerEvents: "auto", cursor: "crosshair",
            background: "transparent", userSelect: "none", WebkitUserSelect: "none"
        });
        document.body.appendChild(svg);

        const menu = document.createElement("div");
        menu.className = "marker-menu";
        menu.innerHTML = `
            <div class="marker-btns">
                <div class="marker-color-picker-wrapper" id="colorWrapper">
                    <input type="color" id="markerColorPicker" value="#00ff88">
                </div>
                <button id="m_brush" class="active" title="Crtaj">
                    <svg viewBox="0 0 24 24"><path d="M13 21h8"/><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
                </button>
                <button id="m_line" title="Linija">
                    <svg viewBox="0 0 24 24"><line x1="5" y1="19" x2="19" y2="5"/></svg>
                </button>
                <button id="m_text" title="Tekst">
                    <svg viewBox="0 0 24 24"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
                </button>
                <button id="m_move" title="Pomeri">
                    <svg viewBox="0 0 24 24"><polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/><polyline points="19 9 22 12 19 15"/><polyline points="9 19 12 22 15 19"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/></svg>
                </button>
                <button id="m_eraser" title="Briši">
                    <svg viewBox="0 0 24 24"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
                </button>
                <button id="m_clear" title="Obriši sve">
                    <svg viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
            </div>
            <input type="range" id="m_size" min="2" max="30" value="5" title="Debljina">
            <button id="m_close" class="close-btn" title="Zatvori">
                <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
        `;
        document.body.appendChild(menu);

        let mode = "brush";
        let drawing = false;
        let currentElement = null;
        let thickness = 5;
        let rAF = null;
        let pendingPoint = null;
        const handleGlobalMouseUp = () => { drawing = false; currentElement = null; };

        const removeMarker = () => {
            if (rAF) {
                cancelAnimationFrame(rAF);
                rAF = null;
            }
            document.querySelectorAll('.marker-text-input').forEach((el) => el.remove());
            svg.remove();
            menu.remove();
            const s = document.getElementById('marker-styles');
            if (s) s.remove();
            window.removeEventListener("mouseup", handleGlobalMouseUp);
            window.markerInjected = false;
        };

        const picker = document.getElementById('markerColorPicker');
        const wrapper = document.getElementById('colorWrapper');
        picker.oninput = (e) => {
            window.markerCurrentColor = e.target.value;
            wrapper.style.backgroundColor = window.markerCurrentColor;
            wrapper.style.borderColor = window.markerCurrentColor;
            chrome.storage.local.set({ selectedColor: window.markerCurrentColor });
        };

        const updateCursor = () => {
            const cursors = { brush: "crosshair", line: "crosshair", text: "text", move: "move", eraser: "crosshair" };
            svg.style.cursor = cursors[mode] || "default";
        };

        menu.onclick = (e) => {
            const btn = e.target.closest("button");
            if (!btn) return;
            if (btn.id === "m_close") {
                removeMarker();
                return;
            }
            if (btn.id === "m_clear") {
                svg.innerHTML = '';
                return;
            }
            document.querySelectorAll(".marker-menu button:not(.close-btn):not(#m_clear)").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            mode = btn.id.replace("m_", "");
            updateCursor();
        };

        document.getElementById("m_size").oninput = (e) => thickness = parseInt(e.target.value, 10) || 5;

        const saveText = (input, x, y) => {
            if (input.value.trim()) {
                const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
                txt.setAttribute("x", x);
                txt.setAttribute("y", y + (thickness * 2.5));
                txt.setAttribute("font-size", thickness * 3);
                txt.setAttribute("fill", window.markerCurrentColor);
                txt.setAttribute("font-family", "Arial");
                txt.setAttribute("font-weight", "bold");
                txt.textContent = input.value;
                txt.style.userSelect = "none";
                txt.style.webkitUserSelect = "none";
                setupElement(txt);
                svg.appendChild(txt);
            }
            input.remove();
        };

        svg.onmousedown = (e) => {
            if (mode === "eraser" || mode === "move" || e.target.tagName === "input") return;

            drawing = true;
            const x = e.clientX;
            const y = e.clientY;

            if (mode === "text") {
                drawing = false;
                const input = document.createElement("input");
                input.className = "marker-text-input";
                input.style.color = window.markerCurrentColor;
                input.style.borderColor = window.markerCurrentColor;
                Object.assign(input.style, { left: `${x}px`, top: `${y}px`, fontSize: `${thickness * 3}px` });
                document.body.appendChild(input);
                setTimeout(() => input.focus(), 10);
                input.onblur = () => saveText(input, x, y);
                input.onkeydown = (ee) => { if (ee.key === "Enter") input.blur(); };
                return;
            }

            currentElement = document.createElementNS("http://www.w3.org/2000/svg", mode === "line" ? "line" : "polyline");
            currentElement.setAttribute("stroke", window.markerCurrentColor);
            currentElement.setAttribute("stroke-width", thickness);
            currentElement.setAttribute("fill", "none");
            currentElement.setAttribute("stroke-linecap", "round");
            currentElement.setAttribute("stroke-linejoin", "round");

            if (mode === "line") {
                currentElement.setAttribute("x1", x); currentElement.setAttribute("y1", y);
                currentElement.setAttribute("x2", x); currentElement.setAttribute("y2", y);
            } else {
                const p = svg.createSVGPoint(); p.x = x; p.y = y;
                currentElement.points.appendItem(p);
            }

            setupElement(currentElement);
            svg.appendChild(currentElement);
        };

        svg.onmousemove = (e) => {
            if (!drawing || !currentElement) return;

            pendingPoint = { x: e.clientX, y: e.clientY };

            if (!rAF) {
                rAF = requestAnimationFrame(() => {
                    if (!drawing || !currentElement) {
                        rAF = null;
                        return;
                    }
                    if (mode === "line") {
                        currentElement.setAttribute("x2", pendingPoint.x);
                        currentElement.setAttribute("y2", pendingPoint.y);
                    } else if (mode === "brush") {
                        const p = svg.createSVGPoint();
                        p.x = pendingPoint.x;
                        p.y = pendingPoint.y;
                        currentElement.points.appendItem(p);
                    }
                    rAF = null;
                });
            }
        };

        window.addEventListener("mouseup", handleGlobalMouseUp);

        function setupElement(el) {
            el.style.pointerEvents = "auto";
            el.onmouseenter = () => { if (mode === "eraser") el.remove(); };

            let isDragging = false;
            el.onmousedown = (e) => {
                if (mode !== "move") return;
                e.stopPropagation();
                e.preventDefault();
                isDragging = true;
                let lastX = e.clientX;
                let lastY = e.clientY;

                const move = (me) => {
                    if (!isDragging) return;
                    const dx = me.clientX - lastX;
                    const dy = me.clientY - lastY;
                    lastX = me.clientX;
                    lastY = me.clientY;

                    if (el.tagName === "polyline") {
                        for (let i = 0; i < el.points.numberOfItems; i++) {
                            el.points.getItem(i).x += dx; el.points.getItem(i).y += dy;
                        }
                    } else if (el.tagName === "line") {
                        el.setAttribute("x1", +el.getAttribute("x1") + dx);
                        el.setAttribute("y1", +el.getAttribute("y1") + dy);
                        el.setAttribute("x2", +el.getAttribute("x2") + dx);
                        el.setAttribute("y2", +el.getAttribute("y2") + dy);
                    } else if (el.tagName === "text") {
                        el.setAttribute("x", +el.getAttribute("x") + dx);
                        el.setAttribute("y", +el.getAttribute("y") + dy);
                    }
                };
                window.addEventListener("mousemove", move);
                window.addEventListener("mouseup", () => { isDragging = false; window.removeEventListener("mousemove", move); }, { once: true });
            };
        }
    }
}

pokreniMarker();

if (!window.aioMarkerMessageListenerAttached) {
    chrome.runtime.onMessage.addListener((request) => {
        if (request.action === "initMarkerColor") {
            window.markerCurrentColor = request.color;
            const picker = document.getElementById('markerColorPicker');
            const wrapper = document.getElementById('colorWrapper');
            if (picker) picker.value = request.color;
            if (wrapper) {
                wrapper.style.backgroundColor = request.color;
                wrapper.style.borderColor = request.color;
            }
        }
    });
    window.aioMarkerMessageListenerAttached = true;
}