/* ============================================================
   FNAF 1 MULTIJUGADOR — SIMULACIÓN (autoridad: HOST)
   Reloj, energía, validación de movimientos, Foxy (fases/carrera),
   habilidad de susto, capturas, condiciones de victoria.
   ============================================================ */
"use strict";

const Game = {
  phase: "lobby",           // lobby | playing | over
  players: {},              // pid -> {pid,name,char,connected}
  st: null,                 // estado de la partida (playing)
  variants: {},             // loc -> índice de variante visual
  guardInput: null,         // referencia al input local del guardia (host)
  tickTimer: null,
  snapTimer: null,

  rand(a, b) { return a + Math.random() * (b - a); },
  randi(a, b) { return Math.floor(this.rand(a, b + 1)); },

  /* ==================== LOBBY ==================== */
  addPlayer(pid, name) {
    this.players[pid] = { pid, name: (name || "Jugador").slice(0, 12), char: null, connected: true };
  },
  removePlayer(pid) { delete this.players[pid]; },

  pickChar(pid, charId) {
    const p = this.players[pid];
    if (!p || this.phase !== "lobby") return;
    // ¿libre?
    for (const q in this.players) {
      if (this.players[q].char === charId && +q !== pid) return; // ocupado
    }
    p.char = (p.char === charId) ? null : charId; // toggle
  },

  /* Asigna personajes automáticamente a quien no eligió, y arranca */
  startNight(onStart) {
    // roles: guardia = host (pid 1). Los demás: animatrónicos.
    const free = CHAR_ORDER.slice();
    const assigned = {};
    // 1º: respetar elecciones
    for (const pid in this.players) {
      const p = this.players[pid];
      if (+pid === 1) continue;
      if (p.char && free.includes(p.char)) {
        free.splice(free.indexOf(p.char), 1);
      }
    }
    // 2º: auto-asignar al resto
    for (const pid in this.players) {
      const p = this.players[pid];
      if (+pid === 1) continue;
      if (!p.char) {
        p.char = free.length ? free.shift() : null;
      }
    }
    // estado inicial
    this.st = {
      t: 0,
      power: 100,
      powerOut: false, powerOutAt: null, poJinglePlayed: false,
      guard: { dL: false, dR: false, liL: false, liR: false, mon: null, jamDoorsUntil: 0, camJamUntil: 0 },
      anims: {},
      stats: { moves: 0, blocked: 0, scares: 0, runs: 0 },
      over: null,
    };
    this.variants = {};
    for (const loc in CAM_VARIANTS) this.variants[loc] = this.randi(0, CAM_VARIANTS[loc].length - 1);

    for (const pid in this.players) {
      const p = this.players[pid];
      if (+pid === 1 || !p.char) continue;
      const c = CHARS[p.char];
      this.st.anims[p.char] = {
        pid: +pid, node: c.start,
        cd: 2 + this.rand(0, 3),          // pequeño cd inicial aleatorio
        phase: c.phaseOnly ? 1 : null,
        running: false, runStart: 0, runNode: null,
        walk: null,                       // caminata en curso {from,to,start,dur}
        doorAt: null,                     // instante (s.t) de llegada a una puerta de oficina
        stealthUntil: 0,                  // Bonnie: invisible en cámaras
        effUntil: 0,                      // fin del efecto de la habilidad (para el HUD)
        ab: { ready: false, nextAt: this.rand(CFG.ABILITY_FIRST_MIN, CFG.ABILITY_FIRST_MAX) },
        lastFrom: c.start,
      };
    }
    this.phase = "playing";
    if (onStart) onStart();
  },

  /* ==================== BUCLE ==================== */
  startLoops() {
    this.stopLoops();
    this.tickTimer = setInterval(() => this.tick(), CFG.TICK_MS);
    this.snapTimer = setInterval(() => this.broadcastSnapshot(), CFG.SNAPSHOT_MS);
  },
  stopLoops() {
    clearInterval(this.tickTimer); clearInterval(this.snapTimer);
    this.tickTimer = this.snapTimer = null;
  },

  ev(e, extra) {
    const msg = Object.assign({ t: "ev", e: e }, extra || {});
    Net.broadcast(msg);
    Net.emit("msg", msg); // el host también lo procesa (guardia local)
  },

  /* ------------------- TICK (10 Hz) ------------------- */
  tick() {
    if (this.phase !== "playing" || !this.st) return;
    const s = this.st;
    const dt = CFG.TICK_MS / 1000;
    s.t += dt;
    this.syncGuardInput(); // el input local del guardia (host) -> estado

    /* ---- 6 AM (gana el guardia) ---- */
    if (s.t >= CFG.NIGHT_SEC && !s.over) {
      this.finish("guard", null, "¡Amaneció! El guardia sobrevivió la noche.");
      this.ev("sixam");
      return;
    }

    /* ---- Energía ---- */
    if (!s.powerOut && !s.over) {
      let drain = CFG.POWER_BASE;
      if (s.guard.dL) drain += CFG.POWER_DOOR;
      if (s.guard.dR) drain += CFG.POWER_DOOR;
      if (s.guard.liL) drain += CFG.POWER_LIGHT;
      if (s.guard.liR) drain += CFG.POWER_LIGHT;
      if (s.guard.mon) drain += CFG.POWER_CAM;
      s.power = Math.max(0, s.power - drain * dt);
      if (s.power <= 0) {
        s.powerOut = true;
        s.guard.dL = s.guard.dR = false;      // las puertas se abren
        s.guard.liL = s.guard.liR = false;
        s.guard.mon = null;
        s.powerOutAt = s.t + this.rand(CFG.POWER_OUT_MIN, CFG.POWER_OUT_MAX);
        this.ev("powerout");
      }
    }

    /* ---- Ataque final tras el apagón ----
       SOLO animatrónicos con jugador: si hay un Freddy jugador,
       él ataca (clásico). Si no, ataca quien esté EN una puerta.
       Si no hay nadie, el guardia aguanta la oscuridad hasta las 6AM. */
    if (s.powerOut && s.powerOutAt !== null && s.t >= s.powerOutAt && !s.over) {
      let attacker = null;
      if (s.anims.freddy) attacker = "freddy";
      else {
        for (const ch in s.anims) {
          if (s.anims[ch].node === "ldoor" || s.anims[ch].node === "rdoor") { attacker = ch; break; }
        }
      }
      if (attacker) {
        this.finish("anims", attacker, "La energía se agotó... " + CHARS[attacker].name + " entró en la oscuridad.");
        this.ev("caught", { by: attacker, reason: "power" });
        return;
      }
      // nadie puede atacar: la noche continúa a oscuras hasta las 6AM
      s.powerOutAt = null;
    }

    /* ---- Habilidades: recarga fija por personaje ---- */
    for (const ch in s.anims) {
      const a = s.anims[ch];
      if (!a.ab.ready && s.t >= a.ab.nextAt && !s.over) {
        a.ab.ready = true; // disponible periódicamente durante la noche
      }
    }

    /* ---- Caminata: el movimiento se recorre A PIE ----
       Durante el tramo el animatrónico está "en tránsito"
       (no aparece en ninguna cámara); al llegar se hace efectivo. */
    if (!s.over) {
      for (const ch in s.anims) {
        const a = s.anims[ch];
        if (!a.walk) continue;
        if (s.t >= a.walk.start + a.walk.dur) {
          const to = a.walk.to;
          a.node = to;
          a.lastFrom = a.walk.from;
          a.walk = null;
          a.cd = s.t + CHARS[ch].cooldown;
          a.doorAt = isTerminal(to) ? s.t : null;
          this.ev("arrive", { by: ch, to: to, door: isTerminal(to) });
        }
      }
    }

    /* ---- Estancia máxima en la puerta de la oficina ----
       Si un animatrónico agota el tiempo en la puerta, se le
       FUERZA el repliegue CAMINANDO a la esquina del pasillo. */
    if (!s.over) {
      for (const ch in s.anims) {
        const a = s.anims[ch];
        const term = a.node === "ldoor" ? "L" : a.node === "rdoor" ? "R" : null;
        if (term && !a.walk && a.doorAt !== null && s.t - a.doorAt >= CFG.DOOR_STAY_SEC) {
          if (CHARS[ch].phaseOnly) {
            // Foxy: vuelve de un salto a la Cala Pirata a empezar de nuevo
            a.node = "cove"; a.phase = 1; a.cd = s.t + CFG.FOXY_PHASE_CD + 3;
            a.doorAt = null;
          } else {
            const back = term === "L" ? "westcorner" : "eastcorner";
            a.walk = { from: a.node, to: back, start: s.t, dur: walkDur(a.node, back) };
            a.doorAt = null;
          }
          this.ev("retreat", { by: ch });
        }
      }
    }

    /* ---- Carrera de Foxy ---- */
    const fx = s.anims.foxy;
    if (fx && fx.running && !s.over) {
      const prog = (s.t - fx.runStart) / CFG.FOXY_RUN_SEC;
      // nodo intermedio visible en cámaras
      if (prog < 0.55) fx.node = "westhall";
      else if (prog < 1) fx.node = "westcorner";
      if (s.t - fx.runStart >= CFG.FOXY_RUN_SEC) {
        fx.running = false;
        if (s.guard.dL) {
          // puerta cerrada a tiempo: golpes y repliegue
          s.power = Math.max(0, s.power - CFG.FOXY_BANG_PENALTY);
          fx.node = "cove"; fx.phase = 1; fx.cd = CFG.FOXY_PHASE_CD + 3;
          fx.doorAt = null;
          s.stats.runs++;
          this.ev("bang");
        } else {
          fx.node = "ldoor"; // ¡a la puerta! captura disponible
          fx.doorAt = s.t;   // el temporizador de estancia empieza a correr
          this.ev("atdoor", { by: "foxy" });
        }
      }
    }
  },

  /* ------------------- MENSAJES DE CLIENTES ------------------- */
  onClientMsg(m) {
    if (this.phase !== "playing" || !this.st) {
      if (m.t === "lobbyReady") {} // nada
      return;
    }
    const s = this.st;
    const pid = m._pid;
    const p = this.players[pid];
    if (!p || !p.connected) return;
    const charId = p.char;
    const a = charId ? s.anims[charId] : null;

    switch (m.t) {
      case "move": { // inicia la CAMINATA hacia la sala adyacente
        if (!a || s.over) return;
        const to = m.to;
        if (!LOCS[to]) return;
        if (a.cd > s.t) return;                        // cooldown
        if (a.walk) return;                            // ya está caminando
        if (CHARS[charId].phaseOnly) return;            // Foxy usa fases, no nodos
        if (!ADJ[a.node] || !ADJ[a.node].includes(to)) return;   // adyacencia
        if (!canGoTo(charId, to)) return;               // lado permitido
        a.walk = { from: a.node, to: to, start: s.t, dur: walkDur(a.node, to) };
        a.doorAt = null;                                // sale de la puerta si estaba
        s.stats.moves++;
        this.ev("walk", { by: charId, from: a.walk.from, to: to, dur: a.walk.dur });
        return;
      }
      case "phase": { // Foxy avanza de fase
        if (!a || s.over || !CHARS[charId].phaseOnly) return;
        if (a.phase >= 3 || a.running) return;
        if (a.cd > s.t) return;
        // si el guardia está mirando la Cala Pirata, Foxy no avanza
        if (s.guard.mon === "cove") {
          Net.to(pid, { t: "deny", msg: "¡El guardia te está mirando! (CAM 1C)" });
          return;
        }
        a.phase++;
        a.cd = s.t + CFG.FOXY_PHASE_CD;
        this.ev("phase", { by: "foxy", ph: a.phase });
        return;
      }
      case "run": { // Foxy inicia la carrera
        if (!a || s.over || !CHARS[charId].phaseOnly) return;
        if (a.phase !== 3 || a.running) return;
        a.running = true;
        a.runStart = s.t;
        a.node = "westhall"; // sale de la cala
        this.ev("foxyrun", { by: "foxy" });
        return;
      }
      case "ability": { // habilidad especial única por animatrónico
        if (!a || s.over) return;
        if (!a.ab.ready) return;
        const ab = ABILITIES[charId];
        if (!ab || ab.id === "run") return;            // Foxy: su habilidad es la carrera
        a.ab.ready = false;
        a.ab.nextAt = s.t + ab.cd;                      // recarga fija
        a.effUntil = s.t + ab.dur;
        s.stats.scares++;
        if (ab.id === "laugh") {
          s.guard.jamDoorsUntil = s.t + ab.dur;         // el guardia no puede usar puertas/luces
          this.ev("laugh", { by: charId, dur: ab.dur });
        } else if (ab.id === "stealth") {
          a.stealthUntil = s.t + ab.dur;                // invisible en cámaras
          this.ev("stealth", { by: charId, dur: ab.dur });
        } else if (ab.id === "jam") {
          s.guard.camJamUntil = s.t + ab.dur;           // estática total en el monitor
          this.ev("jam", { by: charId, dur: ab.dur });
        }
        return;
      }
      case "capture": { // acción final de captura en la puerta
        if (!a || s.over) return;
        if (a.walk) return;                            // caminando no se puede capturar
        const term = a.node === "ldoor" ? "L" : a.node === "rdoor" ? "R" : null;
        if (!term) return;
        const doorClosed = term === "L" ? s.guard.dL : s.guard.dR;
        if (doorClosed) {
          // el guardia cerró a tiempo: captura bloqueada, repliegue CAMINANDO
          if (CHARS[charId].phaseOnly) {
            a.node = "cove"; a.phase = 1; a.cd = s.t + CFG.FOXY_PHASE_CD + 3;
          } else {
            const back = term === "L" ? "westcorner" : "eastcorner";
            a.walk = { from: a.node, to: back, start: s.t, dur: walkDur(a.node, back) };
          }
          a.doorAt = null;
          s.stats.blocked++;
          this.ev("blocked", { by: charId });
        } else {
          this.finish("anims", charId, "La puerta de la oficina estaba abierta…");
          this.ev("caught", { by: charId, reason: "capture" });
        }
        return;
      }
      /* Guardia (por si el guardia fuese cliente en el futuro) */
      case "gset": {
        if (pid !== 1) return;
        if (m.k === "dL") s.guard.dL = m.v;
        if (m.k === "dR") s.guard.dR = m.v;
        if (m.k === "liL") s.guard.liL = m.v;
        if (m.k === "liR") s.guard.liR = m.v;
        if (m.k === "mon") s.guard.mon = m.v;
        return;
      }
    }
  },

  /* Sincroniza el input local del guardia (host) al estado */
  syncGuardInput() {
    if (!this.st || !this.guardInput) return;
    const g = this.st.guard;
    g.dL = !!this.guardInput.doors.L;
    g.dR = !!this.guardInput.doors.R;
    g.liL = !!this.guardInput.lights.L;
    g.liR = !!this.guardInput.lights.R;
    g.mon = this.guardInput.monitor || null;
  },

  /* ------------------- FIN DE PARTIDA ------------------- */
  finish(winner, byChar, reason) {
    if (this.st.over) return;
    this.st.over = { winner, by: byChar, reason, t: this.st.t, power: Math.round(this.st.power) };
    this.phase = "over";
    this.stopLoops();
    this.broadcastSnapshot();
  },

  abort(reason) {
    if (this.phase === "playing") {
      this.st.over = { winner: null, by: null, reason: reason, t: this.st.t, power: Math.round(this.st.power) };
      this.phase = "over";
    }
    this.stopLoops();
    this.ev("aborted", { reason });
    this.broadcastSnapshot();
  },

  /* ------------------- SNAPSHOT (5 Hz) ------------------- */
  snapshot() {
    if (!this.st) return null;
    const s = this.st;
    const anims = {};
    for (const ch in s.anims) {
      const a = s.anims[ch];
      anims[ch] = {
        n: a.node,
        cd: Math.max(0, +(a.cd - s.t).toFixed(1)),
        abR: a.ab.ready ? 0 : Math.max(0, +(a.ab.nextAt - s.t).toFixed(0)),
        abA: Math.max(0, +(a.effUntil - s.t).toFixed(1)),   // habilidad activa (s restantes)
        st: !!(a.stealthUntil && s.t < a.stealthUntil),     // sigilo activo (Bonnie)
        w: a.walk ? {
            from: a.walk.from, to: a.walk.to, dur: +a.walk.dur.toFixed(1),
            p: Math.min(1, +((s.t - a.walk.start) / a.walk.dur).toFixed(2)),
          } : null,
        running: a.running,
        phase: a.phase,
        dT: (a.node === "ldoor" || a.node === "rdoor") && !a.walk && a.doorAt !== null
              ? Math.max(0, +(CFG.DOOR_STAY_SEC - (s.t - a.doorAt)).toFixed(1))
              : null,
      };
    }
    return {
      t: "snap",
      s: {
        t: +s.t.toFixed(1),
        ph: this.phase,
        power: +s.power.toFixed(1),
        po: s.powerOut,
        guard: {
          dL: s.guard.dL, dR: s.guard.dR,
          liL: s.guard.liL, liR: s.guard.liR,
          mon: s.guard.mon,
          jamDoorsMs: Math.max(0, +((s.guard.jamDoorsUntil || 0) - s.t).toFixed(1)) * 1000,
          camJamMs:  Math.max(0, +((s.guard.camJamUntil  || 0) - s.t).toFixed(1)) * 1000,
        },
        anims: anims,
        stats: s.stats,
        over: s.over,
      },
    };
  },

  broadcastSnapshot() {
    const snap = this.snapshot();
    if (!snap) return;
    Net.broadcast(snap);
    Net.emit("msg", snap); // host local
  },
};
