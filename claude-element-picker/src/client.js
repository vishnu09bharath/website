/* Element picker client — injected only in dev by the host integration.
 * Lets you toggle "pick mode", hover-highlight any element, and click to add it
 * to a selection tray. The selection is POSTed back to the picker MCP server it
 * was served from, which Claude reads via get_selected_elements. Never ships. */
(function () {
  "use strict";
  if (window.__pickerLoaded) return;
  window.__pickerLoaded = true;

  // Talk to whichever server served this script — no hard-coded port.
  var ENDPOINT = (function () {
    try { return new URL(document.currentScript.src).origin; }
    catch (e) { return "http://localhost:7337"; }
  })();
  var STYLE_KEYS = [
    "font-size", "font-weight", "font-family", "line-height", "color",
    "background-color", "display", "flex-direction", "gap",
    "grid-template-columns", "padding", "margin", "width", "height",
    "border-radius", "text-align",
  ];

  var selections = []; // {key,file,loc,route,tag,id,classes,text,html,styles,note}
  var elMap = {}; // selection key -> live element (for persistent markers)
  var pickMode = false;
  var hoverEl = null;
  var PAD = 6; // px of breathing room drawn around each element's box

  // Hide Astro's dev toolbar UI (we only want its source attributes, not its
  // floating bar). Appended to <html> so it survives ViewTransitions head swaps.
  var hideToolbar = document.createElement("style");
  hideToolbar.textContent = "astro-dev-toolbar{display:none!important}";
  document.documentElement.appendChild(hideToolbar);

  // ------------------------------------------------- UI (shadow, host-themed)
  // Inherit the host site's design tokens (falls back to sensible defaults), so
  // the picker matches whatever site it's dropped into rather than imposing its
  // own look. CSS custom properties survive `all:initial`.
  var sv = getComputedStyle(document.documentElement);
  function tok(name, fb) {
    var v = (sv.getPropertyValue(name) || "").trim();
    return v || fb;
  }
  var TOKENS = {
    "--p-bg": tok("--bg", "#131312"),
    "--p-fg": tok("--fg", "#e8e8e4"),
    "--p-muted": tok("--muted", "#9a9a94"),
    "--p-rule": tok("--rule", "#2b2b29"),
    // The site's point-of-interest blue (rgb 47,129,247) — used for the box.
    "--p-accent": "#2f81f7",
    "--p-font": "'Helvetica Neue', Helvetica, Arial, sans-serif",
  };

  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box}",
    // hover highlight: thin fg outline + faint fg wash
    "#hl{position:fixed;pointer-events:none;z-index:1;display:none;border:1.5px solid var(--p-accent);",
    "background:color-mix(in srgb,var(--p-accent) 12%,transparent);border-radius:3px;transition:all .04s linear}",
    // hover label: blue chip
    "#label{position:fixed;pointer-events:none;z-index:2;display:none;white-space:nowrap;",
    "font:500 10px/1.5 var(--p-font);letter-spacing:.04em;",
    "background:var(--p-accent);color:#fff;padding:2px 6px;border-radius:2px}",
    // persistent selection markers
    ".mark{position:fixed;pointer-events:none;z-index:0;border:1.5px solid var(--p-accent);border-radius:3px;",
    "background:color-mix(in srgb,var(--p-accent) 8%,transparent);",
    "box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--p-bg) 55%,transparent)}",
    ".mark .badge{position:absolute;top:-9px;left:-2px;background:var(--p-accent);color:#fff;",
    "font:600 10px/1 var(--p-font);padding:1px 5px;border-radius:2px}",
    // toggle: mirrors .section-taskbar a / .is-active
    "#toggle{position:fixed;right:16px;bottom:16px;z-index:5;pointer-events:auto;cursor:pointer;",
    "font:500 11px/1 var(--p-font);text-transform:uppercase;letter-spacing:.12em;color:var(--p-muted);",
    "background:var(--p-bg);border:1px solid var(--p-rule);border-radius:2px;padding:10px 16px;",
    "transition:border-color .15s ease,color .15s ease}",
    "#toggle:hover{border-color:var(--p-fg);color:var(--p-fg)}",
    "#toggle.on{background:var(--p-fg);color:var(--p-bg);border-color:var(--p-fg)}",
    // tray
    "#tray{position:fixed;right:16px;bottom:58px;z-index:5;pointer-events:auto;width:300px;",
    "max-height:46vh;overflow:auto;display:none;flex-direction:column;gap:7px;background:var(--p-bg);",
    "border:1px solid var(--p-rule);border-radius:2px;padding:11px;box-shadow:0 8px 28px rgba(0,0,0,.5)}",
    "#tray.show{display:flex}",
    "#tray .hd{display:flex;justify-content:space-between;align-items:center;font:500 11px/1 var(--p-font);",
    "color:var(--p-muted);text-transform:uppercase;letter-spacing:.12em}",
    "#tray .hd button{font:inherit;color:var(--p-muted);background:none;border:none;cursor:pointer;",
    "padding:0;text-decoration:underline;text-underline-offset:.2em}",
    "#tray .hd button:hover{color:var(--p-fg)}",
    ".item{border:1px solid var(--p-rule);border-radius:2px;padding:8px 9px;font:400 12px/1.45 var(--p-font);",
    "color:var(--p-fg)}",
    ".item .top{display:flex;justify-content:space-between;gap:6px;align-items:baseline}",
    ".item .loc{color:var(--p-fg);font-size:11px;font-variant-numeric:tabular-nums;word-break:break-all}",
    ".item .acts{flex:none;display:flex;gap:8px;align-items:center}",
    ".item .acts button{color:var(--p-muted);background:none;border:none;cursor:pointer;",
    "font:500 10px/1 var(--p-font);text-transform:uppercase;letter-spacing:.08em;padding:0}",
    ".item .acts button:hover{color:var(--p-fg)}",
    ".item .cam.on{color:var(--p-fg)}",
    ".item .x{font-size:14px;letter-spacing:0}",
    ".item .meta{color:var(--p-muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".item input{margin-top:7px;width:100%;background:var(--p-bg);border:1px solid var(--p-rule);",
    "border-radius:2px;color:var(--p-fg);padding:5px 7px;font:400 12px/1.4 var(--p-font)}",
    ".item input:focus{outline:none;border-color:var(--p-fg)}",
    ".item input::placeholder{color:var(--p-muted)}",
  ].join("");

  var host = document.createElement("div");
  host.id = "__picker_host";
  host.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
  Object.keys(TOKENS).forEach(function (k) { host.style.setProperty(k, TOKENS[k]); });
  document.documentElement.appendChild(host);
  var root = host.attachShadow({ mode: "open" });
  root.innerHTML =
    "<style>" + CSS + "</style>" +
    '<div id="marks"></div>' +
    '<div id="hl"></div><div id="label"></div>' +
    '<button id="toggle">pick</button>' +
    '<div id="tray"></div>';

  var marksEl = root.getElementById("marks");
  var hlEl = root.getElementById("hl");
  var labelEl = root.getElementById("label");
  var toggleEl = root.getElementById("toggle");
  var trayEl = root.getElementById("tray");

  // ----------------------------------------------------------------- behaviour
  function setMode(on) {
    pickMode = on;
    toggleEl.classList.toggle("on", on);
    toggleEl.textContent = on ? "picking" : "pick";
    document.documentElement.style.cursor = on ? "crosshair" : "";
    if (!on) hideHighlight();
    renderTray();
  }

  function hideHighlight() {
    hoverEl = null;
    hlEl.style.display = "none";
    labelEl.style.display = "none";
  }

  function basename(p) {
    return (p || "").split("/").pop();
  }

  function srcOf(el) {
    return el && el.closest ? el.closest("[data-astro-source-file]") : null;
  }

  function showHighlight(el) {
    var r = el.getBoundingClientRect();
    hlEl.style.display = "block";
    hlEl.style.left = r.left - PAD + "px";
    hlEl.style.top = r.top - PAD + "px";
    hlEl.style.width = r.width + 2 * PAD + "px";
    hlEl.style.height = r.height + 2 * PAD + "px";
    var file = el.getAttribute("data-astro-source-file");
    var loc = el.getAttribute("data-astro-source-loc") || "";
    labelEl.textContent = el.tagName.toLowerCase() + " · " + basename(file) + ":" + loc;
    labelEl.style.display = "block";
    var ly = r.top - PAD - 22;
    labelEl.style.left = r.left - PAD + "px";
    labelEl.style.top = (ly < 2 ? r.top - PAD + 4 : ly) + "px";
  }

  function capture(el) {
    var src = srcOf(el);
    if (!src) return null;
    var cs = getComputedStyle(src);
    var styles = {};
    STYLE_KEYS.forEach(function (k) {
      var v = cs.getPropertyValue(k);
      if (v) styles[k] = v.trim();
    });
    // Full computed styles too, so Claude can request cssLevel:2 later.
    var stylesFull = {};
    for (var j = 0; j < cs.length; j++) {
      var p = cs[j];
      stylesFull[p] = cs.getPropertyValue(p);
    }
    var cls =
      src.className && typeof src.className === "string"
        ? src.className.trim().split(/\s+/).filter(Boolean).slice(0, 6)
        : [];
    var file = src.getAttribute("data-astro-source-file");
    var loc = src.getAttribute("data-astro-source-loc") || "";
    var key = file + "@" + loc + "@" + location.pathname;
    elMap[key] = src;
    return {
      key: key,
      file: file,
      loc: loc,
      route: location.pathname,
      tag: src.tagName.toLowerCase(),
      id: src.id || "",
      classes: cls,
      text: (src.textContent || "").trim().replace(/\s+/g, " ").slice(0, 2000),
      html: src.outerHTML.slice(0, 2000),
      styles: styles,
      stylesFull: stylesFull,
      note: "",
      hasShot: false,
    };
  }

  function add(el) {
    var sel = capture(el);
    if (!sel) return;
    if (selections.some(function (s) { return s.key === sel.key; })) return;
    selections.push(sel);
    renderTray();
    renderMarkers();
    sync();
  }

  function removeAt(i) {
    delete elMap[selections[i].key];
    selections.splice(i, 1);
    renderTray();
    renderMarkers();
    sync();
  }

  function clearAll() {
    selections = [];
    elMap = {};
    renderTray();
    renderMarkers();
    sync();
  }

  // Resolve a selection back to a live element on the current page (rebinding
  // after HMR / view transitions, when the cached node is gone).
  function resolveEl(s) {
    var el = elMap[s.key];
    if (el && el.isConnected) return el;
    if (s.route === location.pathname && s.loc) {
      var cand = document.querySelectorAll('[data-astro-source-loc="' + s.loc + '"]');
      for (var i = 0; i < cand.length; i++) {
        if (cand[i].getAttribute("data-astro-source-file") === s.file) {
          elMap[s.key] = cand[i];
          return cand[i];
        }
      }
    }
    return null;
  }

  // Persistent outline + index badge over every selected element on this page.
  function renderMarkers() {
    var html = "";
    selections.forEach(function (s, i) {
      var el = resolveEl(s);
      if (!el) return;
      var r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      html +=
        '<div class="mark" style="left:' + (r.left - PAD) + "px;top:" + (r.top - PAD) +
        "px;width:" + (r.width + 2 * PAD) + "px;height:" + (r.height + 2 * PAD) + 'px">' +
        '<span class="badge">' + (i + 1) + "</span></div>";
    });
    marksEl.innerHTML = html;
  }

  var _syncT;
  function sync() {
    clearTimeout(_syncT);
    _syncT = setTimeout(function () {
      try {
        fetch(ENDPOINT + "/selections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selections: selections }),
          keepalive: true,
        }).catch(function () {});
      } catch (e) {}
    }, 200);
  }

  // Lazy-load html2canvas (dev-only, optional) for on-demand screenshots.
  var _h2c;
  function loadH2C() {
    if (_h2c) return _h2c;
    _h2c = new Promise(function (res, rej) {
      if (window.html2canvas) return res(window.html2canvas);
      var s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      s.onload = function () { res(window.html2canvas); };
      s.onerror = function () { rej(new Error("html2canvas failed to load")); };
      document.head.appendChild(s);
    });
    return _h2c;
  }

  function shoot(i) {
    var s = selections[i];
    var el = resolveEl(s);
    if (!el) return;
    loadH2C()
      .then(function (h2c) { return h2c(el, { backgroundColor: null, scale: 1, logging: false }); })
      .then(function (canvas) {
        var base64 = canvas.toDataURL("image/png").split(",")[1];
        s.hasShot = true;
        renderTray();
        fetch(ENDPOINT + "/shot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: s.key, mime: "image/png", data: base64 }),
        }).catch(function () {});
      })
      .catch(function (e) { console.warn("[picker] screenshot failed:", e.message); });
  }

  function renderTray() {
    var show = pickMode || selections.length > 0;
    trayEl.classList.toggle("show", show);
    if (!show) return;
    var html =
      '<div class="hd"><span>' +
      selections.length +
      " selected</span>" +
      (selections.length ? '<button id="clr">clear all</button>' : "") +
      "</div>";
    selections.forEach(function (s, i) {
      html +=
        '<div class="item">' +
        '<div class="top"><span class="loc">' +
        basename(s.file) + ":" + s.loc +
        '</span><span class="acts">' +
        '<button class="cam' + (s.hasShot ? " on" : "") + '" data-i="' + i +
        '" title="capture screenshot">' + (s.hasShot ? "screenshot ✓" : "screenshot") + "</button>" +
        '<button class="x" data-i="' + i + '" title="remove">×</button>' +
        "</span></div>" +
        '<div class="meta">&lt;' + s.tag + "&gt; " +
        (s.text ? esc(s.text.slice(0, 80)) : "") +
        "</div>" +
        '<input data-i="' + i + '" placeholder="note (optional)" value="' +
        esc(s.note) + '"/></div>';
    });
    if (!selections.length) {
      html += '<div class="item" style="color:var(--p-muted)">Click any element to add it.</div>';
    }
    trayEl.innerHTML = html;
    var clr = root.getElementById("clr");
    if (clr) clr.onclick = clearAll;
    trayEl.querySelectorAll(".x").forEach(function (b) {
      b.onclick = function () { removeAt(+b.getAttribute("data-i")); };
    });
    trayEl.querySelectorAll(".cam").forEach(function (b) {
      b.onclick = function () { shoot(+b.getAttribute("data-i")); };
    });
    trayEl.querySelectorAll("input").forEach(function (inp) {
      inp.oninput = function () {
        selections[+inp.getAttribute("data-i")].note = inp.value;
        sync();
      };
    });
  }

  function esc(s) {
    return (s || "").replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ------------------------------------------------------------------- events
  toggleEl.addEventListener("click", function (e) {
    e.stopPropagation();
    setMode(!pickMode);
  });

  document.addEventListener(
    "mousemove",
    function (e) {
      if (!pickMode) return;
      var t = document.elementFromPoint(e.clientX, e.clientY);
      if (!t || t === host) return hideHighlight();
      var src = srcOf(t);
      if (!src) return hideHighlight();
      if (src !== hoverEl) { hoverEl = src; showHighlight(src); }
    },
    true
  );

  document.addEventListener(
    "click",
    function (e) {
      if (!pickMode) return;
      if (e.composedPath && e.composedPath().indexOf(host) >= 0) return; // our UI
      e.preventDefault();
      e.stopPropagation();
      var t = document.elementFromPoint(e.clientX, e.clientY);
      if (t && t !== host) add(t);
    },
    true
  );

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && pickMode) return setMode(false);
    var mod = e.metaKey || e.ctrlKey;
    if (mod && e.shiftKey && (e.key === "E" || e.key === "e")) {
      e.preventDefault();
      setMode(!pickMode);
    }
  });

  window.addEventListener(
    "scroll",
    function () { if (hoverEl) showHighlight(hoverEl); renderMarkers(); },
    true
  );
  window.addEventListener("resize", renderMarkers);
  // Re-resolve + reposition after Astro view transitions / HMR swaps.
  document.addEventListener("astro:page-load", renderMarkers);
  document.addEventListener("astro:after-swap", renderMarkers);

  renderTray();
  renderMarkers();
})();
