/* ============================================================
   FNAF 1 MULTIJUGADOR — VISTA DEL ANIMATRÓNICO
   Inmersiva en primera persona: VE lo que ve su personaje.
   Sin mapa: para moverse usa las PUERTAS del borde de la
   pantalla ("IR AL PASILLO OESTE", "IR A LA COCINA"…).
   En la puerta de la oficina hay tiempo limitado: al agotarse
   el repliegue es FORZOSO.
   ============================================================ */
"use strict";

const Anim = {
  myChar: null,
  lastLoc: null,
  povKey: "",
  doorsKey: "",
  busy: false,
  hudTimer: null,
  kitchenL: null,
  snap: null,          // último snapshot (para el ticker local)
  snapAt: 0,           // Date.now() de llegada del snapshot

  enter(charId) {
    this.myChar = charId;
    this.lastLoc = null;
    this.povKey = "";
    this.doorsKey = "";
    this.busy = false;
    this.snap = null;
    this.stopKitchen();
    UI.show("s-anim");

    const c = CHARS[charId];
    // ---- barra superior compacta ----
    document.getElementById("anim-head").innerHTML =
      '<img class="ah-portrait" src="' + IMG(c.portrait) + '">' +
      '<div class="ah-info">' +
      '  <div class="ah-name" style="color:' + c.color + '">' + c.name + "</div>" +
      '  <div class="ah-desc">' + c.desc + "</div>" +
      "</div>" +
      '<div class="ah-cd" id="ah-cd"><div class="ah-cd-fill" id="cd-fill"></div><span id="cd-txt">—</span></div>';

    // ---- estado (reloj / energía enemiga) ----
    document.getElementById("anim-status").innerHTML =
      '<span id="st-clock">12 AM</span> &nbsp;·&nbsp; ENERGÍA DEL GUARDIA: <span id="st-power">100%</span>' +
      '<span id="st-po"></span>';

    // ---- escena inmersiva ----
    const main = document.getElementById("anim-main");
    main.innerHTML =
      '<div class="anim-scene">' +
      '  <div class="scene-layer" id="scene-layer"></div>' +
      '  <div class="scene-vhs"></div>' +
      '  <div class="scene-loc" id="scene-loc">—</div>' +
      '  <div class="scene-present" id="scene-present"></div>' +
      '  <div class="door-timer" id="door-timer" hidden>' +
      '    <div class="dt-lbl">NO PUEDES QUEDARTE — RETIRADA FORZOSA EN</div>' +
      '    <div class="dt-num" id="dt-num">—</div>' +
      '    <div class="dt-bar"><div class="dt-fill" id="dt-fill"></div></div>' +
      "  </div>" +
      '  <div class="door-badge" id="door-badge" hidden></div>' +
      '  <div class="scene-doors">' +
      '    <div class="dz dz-top" id="dz-top"></div>' +
      '    <div class="dz dz-left" id="dz-left"></div>' +
      '    <div class="dz dz-right" id="dz-right"></div>' +
      '    <div class="dz dz-bottom" id="dz-bottom"></div>' +
      "  </div>" +
      '  <div class="scene-actions" id="scene-actions"></div>' +
      "</div>";

    this.buildActions();
    AudioMan.unlock();
    this.startHudTicker();
  },

  exit() {
    this.stopHudTicker();
    this.stopKitchen();
  },

  stopKitchen() {
    if (this.kitchenL) { this.kitchenL.stop(); this.kitchenL = null; }
  },

  /* Ticker local: interpola cooldown y cuenta atrás entre snapshots */
  startHudTicker() {
    this.stopHudTicker();
    this.hudTimer = setInterval(() => this.tickHud(), 100);
  },
  stopHudTicker() {
    clearInterval(this.hudTimer);
    this.hudTimer = null;
  },

  /* ---------- Acciones (barra inferior) ---------- */
  buildActions() {
    const c = CHARS[this.myChar];
    const box = document.getElementById("scene-actions");
    if (c.phaseOnly) {
      box.innerHTML =
        '<div class="foxy-box">' +
        '  <div class="foxy-phases" id="foxy-phases"></div>' +
        '  <div class="act-row">' +
        '    <button class="abtn scare" id="btn-phase">AVANZAR FASE<span class="ab-sub" id="ph-sub">—</span></button>' +
        '    <button class="abbtn run" id="btn-run" disabled><span>¡CARRERA!</span><span class="cap-sub" id="run-sub">requiere FASE 3</span></button>' +
        "  </div>" +
        "</div>" +
        '<button class="abbtn capture" id="btn-capture" disabled><span>¡CAPTURA!</span><span class="cap-sub" id="cap-sub">—</span></button>';
      document.getElementById("btn-phase").onclick = () => this.foxyPhase();
      document.getElementById("btn-run").onclick = () => this.foxyRun();
      document.getElementById("btn-capture").onclick = () => this.capture();
    } else {
      box.innerHTML =
        '<button class="abtn scare" id="btn-ability">HABILIDAD: SUSTO<span class="ab-sub" id="ab-sub">—</span></button>' +
        '<button class="abbtn capture" id="btn-capture" disabled><span>¡CAPTURA!</span><span class="cap-sub" id="cap-sub">acércate a una puerta</span></button>';
      document.getElementById("btn-ability").onclick = () => this.useAbility();
      document.getElementById("btn-capture").onclick = () => this.capture();
    }
  },

  /* ---------- Puertas de salida (placas) ---------- */
  buildDoors(me) {
    const c = CHARS[this.myChar];
    if (c.phaseOnly) return; // Foxy no se mueve por puertas
    const zones = { top: [], left: [], right: [], bottom: [] };
    const exits = exitsFor(this.myChar, me.n);
    for (const to of exits) zones[exitZone(me.n, to)].push(to);

    const back = isTerminal(me.n); // en la puerta solo se puede REGRESAR
    for (const z in zones) {
      const box = document.getElementById("dz-" + z);
      box.innerHTML = "";
      for (const to of zones[z]) {
        const L = LOCS[to];
        const arrow = z === "left" ? "◀" : z === "right" ? "▶" : z === "top" ? "▲" : "▼";
        const b = document.createElement("button");
        b.className = "door-plaque";
        b.dataset.loc = to;
        b.innerHTML =
          '<span class="dp-head"><span class="dp-arrow">' + arrow + "</span> " +
          (back ? "REGRESAR " : "IR ") + L.dest + "</span>" +
          '<span class="dp-sub">—</span>';
        b.onclick = () => this.tryMove(to);
        box.appendChild(b);
      }
    }
    this.updateDoorsCd(me);
  },

  /* Estado de las placas según cooldown (llamado también por el ticker) */
  updateDoorsCd(me) {
    const cd = this.localCd(me);
    document.querySelectorAll("#anim-main .door-plaque").forEach(b => {
      const sub = b.querySelector(".dp-sub");
      if (cd > 0) {
        b.disabled = true;
        sub.textContent = "espera " + Math.ceil(cd) + "s";
      } else {
        b.disabled = false;
        sub.textContent = LOCS[b.dataset.loc].short.toUpperCase() +
          (LOCS[b.dataset.loc].cam ? " · CAM " + LOCS[b.dataset.loc].cam : "");
      }
    });
  },

  /* ---------- Interacción ---------- */
  tryMove(to) {
    if (!App.snap || App.gameOverMsg) return;
    const me = App.snap.anims[this.myChar];
    if (!me) return;
    const c = CHARS[this.myChar];
    if (c.phaseOnly) return;
    if (this.busy) return;
    if (me.cd > 0) { FX.toast("Espera " + Math.ceil(me.cd) + "s para moverte.", 1400); return; }
    if (!ADJ[me.n] || !ADJ[me.n].includes(to)) { FX.toast("No puedes ir tan lejos de una sola vez.", 1400); return; }
    if (!canGoTo(this.myChar, to)) { FX.toast("Tu personaje no va por ahí.", 1400); return; }
    if (this.busy) return;
    Net.toHost({ t: "move", to: to });
    this.busy = true;
    setTimeout(() => { this.busy = false; }, 350);
  },

  foxyPhase() {
    const me = App.snap && App.snap.anims.foxy;
    if (!me) return;
    if (me.cd > 0) { FX.toast("Espera " + Math.ceil(me.cd) + "s.", 1400); return; }
    if (me.running) { FX.toast("¡Ya estás corriendo!", 1400); return; }
    if (App.snap.guard.mon === "cove") { FX.toast("¡El guardia te está mirando! (CAM 1C)", 1600); return; }
    Net.toHost({ t: "phase" });
  },

  foxyRun() {
    Net.toHost({ t: "run" });
    AudioMan.play("foxyRun", 0.9);
  },

  useAbility() {
    const me = App.snap && App.snap.anims[this.myChar];
    if (!me) return;
    if (me.abR !== 0) { FX.toast("Habilidad recargando (" + Math.ceil(me.abR) + "s)…", 1400); return; }
    Net.toHost({ t: "ability" });
  },

  capture() {
    const me = App.snap && App.snap.anims[this.myChar];
    if (!me) return;
    if (me.n !== "ldoor" && me.n !== "rdoor") { FX.toast("Debes estar EN la puerta.", 1400); return; }
    Net.toHost({ t: "capture" });
  },

  /* ---------- Snapshot ---------- */
  onSnap(s) {
    if (!this.myChar) return;
    const me = s.anims[this.myChar];
    if (!me) return;
    this.snap = s;
    this.snapAt = Date.now();

    // ¿cambié de ubicación? -> reconstruir puertas
    if (me.n !== this.lastLoc) {
      this.lastLoc = me.n;
      this.buildDoors(me);
      this.povKey = ""; // fuerza refresco de la vista
    }
    this.updateDoorsCd(me);

    this.renderPOV(me, s);
    this.renderDoorBadge(me, s);
    this.renderActions(me, s);
    this.tickHud();

    document.getElementById("st-clock").textContent = fmtClock(s.t);
    document.getElementById("st-power").textContent = Math.ceil(s.power) + "%";
    document.getElementById("st-po").innerHTML = s.po ? ' <span class="po-tag">¡ENERGÍA AGOTADA!</span>' : "";
  },

  /* cooldown local interpolado */
  localCd(me) {
    if (!me || me.cd <= 0) return 0;
    const elapsed = (Date.now() - this.snapAt) / 1000;
    return Math.max(0, me.cd - elapsed);
  },
  /* cuenta atrás de puerta interpolada */
  localDoorT(me) {
    if (!me || me.dT === null || me.dT === undefined) return null;
    const elapsed = (Date.now() - this.snapAt) / 1000;
    return Math.max(0, me.dT - elapsed);
  },

  /* Ticker: refresca números suaves (cd, temporizador) */
  tickHud() {
    const s = this.snap;
    if (!s) return;
    const me = s.anims[this.myChar];
    if (!me) return;

    // chip de cooldown
    const fill = document.getElementById("cd-fill");
    const txt = document.getElementById("cd-txt");
    const c = CHARS[this.myChar];
    const total = c.phaseOnly ? CFG.FOXY_PHASE_CD : c.cooldown;
    const cd = this.localCd(me);
    if (cd > 0) {
      fill.style.width = (100 - (cd / total) * 100) + "%";
      txt.textContent = cd.toFixed(1) + "s";
    } else {
      fill.style.width = "100%";
      txt.textContent = "LISTO";
    }

    // placas: habilitar justo cuando el cd llega a 0
    this.updateDoorsCd(me);

    // temporizador de estancia en puerta
    const timer = document.getElementById("door-timer");
    const dT = this.localDoorT(me);
    if (dT !== null && (me.n === "ldoor" || me.n === "rdoor")) {
      timer.hidden = false;
      document.getElementById("dt-num").textContent = dT.toFixed(1) + "s";
      document.getElementById("dt-fill").style.width = (dT / CFG.DOOR_STAY_SEC * 100) + "%";
      timer.classList.toggle("warn", dT <= CFG.DOOR_STAY_WARN_SEC);
    } else {
      timer.hidden = true;
    }
  },

  /* ---------- POV: lo que ves desde donde estás ---------- */
  renderPOV(me, s) {
    const present = [];
    for (const ch in s.anims) if (s.anims[ch].n === me.n) present.push(ch);
    const doorSide = me.n === "ldoor" ? "L" : me.n === "rdoor" ? "R" : null;
    const doorClosed = doorSide === "L" ? s.guard.dL : doorSide === "R" ? s.guard.dR : null;
    const key = me.n + "|" + present.join(",") + "|" + doorClosed + "|" + (me.phase || "") + "|" + !!me.running;
    if (key === this.povKey) return; // sin cambios
    this.povKey = key;

    const layer = document.getElementById("scene-layer");
    const locLbl = document.getElementById("scene-loc");
    const loc = me.n;

    let html = "";
    if (loc === "kitchen") {
      // a oscuras, entre cacharros
      locLbl.textContent = "COCINA — A OSCURAS";
      html = '<div class="scene-dark"><div class="sd-big">A OSCURAS</div>' +
        '<div>Chacharros y ollas… el guardia solo puede OÍRTE.</div>' +
        '<div class="sd-hint">Desde aquí puedes rondar hasta el Pasillo Este.</div></div>';
      if (!this.kitchenL) this.kitchenL = AudioMan.loop("kitchen", 0.55);
    } else {
      this.stopKitchen();
      let img, sub;
      if (loc === "ldoor" || loc === "rdoor") {
        const side = loc === "ldoor" ? "l" : "r";
        img = doorClosed ? side + "door_closed_2" : side + "door_light_2";
        locLbl.textContent = loc === "ldoor" ? "PUERTA IZQUIERDA DE LA OFICINA" : "PUERTA DERECHA DE LA OFICINA";
        sub = doorClosed
          ? "El guardia ha BAJADO LA PUERTA. Si pulsas CAPTURA te bloqueará."
          : "¡La puerta está ABIERTA! Pulsa CAPTURA para entrar…";
      } else if (loc === "cove") {
        const ph = me.phase || 1;
        img = FOXY_PHASE_IMG[ph] || "cove_closed";
        locLbl.textContent = "CALA PIRATA — FASE " + ph;
      } else if (me.running) {
        img = "cove_run" + Math.min(4, Math.max(1, Math.ceil(Math.abs(Math.sin(Date.now() / 300)) * 4)));
        locLbl.textContent = "¡CORRIENDO POR EL PASILLO IZQUIERDO!";
      } else {
        const vars = CAM_VARIANTS[loc];
        img = vars ? vars[App.gameVariants && App.gameVariants[loc] !== undefined ? App.gameVariants[loc] : 0] : LOCS[loc].base;
        locLbl.textContent = LOCS[loc].name.toUpperCase() + (LOCS[loc].cam ? " — CAM " + LOCS[loc].cam : "");
      }
      html = '<img class="scene-img" src="' + IMG(img) + '" alt="">';
      if (sub) html += '<div class="scene-hint">' + sub + "</div>";
    }
    layer.innerHTML = html;
    const scene = layer.closest(".anim-scene");
    if (scene) scene.classList.toggle("running", !!me.running);

    // compañeros en la misma sala
    const box = document.getElementById("scene-present");
    let chips = "";
    for (const ch of present) {
      if (ch === this.myChar) continue;
      chips += '<div class="cp-chip" style="border-color:' + CHARS[ch].color + '">' +
        '<img src="' + IMG(CHARS[ch].portrait) + '">' + CHARS[ch].name + " está aquí</div>";
    }
    box.innerHTML = chips;
  },

  /* ---------- Estado de la puerta de la oficina (visible desde esquinas/puertas) ---------- */
  renderDoorBadge(me, s) {
    const badge = document.getElementById("door-badge");
    const near = { ldoor: "L", rdoor: "R", westcorner: "L", eastcorner: "R" }[me.n];
    if (!near || me.running) { badge.hidden = true; return; }
    const closed = near === "L" ? s.guard.dL : s.guard.dR;
    const name = near === "L" ? "PUERTA IZQUIERDA" : "PUERTA DERECHA";
    badge.hidden = false;
    badge.className = "door-badge " + (closed ? "closed" : "open");
    badge.innerHTML = (me.n === "ldoor" || me.n === "rdoor" ? "" : "AL FINAL DEL PASILLO: ") +
      name + (closed ? " — CERRADA" : " — ABIERTA");
  },

  /* ---------- Botones de acción ---------- */
  renderActions(me, s) {
    const c = CHARS[this.myChar];
    if (c.phaseOnly) {
      const ph = me.phase || 1;
      document.getElementById("foxy-phases").innerHTML =
        [1, 2, 3].map(i =>
          '<div class="fphase' + (i <= ph ? " done" : "") + (i === ph ? " cur" : "") + '">F' + i + "</div>"
        ).join("") + '<div class="fphase-arrow">→ 🏁 puerta izq.</div>';
      const phBtn = document.getElementById("btn-phase");
      const phSub = document.getElementById("ph-sub");
      const runBtn = document.getElementById("btn-run");
      const runSub = document.getElementById("run-sub");
      if (me.running) {
        phBtn.disabled = true; phSub.textContent = "corriendo…";
        runBtn.disabled = true; runSub.textContent = "¡EN CARRERA!";
      } else if (me.n !== "cove") {
        phBtn.disabled = true; phSub.textContent = "vuelve a la cala";
        runBtn.disabled = true; runSub.textContent = "fuera de la cala";
      } else if (ph >= 3) {
        phBtn.disabled = true; phSub.textContent = "fase máxima";
        runBtn.disabled = false; runSub.textContent = "¡corre por el pasillo izquierdo!";
      } else {
        phBtn.disabled = me.cd > 0;
        phSub.textContent = me.cd > 0 ? Math.ceil(me.cd) + "s" : "avanza a F" + (ph + 1);
        runBtn.disabled = true; runSub.textContent = "requiere FASE 3";
        if (s.guard.mon === "cove") phSub.textContent = "¡te están mirando!";
      }
    } else {
      const abBtn = document.getElementById("btn-ability");
      const abSub = document.getElementById("ab-sub");
      if (me.abR === 0) { abBtn.classList.add("ready"); abSub.textContent = "¡LISTA!"; }
      else { abBtn.classList.remove("ready"); abSub.textContent = "recarga " + Math.ceil(me.abR) + "s"; }
    }
    // captura
    const cap = document.getElementById("btn-capture");
    const capSub = document.getElementById("cap-sub");
    const atDoor = me.n === "ldoor" || me.n === "rdoor";
    if (atDoor && !me.running) {
      const side = me.n === "ldoor" ? "L" : "R";
      const closed = side === "L" ? s.guard.dL : s.guard.dR;
      if (closed) {
        cap.disabled = true;
        cap.classList.remove("armed");
        capSub.textContent = "cerrada… resígnate y regresa";
      } else {
        cap.disabled = false;
        cap.classList.add("armed");
        capSub.textContent = "¡la puerta está ABIERTA — ahora!";
      }
    } else {
      cap.disabled = true;
      cap.classList.remove("armed");
      capSub.textContent = c.phaseOnly ? "llega a la puerta corriendo" : "acércate a una puerta";
    }
  },

  /* ---------- Eventos ---------- */
  onEvent(m) {
    const mine = m.by === this.myChar;
    switch (m.e) {
      case "scare":
        if (mine) FX.toast("¡Susto enviado al guardia! Su monitor queda cegado.", 2400, "good");
        else FX.toast(CHARS[m.by].name + " ha usado su susto.", 2200);
        break;
      case "moved":
        if (mine) AudioMan.play("steps", 0.8);
        break;
      case "phase":
        if (mine) FX.toast("Fase " + m.ph + " alcanzada.", 1800, "good");
        break;
      case "foxyrun":
        FX.toast(mine ? "¡CARRERA INICIADA!" : "Foxy empieza a correr…", 2400, "warn");
        break;
      case "atdoor":
        if (mine) FX.toast("¡Estás EN la puerta! Si está ABIERTA pulsa CAPTURA. ¡No puedes quedarte mucho tiempo!", 3600, "good");
        break;
      case "blocked":
        if (mine) { FX.toast("¡La puerta se cerró a tiempo! Repliegue…", 3000, "bad"); AudioMan.play("door", 0.8); }
        else FX.toast("Captura bloqueada por el guardia.", 2400);
        break;
      case "retreat":
        if (mine) { FX.toast("¡TIEMPO AGOTADO! Repliegue forzoso…", 3000, "bad"); AudioMan.play("steps", 0.9); }
        else FX.toast(CHARS[m.by].name + " tuvo que retirarse de la puerta.", 2400);
        break;
      case "powerout":
        FX.toast("¡ENERGÍA AGOTADA! Las puertas están abiertas…", 4000, "good");
        break;
      case "deny":
        FX.toast(m.msg || "Acción denegada.", 2000, "bad");
        break;
    }
  },
};
