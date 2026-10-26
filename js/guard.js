/* ============================================================
   FNAF 1 MULTIJUGADOR — VISTA DEL GUARDIA (MECÁNICAS ORIGINALES)
   Oficina panorámica fija (como el FNAF 1 original): puertas a
   los lados, botones DOOR/LUZ en la pared junto a cada puerta,
   la puerta metálica BAJA deslizándose, la LUZ revela al
   animatrónico parado en el umbral (imágenes auténticas 0223
   Bonnie / 0224 Chica / secuencia 0396-0412 de Foxy).
   Monitor de cámaras original: pantalla completa + plano
   auténtico M0013 + botones CAM.
   ============================================================ */
"use strict";

const Guard = {
  input: { doors: { L: false, R: false }, lights: { L: false, R: false }, monitor: null },
  fan: null, staticL: null, kitchenL: null, jingle: null, lightHum: null,
  lastAnims: {},
  jamUntil: 0,         // RISA de Freddy: controles de puerta/luz atascados
  jamT: null,
  blindUntilLocal: 0,  // SUSTO inofensivo: monitor cegado
  camSeqTimer: null,   // secuencia animada de cámara en marcha
  camSeqKey: null,
  camVar: {},
  doorAnim: { L: null, R: null },   // animación de puerta bajando/subiendo
  walkFxKey: "",                    // clave de la caminata visible en cámara

  /* entrada al modo guardia */
  enter() {
    UI.show("s-guard");
    this.powerOutLocal = false;
    this.input.doors.L = false; this.input.doors.R = false;
    this.input.lights.L = false; this.input.lights.R = false;
    this.input.monitor = null;
    this.lastCam = null;
    this.jamUntil = 0;
    this.blindUntilLocal = 0;
    this.doorAnim = { L: null, R: null };
    clearTimeout(this.jamT);
    document.getElementById("powerout-fx").classList.remove("active");
    this.buildOffice();
    this.buildMonitor();
    this.lastAnims = {};
    this.camVar = {};
    // sonidos de ambiente (el ventilador de la oficina, como el original)
    AudioMan.unlock();
    this.fan = AudioMan.loop("fan", 0.5);
    document.getElementById("guard-clock").textContent = "12 AM";
    document.getElementById("guard-power-val").textContent = "99%";
    this.setUsage(1);
  },

  exit() {
    if (this.fan) this.fan.stop();
    if (this.staticL) this.staticL.stop();
    if (this.kitchenL) this.kitchenL.stop();
    if (this.jingle) { this.jingle.stop(); this.jingle = null; }
    if (this.lightHum) { this.lightHum.stop(); this.lightHum = null; }
    this.fan = this.staticL = this.kitchenL = null;
    this.stopCamSeq();
  },

  /* ---------- Construcción de la oficina (ORIGINAL) ----------
     Vista panorámica fija: escritorio al centro, puertas de sala
     en los laterales. Botones DOOR/LIGHT en la pared. */
  buildOffice() {
    const view = document.getElementById("office-view");
    view.innerHTML =
      '<div class="office-pan" id="office-pan">' +
      '  <img class="office-img" src="' + IMG("office") + '" alt="oficina" draggable="false">' +
      '  <div class="door-reveal" id="reveal-L"></div>' +
      '  <div class="door-reveal" id="reveal-R"></div>' +
      '  <div class="door-zone dz-left">' +
      '    <div class="door-lightglow" id="glow-L"></div>' +
      '    <div class="metal-door" id="mdoor-L"><div class="md-ridges"></div><div class="md-hazard"></div></div>' +
      '  </div>' +
      '  <div class="door-zone dz-right">' +
      '    <div class="door-lightglow" id="glow-R"></div>' +
      '    <div class="metal-door" id="mdoor-R"><div class="md-ridges"></div><div class="md-hazard"></div></div>' +
      '  </div>' +
      '  <div class="wall-btns wb-left" id="wbtns-L">' +
      '    <button class="wbtn" id="btn-door-L"><span class="wb-txt">DOOR</span><span class="wb-led"></span></button>' +
      '    <button class="wbtn" id="btn-light-L"><span class="wb-txt">LIGHT</span><span class="wb-led"></span></button>' +
      '  </div>' +
      '  <div class="wall-btns wb-right" id="wbtns-R">' +
      '    <button class="wbtn" id="btn-door-R"><span class="wb-txt">DOOR</span><span class="wb-led"></span></button>' +
      '    <button class="wbtn" id="btn-light-R"><span class="wb-txt">LIGHT</span><span class="wb-led"></span></button>' +
      '  </div>' +
      '  <div class="who-there" id="who-L"></div>' +
      '  <div class="who-there wt-right" id="who-R"></div>' +
      "</div>" +
      '<div class="office-hud-tl">' +
      '  <div class="clock-big" id="guard-clock">12 AM</div>' +
      '  <div class="night-lbl">NOCHE 1</div>' +
      "</div>" +
      '<div class="office-hud-bl">' +
      '  <div class="power-lbl">Power left: <span id="guard-power-val">99%</span></div>' +
      '  <div class="power-bar"><div class="power-fill" id="power-fill"></div></div>' +
      '  <div class="usage-lbl">Usage: <span id="usage-bars"></span></div>' +
      "</div>" +
      '<div class="cam-strip" id="cam-strip"><span>▲&nbsp;CÁMARAS&nbsp;▲</span></div>';

    // franja de cámaras: mantener pulsado (como el original: hover en la franja)
    const strip = document.getElementById("cam-strip");
    strip.addEventListener("mousedown", () => this.toggleMonitor(true));
    strip.addEventListener("mouseup",   () => this.toggleMonitor(false));
    strip.addEventListener("mouseleave",() => this.toggleMonitor(false));
    strip.addEventListener("click", e => e.preventDefault());

    document.getElementById("btn-door-L").onclick = () => this.toggleDoor("L");
    document.getElementById("btn-door-R").onclick = () => this.toggleDoor("R");
    for (const side of ["L", "R"]) {
      const b = document.getElementById("btn-light-" + side);
      b.onmousedown = () => this.lightOn(side);
      b.onmouseup = () => this.lightOff(side);
      b.onmouseleave = () => this.lightOff(side);
    }
    // paneo sutil con el ratón (la vista original es fija; esto da vida)
    view.addEventListener("mousemove", e => {
      const pan = document.getElementById("office-pan");
      if (!pan) return;
      const t = e.clientX / window.innerWidth - 0.5;   // -0.5..0.5
      pan.style.transform = "scale(1.06) translateX(" + (-t * 1.6) + "%)";
    });

    this.renderDoors();
  },

  /* ---------- Construcción del monitor (SISTEMA ORIGINAL) ----------
     Pantalla completa con la imagen de la cámara, etiqueta CAM
     arriba-izquierda y el plano auténtico (M0013) abajo-derecha. */
  buildMonitor() {
    const mon = document.getElementById("monitor");
    mon.innerHTML =
      '<div class="cam-full" id="cam-feed"></div>' +
      '<div class="cam-label" id="mon-loc">CAM —</div>' +
      '<div class="cam-mapbox" id="cam-mapbox">' +
      '  <img src="' + IMG(MAP_IMG) + '" alt="mapa" draggable="false">' +
      '  <div class="cam-btns" id="cam-btns"></div>' +
      "</div>" +
      '<div class="cam-static-noise"></div>';
    const box = document.getElementById("cam-btns");
    for (const locId in MAP_BTN_POS) {
      const L = LOCS[locId];
      if (!L || !L.cam) continue;
      const pos = MAP_BTN_POS[locId];
      const b = document.createElement("button");
      b.className = "cam-btn";
      b.dataset.loc = locId;
      b.textContent = "CAM " + L.cam;
      b.style.left = pos.x + "%";
      b.style.top = pos.y + "%";
      b.onclick = () => this.selectCam(locId);
      box.appendChild(b);
    }
  },

  /* ---------- Input: puertas ---------- */
  jamActive() { return Date.now() < (this.jamUntil || 0); },
  applyJam(ms) {
    if (!ms || ms <= 0) return;
    this.jamUntil = Date.now() + ms;
    document.querySelectorAll(".wbtn").forEach(b => b.classList.add("jammed"));
    clearTimeout(this.jamT);
    this.jamT = setTimeout(() => {
      this.jamUntil = 0;
      document.querySelectorAll(".wbtn").forEach(b => b.classList.remove("jammed"));
    }, ms);
  },

  toggleDoor(side) {
    if (App.gameOverMsg || this.powerOutLocal) return;
    if (this.jamActive()) { FX.toast("¡ATASCADO! La risa bloquea los controles…", 1300, "bad"); return; }
    if (this.input.lights[side]) this.input.lights[side] = false; // cierra la luz con la puerta
    this.input.doors[side] = !this.input.doors[side];
    AudioMan.play("door", 0.9);
    this.animateDoor(side, this.input.doors[side]);
    this.renderDoors();
  },

  /* la puerta metálica BAJA deslizándose (como el original) */
  animateDoor(side, closing) {
    const el = document.getElementById("mdoor-" + side);
    if (!el) return;
    const st = this.doorAnim[side] = this.doorAnim[side] || { open: true };
    el.style.transition = "transform .28s cubic-bezier(.6,0,.9,.4)";
    requestAnimationFrame(() => {
      el.style.transform = closing ? "translateY(0)" : "translateY(-102%)";
    });
    st.open = !closing;
  },

  lightOn(side) {
    if (App.gameOverMsg || this.powerOutLocal) return;
    if (this.jamActive()) return;
    if (this.input.doors[side]) return;              // con la puerta cerrada no hay luz
    if (!this.input.lights[side]) {
      this.input.lights[side] = true;
      AudioMan.play("click", 0.7);                 // clack del interruptor
      if (!this.lightHum) this.lightHum = AudioMan.loop("drone", 0.18); // zumbido de la luz
      this.renderDoors();
    }
  },
  lightOff(side) {
    if (this.input.lights[side]) {
      this.input.lights[side] = false;
      if (this.lightHum && !this.input.lights.L && !this.input.lights.R) {
        this.lightHum.stop(); this.lightHum = null;
      }
      this.renderDoors();
    }
  },

  /* ---------- Render de puertas y presencia ----------
     La LUZ revela al animatrónico EN el umbral con las imágenes
     auténticas del original: Bonnie (izq), Chica (dcha) y la
     secuencia completa de Foxy embistiendo la puerta izquierda. */
  renderDoors() {
    const snap = App.snap;
    for (const side of ["L", "R"]) {
      const reveal = document.getElementById("reveal-" + side);
      const glow = document.getElementById("glow-" + side);
      const who = document.getElementById("who-" + side);
      const closed = this.input.doors[side];
      const lit = this.input.lights[side];
      const p = side === "L" ? "ldoor" : "rdoor";
      // ¿quién está en esa puerta?
      let present = [];
      if (snap) {
        for (const ch in snap.anims) {
          const an = snap.anims[ch];
          if (an.w) continue;              // caminando: en tránsito
          if (an.n === p) present.push(ch);
        }
      }
      // botones
      const bd = document.getElementById("btn-door-" + side);
      const bl = document.getElementById("btn-light-" + side);
      bd.classList.toggle("on", closed);
      bl.classList.toggle("on", lit);

      // puerta metálica
      const md = document.getElementById("mdoor-" + side);
      if (md) md.classList.toggle("closed", closed);

      // revelación con la luz (umbral iluminado)
      if (lit && !closed) {
        glow.classList.add("active");
        if (present.includes("foxy")) {
          // Foxy asomado en el umbral (frame auténtico de la secuencia 0396-0412)
          reveal.style.backgroundImage = "url(" + IMG("foxydoor_11") + ")";
          reveal.classList.add("active");
        } else if (present.includes("bonnie") && side === "L") {
          reveal.style.backgroundImage = "url(" + IMG("doorL_bonnie") + ")";
          reveal.classList.add("active");
        } else if (present.includes("chica") && side === "R") {
          reveal.style.backgroundImage = "url(" + IMG("doorR_chica") + ")";
          reveal.classList.add("active");
        } else if (present.includes("freddy")) {
          // Freddy en el umbral: su cara a oscuras (ojos brillando)
          reveal.style.backgroundImage = "url(" + IMG("freddy_stare_00") + ")";
          reveal.classList.add("active");
        } else if (side === "L") {
          // umbral izquierdo iluminado, vacío (imagen auténtica)
          reveal.style.backgroundImage = "url(" + IMG("doorL_light") + ")";
          reveal.classList.add("active");
        } else {
          reveal.style.backgroundImage = "url(" + IMG("doorR_empty") + ")";
          reveal.classList.add("active");
        }
      } else {
        glow.classList.remove("active");
        reveal.classList.remove("active");
        reveal.style.backgroundImage = "";
      }

      // aviso de presencia
      if (lit && !closed && present.length) {
        who.innerHTML = "";
        for (const ch of present) {
          const c = CHARS[ch];
          const el = document.createElement("div");
          el.className = "who-face";
          el.innerHTML = '<img src="' + IMG(c.portrait) + '"><span>¡' + c.name.toUpperCase() + "!</span>";
          who.appendChild(el);
        }
        who.classList.add("active");
      } else {
        who.classList.remove("active");
        who.innerHTML = "";
      }
    }
  },

  /* ---------- Monitor ---------- */
  toggleMonitor(force) {
    if (this.powerOutLocal) return;
    const want = force !== undefined ? force : !this.input.monitor;
    if (want && this.blindUntilLocal > Date.now()) {
      FX.toast("MONITOR NO DISPONIBLE — ¡te han asustado!", 1600, "bad");
      return;
    }
    if (want === !!this.input.monitor) return;
    this.input.monitor = want ? (this.input.monitor || this.lastCam || "stage") : null;
    if (want) {
      if (!this.lastCam) this.selectCam("stage");
      AudioMan.play("camUp", 0.8);
      document.getElementById("monitor").classList.add("up");
      this.staticL = AudioMan.loop("staticL", 0.22);
    } else {
      AudioMan.play("camDown", 0.8);
      document.getElementById("monitor").classList.remove("up");
      if (this.staticL) { this.staticL.stop(); this.staticL = null; }
      if (this.kitchenL) { this.kitchenL.stop(); this.kitchenL = null; }
      this.stopCamSeq();
    }
  },

  selectCam(loc) {
    if (!this.input.monitor) return;
    this.lastCam = loc;
    this.input.monitor = loc;
    AudioMan.play("camSw", 0.6);
    FX.staticBurst(240);
    document.getElementById("mon-loc").innerHTML =
      "CAM " + LOCS[loc].cam + "<span class=\"cl-sub\">" + LOCS[loc].name.toUpperCase() + "</span>";
    document.querySelectorAll("#cam-btns .cam-btn").forEach(b =>
      b.classList.toggle("active", b.dataset.loc === loc));
    this.walkFxKey = "";
    this.renderFeed();
  },

  /* ---------- Render del feed (CÁMARAS ORIGINALES + CAMINATA VISIBLE) ----------
     - Vista auténtica de la sala CON los animatrónicos presentes.
     - Animatrónico CAMINANDO: se le ve AVANZAR en la cámara
       (zoom progresivo + parpadeos de estática), saliendo de la
       sala de origen y entrando en la de destino.
     - Foxy CORRIENDO por el pasillo: frames auténticos del esprint. */
  renderFeed() {
    const loc = this.input.monitor;
    const feed = document.getElementById("cam-feed");
    if (!loc || !feed) return;
    const s = App.snap;

    // AVERÍA de Chica: estática total en todas las cámaras
    if (s && s.guard.camJamMs > 0) {
      this.stopCamSeq();
      if (this.kitchenL) { this.kitchenL.stop(); this.kitchenL = null; }
      feed.innerHTML =
        '<div class="cam-jam">' +
        '<img src="' + IMG("monitor_static1") + '" alt="">' +
        '<img src="' + IMG("monitor_static2") + '" alt="">' +
        '<div class="cj-lbl">SEÑAL PERDIDA</div>' +
        "</div>";
      return;
    }

    // presentes (parados) y caminantes (en tránsito por esta sala)
    const present = [];
    const walking = [];
    const hiddenHere = [];
    if (s) {
      for (const ch in s.anims) {
        const an = s.anims[ch];
        if (an.st) { // SIGILO de Bonnie: ni parado ni caminando
          if (an.n === loc && !an.w) hiddenHere.push(ch);
          continue;
        }
        if (ch === "foxy" && an.running) {
          // Foxy en carrera: visible en 2A/2B con los frames del esprint
          if (loc === "westhall" || loc === "westcorner") walking.push(ch);
          continue;
        }
        if (an.w) {
          // caminando: visible SALIENDO del origen (1ª mitad)
          // y ENTRANDO en el destino (2ª mitad)
          if (an.w.from === loc && an.w.p <= 0.55) walking.push(ch);
          else if (an.w.to === loc && an.w.p > 0.55) walking.push(ch);
          continue;
        }
        if (an.n === loc) present.push(ch);
      }
    }

    // cocina: solo audio (como el original)
    if (LOCS[loc].audioOnly) {
      this.stopCamSeq();
      feed.innerHTML = '<div class="cam-audioonly"><div class="ao-top">CÁMARA DESACTIVADA</div><div class="big">SOLO AUDIO</div></div>';
      if (present.length && !this.kitchenL) this.kitchenL = AudioMan.loop("kitchen", 0.7);
      if (!present.length && this.kitchenL) { this.kitchenL.stop(); this.kitchenL = null; }
      feed.classList.toggle("glitch", false);
      return;
    }
    if (this.kitchenL) { this.kitchenL.stop(); this.kitchenL = null; }

    // CALA PIRATA: fases auténticas de Foxy tras la cortina
    if (loc === "cove") {
      this.stopCamSeq();
      const foxyThere = present.includes("foxy") || walking.includes("foxy");
      const fx = s && s.anims.foxy;
      const running = fx && fx.running;
      const ph = fx ? (fx.phase || 0) : 0;
      let img;
      if (!foxyThere) img = "cove_closed";       // nadie: cortina cerrada
      else if (running) img = "cove_gone";        // ¡cortina abierta y VACÍA!
      else img = FOXY_PHASE_IMG[ph] || "cove_peek";
      feed.innerHTML = '<img class="cf-img" src="' + IMG(img) + '" alt="Pirate Cove">';
      feed.classList.toggle("glitch", false);
      return;
    }

    // Foxy CORRIENDO por el pasillo: frames auténticos del esprint (CAM 2A/2B)
    if ((loc === "westhall" || loc === "westcorner") && walking.includes("foxy")) {
      this.startCamSeq(FOXYRUN_FRAMES, FOXYRUN_MS, "foxyrun");
      feed.classList.toggle("glitch", false);
      return;
    }

    // Freddy clavando la mirada en la Esquina Este (secuencia auténtica)
    if (loc === "eastcorner" && present.includes("freddy")) {
      this.startCamSeq(FREDDY_STARE, STARE_MS, "stare");
      feed.classList.toggle("glitch", false);
      return;
    }
    this.stopCamSeq();

    // caminantes por esta sala (excluye a Foxy, que va a la carrera)
    const walkers = walking.filter(ch => ch !== "foxy");

    // vista auténtica: si un CAMINANTE cruza esta sala y existe imagen
    // suya en ella, se le VE avanzar (Bonnie en el pasillo, etc.);
    // si no, la sala con sus ocupantes parados
    let img = null;
    for (const ch of walkers) {
      const v = CAM_VIEWS[loc] && CAM_VIEWS[loc][ch];
      if (v) { img = v; break; }
    }
    if (!img) img = this.camImage(loc, present);
    const changed = this._lastFeedImg !== undefined && this._lastFeedImg !== img;
    this._lastFeedImg = img;

    let html = '<img class="cf-img" id="cf-main" src="' + IMG(img) + '" alt="' + LOCS[loc].name + '">';

    // CAMINATA VISIBLE: quien camina por esta sala AVANZA en el feed
    // (zoom progresivo del plano + parpadeo de estática al pasar)
    if (walkers.length) {
      const w = s.anims[walkers[0]].w;
      if (w) {
        const key = walkers[0] + ">" + loc;
        if (this.walkFxKey !== key) {
          this.walkFxKey = key;
          const im = document.getElementById("cf-main");
          FX.staticBurst(160);
        }
        html += '<div class="cam-walkflag"><span class="cw-dot"></span>ALGO SE MUEVE…</div>';
      }
    } else {
      this.walkFxKey = "";
    }

    // ocupantes sin vista auténtica -> chips de presencia
    const comboUsed = this.comboIsAuthentic(loc, present);
    if (present.length && !comboUsed) {
      html += '<div class="cam-present">';
      for (const ch of present) {
        const c = CHARS[ch];
        html += '<div class="cp-chip" style="border-color:' + c.color + '">' +
          '<img src="' + IMG(c.portrait) + '">' + c.name + "</div>";
      }
      html += "</div>";
    }
    feed.innerHTML = html;

    // zoom de avance si alguien camina por la sala (se le ve ACERCARSE)
    const im = feed.querySelector("#cf-main");
    if (im && walkers.length && s) {
      const w = s.anims[walkers[0]].w;
      if (w && im.animate) {
        const z = 1 + 0.10 * w.p;   // avanza según el progreso del tramo
        im.style.transform = "scale(" + z.toFixed(3) + ")";
      }
    } else if (im) {
      im.style.transform = "";
    }
    if (changed) FX.staticBurst(140);
    // SIGILO de Bonnie: interferencia sutil en la sala donde está oculto
    feed.classList.toggle("glitch", hiddenHere.length > 0);
  },

  /* imagen de cámara según ocupación (vistas auténticas) */
  camImage(loc, present) {
    const views = CAM_VIEWS[loc];
    if (views) {
      const key = comboKey(present);
      if (views[key]) return views[key];
      if (present.length === 1 && views[present[0]]) return views[present[0]];
    }
    const vars = CAM_VARIANTS[loc];
    if (vars) {
      if (this.camVar[loc] === undefined) this.camVar[loc] = App.gameVariants && App.gameVariants[loc] !== undefined ? App.gameVariants[loc] : Math.floor(Math.random() * vars.length);
      return vars[this.camVar[loc]];
    }
    return LOCS[loc].base;
  },

  /* Secuencia animada de cámara en marcha (frames auténticos) */
  startCamSeq(frames, ms, keyId) {
    const feed = document.getElementById("cam-feed");
    if (!feed) return;
    if (this.camSeqKey === keyId) return; // ya en marcha
    this.stopCamSeq();
    this.camSeqKey = keyId;
    let i = 0;
    feed.innerHTML = '<img class="cf-img" src="' + IMG(frames[0]) + '" alt="">';
    this.camSeqTimer = setInterval(() => {
      i = (i + 1) % frames.length;
      const im = feed.querySelector(".cf-img");
      if (im) im.src = IMG(frames[i]);
    }, ms);
  },
  stopCamSeq() {
    clearInterval(this.camSeqTimer);
    this.camSeqTimer = null;
    this.camSeqKey = null;
  },

  comboIsAuthentic(loc, present) {
    if (loc === "cove") return present.includes("foxy");
    if (loc === "eastcorner" && present.includes("freddy")) return true;
    const views = CAM_VIEWS[loc];
    if (!views) return false;
    const key = comboKey(present);
    return !!(views[key] || (present.length === 1 && views[present[0]]));
  },

  /* ---------- Snapshot ---------- */
  onSnap(s) {
    // reloj y energía
    document.getElementById("guard-clock").textContent = fmtClock(s.t);
    document.getElementById("guard-power-val").textContent = Math.ceil(s.power) + "%";
    document.getElementById("power-fill").style.width = Math.max(0, s.power) + "%";
    document.getElementById("power-fill").classList.toggle("low", s.power < 25);

    // uso (como el original: barras verdes)
    let usage = 1;
    if (s.guard.dL) usage++; if (s.guard.dR) usage++;
    if (s.guard.liL) usage++; if (s.guard.liR) usage++;
    if (s.guard.mon) usage++;
    this.setUsage(usage);

    // RISA de Freddy: controles atascados (si el evento se perdió)
    if (s.guard.jamDoorsMs > 0 && !this.jamActive()) this.applyJam(s.guard.jamDoorsMs);

    // SUSTO inofensivo: ceguera del monitor (si el evento se perdió)
    if (s.guard.blindMs > 0 && this.blindUntilLocal < Date.now()) this.goBlind(s.guard.blindMs);

    // apagón
    if (s.po && !this.powerOutLocal) this.enterPowerOut();

    // refresco de feed y puertas
    this.renderDoors();
    if (this.input.monitor) this.renderFeed();
  },

  setUsage(n) {
    let bars = "";
    for (let i = 0; i < 5; i++) bars += i < n ? "▮" : "▯";
    document.getElementById("usage-bars").textContent = bars;
  },

  /* ---------- Eventos ---------- */
  onEvent(m) {
    switch (m.e) {
      case "laugh":
        this.applyJam((m.dur || 4) * 1000);
        AudioMan.play("laugh", 1.0);
        FX.toast("¡La RISA de " + CHARS[m.by].name + " aturde los controles de PUERTAS y LUCES!", 3000, "bad");
        break;
      case "scare": {
        FX.harmlessScare(m.by, () => {});
        this.goBlind(CFG.SCARE_BLIND_MS);
        FX.toast("¡" + CHARS[m.by].name + " TE HA ASUSTADO! Monitor no disponible…", 3000, "bad");
        break;
      }
      case "stealth":
        FX.toast(CHARS[m.by].name + " se ha esfumado de las cámaras…", 2400, "warn");
        break;
      case "jam":
        AudioMan.play("camSw", 0.9);          // estallido de estática (no cocina)
        FX.staticBurst(800);
        FX.toast("¡AVERÍA! " + CHARS[m.by].name + " ha saturado las cámaras (" + m.dur + "s)…", 3000, "bad");
        break;
      case "foxyrun":
        AudioMan.play("foxyRun", 1.0);
        FX.toast("¡Se oye una carrera en el pasillo izquierdo!", 2600, "warn");
        break;
      case "bang":
        AudioMan.play("foxyBang", 1.1);
        FX.toast("¡Foxy golpea la puerta! (−2% energía)", 3000, "warn");
        break;
      case "powerout": this.enterPowerOut(); break;
      case "walk": if (m.by === "freddy") AudioMan.play("laugh", 0.85); break; // su risa delata su avance
      case "blocked": FX.toast("¡Captura bloqueada! Buen reflejo.", 2600, "good"); break;
      case "atdoor": FX.toast("¡Algo se acerca a una puerta!", 2600, "warn"); break;
    }
  },

  forceMonitorDown() {
    if (this.input.monitor) {
      this.input.monitor = null;
      document.getElementById("monitor").classList.remove("up");
      if (this.staticL) { this.staticL.stop(); this.staticL = null; }
      if (this.kitchenL) { this.kitchenL.stop(); this.kitchenL = null; }
      this.stopCamSeq();
      AudioMan.play("camDown", 0.7);
    }
  },

  goBlind(ms) {
    this.blindUntilLocal = Date.now() + (ms || CFG.SCARE_BLIND_MS);
    this.forceMonitorDown();
  },

  /* ---------- Apagón ---------- */
  enterPowerOut() {
    if (this.powerOutLocal) return;
    this.powerOutLocal = true;
    this.input.doors.L = this.input.doors.R = false;
    this.input.lights.L = this.input.lights.R = false;
    if (this.lightHum) { this.lightHum.stop(); this.lightHum = null; }
    this.forceMonitorDown();
    if (this.fan) this.fan.stop();
    AudioMan.play("powerDown", 1.0);
    this.jingle = AudioMan.loop("jingle", 0.55);
    const ov = document.getElementById("powerout-fx");
    ov.classList.add("active");
    FX.toast("LA ENERGÍA SE AGOTÓ", 4000, "bad");
    this.renderDoors();
  },
};
