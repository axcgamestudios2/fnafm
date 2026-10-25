/* ============================================================
   FNAF 1 MULTIJUGADOR — CONFIGURACIÓN DEL MUNDO
   Basado en los assets auténticos del FNAF 1 (port HTML5)
   ============================================================ */
"use strict";

const CFG = {
  /* ---- Red ---- */
  PEER_PREFIX: "fnafm-room-",
  MAX_PLAYERS: 5,            // 1 guardia + 4 animatrónicos
  SNAPSHOT_MS: 200,          // 5 Hz
  TICK_MS: 100,              // sim del host

  /* ---- Tiempo de partida ---- */
  HOUR_SEC: 75,              // segundos por hora in-game
  HOURS: 6,                  // 12AM -> 6AM
  get NIGHT_SEC() { return this.HOUR_SEC * this.HOURS; },

  /* ---- Energía ---- */
  POWER_BASE: 0.055,         // %/s pasivo
  POWER_DOOR: 0.19,          // %/s por puerta cerrada
  POWER_LIGHT: 0.14,         // %/s por luz encendida
  POWER_CAM: 0.10,           // %/s con monitor arriba
  FOXY_BANG_PENALTY: 2.0,    // % al golpear Foxy la puerta
  POWER_OUT_MIN: 8,          // s mínimo de oscuridad antes del ataque final
  POWER_OUT_MAX: 14,

  /* ---- Habilidad susto (jumpscare inofensivo) ---- */
  ABILITY_FIRST_MIN: 15,     // s hasta primera recarga
  ABILITY_FIRST_MAX: 40,
  ABILITY_RE_MIN: 28,        // s de recarga tras uso
  ABILITY_RE_MAX: 60,
  SCARE_FLASH_MS: 1350,      // duración del susto animado
  BLIND_MS: 2500,            // monitor bloqueado tras el susto
  JS_FRAME_MS: 85,           // ms por frame del jumpscare animado

  /* ---- Foxy ---- */
  FOXY_PHASE_CD: 8,          // s entre fases
  FOXY_RUN_SEC: 3.6,         // duración de la carrera
  FOXY_PATH: ["westhall", "westcorner"], // ruta de la carrera (cuba->...->puerta izq)

  /* ---- Victoria por captura ---- */
  CAPTURE_WINDOW_MS: 1500,   // margen de gracia anti-doble-click

  /* ---- Estancia máxima en la puerta de la oficina ---- */
  DOOR_STAY_SEC: 12,         // s en la puerta antes del repliegue FORZOSO
  DOOR_STAY_WARN_SEC: 4,     // s finales en rojo parpadeante
};

/* ============================================================
   OFICINA (geometría sobre office.png 1600x720, en píxeles)
   Detectada por análisis de píxeles de la imagen original.
   ============================================================ */
const OFFICE = {
  W: 1600, H: 720,
  // anclaje de las franjas de puerta (overlays auténticos ldoor_*/rdoor_*)
  ldoor: { x: 62 },          // borde izquierdo de la franja izq.
  rdoor: { right: 62 },      // margen derecho de la franja dcha.
  // paneles de botones en la pared (DOOR arriba / LIGHT abajo)
  lbtn: { x: 414, y: 484, w: 66, h: 158 },
  rbtn: { x: 1120, y: 484, w: 66, h: 158 },
};

/* Frames de puerta según estado (los auténticos del juego) */
const DOOR_IMG = {
  L: { closed: "ldoor_closed_3", light: ["ldoor_light_0", "ldoor_light_1", "ldoor_light_2", "ldoor_light_3"] },
  R: { closed: "rdoor_closed_3", light: ["rdoor_light_0", "rdoor_light_1", "rdoor_light_2", "rdoor_light_3"] },
};

/* Jumpscare ANIMADO original: secuencias de frames auténticas */
const JS_FRAMES = {
  freddy: Array.from({ length: 10 }, (_, i) => "jsq_freddy_" + String(i).padStart(2, "0")),
  bonnie: Array.from({ length: 12 }, (_, i) => "jsq_bonnie_" + String(i).padStart(2, "0")),
  chica:  Array.from({ length: 11 }, (_, i) => "jsq_chica_" + String(i).padStart(2, "0")),
  foxy:   ["jsq_foxy_00"],
};

/* Vista de "está en la puerta" con la luz encendida (frames originales:
   Bonnie asomado en la puerta izq., Chica en la dcha., etc.) */
const DOOR_REVEAL = {
  bonnie: "jsq_bonnie_00",
  chica:  "jsq_chica_00",
  freddy: "jsq_freddy_00",
  foxy:   "jsq_foxy_00",
};

/* ============================================================
   LOCACIONES (nodos de movimiento) — mapa del FNAF 1
   mx/my/mw/mh = posición y tamaño del botón CAM sobre el mapa
   auténtico del monitor (en % del mapa, 628x334).
   ============================================================ */
const LOCS = {
  stage:      { cam: "1A", name: "Show Stage",      short: "Escenario",  base: "stage_empty",   mx: 58, my: 4,  mw: 18, mh: 10, dest: "AL ESCENARIO" },
  backstage:  { cam: "5",  name: "Backstage",        short: "Backstage",  base: "backstage",     mx: 36, my: 40, mw: 11, mh: 10, dest: "AL BACKSTAGE" },
  dining:     { cam: "1B", name: "Dining Area",      short: "Comedor",    base: "dining",        mx: 53, my: 24, mw: 18, mh: 14, dest: "AL COMEDOR" },
  cove:       { cam: "1C", name: "Pirate Cove",      short: "Cala Pirata",base: "cove_closed",   mx: 42, my: 14, mw: 10, mh: 10, foxyOnly: true, dest: "A LA CALA PIRATA" },
  kitchen:    { cam: "6",  name: "Kitchen",          short: "Cocina",     base: null, audioOnly: true, mx: 86, my: 46, mw: 10, mh: 10, dest: "A LA COCINA" },
  restrooms:  { cam: "7",  name: "Restrooms",        short: "Baños",      base: "restrooms",     mx: 85, my: 21, mw: 11, mh: 10, dest: "A LOS BAÑOS" },
  closet:     { cam: "3",  name: "Supply Closet",    short: "Almacén",    base: "closet",        mx: 40, my: 85, mw: 9,  mh: 9,  dest: "AL ALMACÉN" },
  westhall:   { cam: "2A", name: "West Hall",        short: "Pasillo O",  base: "westhall",      mx: 50, my: 50, mw: 9,  mh: 18, dest: "AL PASILLO OESTE" },
  westcorner: { cam: "2B", name: "W. Hall Corner",   short: "Esq. Oeste", base: "westcorner",    mx: 55, my: 85, mw: 10, mh: 9,  dest: "A LA ESQUINA OESTE" },
  easthall:   { cam: "4A", name: "East Hall",        short: "Pasillo E",  base: "easthall",      mx: 74, my: 50, mw: 9,  mh: 18, dest: "AL PASILLO ESTE" },
  eastcorner: { cam: "4B", name: "E. Hall Corner",   short: "Esq. Este",  base: "eastcorner",    mx: 77, my: 85, mw: 10, mh: 9,  dest: "A LA ESQUINA ESTE" },
  ldoor:      { cam: null, name: "Puerta Izquierda", short: "P. IZQ",     base: null, terminal: "L", mx: 58, my: 93, mw: 8, mh: 6, dest: "A LA PUERTA IZQUIERDA" },
  rdoor:      { cam: null, name: "Puerta Derecha",   short: "P. DCHA",    base: null, terminal: "R", mx: 79, my: 93, mw: 8, mh: 6, dest: "A LA PUERTA DERECHA" },
};

/* Adyacencia (grafo de movimiento) */
const ADJ = {
  stage:      ["dining"],
  backstage:  ["dining"],
  dining:     ["stage", "backstage", "cove", "kitchen", "restrooms", "westhall"],
  cove:       ["dining"],                    // solo Foxy la habita
  kitchen:    ["dining", "easthall"],
  restrooms:  ["dining"],
  closet:     ["westhall"],
  westhall:   ["dining", "closet", "westcorner"],
  westcorner: ["westhall", "ldoor"],
  easthall:   ["kitchen", "eastcorner"],
  eastcorner: ["easthall", "rdoor"],
  ldoor:      ["westcorner"],
  rdoor:      ["eastcorner"],
};

/* ============================================================
   PERSONAJES
   ============================================================ */
const CHARS = {
  bonnie: {
    name: "Bonnie", fullName: "Bonnie el Conejo", color: "#a06be0",
    js: "jsq_bonnie_05", portrait: "js_bonnie2",
    allowed: ["stage", "backstage", "dining", "westhall", "closet", "westcorner", "ldoor"],
    cooldown: 8, start: "stage", side: "L",
    desc: "Rápido por el ala OESTE. Ataca por la puerta izquierda.",
  },
  chica: {
    name: "Chica", fullName: "Chica la Gallina", color: "#e8c547",
    js: "jsq_chica_05", portrait: "js_chica",
    allowed: ["stage", "dining", "kitchen", "restrooms", "easthall", "eastcorner", "rdoor"],
    cooldown: 9, start: "stage", side: "R",
    desc: "Recorre el ala ESTE (y la cocina). Ataca por la puerta derecha.",
  },
  freddy: {
    name: "Freddy", fullName: "Freddy Fazbear", color: "#b98d4f",
    js: "jsq_freddy_05", portrait: "menu_face",
    allowed: ["stage", "backstage", "dining", "kitchen", "restrooms",
              "westhall", "closet", "westcorner", "easthall", "eastcorner", "ldoor", "rdoor"],
    cooldown: 13, start: "stage", side: "LR",
    desc: "Lento pero flexible: puede usar CUALQUIER lado. Su risa delata sus movimientos.",
  },
  foxy: {
    name: "Foxy", fullName: "Foxy el Pirata", color: "#d9583b",
    js: "jsq_foxy_00", portrait: "js_foxy",
    allowed: ["cove"], phaseOnly: true,
    cooldown: CFG.FOXY_PHASE_CD, start: "cove", side: "L",
    desc: "Avanza por FASES en la Cala Pirata y luego EMPIEZA una carrera directa al pasillo izquierdo.",
  },
};
const CHAR_ORDER = ["freddy", "bonnie", "chica", "foxy"];

/* ============================================================
   IMÁGENES DE CÁMARA — composición auténtica
   combo[loc][charSetKey] = imagen (cuando solo está ese personaje,
   o una combinación exacta). Si no hay combo -> base + overlay.
   ============================================================ */
const CAM_COMBO = {
  stage:      { "bonnie,chica,freddy": "stage_full" },
  dining:     { "freddy": "dining_freddy", "bonnie": "dining_bonnie",
                "freddy2": "dining_freddy2", "freddy3": "dining_freddy3" },
  westhall:   { "freddy": "westhall_freddy" },
  westcorner: { "freddy": "westcorner_freddy" },
  easthall:   { "freddy": "easthall_freddy", "bonnie": "easthall_bonnie" },
  eastcorner: { "freddy": "eastcorner_freddy" },
  backstage:  { "freddy": "backstage_freddy", "chica": "backstage_chica" },
  restrooms:  { "chica,freddy": "restrooms_chica_freddy" },
};

/* Variantes visuales (se elige aleatoriamente para dar vida) */
const CAM_VARIANTS = {
  westhall:   ["westhall", "westhall2", "westhall_far"],
  eastcorner: ["eastcorner", "eastcorner2"],
  closet:     ["closet", "closet2"],
  restrooms:  ["restrooms", "restrooms2"],
  backstage:  ["backstage", "backstage_lit", "backstage_dark"],
  dining:     ["dining", "dining_orig"],
};

/* Fases de Foxy en la cala (índice de fase -> imagen) */
const FOXY_PHASE_IMG = {
  1: "cove_peek",     // asomando
  2: "cove_out",      // fuera de la cortina
  3: "cove_ready",    // listo para correr
};

/* ============================================================
   HELPERS
   ============================================================ */
function locName(id)  { return LOCS[id] ? LOCS[id].name : id; }
function locCam(id)   { return LOCS[id] && LOCS[id].cam; }
function isTerminal(id) { return id === "ldoor" || id === "rdoor"; }

/* ¿El personaje puede moverse a ese nodo? */
function canGoTo(charId, locId) {
  const c = CHARS[charId];
  if (!c) return false;
  if (c.phaseOnly) return locId === "cove"; // Foxy no se mueve por nodos
  return c.allowed.includes(locId);
}

/* Tecla del set de personajes presentes para lookup de combos */
function comboKey(chars) { return chars.slice().sort().join(","); }

/* ============================================================
   PUERTAS DE SALIDA — lado de pantalla donde se dibuja la placa.
   Usa la geografía del mapa (mx/my de cada sala).
   ============================================================ */
function locCenter(id) {
  const L = LOCS[id];
  return { cx: L.mx !== undefined ? L.mx + L.mw / 2 : 50,
           cy: L.my !== undefined ? L.my + L.mh / 2 : 50 };
}

function exitZone(from, to) {
  const A = locCenter(from), B = locCenter(to);
  const dx = B.cx - A.cx, dy = B.cy - A.cy;
  if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return "bottom"; // mismo sitio
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

/* Salidas jugables: vecinos contiguos que el personaje puede pisar */
function exitsFor(charId, from) {
  const list = ADJ[from] || [];
  return list.filter(to => canGoTo(charId, to));
}
