/* ============================================================
   FNAF 1 MULTIJUGADOR — VISTA DEL GUARDIA
   Oficina en 3 paneles (puerta izq | escritorio | puerta dcha),
   panel de cámaras desplegable, luces, puertas, energía, reloj.
   ============================================================ */
"use strict";

const Guard = {
  input: { doors: { L: false, R: false }, lights: { L: false, R: false }, monitor: null },
  fan: null, staticL: null, kitchenL: null, jingle: null,
  lastAnims: {},
  jamUntil: 0,         // RISA de Freddy: controles de puerta/luz atascados
  jamT: null,
  blindUntilLocal: 0,  // SUSTO inofensivo: monitor cegado
  camVar: {},

  /* entrada al modo guardia */
  enter() {
    UI.show("s-guard");
    this.powerOutLocal = false;
    // reset del input (mutando el objeto: Game.guardInput guarda la referencia)
    this.input.doors.L = false; this.input.doors.R = false;
    this.input.lights.L = false; this.input.lights.R = false;
    this.input.monitor = null;
    this.lastCam = null;
    this.jamUntil = 0;
    this.blindUntilLocal = 0;
    clearTimeout(this.jamT);
    document.getElementById("powerout-fx").classList.remove("active");
    this.buildOffice();
    this.buildMonitor();
    this.lastAnims = {};
    this.camVar = {};
    // sonidos de ambiente
    AudioMan.unlock();
    this.fan = AudioMan.loop("fan", 0.5);
    document.getElementById("guard-clock").textContent = "12 AM";
    document.getElementById("guard-power-val").textContent = "100%";
    this.setUsage(1);
  },

  exit() {
    if (this.fan) this.fan.stop();
    if (this.staticL) this.staticL.stop();
    if (this.kitchenL) this.kitchenL.stop();
    if (this.jingle) { this.jingle.stop(); this.jingle = null; }
    this.fan = this.staticL = this.kitchenL = null;
  },

  /* ---------- Construcción de la oficina ---------- */
  buildOffice() {
    const view = document.getElementById("office-view");
    view.innerHTML = "";
    // panel central: recorte de office.png (sin extremos de umbrales)
    const center = document.createElement("div");
    center.className = "office-center";
    center.innerHTML =
      '<img src="' + IMG("office") + '" alt="oficina" draggable="false">' +
      '<div class="office-glow"></div>' +
      '<div class="office-hud-tl" id="hud-tl">' +
      '  <div class="clock-big" id="guard-clock">12 AM</div>' +
      '  <div class="night-lbl">NOCHE 1</div>' +
      "</div>" +
      '<div class="office-hud-bl">' +
      '  <div class="power-lbl">ENERGÍA</div>' +
      '  <div class="power-val" id="guard-power-val">100%</div>' +
      '  <div class="power-bar"><div class="power-fill" id="power-fill"></div></div>' +
      '  <div class="usage-lbl">USO: <span id="usage-bars"></span></div>' +
      "</div>";
    view.appendChild(center);

    // paneles laterales: puertas + botones
    for (const side of ["L", "R"]) {
      const panel = document.createElement("div");
      panel.className = "office-side office-" + (side === "L" ? "left" : "right");
      panel.id = "side-" + side;
      panel.innerHTML =
        '<div class="door-frame"><img id="door-img-' + side + '" alt="puerta"></div>' +
        '<div class="who-there" id="who-' + side + '"></div>' +
        '<div class="btn-col">' +
        '  <button class="fbtn fbtn-door" id="btn-door-' + side + '">PUERTA</button>' +
        '  <button class="fbtn fbtn-light" id="btn-light-' + side + '">LUZ</button>' +
        "</div>";
      view.appendChild(panel);
    }
    // franja de cámaras
    const strip = document.createElement("div");
    strip.id = "cam-strip";
    strip.innerHTML = "▲ CÁMARAS ▲";
    strip.onclick = () => this.toggleMonitor();
    view.appendChild(strip);

    document.getElementById("btn-door-L").onclick = () => this.toggleDoor("L");
    document.getElementById("btn-door-R").onclick = () => this.toggleDoor("R");
    document.getElementById("btn-light-L").onmousedown = () => this.lightOn("L");
    document.getElementById("btn-light-L").onmouseup = () => this.lightOff("L");
    document.getElementById("btn-light-L").onmouseleave = () => this.lightOff("L");
    document.getElementById("btn-light-R").onmousedown = () => this.lightOn("R");
    document.getElementById("btn-light-R").onmouseup = () => this.lightOff("R");
    document.getElementById("btn-light-R").onmouseleave = () => this.lightOff("R");

    this.renderDoors();
  },

  /* ---------- Construcción del monitor ---------- */
  buildMonitor() {
    const mon = document.getElementById("monitor");
    mon.innerHTML =
      '<div class="mon-frame">' +
      '  <div class="mon-head">' +
      '    <span class="rec-dot"></span> REC' +
      '    <span id="mon-loc">CAM —</span>' +
      '    <span id="mon-clock">12 AM</span>' +
      "  </div>" +
      '  <div class="mon-body">' +
      '    <div class="cam-feed" id="cam-feed"></div>' +
      '    <div class="cam-side">' +
      '      <div id="mon-map"></div>' +
      '      <div class="cam-note" id="cam-note">Selecciona una cámara del mapa</div>' +
      "    </div>" +
      "  </div>" +
      '  <div class="mon-foot">CÁMARA DE SEGURIDAD FAZBEAR — v1.4</div>' +
      "</div>";
    const map = buildMapSVG("guard");
    document.getElementById("mon-map").appendChild(map);
    map.addEventListener("roomtap", (e) => {
      const loc = e.detail.loc;
      if (!LOCS[loc].cam) return; // la oficina no es cámara
      this.selectCam(loc);
    });
  },

  /* ---------- Input: puertas ---------- */
  /* RISA de Freddy: botones atascados un tiempo */
  jamActive() { return Date.now() < (this.jamUntil || 0); },
  applyJam(ms) {
    if (!ms || ms <= 0) return;
    this.jamUntil = Date.now() + ms;
    document.querySelectorAll(".fbtn-door, .fbtn-light").forEach(b => b.classList.add("jammed"));
    clearTimeout(this.jamT);
    this.jamT = setTimeout(() => {
      this.jamUntil = 0;
      document.querySelectorAll(".fbtn-door, .fbtn-light").forEach(b => b.classList.remove("jammed"));
    }, ms);
  },

  toggleDoor(side) {
    if (App.gameOverMsg || this.powerOutLocal) return;
    if (this.jamActive()) { FX.toast("¡ATASCADO! La risa bloquea los controles…", 1300, "bad"); return; }
    this.input.doors[side] = !this.input.doors[side];
    AudioMan.play("door", 0.9);
    this.renderDoors();
  },
  lightOn(side) {
    if (App.gameOverMsg || this.powerOutLocal) return;
    if (this.jamActive()) return;
    if (!this.input.lights[side]) {
      this.input.lights[side] = true;
      AudioMan.play("camSw", 0.5);
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
      const who = document.getElementById("who-" + side);
      const closed = this.input.doors[side];
      const lit = this.input.lights[side];
      const p = side === "L" ? "ldoor" : "rdoor";
      // ¿hay alguien en la puerta?
      let present = [];
      if (snap) {
        for (const ch in snap.anims) {
          const an = snap.anims[ch];
          if (an.w) continue;              // caminando: en tránsito
          if (an.n === p) present.push(ch);
        }
      }
      let src;
      if (closed) src = side === "L" ? "ldoor_closed_2" : "rdoor_closed_2";
      else if (lit) src = side === "L" ? "ldoor_light_2" : "rdoor_light_2";
      else src = side === "L" ? "ldoor_anim_2" : "rdoor_anim_2";
      img.src = IMG(src);

      // revelación con la luz
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
      // estilo de botones
      const bd = document.getElementById("btn-door-" + side);
      const bl = document.getElementById("btn-light-" + side);
      bd.classList.toggle("on", closed);
      bl.classList.toggle("on", lit);
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
      this.staticL = AudioMan.loop("staticL", 0.25);
    } else {
      AudioMan.play("camDown", 0.8);
      document.getElementById("monitor").classList.remove("up");
      if (this.staticL) { this.staticL.stop(); this.staticL = null; }
      if (this.kitchenL) { this.kitchenL.stop(); this.kitchenL = null; }
    }
  },

  selectCam(loc) {
    if (!this.input.monitor) return;
    this.lastCam = loc;
    this.input.monitor = loc;
    AudioMan.play("camSw", 0.6);
    FX.staticBurst(240);
    document.getElementById("mon-loc").textContent = "CAM " + LOCS[loc].cam + " — " + LOCS[loc].name.toUpperCase();
    this.renderFeed();
  },

  /* imagen de cámara según ocupación */
  camImage(loc, present) {
    // cocina: solo audio
    if (LOCS[loc].audioOnly) return null;
    // cala pirata: fases de Foxy
    if (loc === "cove") {
      const f = present.includes("foxy");
      if (!f) return "cove_gone";
      const snap = App.snap;
      const ph = snap && snap.anims.foxy ? snap.anims.foxy.phase : 1;
      return FOXY_PHASE_IMG[ph] || "cove_ready";
    }
    // combos auténticos
    const combos = CAM_COMBO[loc];
    if (combos) {
      const key = comboKey(present);
      if (combos[key]) return combos[key];
      if (present.length === 1 && combos[present[0]]) return combos[present[0]];
    }
    // variante base
    const vars = CAM_VARIANTS[loc];
    if (vars) {
      if (this.camVar[loc] === undefined) this.camVar[loc] = App.gameVariants && App.gameVariants[loc] !== undefined ? App.gameVariants[loc] : Math.floor(Math.random() * vars.length);
      return vars[this.camVar[loc]];
    }
    return LOCS[loc].base;
  },

  renderFeed() {
    const loc = this.input.monitor;
    const feed = document.getElementById("cam-feed");
    const note = document.getElementById("cam-note");
    if (!loc) return;
    const s = App.snap;

    // AVERÍA de Chica: estática total en todas las cámaras
    if (s && s.guard.camJamMs > 0) {
      if (this.kitchenL) { this.kitchenL.stop(); this.kitchenL = null; }
      feed.innerHTML =
        '<div class="cam-jam">' +
        '<img src="' + IMG("monitor_static1") + '" alt="">' +
        '<img src="' + IMG("monitor_static2") + '" alt="">' +
        '<div class="cj-lbl">SEÑAL PERDIDA</div>' +
        '<div class="cj-sub">AVERÍA EN EL SISTEMA DE CÁMARAS</div>' +
        "</div>";
      note.textContent = "AVERÍA: no se ve nada hasta que se restablezca la señal…";
      return;
    }

    // presentes (excluye a quien camina y a quien usa SIGILO)
    const present = [];
    const hiddenHere = [];
    if (s) {
      for (const ch in s.anims) {
        const an = s.anims[ch];
        if (an.w) continue;              // en tránsito
        if (an.n !== loc) continue;
        if (an.st) { hiddenHere.push(ch); continue; } // SIGILO de Bonnie
        present.push(ch);
      }
    }
    // cocina: solo audio
    if (LOCS[loc].audioOnly) {
      feed.innerHTML = '<div class="cam-audioonly"><div>CÁMARA AVERIADA</div><div class="big">SOLO AUDIO</div>' +
        (present.length ? '<div class="clatter">🔇 CACHARROS EN LA COCINA…</div>' : "") + "</div>";
      if (present.length && !this.kitchenL) this.kitchenL = AudioMan.loop("kitchen", 0.7);
      if (!present.length && this.kitchenL) { this.kitchenL.stop(); this.kitchenL = null; }
      note.textContent = present.length ? "Se oyen cacharros… hay alguien en la cocina." : "Silencio.";
      return;
    }
    if (this.kitchenL) { this.kitchenL.stop(); this.kitchenL = null; }

    const img = this.camImage(loc, present);
    let html = '<img src="' + IMG(img) + '" alt="' + LOCS[loc].name + '">';
    // overlay de presencia (cuando no hay combo auténtico con imagen)
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
    // SIGILO de Bonnie: interferencia sutil en la sala donde está oculto
    feed.classList.toggle("glitch", hiddenHere.length > 0);
    note.textContent = present.length
      ? "¡Presencia detectada! (" + present.map(c => CHARS[c].name).join(", ") + ")"
      : hiddenHere.length
        ? "Interferencia extraña en la señal…"
        : "Sin actividad visible.";
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
    // reloj y energía
    document.getElementById("guard-clock").textContent = fmtClock(s.t);
    document.getElementById("mon-clock").textContent = fmtClock(s.t);
    document.getElementById("guard-power-val").textContent = Math.ceil(s.power) + "%";
    document.getElementById("power-fill").style.width = Math.max(0, s.power) + "%";
    document.getElementById("power-fill").classList.toggle("low", s.power < 25);
    // uso
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

    // detección de sonidos por delta
    for (const ch in s.anims) {
      const now = s.anims[ch];
      const before = this.lastAnims[ch];
      this.lastAnims[ch] = { n: now.n, phase: now.phase };
      if (!before) continue;
    }
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
        // RISA de Freddy: controles de puertas y luces atascados
        this.applyJam((m.dur || 4) * 1000);
        AudioMan.play("laugh", 1.0);
        FX.toast("¡La RISA de " + CHARS[m.by].name + " aturde los controles de PUERTAS y LUCES!", 3000, "bad");
        break;
      case "scare": {
        // SUSTO INOFENSIVO (habilidad EXTRA): jumpscare animado + monitor cegado
        FX.harmlessScare(m.by, () => {});
        this.goBlind(CFG.SCARE_BLIND_MS);
        FX.toast("¡" + CHARS[m.by].name + " TE HA ASUSTADO! Monitor no disponible…", 3000, "bad");
        break;
      }
      case "stealth":
        FX.toast(CHARS[m.by].name + " se ha esfumado de las cámaras…", 2400, "warn");
        break;
      case "jam":
        AudioMan.play("kitchen", 0.8);
        FX.staticBurst(800);
        FX.toast("¡AVERÍA! " + CHARS[m.by].name + " ha saturado las cámaras (" + m.dur + "s)…", 3000, "bad");
        break;
      case "foxyrun": AudioMan.play("foxyRun", 1.0); FX.toast("¡Se oye una carrera en el pasillo izquierdo!", 2600, "warn"); break;
      case "bang": AudioMan.play("foxyBang", 1.1); FX.toast("¡Foxy golpea la puerta! (−2% energía)", 3000, "warn"); break;
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
      AudioMan.play("camDown", 0.7);
    }
  },

  goBlind(ms) {
    // SUSTO INOFENSIVO: el monitor queda cegado un instante
    this.blindUntilLocal = Date.now() + (ms || CFG.SCARE_BLIND_MS);
    this.forceMonitorDown();
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
    FX.toast("LA ENERGÍA SE AGOTÓ", 4000, "bad");
    this.renderDoors();
  },
};
