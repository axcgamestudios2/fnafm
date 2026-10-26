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
  walkFx: null,         // caminata en curso {to, timer}
  walkAudio: null,      // pasos en bucle
  snap: null,          // último snapshot (para el ticker local)
  snapAt: 0,           // Date.now() de llegada del snapshot

  enter(charId) {
    this.myChar = charId;
    this.lastLoc = null;
    this.povKey = "";
    this.doorsKey = "";
    this.busy = false;
    this.snap = null;
    this.clearWalkFx();
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
      '  <div class="walk-fx" id="walk-fx" hidden></div>' +
      '  <div class="scene-vhs"></div>' +
      '  <div class="scene-loc" id="scene-loc">—</div>' +
      '  <div class="scene-present" id="scene-present"></div>' +
      '  <div class="scene-ab" id="scene-ab" hidden></div>' +
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
    this.clearWalkFx();
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
        '    <button class="abbtn run" id="btn-run" disabled><span>HABILIDAD: ¡CARRERA!</span><span class="cap-sub" id="run-sub">corre muy rápido — requiere FASE 3</span></button>' +
        "  </div>" +
        "</div>" +
        '<button class="abtn extra" id="btn-scare">SUSTO INOFENSIVO<span class="ab-sub" id="sc-sub">—</span></button>' +
        '<button class="abbtn capture" id="btn-capture" disabled><span>¡CAPTURA!</span><span class="cap-sub" id="cap-sub">—</span></button>';
      document.getElementById("btn-phase").onclick = () => this.foxyPhase();
      document.getElementById("btn-run").onclick = () => this.foxyRun();
      document.getElementById("btn-scare").onclick = () => this.useScare();
      document.getElementById("btn-capture").onclick = () => this.capture();
    } else {
      const ab = ABILITIES[this.myChar];
      box.innerHTML =
        '<button class="abtn scare" id="btn-ability">HABILIDAD: ' + ab.name +
        '<span class="ab-sub" id="ab-sub">' + ab.sub + "</span></button>" +
        '<button class="abtn extra" id="btn-scare">SUSTO INOFENSIVO<span class="ab-sub" id="sc-sub">asusta al guardia — jumpscare sin captura</span></button>' +
        '<button class="abbtn capture" id="btn-capture" disabled><span>¡CAPTURA!</span><span class="cap-sub" id="cap-sub">acércate a una puerta</span></button>';
      document.getElementById("btn-ability").onclick = () => this.useAbility();
      document.getElementById("btn-scare").onclick = () => this.useScare();
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

  /* Estado de las placas según cooldown/caminata (también por el ticker) */
  updateDoorsCd(me) {
    const walking = !!(me && me.w);
    const cd = this.localCd(me);
    document.querySelectorAll("#anim-main .door-plaque").forEach(b => {
      const sub = b.querySelector(".dp-sub");
      if (walking) {
        b.disabled = true;
        sub.textContent = "caminando…";
      } else if (cd > 0) {
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
    if (me.w) { FX.toast("Ya estás caminando…", 1200); return; }
    if (me.cd > 0) { FX.toast("Espera " + Math.ceil(me.cd) + "s para moverte.", 1400); return; }
    if (!ADJ[me.n] || !ADJ[me.n].includes(to)) { FX.toast("No puedes ir tan lejos de una sola vez.", 1400); return; }
    if (!canGoTo(this.myChar, to)) { FX.toast("Tu personaje no va por ahí.", 1400); return; }
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
    if (me.abA > 0) { FX.toast("La habilidad ya está ACTIVA.", 1400); return; }
    if (me.abR !== 0) { FX.toast("Habilidad recargando (" + Math.ceil(me.abR) + "s)…", 1400); return; }
    Net.toHost({ t: "ability" });
  },

  /* SUSTO INOFENSIVO — habilidad EXTRA común a todos los animatrónicos */
  useScare() {
    const me = App.snap && App.snap.anims[this.myChar];
    if (!me) return;
    const scR = this.localScR(me);
    if (scR > 0) { FX.toast("El susto recarga (" + Math.ceil(scR) + "s)…", 1400); return; }
    Net.toHost({ t: "scare" });
  },

  capture() {
    const me = App.snap && App.snap.anims[this.myChar];
    if (!me) return;
    if (me.w) { FX.toast("Termina de caminar primero…", 1400); return; }
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

    // caminata: asegurar la animación (por si el evento se perdió)
    if (me.w) this.ensureWalkFx(me);
    else if (this.walkFx || this._lastWalkKey) {
      // llegada: ráfaga de estática auténtica al asentarse la vista
      this.staticBurstLocal(240);
      this.clearWalkFx();
    }

    // ¿cambié de ubicación (llegada efectiva)? -> reconstruir puertas
    if (!me.w && me.n !== this.lastLoc) {
      this.lastLoc = me.n;
      this.buildDoors(me);
      this.povKey = ""; // fuerza refresco de la vista
    }
    this.updateDoorsCd(me);

    this.renderPOV(me, s);
    this.renderDoorBadge(me, s);
    this.renderActions(me, s);
    this.renderAbilityBadge(me);
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
  /* recarga de habilidad interpolada */
  localAbR(me) {
    if (!me || !me.abR) return 0;
    const elapsed = (Date.now() - this.snapAt) / 1000;
    return Math.max(0, me.abR - elapsed);
  },
  /* recarga del SUSTO inofensivo interpolada */
  localScR(me) {
    if (!me || !me.scR) return 0;
    const elapsed = (Date.now() - this.snapAt) / 1000;
    return Math.max(0, me.scR - elapsed);
  },
  /* habilidad activa interpolada */
  localAbA(me) {
    if (!me || !me.abA) return 0;
    const elapsed = (Date.now() - this.snapAt) / 1000;
    return Math.max(0, me.abA - elapsed);
  },
  /* cuenta atrás de puerta interpolada */
  localDoorT(me) {
    if (!me || me.dT === null || me.dT === undefined) return null;
    const elapsed = (Date.now() - this.snapAt) / 1000;
    return Math.max(0, me.dT - elapsed);
  },

  /* ============================================================
     CAMINATA EN PRIMERA PERSONA — transición auténtica del FNAF:
     ráfaga de estática al partir (como el cambio de cámara del
     original) y la vista de destino AVANZANDO hacia ella (zoom
     frontal suave) con balanceo de cabeza y pasos.
     ============================================================ */
  povImageFor(loc) {
    if (loc === "kitchen") return IMG("black");
    if (loc === "ldoor" || loc === "rdoor")
      return IMG((loc === "ldoor" ? "l" : "r") + "door_anim_2");
    const vars = CAM_VARIANTS[loc];
    return IMG(vars ? vars[App.gameVariants && App.gameVariants[loc] !== undefined ? App.gameVariants[loc] : 0] : LOCS[loc].base);
  },

  /* Ráfaga de estática auténtica (los 3 fotogramas del original
     ciclando a ~13 fps) — igual que el cambio de cámara del juego */
  staticBurstLocal(ms) {
    const scene = document.querySelector("#anim-main .anim-scene");
    if (!scene || scene.querySelector(".walk-static")) return;
    const d = document.createElement("div");
    d.className = "walk-static";
    d.innerHTML =
      '<img src="' + IMG("static1") + '" alt="">' +
      '<img src="' + IMG("static2") + '" alt="" style="display:none">' +
      '<img src="' + IMG("static3") + '" alt="" style="display:none">';
    scene.appendChild(d);
    const frames = d.querySelectorAll("img");
    let fi = 0;
    const int = setInterval(() => {
      frames.forEach((im, idx) => { im.style.display = idx === (fi % 3) ? "block" : "none"; });
      fi++;
    }, 78);
    setTimeout(() => { clearInterval(int); d.remove(); }, Math.max(160, ms));
  },

  /* Arranca la animación de caminata (desde evento o snapshot) */
  startWalkFx(from, to, durSec) {
    if (!LOCS[to] || !LOCS[from]) return;
    this.clearWalkFx();
    const layer = document.getElementById("walk-fx");
    const sceneLoc = document.getElementById("scene-loc");
    if (!layer) return;
    const ms = Math.max(700, durSec * 1000);
    const isDoor = to === "ldoor" || to === "rdoor";
    layer.hidden = false;
    layer.innerHTML =
      '<img class="walk-img' + (isDoor ? " door-fit" : "") + '" src="' + this.povImageFor(to) + '" alt="">' +
      '<div class="walk-label">CAMINANDO: ' + LOCS[to].short.toUpperCase() + "…</div>";
    // estática de transición al partir (auténtica del FNAF 1)
    this.staticBurstLocal(400);
    AudioMan.play("camSw", 0.7);
    // la vista de destino avanza hacia ti: zoom frontal progresivo
    const img = layer.querySelector(".walk-img");
    if (img && img.animate) img.animate([
      { transform: "scale(1.0)", filter: "brightness(0.78) contrast(1.12)" },
      { transform: "scale(1.3)", filter: "brightness(0.95) contrast(1.06)" },
    ], { duration: ms, fill: "both", easing: "ease-in" });
    // pasos en bucle y balanceo de cabeza
    this.walkAudio = AudioMan.loop("steps", 0.8);
    const scene = layer.closest(".anim-scene");
    if (scene) scene.classList.add("walking");
    if (sceneLoc) sceneLoc.textContent = "➜ " + (LOCS[to].dest || LOCS[to].name.toUpperCase());
    this.walkFx = { to: to, from: from };
    clearTimeout(this._walkT);
    this._walkT = setTimeout(() => { this.stopWalkFx(); }, ms + 150);
  },

  /* El snapshot confirma una caminata en curso */
  ensureWalkFx(me) {
    const w = me.w;
    if (!w) return;
    const key = w.from + ">" + w.to;
    if (this.walkFx && this.walkFx.to === w.to && this.walkFx.from === w.from) return; // ya en pantalla
    if (!this.walkFx && this._lastWalkKey === key) return; // ya reproducida localmente
    this.startWalkFx(w.from, w.to, w.dur * (1 - w.p));
  },

  /* Fin de la caminata: para pasos/balanceo pero MANTIENE la imagen
     de destino hasta que el snapshot de llegada pinte la sala. */
  stopWalkFx() {
    if (this.walkAudio) { this.walkAudio.stop(); this.walkAudio = null; }
    clearTimeout(this._walkT);
    if (this.walkFx) this._lastWalkKey = this.walkFx.from + ">" + this.walkFx.to;
    this.walkFx = null;
    const scene = document.querySelector("#anim-main .anim-scene");
    if (scene) scene.classList.remove("walking");
  },

  /* Limpieza total (llegada confirmada o salida del modo) */
  clearWalkFx() {
    this.stopWalkFx();
    this._lastWalkKey = null;
    const layer = document.getElementById("walk-fx");
    if (layer) { layer.hidden = true; layer.innerHTML = ""; }
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
    if (me.w) return; // caminando: la capa walk-fx posee la vista
    const present = [];
    for (const ch in s.anims) if (!s.anims[ch].w && s.anims[ch].n === me.n) present.push(ch);
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
      let img, sub, extraCls = "";
      if (loc === "ldoor" || loc === "rdoor") {
        const side = loc === "ldoor" ? "l" : "r";
        img = doorClosed ? side + "door_closed_2" : side + "door_light_2";
        extraCls = " door-fit"; // tira vertical de la puerta: encajada a lo alto, sin deformar
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
      html = '<img class="scene-img' + extraCls + '" src="' + IMG(img) + '" alt="">';
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
      const abA = this.localAbA(me);
      const abR = this.localAbR(me);
      if (abA > 0) {
        abBtn.classList.remove("ready");
        abBtn.classList.add("active-ab");
        abBtn.disabled = true;
        abSub.textContent = "¡ACTIVA! " + Math.ceil(abA) + "s";
      } else {
        abBtn.classList.remove("active-ab");
        if (abR <= 0) { abBtn.classList.add("ready"); abBtn.disabled = false; abSub.textContent = "¡LISTA! — púlsala"; }
        else { abBtn.classList.remove("ready"); abBtn.disabled = true; abSub.textContent = "recarga " + Math.ceil(abR) + "s"; }
      }
    }
    // susto inofensivo (EXTRA, común)
    const scBtn = document.getElementById("btn-scare");
    const scSub = document.getElementById("sc-sub");
    if (scBtn && scSub) {
      const scR = this.localScR(me);
      if (scR > 0) {
        scBtn.disabled = true;
        scBtn.classList.remove("ready");
        scSub.textContent = "recarga " + Math.ceil(scR) + "s";
      } else {
        scBtn.disabled = false;
        scBtn.classList.add("ready");
        scSub.textContent = "¡LISTO! — asusta al guardia";
      }
    }
    // captura
    const cap = document.getElementById("btn-capture");
    const capSub = document.getElementById("cap-sub");
    const atDoor = (me.n === "ldoor" || me.n === "rdoor") && !me.w;
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

  /* ---------- Insignia de habilidad activa (sobre la escena) ---------- */
  renderAbilityBadge(me) {
    const badge = document.getElementById("scene-ab");
    if (!badge) return;
    const c = CHARS[this.myChar];
    const abA = this.localAbA(me);
    if (abA > 0 && !c.phaseOnly) {
      const ab = ABILITIES[this.myChar];
      badge.hidden = false;
      badge.className = "scene-ab" + (me.st ? " stealth" : "");
      badge.style.borderColor = c.color;
      badge.innerHTML = (me.st ? "⛔ OCULTO EN CÁMARAS · " : "") +
        ab.name + " — " + Math.ceil(abA) + "s";
    } else {
      badge.hidden = true;
    }
  },

  /* ---------- Eventos ---------- */
  onEvent(m) {
    const mine = m.by === this.myChar;
    switch (m.e) {
      case "walk":
        // la animación de caminata arranca aquí (y el snapshot la confirma)
        if (mine) this.startWalkFx(m.from, m.to, m.dur);
        break;
      case "arrive":
        if (mine && m.door) AudioMan.play("door", 0.5);
        break;
      case "laugh":
        if (mine) FX.toast("¡RISA SINIESTRA! El guardia no puede usar sus puertas ni luces.", 3000, "good");
        else FX.toast("La risa de " + CHARS[m.by].name + " retumba en la pizzería…", 2400);
        break;
      case "stealth":
        if (mine) FX.toast("¡MODO SIGILO! No apareces en las cámaras durante " + m.dur + "s.", 3000, "good");
        else FX.toast(CHARS[m.by].name + " se ha esfumado de las cámaras…", 2400);
        break;
      case "jam":
        if (mine) FX.toast("¡AVERÍA! Las cámaras del guardia llenas de estática " + m.dur + "s.", 3000, "good");
        else FX.toast("Se oye un estruendo de cacharros…", 2400);
        break;
      case "scare":
        if (mine) FX.toast("¡SUSTO ENVIADO! El monitor del guardia queda cegado un momento.", 2800, "good");
        else FX.toast(CHARS[m.by].name + " ha lanzado un susto al guardia…", 2200);
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
        if (mine) { FX.toast("¡TIEMPO AGOTADO! Repliegue forzoso…", 3000, "bad"); }
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
