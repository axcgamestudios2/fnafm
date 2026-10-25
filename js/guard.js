/* ============================================================
   FNAF 1 MULTIJUGADOR — VISTA DEL GUARDIA
   Gameplay idéntico al FNAF 1 original:
   - Oficina panorámica: se GIRA con el ratón hacia los bordes.
   - Botones de PUERTA y LUZ EN LA PARED (izq./dcha.).
   - Monitor de cámaras: franja inferior (hover/click) o
     deslizando hacia abajo; mapa original abajo a la derecha.
   - HUD: reloj arriba a la derecha, energía abajo a la izquierda.
   ============================================================ */
"use strict";

const Guard = {
  input: { doors: { L: false, R: false }, lights: { L: false, R: false }, monitor: null },
  fan: null, staticL: null, kitchenL: null, jingle: null,
  lastAnims: {},
  blind: false,
  camVar: {},

  /* pan de la oficina */
  pan: 0,
  panTarget: 0,
  panMax: 0,
  panRAF: null,
  mouseXFrac: 0.5,
  lightFlicker: null,
  lightFrame: 0,
  bound: false,
  _measure: null,

  /* entrada al modo guardia */
  enter() {
    UI.show("s-guard");
    this.powerOutLocal = false;
    this.blind = false;
    this.input.doors.L = false; this.input.doors.R = false;
    this.input.lights.L = false; this.input.lights.R = false;
    this.input.monitor = null;
    this.lastCam = null;
    document.getElementById("powerout-fx").classList.remove("active");
    this.buildOffice();
    this.buildMonitor();
    this.lastAnims = {};
    this.camVar = {};
    AudioMan.unlock();
    this.fan = AudioMan.loop("fan", 0.5);
    document.getElementById("g-clock").textContent = "12 AM";
    document.getElementById("g-power").textContent = "100%";
    this.setUsage(1);
    this.startPan();
    // la pista de "CÁMARAS" desaparece tras unos segundos
    const hint = document.getElementById("cam-hint");
    if (hint) { hint.classList.remove("gone"); setTimeout(() => hint.classList.add("gone"), 9000); }
  },

  exit() {
    this.stopPan();
    if (this.fan) this.fan.stop();
    if (this.staticL) this.staticL.stop();
    if (this.kitchenL) this.kitchenL.stop();
    if (this.jingle) { this.jingle.stop(); this.jingle = null; }
    if (this.lightFlicker) { clearInterval(this.lightFlicker); this.lightFlicker = null; }
    this.fan = this.staticL = this.kitchenL = null;
  },

  /* ---------- Construcción de la oficina panorámica ---------- */
  buildOffice() {
    const view = document.getElementById("office-view");
    view.innerHTML =
      '<div id="office-world">' +
      '  <img id="office-bg" src="' + IMG("office") + '" alt="" draggable="false">' +
      '  <div id="reveal-L"></div>' +
      '  <div id="reveal-R"></div>' +
      '  <img id="door-img-L" alt="" draggable="false">' +
      '  <img id="door-img-R" alt="" draggable="false">' +
      '  <div class="wall-panel" id="panel-L" style="left:' + (OFFICE.lbtn.x / OFFICE.W * 100) + '%;top:' + (OFFICE.lbtn.y / OFFICE.H * 100) + '%;width:' + (OFFICE.lbtn.w / OFFICE.W * 100) + '%;height:' + (OFFICE.lbtn.h / OFFICE.H * 100) + '%">' +
      '    <button class="wbtn wbtn-door" id="btn-door-L">DOOR</button>' +
      '    <button class="wbtn wbtn-light" id="btn-light-L">LIGHT</button>' +
      "  </div>" +
      '  <div class="wall-panel" id="panel-R" style="left:' + (OFFICE.rbtn.x / OFFICE.W * 100) + '%;top:' + (OFFICE.rbtn.y / OFFICE.H * 100) + '%;width:' + (OFFICE.rbtn.w / OFFICE.W * 100) + '%;height:' + (OFFICE.rbtn.h / OFFICE.H * 100) + '%">' +
      '    <button class="wbtn wbtn-door" id="btn-door-R">DOOR</button>' +
      '    <button class="wbtn wbtn-light" id="btn-light-R">LIGHT</button>' +
      "  </div>" +
      "</div>" +
      '<div id="g-hud-tr"><div id="g-clock">12 AM</div><div id="g-night">NOCHE 1</div></div>' +
      '<div id="g-hud-bl">' +
      '  <div class="gh-line">Power left: <span id="g-power">100%</span></div>' +
      '  <div class="gh-line">Usage: <span id="g-usage"></span></div>' +
      "</div>" +
      '<div class="cam-bar" id="cam-bar"><div class="cam-bar-inner"></div></div>' +
      '<div id="cam-hint">CÁMARAS</div>';

    // botones de pared (como el original: click en el botón de la pared)
    document.getElementById("btn-door-L").onclick = () => this.toggleDoor("L");
    document.getElementById("btn-door-R").onclick = () => this.toggleDoor("R");
    for (const s of ["L", "R"]) {
      const b = document.getElementById("btn-light-" + s);
      b.onmousedown = (e) => { e.preventDefault(); this.lightOn(s); };
      b.onmouseup = () => this.lightOff(s);
      b.onmouseleave = () => this.lightOff(s);
      b.ontouchstart = (e) => { e.preventDefault(); this.lightOn(s); };
      b.ontouchend = () => this.lightOff(s);
    }

    this.bindPanning();
    this.bindCamGestures();
    this.renderDoors();
  },

  /* ---------- Paneo con el ratón (estilo FNAF original) ---------- */
  measureWorld() {
    const view = document.getElementById("office-view");
    const world = document.getElementById("office-world");
    if (!view || !world) return;
    const vw = view.clientWidth, vh = view.clientHeight;
    // el mundo mantiene el aspecto 1600:720; si la pantalla es más ancha,
    // se centra (sin pan). Si es más estrecha (lo normal), sobra ancho = pan.
    const worldW = vh * OFFICE.W / OFFICE.H;
    world.style.width = worldW + "px";
    world.style.left = (vw > worldW ? (vw - worldW) / 2 : 0) + "px";
    this.panMax = Math.max(0, worldW - vw);
    this.panTarget = Math.min(this.panTarget, this.panMax);
  },

  bindPanning() {
    const view = document.getElementById("office-view");
    this.pan = this.panTarget = 0;
    this.measureWorld();
    if (!this._measure) {
      this._measure = () => this.measureWorld();
      window.addEventListener("resize", this._measure);
    }

    view.addEventListener("mousemove", (e) => {
      const vw = view.clientWidth || 1;
      this.mouseXFrac = e.clientX / vw;
      // zona muerta central (como el original): solo se gira en los laterales
      const dead = 0.34;
      let f = 0;
      if (this.mouseXFrac < dead) f = -(dead - this.mouseXFrac) / dead;
      else if (this.mouseXFrac > 1 - dead) f = (this.mouseXFrac - (1 - dead)) / dead;
      this.panTarget = Math.max(0, Math.min(1, 0.5 + f * 1.25)) * this.panMax;
    });

    // arrastre táctil horizontal para girar
    let tx0 = null;
    view.addEventListener("touchstart", (e) => { tx0 = e.touches[0].clientX; }, { passive: true });
    view.addEventListener("touchmove", (e) => {
      if (tx0 === null || this.panMax <= 0) return;
      const dx = e.touches[0].clientX - tx0;
      this.panTarget = Math.max(0, Math.min(this.panMax, this.panTarget - dx * 1.7));
      tx0 = e.touches[0].clientX;
    }, { passive: true });
  },

  startPan() {
    this.stopPan();
    const step = () => {
      this.pan += (this.panTarget - this.pan) * 0.16;
      const world = document.getElementById("office-world");
      if (world) world.style.transform = "translateX(" + (-this.pan) + "px)";
      this.panRAF = requestAnimationFrame(step);
    };
    this.panRAF = requestAnimationFrame(step);
  },
  stopPan() {
    if (this.panRAF) cancelAnimationFrame(this.panRAF);
    this.panRAF = null;
  },

  /* ---------- Gestos del monitor (franja inferior / swipe) ----------
     Se liga UNA sola vez a los elementos persistentes. */
  bindCamGestures() {
    if (this.bound) return;
    this.bound = true;
    const view = document.getElementById("office-view");
    const mon = document.getElementById("monitor");

    const barToggle = (ev) => {
      const bar = ev.currentTarget;
      if (bar.classList.contains("disabled")) return;
      const now = Date.now();
      // anti-rebote GLOBAL compartido: evita el bucle abrir->cerrar cuando
      // el monitor aparece bajo el cursor y su propia franja recibe el hover
      if (now - (this._barLast || 0) < 550) return;
      this._barLast = now;
      this.toggleMonitor();
    };

    // las franjas se crean dinámicamente: delegación en los contenedores
    for (const host of [view, mon]) {
      host.addEventListener("mouseover", (e) => {
        const bar = e.target.closest && e.target.closest(".cam-bar");
        if (bar) barToggle({ currentTarget: bar });
      });
      host.addEventListener("click", (e) => {
        const bar = e.target.closest && e.target.closest(".cam-bar");
        if (bar) barToggle({ currentTarget: bar });
      });
    }

    // swipe vertical en la vista de oficina: hacia abajo abre, hacia arriba cierra
    let sy0 = null, sx0 = null;
    view.addEventListener("touchstart", (e) => {
      sy0 = e.touches[0].clientY; sx0 = e.touches[0].clientX;
    }, { passive: true });
    view.addEventListener("touchend", (e) => {
      if (sy0 === null) return;
      const dy = e.changedTouches[0].clientY - sy0;
      const dx = Math.abs(e.changedTouches[0].clientX - (sx0 || 0));
      if (dy > 70 && dx < 70) this.toggleMonitor(true);
      else if (dy < -70 && dx < 70) this.toggleMonitor(false);
      sy0 = null;
    }, { passive: true });

    // swipe en el monitor: hacia arriba cierra
    let msy0 = null;
    mon.addEventListener("touchstart", (e) => { msy0 = e.touches[0].clientY; }, { passive: true });
    mon.addEventListener("touchend", (e) => {
      if (msy0 === null) return;
      if (msy0 - e.changedTouches[0].clientY > 70) this.toggleMonitor(false);
      msy0 = null;
    }, { passive: true });
  },

  /* ---------- Input: puertas ---------- */
  toggleDoor(side) {
    if (App.gameOverMsg || this.powerOutLocal) return;
    this.input.doors[side] = !this.input.doors[side];
    AudioMan.play("door", 0.9);
    this.renderDoors();
  },
  lightOn(side) {
    if (App.gameOverMsg || this.powerOutLocal) return;
    if (!this.input.lights[side]) {
      this.input.lights[side] = true;
      AudioMan.play("camSw", 0.4);
      this.renderDoors();
    }
  },
  lightOff(side) {
    if (this.input.lights[side]) {
      this.input.lights[side] = false;
      this.renderDoors();
    }
  },

  /* ---------- Render de puertas y presencia ---------- */
  renderDoors() {
    const snap = App.snap;
    for (const side of ["L", "R"]) {
      const img = document.getElementById("door-img-" + side);
      const reveal = document.getElementById("reveal-" + side);
      const closed = this.input.doors[side];
      const lit = this.input.lights[side];
      const p = side === "L" ? "ldoor" : "rdoor";

      // ¿hay alguien en la puerta?
      let present = [];
      if (snap) {
        for (const ch in snap.anims) {
          if (snap.anims[ch].n === p && !snap.anims[ch].running) present.push(ch);
        }
      }

      // revelación: luz + alguien => imagen original del animatrónico en la puerta
      if (lit && !closed && present.length) {
        const rv = DOOR_REVEAL[present[0]] || DOOR_REVEAL.freddy;
        reveal.style.backgroundImage = "url(" + IMG(rv) + ")";
        reveal.classList.add("on");
        img.style.visibility = "hidden";
      } else {
        reveal.classList.remove("on");
        reveal.style.backgroundImage = "";
        let src = null;
        if (closed) src = DOOR_IMG[side].closed;
        else if (lit) src = DOOR_IMG[side].light[this.lightFrame % 4];
        img.style.visibility = src ? "visible" : "hidden";
        if (src) img.src = IMG(src);
      }

      // estilo de los botones de la pared
      const bd = document.getElementById("btn-door-" + side);
      const bl = document.getElementById("btn-light-" + side);
      if (bd) bd.classList.toggle("on", closed);
      if (bl) bl.classList.toggle("on", lit);
    }
    // parpadeo de la luz fluorescente (cicla los 4 frames auténticos)
    if ((this.input.lights.L || this.input.lights.R) && !this.lightFlicker) {
      this.lightFlicker = setInterval(() => {
        this.lightFrame++;
        this.renderDoors();
      }, 90);
    } else if (!this.input.lights.L && !this.input.lights.R && this.lightFlicker) {
      clearInterval(this.lightFlicker);
      this.lightFlicker = null;
    }
  },

  /* ---------- Construcción del monitor (cámaras originales) ---------- */
  buildMonitor() {
    const mon = document.getElementById("monitor");
    mon.innerHTML =
      '<div id="mon-screen">' +
      '  <div id="mon-feed"></div>' +
      '  <div id="mon-scanlines"></div>' +
      '  <div id="mon-label">' +
      '    <div id="mon-loc">—</div>' +
      '    <div id="mon-cam">CAM —</div>' +
      "  </div>" +
      '  <div id="mon-map">' +
      '    <img src="' + IMG("map_floorplan") + '" alt="" draggable="false">' +
      '    <div id="mon-map-btns"></div>' +
      "  </div>" +
      '  <div class="cam-bar"><div class="cam-bar-inner"></div></div>' +
      "</div>";

    // botones CAM sobre el mapa auténtico
    const btns = document.getElementById("mon-map-btns");
    for (const loc in LOCS) {
      const L = LOCS[loc];
      if (!L.cam) continue; // la oficina no es cámara
      const b = document.createElement("button");
      b.className = "mapbtn";
      b.id = "mbtn-" + loc;
      b.style.left = L.mx + "%";
      b.style.top = L.my + "%";
      b.style.width = L.mw + "%";
      b.style.height = L.mh + "%";
      b.innerHTML = '<span class="mb-id">CAM ' + L.cam + "</span>";
      b.title = L.name;
      b.onclick = () => this.selectCam(loc);
      btns.appendChild(b);
    }
  },

  /* ---------- Monitor ---------- */
  toggleMonitor(force) {
    if (this.powerOutLocal) return;
    const want = force !== undefined ? force : !this.input.monitor;
    if (want === !!this.input.monitor) return;
    if (this.blind && want) return;
    this.input.monitor = want ? (this.input.monitor || this.lastCam || "stage") : null;
    const mon = document.getElementById("monitor");
    if (want) {
      AudioMan.play("camUp", 0.8);
      FX.staticBurst(320);
      mon.classList.add("up");
      if (!this.lastCam) this.selectCam("stage", true);
      else this.renderFeed();
      this.staticL = AudioMan.loop("staticL", 0.16);
    } else {
      AudioMan.play("camDown", 0.8);
      mon.classList.remove("up");
      if (this.staticL) { this.staticL.stop(); this.staticL = null; }
      if (this.kitchenL) { this.kitchenL.stop(); this.kitchenL = null; }
    }
  },

  selectCam(loc, silent) {
    if (this.blind) return;
    this.lastCam = loc;
    this.input.monitor = loc;
    if (!silent) AudioMan.play("camSw", 0.6);
    FX.staticBurst(240);
    const locEl = document.getElementById("mon-loc");
    const camEl = document.getElementById("mon-cam");
    if (locEl) locEl.textContent = LOCS[loc].name.toUpperCase();
    if (camEl) camEl.textContent = "CAM " + LOCS[loc].cam;
    document.querySelectorAll(".mapbtn").forEach(b => b.classList.remove("sel"));
    const mb = document.getElementById("mbtn-" + loc);
    if (mb) mb.classList.add("sel");
    this.renderFeed();
  },

  /* imagen de cámara según ocupación */
  camImage(loc, present) {
    if (LOCS[loc].audioOnly) return null;
    if (loc === "cove") {
      const f = present.includes("foxy");
      if (!f) return "cove_gone";
      const snap = App.snap;
      const ph = snap && snap.anims.foxy ? snap.anims.foxy.phase : 1;
      return FOXY_PHASE_IMG[ph] || "cove_ready";
    }
    const combos = CAM_COMBO[loc];
    if (combos) {
      const key = comboKey(present);
      if (combos[key]) return combos[key];
      if (present.length === 1 && combos[present[0]]) return combos[present[0]];
    }
    const vars = CAM_VARIANTS[loc];
    if (vars) {
      if (this.camVar[loc] === undefined) this.camVar[loc] = App.gameVariants && App.gameVariants[loc] !== undefined ? App.gameVariants[loc] : Math.floor(Math.random() * vars.length);
      return vars[this.camVar[loc]];
    }
    return LOCS[loc].base;
  },

  renderFeed() {
    const loc = this.input.monitor;
    const feed = document.getElementById("mon-feed");
    if (!loc || !feed) return;
    const present = [];
    if (App.snap) {
      for (const ch in App.snap.anims) if (App.snap.anims[ch].n === loc) present.push(ch);
    }
    // cocina: solo audio (como el original: pantalla negra con aviso)
    if (LOCS[loc].audioOnly) {
      feed.innerHTML =
        '<div class="cam-audioonly">' +
        '  <div>CAMERA DISABLED</div>' +
        '  <div class="big">AUDIO ONLY</div>' +
        (present.length ? '<div class="clatter">- RUIDO DE CACHARROS -</div>' : "") +
        "</div>";
      if (present.length && !this.kitchenL) this.kitchenL = AudioMan.loop("kitchen", 0.7);
      if (!present.length && this.kitchenL) { this.kitchenL.stop(); this.kitchenL = null; }
      return;
    }
    if (this.kitchenL) { this.kitchenL.stop(); this.kitchenL = null; }

    const img = this.camImage(loc, present);
    let html = '<img src="' + IMG(img) + '" alt="">';
    const comboUsed = this.comboIsAuthentic(loc, present);
    if (present.length && !comboUsed) {
      html += '<div class="cam-motion">MOVIMIENTO DETECTADO</div>';
    }
    feed.innerHTML = html;
  },

  comboIsAuthentic(loc, present) {
    if (loc === "cove") return present.includes("foxy");
    const combos = CAM_COMBO[loc];
    if (!combos) return false;
    const key = comboKey(present);
    return !!(combos[key] || (present.length === 1 && combos[present[0]]));
  },

  /* ---------- Snapshot ---------- */
  onSnap(s) {
    const clockEl = document.getElementById("g-clock");
    const powEl = document.getElementById("g-power");
    if (clockEl) clockEl.textContent = fmtClock(s.t);
    if (powEl) {
      powEl.textContent = Math.ceil(s.power) + "%";
      powEl.classList.toggle("low", s.power < 25);
    }
    let usage = 1;
    if (s.guard.dL) usage++; if (s.guard.dR) usage++;
    if (s.guard.liL) usage++; if (s.guard.liR) usage++;
    if (s.guard.mon) usage++;
    this.setUsage(usage);

    if (s.guard.blindMs > 0 && !this.blind) this.goBlind(s.guard.blindMs);
    if (s.po && !this.powerOutLocal) this.enterPowerOut();

    this.renderDoors();
    if (this.input.monitor) this.renderFeed();
  },

  setUsage(n) {
    const el = document.getElementById("g-usage");
    if (!el) return;
    let bars = "";
    for (let i = 0; i < 5; i++) bars += '<span class="ubar' + (i < n ? " on" : "") + '"></span>';
    el.innerHTML = bars;
  },

  /* ---------- Eventos ---------- */
  onEvent(m) {
    switch (m.e) {
      case "scare":
        FX.harmlessScare(m.by, () => {});
        break;
      case "foxyrun": AudioMan.play("foxyRun", 1.0); break;
      case "bang":
        AudioMan.play("foxyBang", 1.1);
        document.getElementById("s-guard").classList.add("shake");
        setTimeout(() => document.getElementById("s-guard").classList.remove("shake"), 500);
        break;
      case "powerout": this.enterPowerOut(); break;
      case "moved": if (m.by === "freddy") AudioMan.play("laugh", 0.9); break;
    }
  },

  forceMonitorDown() {
    if (this.input.monitor) {
      this.input.monitor = null;
      const mon = document.getElementById("monitor");
      if (mon) mon.classList.remove("up");
      if (this.staticL) { this.staticL.stop(); this.staticL = null; }
      if (this.kitchenL) { this.kitchenL.stop(); this.kitchenL = null; }
      AudioMan.play("camDown", 0.7);
    }
  },

  goBlind(ms) {
    this.blind = true;
    this.forceMonitorDown();
    document.querySelectorAll(".cam-bar").forEach(b => b.classList.add("disabled"));
    FX.staticBurst(Math.max(600, ms));
    setTimeout(() => {
      this.blind = false;
      document.querySelectorAll(".cam-bar").forEach(b => b.classList.remove("disabled"));
    }, Math.min(ms, CFG.BLIND_MS));
  },

  /* ---------- Apagón ---------- */
  enterPowerOut() {
    if (this.powerOutLocal) return;
    this.powerOutLocal = true;
    this.input.doors.L = this.input.doors.R = false;
    this.input.lights.L = this.input.lights.R = false;
    this.forceMonitorDown();
    if (this.fan) this.fan.stop();
    AudioMan.play("powerDown", 1.0);
    this.jingle = AudioMan.loop("jingle", 0.55);
    const ov = document.getElementById("powerout-fx");
    ov.classList.add("active");
    // la cara que parpadea en la oscuridad: un animatrónico REAL de la partida
    const attacker = this.powerOutAttacker();
    const poImg = ov.querySelector("img");
    if (poImg && attacker) poImg.src = IMG(CHARS[attacker].js);
    this.renderDoors();
  },

  /* ¿Quién acecha en el apagón? (solo animatrónicos CON jugador) */
  powerOutAttacker() {
    const s = App.snap;
    if (!s) return null;
    if (s.anims.freddy) return "freddy";
    for (const n of ["ldoor", "rdoor"]) {
      for (const c in s.anims) if (s.anims[c].n === n) return c;
    }
    return null;
  },
};
