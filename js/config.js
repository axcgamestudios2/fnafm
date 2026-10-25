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
  SCARE_FLASH_MS: 1100,      // duración del flash de susto
  BLIND_MS: 2500,            // monitor bloqueado tras el susto

  /* ---- Foxy ---- */
  FOXY_PHASE_CD: 8,          // s entre fases
  FOXY_RUN_SEC: 3.6,         // duración de la carrera
  FOXY_PATH: ["westhall", "westcorner"], // ruta de la carrera (cuba->...->puerta izq)

  /* ---- Victoria por captura ---- */
  CAPTURE_WINDOW_MS: 1500,   // margen de gracia anti-doble-click
};

/* ============================================================
   LOCACIONES (nodos de movimiento) — mapa del FNAF 1
   ============================================================ */
const LOCS = {
  stage:      { cam: "1A", name: "Show Stage",      short: "Escenario",  base: "stage_empty",   x: 400, y: 30,  w: 225, h: 85  },
  backstage:  { cam: "5",  name: "Backstage",        short: "Backstage",  base: "backstage",     x: 240, y: 40,  w: 130, h: 90  },
  dining:     { cam: "1B", name: "Dining Area",      short: "Comedor",    base: "dining",        x: 330, y: 140, w: 340, h: 120 },
  cove:       { cam: "1C", name: "Pirate Cove",      short: "Cala Pirata",base: "cove_closed",   x: 175, y: 150, w: 130, h: 105, foxyOnly: true },
  kitchen:    { cam: "6",  name: "Kitchen",          short: "Cocina",     base: null, audioOnly: true, x: 700, y: 140, w: 110, h: 90 },
  restrooms:  { cam: "7",  name: "Restrooms",        short: "Baños",      base: "restrooms",     x: 825, y: 140, w: 140, h: 90  },
  closet:     { cam: "3",  name: "Supply Closet",    short: "Almacén",    base: "closet",        x: 205, y: 270, w: 115, h: 105 },
  westhall:   { cam: "2A", name: "West Hall",        short: "Pasillo O",  base: "westhall",      x: 340, y: 275, w: 105, h: 150 },
  westcorner: { cam: "2B", name: "W. Hall Corner",   short: "Esq. Oeste", base: "westcorner",    x: 340, y: 440, w: 105, h: 80  },
  easthall:   { cam: "4A", name: "East Hall",        short: "Pasillo E",  base: "easthall",      x: 700, y: 275, w: 105, h: 150 },
  eastcorner: { cam: "4B", name: "E. Hall Corner",   short: "Esq. Este",  base: "eastcorner",    x: 700, y: 440, w: 105, h: 80  },
  ldoor:      { cam: null, name: "Puerta Izquierda", short: "P. IZQ",     base: null, terminal: "L", x: 470, y: 465, w: 70, h: 55 },
  rdoor:      { cam: null, name: "Puerta Derecha",   short: "P. DCHA",    base: null, terminal: "R", x: 600, y: 465, w: 70, h: 55 },
};
const OFFICE_MAP = { x: 470, y: 530, w: 200, h: 45 }; // posición "YOU" (solo estética)

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
    js: "js_bonnie", portrait: "js_bonnie2",
    allowed: ["stage", "backstage", "dining", "westhall", "closet", "westcorner", "ldoor"],
    cooldown: 8, start: "stage", side: "L",
    desc: "Rápido por el ala OESTE. Ataca por la puerta izquierda.",
  },
  chica: {
    name: "Chica", fullName: "Chica la Gallina", color: "#e8c547",
    js: "js_chica", portrait: "js_chica",
    allowed: ["stage", "dining", "kitchen", "restrooms", "easthall", "eastcorner", "rdoor"],
    cooldown: 9, start: "stage", side: "R",
    desc: "Recorre el ala ESTE (y la cocina). Ataca por la puerta derecha.",
  },
  freddy: {
    name: "Freddy", fullName: "Freddy Fazbear", color: "#b98d4f",
    js: "js_freddy", portrait: "menu_face",
    allowed: ["stage", "backstage", "dining", "kitchen", "restrooms",
              "westhall", "closet", "westcorner", "easthall", "eastcorner", "ldoor", "rdoor"],
    cooldown: 13, start: "stage", side: "LR",
    desc: "Lento pero flexible: puede usar CUALQUIER lado. Su risa delata sus movimientos.",
  },
  foxy: {
    name: "Foxy", fullName: "Foxy el Pirata", color: "#d9583b",
    js: "js_foxy", portrait: "js_foxy",
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
