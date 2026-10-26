/* ============================================================
   FNAF 1 MULTIJUGADOR — CONFIGURACIÓN DEL MUNDO
   Assets 100% auténticos del FNAF 1 original (port HTML5),
   verificados por hash perceptual + estructura + color.
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
  JS_FRAME_MS: 85,           // ms por frame del jumpscare animado

  /* ---- Susto inofensivo (habilidad EXTRA común) ---- */
  SCARE_FIRST_MIN: 10,       // s hasta la primera carga del susto
  SCARE_FIRST_MAX: 22,
  SCARE_RE_SEC: 30,          // recarga fija del susto
  SCARE_FLASH_MS: 1350,      // duración del jumpscare animado en el guardia
  SCARE_BLIND_MS: 2600,      // monitor del guardia cegado tras el susto

  /* ---- Foxy ---- */
  FOXY_PHASE_CD: 8,          // s entre fases
  FOXY_RUN_SEC: 3.6,         // duración de la carrera
  FOXY_PATH: ["westhall", "westcorner"], // ruta de la carrera (cala->...->puerta izq)

  /* ---- Victoria por captura ---- */
  CAPTURE_WINDOW_MS: 1500,   // margen de gracia anti-doble-click

  /* ---- Estancia máxima en la puerta de la oficina ---- */
  DOOR_STAY_SEC: 12,         // s en la puerta antes del repliegue FORZOSO
  DOOR_STAY_WARN_SEC: 4,     // s finales en rojo parpadeante
};

/* Jumpscare ANIMADO original: secuencias de frames auténticas */
const JS_FRAMES = {
  freddy: Array.from({ length: 16 }, (_, i) => "jsq_freddy_" + String(i).padStart(2, "0")),
  bonnie: Array.from({ length: 12 }, (_, i) => "jsq_bonnie_" + String(i).padStart(2, "0")),
  chica:  Array.from({ length: 11 }, (_, i) => "jsq_chica_" + String(i).padStart(2, "0")),
  foxy:   Array.from({ length: 7 },  (_, i) => "jsq_foxy_" + String(i).padStart(2, "0")),
};

/* ============================================================
   LOCACIONES (nodos de movimiento) — mapa del FNAF 1
   Pasillos corregidos: OESTE = 0043 (con Bonnie 0222),
   ESTE = 0554/0241. Esquinas corregidas: OESTE = 0280/0282,
   ESTE = 0041/0494. (Verificado: Foxy rojo en la familia 0043,
   Bonnie púrpura en 0222, secuencia de Bonnie en la 0280.)
   ============================================================ */
const LOCS = {
  stage:      { cam: "1A", name: "Show Stage",      short: "Escenario",  base: "stage_empty",   x: 400, y: 30,  w: 225, h: 85,  dest: "AL ESCENARIO" },
  backstage:  { cam: "5",  name: "Backstage",       short: "Backstage",  base: "backstage",     x: 240, y: 40,  w: 130, h: 90,  dest: "AL BACKSTAGE" },
  dining:     { cam: "1B", name: "Dining Area",     short: "Comedor",    base: "dining",        x: 330, y: 140, w: 340, h: 120, dest: "AL COMEDOR" },
  cove:       { cam: "1C", name: "Pirate Cove",     short: "Cala Pirata",base: "cove_closed",  x: 175, y: 150, w: 130, h: 105, foxyOnly: true, dest: "A LA CALA PIRATA" },
  kitchen:    { cam: "6",  name: "Kitchen",         short: "Cocina",     base: null, audioOnly: true, x: 700, y: 140, w: 110, h: 90, dest: "A LA COCINA" },
  restrooms:  { cam: "7",  name: "Restrooms",       short: "Baños",      base: "restrooms",     x: 825, y: 140, w: 140, h: 90,  dest: "A LOS BAÑOS" },
  closet:     { cam: "3",  name: "Supply Closet",   short: "Almacén",    base: "closet",        x: 205, y: 270, w: 115, h: 105, dest: "AL ALMACÉN" },
  westhall:   { cam: "2A", name: "West Hall",       short: "Pasillo O",  base: "westhall",      x: 340, y: 275, w: 105, h: 150, dest: "AL PASILLO OESTE" },
  westcorner: { cam: "2B", name: "W. Hall Corner",  short: "Esq. Oeste", base: "westcorner",    x: 340, y: 440, w: 105, h: 80,  dest: "A LA ESQUINA OESTE" },
  easthall:   { cam: "4A", name: "East Hall",       short: "Pasillo E",  base: "easthall",      x: 700, y: 275, w: 105, h: 150, dest: "AL PASILLO ESTE" },
  eastcorner: { cam: "4B", name: "E. Hall Corner",  short: "Esq. Este",  base: "eastcorner",    x: 700, y: 440, w: 105, h: 80,  dest: "A LA ESQUINA ESTE" },
  ldoor:      { cam: null, name: "Puerta Izquierda", short: "P. IZQ",    base: null, terminal: "L", x: 470, y: 465, w: 70, h: 55, dest: "A LA PUERTA IZQUIERDA" },
  rdoor:      { cam: null, name: "Puerta Derecha",   short: "P. DCHA",   base: null, terminal: "R", x: 600, y: 465, w: 70, h: 55, dest: "A LA PUERTA DERECHA" },
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
    desc: "Ala OESTE. HABILIDAD: SIGILO (invisible en cámaras 7s) + SUSTO inofensivo EXTRA.",
  },
  chica: {
    name: "Chica", fullName: "Chica la Gallina", color: "#e8c547",
    js: "js_chica", portrait: "js_chica",
    allowed: ["stage", "dining", "kitchen", "restrooms", "easthall", "eastcorner", "rdoor"],
    cooldown: 9, start: "stage", side: "R",
    desc: "Ala ESTE y cocina. HABILIDAD: AVERÍA (satura las cámaras 6s) + SUSTO inofensivo EXTRA.",
  },
  freddy: {
    name: "Freddy", fullName: "Freddy Fazbear", color: "#b98d4f",
    js: "js_freddy", portrait: "menu_face",
    allowed: ["stage", "backstage", "dining", "kitchen", "restrooms",
              "westhall", "closet", "westcorner", "easthall", "eastcorner", "ldoor", "rdoor"],
    cooldown: 13, start: "stage", side: "LR",
    desc: "Lento pero flexible (cualquier lado). HABILIDAD: RISA (bloquea puertas/luces 4s) + SUSTO inofensivo EXTRA.",
  },
  foxy: {
    name: "Foxy", fullName: "Foxy el Pirata", color: "#d9583b",
    js: "js_foxy", portrait: "js_foxy",
    allowed: ["cove"], phaseOnly: true,
    cooldown: CFG.FOXY_PHASE_CD, start: "cove", side: "L",
    desc: "Fases en la Cala Pirata. HABILIDAD: ¡CARRERA! veloz hasta la puerta izq. + SUSTO inofensivo EXTRA.",
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
   VISTAS DE CÁMARA AUTÉNTICAS CON ANIMATRÓNICOS
   (imágenes originales verificadas: sala + personaje presente)
   CAM_VIEWS[loc][charId] = imagen
   ============================================================ */
const CAM_VIEWS = {
  stage: {
    "bonnie,chica,freddy": "stage_full",     // los 3 en el escenario
    "bonnie,freddy":       "stage_bf",       // Bonnie+Freddy (sin Chica)
    "freddy":              "stage_full_alt", // variante auténtica
    /* sin combinación auténtica -> base + chips */
  },
  dining: {
    "bonnie": "dining_bonnie",
    "freddy": "dining_freddy",
  },
  backstage: {
    "bonnie":  "backstage_bonnie",   // la cara de Bonnie asomando
    "freddy":  "backstage_freddy",
    "chica":   "backstage_chica",
  },
  restrooms: {
    "chica,freddy": "restrooms_chica_freddy",
  },
  westhall: {
    "bonnie": "westhall_bonnie",     // Bonnie parado en el pasillo oeste
    "freddy": "easthall_freddy",     // Freddy oscuro (vista auténtica de pasillo)
  },
  westcorner: {
    "bonnie": "westcorner_bonnie3",  // el primerísimo plano ICÓNICO
  },
  easthall: {
    "freddy": "easthall_freddy",     // Freddy a oscuras con ojos blancos
    "chica":  "easthall_freddy",     // oscurecido (sin imagen propia de Chica lejos)
  },
  eastcorner: {
    "chica":  "eastcorner_chica",    // cara de Chica en la esquina
    "freddy": null,                  /* secuencia animada (freddy_stare) — se maneja aparte */
  },
};

/* Variantes visuales de sala VACÍA (elegidas por el host al azar) */
const CAM_VARIANTS = {
  westhall:   ["westhall"],
  westcorner: ["westcorner", "westcorner2"],
  easthall:   ["easthall", "easthall2"],
  eastcorner: ["eastcorner", "eastcorner_poster"],
  closet:     ["closet"],
  restrooms:  ["restrooms"],
  backstage:  ["backstage", "backstage_lit"],
  dining:     ["dining"],
};

/* Fases de Foxy en la cala (índice de fase -> imagen auténtica)
   F1: asoma la cabeza por la rendija · F2: medio fuera · F3: ¡VACÍA! (listo) */
const FOXY_PHASE_IMG = {
  0: "cove_closed",   // tras la cortina (inicio de noche)
  1: "cove_peek",
  2: "cove_lean",
  3: "cove_gone",
};

/* Frames auténticos de Foxy EMBISTIENDO la puerta izquierda (0396-0412) */
const FOXYDOOR_FRAMES = Array.from({ length: 17 }, (_, i) => "foxydoor_" + String(i).padStart(2, "0"));

/* Frames auténticos de Foxy CORRIENDO por el pasillo (CAM 2A/2B) */
const FOXYRUN_FRAMES = ["foxyrun_1", "foxyrun_2", "foxyrun_3", "foxyrun_4"];
const FOXYRUN_MS = 110;   // ~9 fps: esprint

/* Secuencia animada de Freddy clavando la mirada en la Esquina Este */
const FREDDY_STARE = Array.from({ length: 10 }, (_, i) => "freddy_stare_" + String(i).padStart(2, "0"));
const STARE_MS = 620;

/* ============================================================
   MAPA ORIGINAL DEL MONITOR (M0013 del juego auténtico, 404x404)
   ============================================================ */
const MAP_IMG = "map_floorplan";
const MAP_BTN_POS = {                    // {x,y} en % del plano (0-100)
  stage:      { x: 44.6, y: 15.1 },     // CAM 1A — Show Stage
  dining:     { x: 44.8, y: 36.9 },     // CAM 1B — Dining Area
  cove:       { x: 10.9, y: 46.5 },     // CAM 1C — Pirate Cove
  westhall:   { x: 31.7, y: 68.1 },     // CAM 2A — West Hall
  westcorner: { x: 31.7, y: 85.4 },     // CAM 2B — W. Hall Corner
  closet:     { x: 18.8, y: 70.0 },     // CAM 3  — Supply Closet
  easthall:   { x: 57.4, y: 68.1 },     // CAM 4A — East Hall
  eastcorner: { x: 57.4, y: 85.4 },     // CAM 4B — E. Hall Corner
  backstage:  { x: 7.7,  y: 28.2 },     // CAM 5  — Backstage
  kitchen:    { x: 80.7, y: 39.4 },     // CAM 6  — Kitchen
  restrooms:  { x: 91.1, y: 43.3 },     // CAM 7  — Restrooms
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

/* Tecla del set de personajes presentes para lookup de vistas */
function comboKey(chars) { return chars.slice().sort().join(","); }

/* ============================================================
   PUERTAS DE SALIDA — lado de pantalla donde se dibuja la placa
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

/* Duración del tramo a pie entre dos salas */
function walkDur(from, to) {
  const A = locCenter(from), B = locCenter(to);
  const d = Math.hypot(B.cx - A.cx, B.cy - A.cy);
  return Math.min(CFG.WALK_SEC_MAX,
           Math.max(CFG.WALK_SEC_MIN, CFG.WALK_SEC_BASE + d / CFG.WALK_SEC_PER_PX));
}
