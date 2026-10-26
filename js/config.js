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

  /* ---- Caminata (movimiento a pie, sin teletransporte) ---- */
  WALK_SEC_BASE: 1.2,        // s base de cada tramo
  WALK_SEC_PER_PX: 300,      // px del mapa por segundo extra
  WALK_SEC_MIN: 2.2,         // duración mínima
  WALK_SEC_MAX: 3.8,         // duración máxima

  /* ---- Habilidades especiales por animatrónico ---- */
  ABILITY_FIRST_MIN: 12,     // s hasta la primera carga
  ABILITY_FIRST_MAX: 25,
  SCARE_FLASH_MS: 1350,      // duración del susto animado
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

/* Jumpscare ANIMADO original: secuencias de frames auténticas */
const JS_FRAMES = {
  freddy: Array.from({ length: 10 }, (_, i) => "jsq_freddy_" + String(i).padStart(2, "0")),
  bonnie: Array.from({ length: 12 }, (_, i) => "jsq_bonnie_" + String(i).padStart(2, "0")),
  chica:  Array.from({ length: 11 }, (_, i) => "jsq_chica_" + String(i).padStart(2, "0")),
  foxy:   ["jsq_foxy_00"],
};

/* ============================================================
   LOCACIONES (nodos de movimiento) — mapa del FNAF 1
   ============================================================ */
const LOCS = {
  stage:      { cam: "1A", name: "Show Stage",      short: "Escenario",  base: "stage_empty",   x: 400, y: 30,  w: 225, h: 85,  dest: "AL ESCENARIO" },
  backstage:  { cam: "5",  name: "Backstage",        short: "Backstage",  base: "backstage",     x: 240, y: 40,  w: 130, h: 90,  dest: "AL BACKSTAGE" },
  dining:     { cam: "1B", name: "Dining Area",      short: "Comedor",    base: "dining",        x: 330, y: 140, w: 340, h: 120, dest: "AL COMEDOR" },
  cove:       { cam: "1C", name: "Pirate Cove",      short: "Cala Pirata",base: "cove_closed",   x: 175, y: 150, w: 130, h: 105, foxyOnly: true, dest: "A LA CALA PIRATA" },
  kitchen:    { cam: "6",  name: "Kitchen",          short: "Cocina",     base: null, audioOnly: true, x: 700, y: 140, w: 110, h: 90, dest: "A LA COCINA" },
  restrooms:  { cam: "7",  name: "Restrooms",        short: "Baños",      base: "restrooms",     x: 825, y: 140, w: 140, h: 90,  dest: "A LOS BAÑOS" },
  closet:     { cam: "3",  name: "Supply Closet",    short: "Almacén",    base: "closet",        x: 205, y: 270, w: 115, h: 105, dest: "AL ALMACÉN" },
  westhall:   { cam: "2A", name: "West Hall",        short: "Pasillo O",  base: "westhall",      x: 340, y: 275, w: 105, h: 150, dest: "AL PASILLO OESTE" },
  westcorner: { cam: "2B", name: "W. Hall Corner",   short: "Esq. Oeste", base: "westcorner",    x: 340, y: 440, w: 105, h: 80,  dest: "A LA ESQUINA OESTE" },
  easthall:   { cam: "4A", name: "East Hall",        short: "Pasillo E",  base: "easthall",      x: 700, y: 275, w: 105, h: 150, dest: "AL PASILLO ESTE" },
  eastcorner: { cam: "4B", name: "E. Hall Corner",   short: "Esq. Este",  base: "eastcorner",    x: 700, y: 440, w: 105, h: 80,  dest: "A LA ESQUINA ESTE" },
  ldoor:      { cam: null, name: "Puerta Izquierda", short: "P. IZQ",     base: null, terminal: "L", x: 470, y: 465, w: 70, h: 55, dest: "A LA PUERTA IZQUIERDA" },
  rdoor:      { cam: null, name: "Puerta Derecha",   short: "P. DCHA",    base: null, terminal: "R", x: 600, y: 465, w: 70, h: 55, dest: "A LA PUERTA DERECHA" },
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
    desc: "Ala OESTE. HABILIDAD: SIGILO — desaparece de las cámaras 7s.",
  },
  chica: {
    name: "Chica", fullName: "Chica la Gallina", color: "#e8c547",
    js: "js_chica", portrait: "js_chica",
    allowed: ["stage", "dining", "kitchen", "restrooms", "easthall", "eastcorner", "rdoor"],
    cooldown: 9, start: "stage", side: "R",
    desc: "Ala ESTE y cocina. HABILIDAD: AVERÍA — satura TODAS las cámaras 6s.",
  },
  freddy: {
    name: "Freddy", fullName: "Freddy Fazbear", color: "#b98d4f",
    js: "js_freddy", portrait: "menu_face",
    allowed: ["stage", "backstage", "dining", "kitchen", "restrooms",
              "westhall", "closet", "westcorner", "easthall", "eastcorner", "ldoor", "rdoor"],
    cooldown: 13, start: "stage", side: "LR",
    desc: "Lento pero flexible (cualquier lado). HABILIDAD: RISA — bloquea puertas y luces del guardia 4s.",
  },
  foxy: {
    name: "Foxy", fullName: "Foxy el Pirata", color: "#d9583b",
    js: "js_foxy", portrait: "js_foxy",
    allowed: ["cove"], phaseOnly: true,
    cooldown: CFG.FOXY_PHASE_CD, start: "cove", side: "L",
    desc: "Fases en la Cala Pirata. HABILIDAD: ¡CARRERA! — corre a toda velocidad hasta la puerta izquierda.",
  },
};
const CHAR_ORDER = ["freddy", "bonnie", "chica", "foxy"];

/* ============================================================
   HABILIDADES ESPECIALES (una por animatrónico, con recarga)
   ============================================================ */
const ABILITIES = {
  freddy: { id: "laugh",   name: "RISA SINIESTRA",    cd: 45, dur: 4,
            sub: "bloquea PUERTAS y LUCES del guardia",
            toast: "¡RISA SINIESTRA! El guardia no puede usar sus puertas ni luces." },
  bonnie: { id: "stealth", name: "MODO SIGILO",       cd: 40, dur: 7,
            sub: "invisible en las cámaras del guardia",
            toast: "¡MODO SIGILO! No apareces en ninguna cámara." },
  chica:  { id: "jam",     name: "AVERÍA DE CÁMARAS", cd: 40, dur: 6,
            sub: "estática total en el monitor del guardia",
            toast: "¡AVERÍA! Todas las cámaras del guardia llenas de estática." },
  foxy:   { id: "run",     name: "¡CARRERA!",         cd: 0,  dur: CFG.FOXY_RUN_SEC,
            sub: "corre a toda velocidad por el pasillo izquierdo",
            toast: "¡CARRERA INICIADA!" },
};

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
   Se calcula con la geografía real del mapa: la puerta que lleva
   a una sala se dibuja en el borde de pantalla correspondiente a
   su dirección relativa (izquierda/derecha/arriba/abajo).
   ============================================================ */
function locCenter(id) {
  const L = LOCS[id];
  return { cx: L.x + L.w / 2, cy: L.y + L.h / 2 };
}

function exitZone(from, to) {
  const A = locCenter(from), B = locCenter(to);
  const dx = B.cx - A.cx, dy = B.cy - A.cy;
  if (Math.abs(dx) < 45 && Math.abs(dy) < 45) return "bottom"; // mismo sitio
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "bottom" : "top";
}

/* Salidas jugables: vecinos contiguos que el personaje puede pisar */
function exitsFor(charId, from) {
  const list = ADJ[from] || [];
  return list.filter(to => canGoTo(charId, to));
}

/* Duración del tramo a pie entre dos salas (según distancia real del mapa) */
function walkDur(from, to) {
  const A = locCenter(from), B = locCenter(to);
  const d = Math.hypot(B.cx - A.cx, B.cy - A.cy);
  return Math.min(CFG.WALK_SEC_MAX,
           Math.max(CFG.WALK_SEC_MIN, CFG.WALK_SEC_BASE + d / CFG.WALK_SEC_PER_PX));
}
