/* ============================================================
   FNAF 1 MULTIJUGADOR — VISTA DEL ANIMATRÓNICO
   Mapa táctico de nodos, cooldown, habilidad de susto,
   captura en puerta, fases/carrera de Foxy.
   ============================================================ */
"use strict";

const Anim = {
  myChar: null,
  lastLoc: null,

  enter(charId) {
    this.myChar = charId;
    this.lastLoc = null;
    UI.show("s-anim");
    const c = CHARS[charId];
    document.getElementById("anim-head").innerHTML =
      '<img class="ah-portrait" src="' + IMG(c.portrait) + '">' +
      '<div class="ah-info">' +
      '  <div class="ah-name" style="color:' + c.color + '">' + c.fullName + "</div>" +
      '  <div class="ah-desc">' + c.desc + "</div>" +
      "</div>" +
      '<div class="ah-cd" id="ah-cd"><div class="ah-cd-fill" id="cd-fill"></div><span id="cd-txt">—</span></div>';

    const main = document.getElementById("anim-main");
    main.innerHTML = "";
    // mapa táctico
    const mapWrap = document.createElement("div");
    mapWrap.className = "anim-map";
    const map = buildMapSVG("anim");
    mapWrap.appendChild(map);
    main.appendChild(mapWrap);
    map.addEventListener("roomtap", (e) => this.onNodeTap(e.detail.loc));

    // panel lateral
    const side = document.createElement("div");
    side.className = "anim-side";
    side.innerHTML =
      '<div class="panel pov">' +
      '  <div class="panel-title">TU CÁMARA</div>' +
      '  <div class="pov-frame" id="pov-frame"></div>' +
      '  <div class="pov-loc" id="pov-loc">—</div>' +
      "</div>" +
      '<div class="panel doors" id="doors-panel">' +
      '  <div class="panel-title">PUERTAS DE LA OFICINA</div>' +
      '  <div class="doorstat" id="ds-L"><span class="ds-name">IZQUIERDA</span><span class="ds-state">—</span></div>' +
      '  <div class="doorstat" id="ds-R"><span class="ds-name">DERECHA</span><span class="ds-state">—</span></div>' +
      "</div>" +
      '<div class="panel actions" id="anim-actions"></div>' +
      '<div class="panel team" id="team-panel">' +
      '  <div class="panel-title">EQUIPO ANIMATRÓNICO</div>' +
      '  <div id="team-chips"></div>' +
      "</div>";
    main.appendChild(side);

    if (c.phaseOnly) this.buildFoxyActions(); else this.buildMoveActions();
    AudioMan.unlock();
    // sonido de pasos al moverse (local)
  },

  /* ---------- Acciones normales ---------- */
  buildMoveActions() {
    const c = CHARS[this.myChar];
    document.getElementById("anim-actions").innerHTML =
      '<div class="panel-title">ACCIONES</div>' +
      '<div class="act-hint">Pulsa un nodo <b>contiguo</b> del mapa para moverte.</div>' +
      '<button class="abtn scare" id="btn-ability">' +
      '  <span class="ab-ico">💀</span> HABILIDAD: SUSTO' +
      '  <span class="ab-sub" id="ab-sub">—</span>' +
      "</button>" +
      '<button class="abbtn capture" id="btn-capture" disabled>' +
      '  <span>¡CAPTURA!</span><span class="cap-sub" id="cap-sub">acércate a una puerta</span>' +
      "</button>";
    document.getElementById("btn-ability").onclick = () => this.useAbility();
    document.getElementById("btn-capture").onclick = () => this.capture();
  },

  /* ---------- Acciones de Foxy ---------- */
  buildFoxyActions() {
    document.getElementById("anim-actions").innerHTML =
      '<div class="panel-title">ACCIONES DE FOXY</div>' +
      '<div class="foxy-phases" id="foxy-phases"></div>' +
      '<div class="act-hint">Avanza por fases en la Cala Pirata. ¡Si el guardia mira la CAM 1C no podrás avanzar!</div>' +
      '<button class="abtn scare" id="btn-phase"><span class="ab-ico">🎭</span> AVANZAR FASE<span class="ab-sub" id="ph-sub">—</span></button>' +
      '<button class="abbtn run" id="btn-run" disabled><span>¡CARRERA!</span><span class="cap-sub" id="run-sub">requiere FASE 3</span></button>' +
      '<button class="abbtn capture" id="btn-capture" disabled><span>¡CAPTURA!</span><span class="cap-sub" id="cap-sub">—</span></button>';
    document.getElementById("btn-phase").onclick = () => this.foxyPhase();
    document.getElementById("btn-run").onclick = () => this.foxyRun();
    document.getElementById("btn-capture").onclick = () => this.capture();
  },

  /* ---------- Interacción ---------- */
  onNodeTap(loc) {
    if (!App.snap || App.gameOverMsg) return;
    const me = App.snap.anims[this.myChar];
    if (!me) return;
    const c = CHARS[this.myChar];
    if (c.phaseOnly) return; // foxy no usa el mapa
    if (this.busy) return;
    if (me.cd > 0) { FX.toast("Espera " + Math.ceil(me.cd) + "s para moverte.", 1400); return; }
    if (!ADJ[me.n] || !ADJ[me.n].includes(loc)) { FX.toast("Solo puedes saltar a una ubicación contigua.", 1400); return; }
    if (!canGoTo(this.myChar, loc)) { FX.toast("Tu personaje no va por ahí.", 1400); return; }
    if (isTerminal(loc) || isTerminal(me.n)) { /* permitido */ }
    Net.toHost({ t: "move", to: loc });
    AudioMan.play("steps", 0.7);
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
    AudioMan.play("steps", 0.6);
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
    const c = CHARS[this.myChar];

    // cooldown
    const fill = document.getElementById("cd-fill");
    const txt = document.getElementById("cd-txt");
    const total = c.phaseOnly ? CFG.FOXY_PHASE_CD : c.cooldown;
    if (me.cd > 0) {
      fill.style.width = (100 - (me.cd / total) * 100) + "%";
      txt.textContent = me.cd.toFixed(1) + "s";
    } else {
      fill.style.width = "100%";
      txt.textContent = "LISTO";
    }

    // posiciones en el mapa
    updateMapMarkers(document.querySelector(".anim-map .fnaf-map"), this.mapPositions(s), this.myChar);
    this.renderPOV(me, s);
    this.renderDoors(s);
    this.renderTeam(s);
    this.renderActions(me, s);
    // título con reloj/energía del enemigo
    document.getElementById("anim-status").innerHTML =
      "🕐 " + fmtClock(s.t) + " &nbsp;·&nbsp; ⚡ " + Math.ceil(s.power) + "%" +
      (s.po ? ' <span class="po-tag">¡ENERGÍA AGOTADA!</span>' : "");
  },

  mapPositions(s) {
    const out = {};
    for (const ch in s.anims) out[ch] = s.anims[ch].n;
    return out;
  },

  /* ---------- POV: dónde estoy yo ahora ---------- */
  renderPOV(me, s) {
    if (me.n === this.lastLoc && !this._forcePOV) { /* refresco barato */ }
    this.lastLoc = me.n;
    const frame = document.getElementById("pov-frame");
    const locLbl = document.getElementById("pov-loc");
    const loc = me.n;
    const present = [];
    for (const ch in s.anims) if (s.anims[ch].n === loc) present.push(ch);

    let img;
    if (loc === "ldoor") { img = "ldoor_light_2"; locLbl.textContent = "ESTÁS EN LA PUERTA IZQUIERDA"; }
    else if (loc === "rdoor") { img = "rdoor_light_2"; locLbl.textContent = "ESTÁS EN LA PUERTA DERECHA"; }
    else if (loc === "kitchen") img = "kitchen";
    else if (loc === "cove") {
      const ph = me.phase || 1;
      img = FOXY_PHASE_IMG[ph] || "cove_closed";
      locLbl.textContent = "CALA PIRATA — FASE " + ph;
    }
    else {
      const vars = CAM_VARIANTS[loc];
      img = vars ? vars[App.gameVariants && App.gameVariants[loc] !== undefined ? App.gameVariants[loc] : 0] : LOCS[loc].base;
      locLbl.textContent = LOCS[loc].name.toUpperCase() + " — CAM " + (LOCS[loc].cam || "—");
    }
    let html = '<img src="' + IMG(img) + '">';
    if (present.length > 1 || (present.length === 1 && present[0] !== this.myChar)) {
      html += '<div class="cam-present">';
      for (const ch of present) if (ch !== this.myChar) {
        html += '<div class="cp-chip" style="border-color:' + CHARS[ch].color + '">' + CHARS[ch].name + " también está aquí</div>";
      }
      html += "</div>";
    }
    frame.innerHTML = html;
  },

  renderDoors(s) {
    for (const side of ["L", "R"]) {
      const el = document.getElementById("ds-" + side);
      const closed = side === "L" ? s.guard.dL : s.guard.dR;
      const st = el.querySelector(".ds-state");
      st.textContent = closed ? "CERRADA 🔒" : "ABIERTA";
      el.classList.toggle("closed", closed);
      el.classList.toggle("open", !closed);
    }
  },

  renderTeam(s) {
    const chips = document.getElementById("team-chips");
    let html = "";
    for (const ch in s.anims) {
      const a = s.anims[ch];
      const loc = LOCS[a.n] ? LOCS[a.n].short : a.n;
      html += '<div class="tchip' + (ch === this.myChar ? " me" : "") + '" style="border-color:' + CHARS[ch].color + '">' +
        '<b>' + CHARS[ch].name + "</b> · " + loc + (a.running ? " 🏃" : "") + "</div>";
    }
    chips.innerHTML = html;
  },

  renderActions(me, s) {
    const c = CHARS[this.myChar];
    if (c.phaseOnly) {
      // fases
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
    if (atDoor) {
      const side = me.n === "ldoor" ? "L" : "R";
      const closed = side === "L" ? s.guard.dL : s.guard.dR;
      if (closed) {
        cap.disabled = true;
        capSub.textContent = "la puerta está CERRADA — ciérrala él nunca… ¡retírate!";
        cap.classList.remove("armed");
      } else {
        cap.disabled = false;
        cap.classList.add("armed");
        capSub.textContent = "¡la puerta está ABIERTA — ahora!";
      }
    } else {
      cap.disabled = true;
      cap.classList.remove("armed");
      capSub.textContent = "acércate a una puerta";
    }
  },

  /* ---------- Eventos ---------- */
  onEvent(m) {
    const mine = m.by === this.myChar;
    switch (m.e) {
      case "scare":
        if (mine) FX.toast("¡Susto enviado al guardia! 📵", 2400, "good");
        else FX.toast(CHARS[m.by].name + " ha usado su susto.", 2200);
        break;
      case "moved":
        if (mine) { AudioMan.play("steps", 0.8); }
        break;
      case "phase":
        if (mine) FX.toast("Fase " + m.ph + " alcanzada.", 1800, "good");
        break;
      case "foxyrun":
        FX.toast(mine ? "¡CARRERA INICIADA!" : "Foxy empieza a correr…", 2400, "warn");
        break;
      case "atdoor":
        if (mine) FX.toast("¡Estás EN la puerta! Pulsa CAPTURA si está abierta.", 3000, "good");
        break;
      case "blocked":
        if (mine) { FX.toast("¡La puerta se cerró a tiempo! Repliegue…", 3000, "bad"); AudioMan.play("door", 0.8); }
        else FX.toast("Captura bloqueada por el guardia.", 2400);
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
