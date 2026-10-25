/* ============================================================
   FNAF 1 MULTIJUGADOR — EFECTOS VISUALES Y FX
   Jumpscare (inofensivo y letal), VHS, toasts, mapas SVG
   ============================================================ */
"use strict";

const IMG = (name) => "resources/img/" + name + ".png";

/* ---------- FX: Jumpscare ---------- */
const FX = {
  scareTimeout: null,

  /* Susto inofensivo (habilidad): flash + ceguera de monitor 2.5s */
  harmlessScare(charId, done) {
    const ov = document.getElementById("fx-jumpscare");
    const img = ov.querySelector("img");
    img.src = IMG(CHARS[charId] ? CHARS[charId].js : "js_freddy");
    ov.classList.add("active", "shake");
    AudioMan.play("scream", 1.0);
    // vibración móvil si existe
    if (navigator.vibrate) try { navigator.vibrate(300); } catch (e) {}
    clearTimeout(this.scareTimeout);
    this.scareTimeout = setTimeout(() => {
      ov.classList.remove("active", "shake");
      if (done) done();
    }, CFG.SCARE_FLASH_MS);
  },

  /* Jumpscare letal (fin de partida) — dura más y con glitch */
  lethalScare(charId, then) {
    const ov = document.getElementById("fx-jumpscare");
    const img = ov.querySelector("img");
    img.src = IMG(CHARS[charId] ? CHARS[charId].js : "js_freddy");
    ov.classList.add("active", "shake", "glitching");
    AudioMan.play("scream", 1.15, 0.92);
    if (navigator.vibrate) try { navigator.vibrate([400, 80, 400]); } catch (e) {}
    clearTimeout(this.scareTimeout);
    this.scareTimeout = setTimeout(() => {
      ov.classList.remove("active", "shake", "glitching");
      if (then) then();
    }, 1600);
  },

  /* ---------- Toast ---------- */
  toast(msg, ms = 2600, kind = "") {
    const t = document.getElementById("fx-toast");
    t.textContent = msg;
    t.className = "show " + kind;
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.className = ""; }, ms);
  },

  /* ---------- Ráfaga de estática (cambio de cámara) ---------- */
  staticBurst(ms = 260) {
    const s = document.getElementById("fx-static");
    s.classList.add("active");
    clearTimeout(s._h);
    s._h = setTimeout(() => s.classList.remove("active"), ms);
  },
};

/* ============================================================
   MAPA SVG COMPARtido — lo usan el monitor del guardia
   (botones de cámara) y la vista táctica de animatrónicos
   (nodos de movimiento).
   ============================================================ */
function buildMapSVG(mode) {
  // mode: "guard" (botones por cámara) | "anim" (nodos de movimiento)
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 1000 600");
  svg.classList.add("fnaf-map");

  const mk = (tag, attrs, parent) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    (parent || svg).appendChild(el);
    return el;
  };

  // Suelo de fondo
  mk("rect", { x: 150, y: 15, width: 840, height: 570, fill: "#0a0a0d", stroke: "#232328", "stroke-width": 2, rx: 14 });

  // Zona oficinas abajo
  mk("rect", {
    x: OFFICE_MAP.x, y: OFFICE_MAP.y, width: OFFICE_MAP.w, height: OFFICE_MAP.h,
    fill: "#141419", stroke: "#3a3a44", "stroke-width": 2, rx: 8,
  });
  const t = mk("text", { x: OFFICE_MAP.x + OFFICE_MAP.w / 2, y: OFFICE_MAP.y + 28, fill: "#9a9aa5", "font-size": 20, "text-anchor": "middle", "font-family": "monospace" });
  t.textContent = mode === "guard" ? "TÚ" : "OFICINA";

  // Pasillos de conexión (líneas) — se dibujan entre centros de salas adyacentes
  const drawn = new Set();
  const center = (id) => ({ cx: LOCS[id].x + LOCS[id].w / 2, cy: LOCS[id].y + LOCS[id].h / 2 });
  for (const a in ADJ) {
    for (const b of ADJ[a]) {
      const key = [a, b].sort().join("|");
      if (drawn.has(key)) continue;
      drawn.add(key);
      const A = center(a), B = center(b);
      mk("line", { x1: A.cx, y1: A.cy, x2: B.cx, y2: B.cy, stroke: "#232328", "stroke-width": 10, "stroke-linecap": "round" });
    }
  }

  // Salas
  const markers = {};
  for (const id in LOCS) {
    const L = LOCS[id];
    const g = mk("g", { class: "map-room" + (L.audioOnly ? " audio" : "") + (L.terminal ? " terminal" : ""), "data-loc": id });
    mk("rect", { x: L.x, y: L.y, width: L.w, height: L.h, rx: 8, fill: L.foxyOnly ? "#160b0b" : "#15151c", stroke: L.foxyOnly ? "#5a2c22" : "#34343e", "stroke-width": 2 }, g);
    const label = mk("text", { x: L.x + L.w / 2, y: L.y + L.h / 2 - 2, fill: "#8f8f9c", "font-size": 15, "text-anchor": "middle", "font-family": "monospace", "pointer-events": "none" }, g);
    label.textContent = L.short.toUpperCase();
    const sub = mk("text", { x: L.x + L.w / 2, y: L.y + L.h / 2 + 18, fill: "#5a5a66", "font-size": 12, "text-anchor": "middle", "font-family": "monospace", "pointer-events": "none" }, g);
    sub.textContent = L.cam ? "CAM " + L.cam : (L.terminal ? "ATACA AQUÍ" : "");
    if (mode === "guard" && L.cam) {
      mk("circle", { cx: L.x + 14, cy: L.y + 14, r: 10, fill: "#2f6f39", stroke: "#000", "stroke-width": 2, class: "cam-led", "pointer-events": "none" }, g);
    }
    g.addEventListener("click", () => {
      svg.dispatchEvent(new CustomEvent("roomtap", { detail: { loc: id } }));
    });
    markers[id] = g;
  }
  svg._markers = markers;
  return svg;
}

/* Actualiza los marcadores de posición de animatrónicos en un mapa */
function updateMapMarkers(svg, positions, myChar, atDoorStatus) {
  if (!svg._markers) return;
  // limpiar marcadores previos
  svg.querySelectorAll(".map-marker").forEach(m => m.remove());
  for (const charId in positions) {
    const loc = positions[charId];
    const L = LOCS[loc];
    if (!L) continue;
    const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
    g.setAttribute("class", "map-marker" + (charId === myChar ? " mine" : ""));
    const cx = L.x + L.w / 2, cy = L.y + L.h / 2;
    const NS = "http://www.w3.org/2000/svg";
    const dot = document.createElementNS(NS, "circle");
    dot.setAttribute("cx", cx); dot.setAttribute("cy", cy + 26);
    dot.setAttribute("r", charId === myChar ? 11 : 8);
    dot.setAttribute("fill", CHARS[charId].color);
    dot.setAttribute("stroke", "#000"); dot.setAttribute("stroke-width", "2");
    g.appendChild(dot);
    if (charId === myChar) {
      const ring = document.createElementNS(NS, "circle");
      ring.setAttribute("cx", cx); ring.setAttribute("cy", cy + 26);
      ring.setAttribute("r", 15); ring.setAttribute("fill", "none");
      ring.setAttribute("stroke", CHARS[charId].color); ring.setAttribute("stroke-width", "2");
      ring.setAttribute("class", "pulse");
      g.appendChild(ring);
    }
    svg.appendChild(g);
  }
}

/* Reloj: segundos -> "12 AM" / "3 AM" + progreso de hora */
function fmtClock(sec) {
  const hour = Math.min(6, Math.floor(sec / CFG.HOUR_SEC)); // 0..6
  const disp = hour === 0 ? 12 : hour;
  return disp + " AM";
}
