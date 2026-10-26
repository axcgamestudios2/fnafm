/* ============================================================
   FNAF 1 MULTIJUGADOR — APP PRINCIPAL
   Menú, flujo host/cliente, routing de mensajes, fin de partida.
   ============================================================ */
"use strict";

const App = {
  myName: "Jugador",
  snap: null,
  role: null,          // 'guard' | 'anim'
  myChar: null,
  gameOverMsg: false,
  gameVariants: {},
  menuMusic: null,

  /* ==================== ARRANQUE ==================== */
  init() {
    // nombre persistente
    const saved = localStorage.getItem("fnafm-name");
    if (saved) document.getElementById("inp-name").value = saved;
    this.myName = saved || "Jugador";

    document.getElementById("btn-create").onclick = () => {
      AudioMan.unlock();
      const n = this.readName();
      localStorage.setItem("fnafm-name", n);
      this.stopMenuMusic();
      this.role = "guard";
      Lobby.hostFlow();
    };
    document.getElementById("btn-join").onclick = () => {
      AudioMan.unlock();
      const code = (document.getElementById("inp-code").value || "").trim().toUpperCase();
      if (code.length < 4) { FX.toast("Introduce un código de sala válido (4-5 caracteres).", 2400, "bad"); return; }
      const n = this.readName();
      localStorage.setItem("fnafm-name", n);
      this.stopMenuMusic();
      this.role = "anim";
      Lobby.joinFlow(code);
    };
    document.getElementById("btn-start").onclick = () => this.hostStartNight();
    document.getElementById("btn-again").onclick = () => this.againFlow();
    document.getElementById("btn-exit").onclick = () => location.reload();

    // música de menú al primer gesto
    const kick = () => {
      AudioMan.unlock();
      if (!this.menuMusic && UI.current === "s-menu") {
        this.menuMusic = playMenuMusic();
        this.menuMusic.play().catch(() => {});
      }
    };
    document.addEventListener("pointerdown", kick, { once: true });
    document.addEventListener("keydown", kick, { once: true });

    // teclas del guardia
    document.addEventListener("keydown", (e) => this.onKey(e, true));
    document.addEventListener("keyup", (e) => this.onKey(e, false));

    // routing de red
    Net.on("msg", (m) => this.onNetMsg(m));
    Net.on("join", (j) => {
      if (this.role === "guard") { // host
        Game.addPlayer(j.pid, j.name);
        FX.toast(esc(j.name) + " se unió a la sala.", 2400);
        this.broadcastLobby();
      }
    });
    Net.on("leave", (pid) => {
      if (this.role !== "guard") return;
      const p = Game.players[pid];
      if (!p) return;
      p.connected = false;
      FX.toast(esc(p.name) + " se desconectó.", 2400, "bad");
      // retirar su personaje de la partida
      if (Game.st && Game.st.anims && p.char) delete Game.st.anims[p.char];
      const anyAnim = Object.values(Game.players).some(q => q.connected && +q.pid !== 1);
      if (Game.phase === "playing" && !anyAnim) {
        Game.abort("Se quedaron sin animatrónicos… partida cancelada.");
      } else if (Game.phase === "lobby") {
        this.broadcastLobby();
      }
    });
    Net.on("hostlost", () => {
      FX.toast("Se perdió la conexión con el anfitrión.", 3000, "bad");
      setTimeout(() => location.reload(), 1800);
    });

    UI.show("s-menu");
  },

  readName() {
    this.myName = (document.getElementById("inp-name").value || "Jugador").slice(0, 12) || "Jugador";
    return this.myName;
  },

  stopMenuMusic() {
    if (this.menuMusic) { this.menuMusic.pause(); this.menuMusic = null; }
  },

  backToMenu(msg) {
    Net.close();
    Game.phase = "lobby"; Game.st = null;
    this.snap = null; this.role = null; this.myChar = null;
    UI.show("s-menu");
    if (msg) FX.toast(msg, 3000, "bad");
  },

  /* ==================== HOST: empezar noche ==================== */
  checkStart() {
    const btn = document.getElementById("btn-start");
    if (!Net.isHost) return;
    const others = Object.values(Game.players).filter(p => +p.pid !== 1 && p.connected).length;
    btn.disabled = !(others >= 1); // host(guardia) + ≥1 animatrónico
    document.getElementById("start-note").textContent =
      others >= 1 ? "Listo para empezar. ¡Buenas noches!" : "Esperando jugadores (mín. 1 animatrónico)…";
  },

  hostStartNight() {
    if (Game.phase === "playing") return;
    Game.startNight();
    // host = guardia
    Game.guardInput = Guard.input;
    App.gameVariants = Game.variants;
    Game.startLoops();
    this.broadcastStart();
    this.enterGame("guard", null);
    FX.toast("La noche ha comenzado. ¡Sobrevive hasta las 6 AM!", 3400);
  },

  broadcastStart() {
    const chars = {};
    for (const pid in Game.players) chars[pid] = Game.players[pid].char;
    Net.broadcast({ t: "start", chars: chars, guardPid: 1, variants: Game.variants });
  },

  broadcastLobby() {
    const players = Object.values(Game.players).map(p => ({
      pid: p.pid, name: p.name, char: p.char, connected: p.connected,
    }));
    Net.broadcast({ t: "lobby", players: players, code: Net.roomCode });
    // host local también
    Lobby.renderPlayers();
    Lobby.refreshCharStates();
  },

  /* ==================== ENTRAR EN PARTIDA ==================== */
  enterGame(role, charId) {
    this.role = role;
    this.myChar = charId;
    this.gameOverMsg = false;
    this.snap = null;
    if (role === "guard") Guard.enter();
    else Anim.enter(charId);
  },

  /* ==================== ROUTING ==================== */
  onNetMsg(m) {
    if (!m || !m.t) return;
    switch (m.t) {
      case "welcome": {
        Net.myId = m.pid;
        break;
      }
      case "err": {
        FX.toast(m.msg, 3000, "bad");
        if (m.code === "full") setTimeout(() => location.reload(), 1500);
        break;
      }
      case "lobby": {
        if (Game.phase === "playing") break; // ignorar durante partida
        Game.players = {};
        for (const p of m.players) {
          Game.players[p.pid] = { pid: p.pid, name: p.name, char: p.char, connected: p.connected };
        }
        Lobby.renderPlayers();
        Lobby.refreshCharStates();
        break;
      }
      case "start": {
        this.gameVariants = m.variants || {};
        const myChar = m.chars[Net.myId];
        this.enterGame("anim", myChar);
        FX.toast("La noche ha comenzado. ¡Caza antes de las 6 AM!", 3400);
        break;
      }
      case "snap": {
        this.applySnap(m.s);
        break;
      }
      case "ev": {
        this.applyEvent(m);
        break;
      }
      case "deny": {
        if (this.role === "anim") Anim.onEvent({ e: "deny", msg: m.msg });
        break;
      }
      case "pick": {
        if (Net.isHost) {
          Game.pickChar(m._pid, m.char);
          this.broadcastLobby();
        }
        break;
      }
      case "relobby": {
        this.snap = null;
        this.gameOverMsg = false;
        Game.phase = "lobby";
        UI.show("s-lobby");
        Lobby.show();
        setStatus("El anfitrión puede empezar otra noche.");
        break;
      }
      default: {
        if (Net.isHost) Game.onClientMsg(m);
      }
    }
  },

  applySnap(s) {
    if (!s) return;
    this.snap = s;
    if (s.ph === "over" && !this.gameOverMsg) { this.triggerEnd(s.over, s); return; }
    if (this.gameOverMsg) return;
    if (this.role === "guard") Guard.onSnap(s);
    else if (this.role === "anim") Anim.onSnap(s);
  },

  applyEvent(m) {
    if (this.role === "guard") Guard.onEvent(m);
    else if (this.role === "anim") Anim.onEvent(m);
    if (m.e === "sixam" && !this.gameOverMsg) { /* el snap 'over' lo mostrará */ }
  },

  /* ==================== FIN DE PARTIDA ==================== */
  triggerEnd(over, s) {
    if (this.gameOverMsg || !over) return;
    this.gameOverMsg = true;
    const iWon = (this.role === "guard" && over.winner === "guard") ||
                 (this.role === "anim" && over.winner === "anims" && over.by === this.myChar);
    const guardLost = this.role === "guard" && over.winner === "anims";

    const showScreen = () => {
      if (this.role === "guard") { Guard.forceMonitorDown(); Guard.exit(); }
      document.getElementById("powerout-fx").classList.remove("active");
      UI.show("s-end");
      const title = document.getElementById("end-title");
      const sub = document.getElementById("end-sub");
      const stats = document.getElementById("end-stats");
      if (over.winner === "guard") {
        title.textContent = "¡6:00 AM!";
        title.className = "win";
        sub.textContent = "El guardia sobrevivió la noche. " + (over.reason || "");
        AudioMan.play("sixam", 0.9);
        setTimeout(() => AudioMan.play("yay", 0.9), 2600);
      } else if (over.winner === "anims") {
        const c = over.by ? CHARS[over.by] : null;
        title.textContent = "¡CAPTURADO!";
        title.className = "lose";
        sub.textContent = (c ? c.fullName : "Un animatrónico") + " entró en la oficina. " + (over.reason || "");
      } else {
        title.textContent = "PARTIDA CANCELADA";
        title.className = "lose";
        sub.textContent = over.reason || "";
      }
      const st = s ? s.stats : null;
      stats.innerHTML =
        "<b>Sobreviviste hasta:</b> " + fmtClock(s ? s.t : 0) + " · " +
        Math.round((s ? s.t : 0) / CFG.NIGHT_SEC * 100) + "% de la noche<br>" +
        "<b>Energía restante:</b> " + (over.power != null ? over.power : "—") + "%<br>" +
        (st ? "<b>Movimientos:</b> " + st.moves + " · <b>Sustos:</b> " + st.scares +
              " · <b>Corridas de Foxy:</b> " + st.runs + " · <b>Capturas bloqueadas:</b> " + st.blocked : "");
      document.getElementById("end-img").src = over.winner === "guard" ? IMG("sixam") : IMG("gameover" + (1 + Math.floor(Math.random() * 3)));
      // botones
      document.getElementById("btn-again").style.display = Net.isHost ? "" : "none";
      document.getElementById("wait-host").style.display = Net.isHost ? "none" : "";
    };

    if (guardLost) {
      // jumpscare letal y luego pantalla
      const byChar = over.by || "freddy";
      FX.lethalScare(byChar, showScreen);
    } else {
      showScreen();
    }
  },

  againFlow() {
    if (!Net.isHost) return;
    Game.phase = "lobby";
    Game.st = null;
    this.snap = null;
    this.gameOverMsg = false;
    if (this.role === "guard") Guard.exit();
    Net.broadcast({ t: "relobby" });
    UI.show("s-lobby");
    Lobby.show();
    setStatus("Nueva noche: pulsa EMPEZAR.");
    this.broadcastLobby();
  },

  /* ==================== TEclas del guardia ==================== */
  onKey(e, down) {
    if (this.role !== "guard" || this.gameOverMsg) return;
    const k = e.key.toLowerCase();
    if (k === " " || e.code === "Space") { e.preventDefault(); if (down) Guard.toggleMonitor(); return; }
    if (down) {
      if (k === "a") Guard.toggleDoor("L");
      if (k === "d") Guard.toggleDoor("R");
      if (k === "z") Guard.lightOn("L");
      if (k === "x") Guard.lightOn("R");
    } else {
      if (k === "z") Guard.lightOff("L");
      if (k === "x") Guard.lightOff("R");
    }
  },
};

/* ==================== UI ==================== */
const UI = {
  current: null,
  show(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const el = document.getElementById(id);
    if (el) el.classList.add("active");
    this.current = id;
  },
};

window.addEventListener("load", () => App.init());
