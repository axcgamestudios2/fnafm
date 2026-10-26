/* ============================================================
   FNAF 1 MULTIJUGADOR — AUDIO
   Sonidos auténticos extraídos del port HTML5 del FNAF 1
   ============================================================ */
"use strict";

const SND = {
  fan: "resources/snd/fan_loop.mp3",        // ambiente ventilador oficina
  drone: "resources/snd/drone_loop.mp3",    // ambiente nocturno
  menu: "resources/snd/menu_music.mp3",     // música de menú
  camUp: "resources/snd/cam_up.mp3",        // abrir monitor
  camDown: "resources/snd/cam_down.mp3",    // cerrar monitor
  camSw: "resources/snd/cam_switch.mp3",    // estática al cambiar cámara
  click: "resources/snd/ui_click.mp3",      // botón
  door: "resources/snd/door.mp3",           // puerta seguridad
  scream: "resources/snd/scream.mp3",       // jumpscare
  laugh: "resources/snd/freddy_laugh.mp3",  // risa Freddy (se mueve)
  jingle: "resources/snd/freddy_jingle.mp3",// marcha toreador (sin energía)
  foxyRun: "resources/snd/foxy_run.mp3",    // carrera Foxy
  foxyBang: "resources/snd/foxy_bang.mp3",  // golpes en puerta
  steps: "resources/snd/footsteps.mp3",     // pasos (movimiento propio)
  kitchen: "resources/snd/kitchen.mp3",     // cacharros cocina
  staticL: "resources/snd/static_loop.mp3", // estática cámara
  powerDown: "resources/snd/power_down.mp3",// se agota la energía
  sixam: "resources/snd/sixam.mp3",         // campanadas 6AM
  yay: "resources/snd/yay.mp3",             // niños "¡yay!"
};

const AudioMan = {
  ctx: null,
  pool: {},
  unlocked: false,

  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { return; }
    // pre-carga de buffers usados con frecuencia
    for (const k of ["camUp", "camDown", "camSw", "click", "door", "scream",
                     "steps", "foxyRun", "foxyBang", "powerDown", "laugh", "sixam", "yay"]) {
      this._load(k);
    }
  },

  unlock() {
    this.init();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
    this.unlocked = true;
  },

  _load(key) {
    if (this.pool[key] !== undefined) return this.pool[key];
    this.pool[key] = null; // marcador: cargando
    fetch(SND[key]).then(r => r.arrayBuffer()).then(buf => {
      if (!this.ctx) { this.pool[key] = buf; return; }
      this.ctx.decodeAudioData(buf, ab => { this.pool[key] = ab; }, () => {});
    }).catch(() => {});
    return null;
  },

  /* Reproduce un efecto puntual. volume 0-2 */
  play(key, vol = 1, rate = 1) {
    this.init();
    if (!this.ctx) { // fallback sin AudioContext (raro)
      try { new Audio(SND[key]).play(); } catch (e) {}
      return;
    }
    const playBuf = (buf) => {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(g).connect(this.ctx.destination);
      src.start();
    };
    const buf = this.pool[key];
    if (buf instanceof AudioBuffer) { playBuf(buf); return; }
    // buffer crudo aún no decodificado o cargando: cargar a demanda
    fetch(SND[key]).then(r => r.arrayBuffer()).then(ab =>
      this.ctx.decodeAudioData(ab, b => { this.pool[key] = b; playBuf(b); }, () => {})
    ).catch(() => {});
  },

  /* Bucle con gain controlable. Devuelve handle {stop,setVol} */
  loop(key, vol = 0.6) {
    this.init();
    if (!this.ctx) return { stop(){}, setVol(){} };
    const handle = { src: null, gain: null, stopped: false,
      stop() { this.stopped = true; if (this.src) { try{this.src.stop();}catch(e){} } },
      setVol(v) { if (this.gain) this.gain.gain.value = v; } };
    const start = (buf) => {
      if (handle.stopped || !this.ctx) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const g = this.ctx.createGain();
      g.gain.value = vol;
      src.connect(g).connect(this.ctx.destination);
      src.start(0);
      handle.src = src; handle.gain = g;
    };
    const buf = this.pool[key];
    if (buf instanceof AudioBuffer) start(buf);
    else fetch(SND[key]).then(r => r.arrayBuffer())
      .then(ab => this.ctx.decodeAudioData(ab, b => { this.pool[key] = b; start(b); }, () => {}))
      .catch(() => {});
    return handle;
  },
};

/* Reproduce un HTMLAudioElement simple (para música de menú con control CSS) */
function playMenuMusic() {
  const a = new Audio(SND.menu);
  a.loop = true; a.volume = 0.35;
  return a;
}
