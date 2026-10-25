/* ============================================================
   FNAF 1 MULTIJUGADOR — EFECTOS VISUALES Y FX
   Jumpscare ANIMADO con los frames originales del juego,
   VHS, estática, toasts sobrios.
   ============================================================ */
"use strict";

const IMG = (name) => "resources/img/" + name + ".png";

/* ---------- FX ---------- */
const FX = {
  scareTimeout: null,
  scareAnim: null,

  /* Jumpscare animado (frames auténticos del FNAF 1) */
  playJumpscare(charId, ms, lethal, done) {
    const ov = document.getElementById("fx-jumpscare");
    const img = ov.querySelector("img");
    const frames = JS_FRAMES[charId] || JS_FRAMES.freddy;
    let i = 0;
    ov.classList.add("active", "shake");
    if (lethal) ov.classList.add("glitching");
    AudioMan.play("scream", lethal ? 1.15 : 1.0, lethal ? 0.92 : 1);
    if (navigator.vibrate) try { navigator.vibrate(lethal ? [400, 80, 400] : 300); } catch (e) {}
    clearInterval(this.scareAnim);
    this.scareAnim = setInterval(() => {
      img.src = IMG(frames[i % frames.length]);
      i++;
    }, CFG.JS_FRAME_MS);
    img.src = IMG(frames[0]);
    clearTimeout(this.scareTimeout);
    this.scareTimeout = setTimeout(() => {
      clearInterval(this.scareAnim);
      ov.classList.remove("active", "shake", "glitching");
      if (done) done();
    }, ms);
  },

  /* Susto inofensivo (habilidad): jumpscare animado + ceguera de monitor */
  harmlessScare(charId, done) {
    this.playJumpscare(charId, CFG.SCARE_FLASH_MS, false, done);
  },

  /* Jumpscare letal (fin de partida) */
  lethalScare(charId, then) {
    this.playJumpscare(charId, 1700, true, then);
  },

  /* ---------- Toast ---------- */
  toast(msg, ms = 2600, kind = "") {
    const t = document.getElementById("fx-toast");
    t.textContent = msg;
    t.className = "show " + kind;
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.className = ""; }, ms);
  },

  /* ---------- Ráfaga de estática ---------- */
  staticBurst(ms = 260) {
    const s = document.getElementById("fx-static");
    s.classList.add("active");
    clearTimeout(s._h);
    s._h = setTimeout(() => s.classList.remove("active"), ms);
  },
};

/* Reloj: segundos -> "12 AM" / "3 AM" */
function fmtClock(sec) {
  const hour = Math.min(6, Math.floor(sec / CFG.HOUR_SEC)); // 0..6
  const disp = hour === 0 ? 12 : hour;
  return disp + " AM";
}
