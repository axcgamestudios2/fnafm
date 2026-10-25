/* ============================================================
   FNAF 1 MULTIJUGADOR — CAPA DE RED (Peer.js)
   Topología estrella: el Host (guardia) es la autoridad.
   Jugadores 2-5 se conectan vía código de sala (WebRTC).
   ============================================================ */
"use strict";

const Net = {
  peer: null,
  isHost: false,
  roomCode: null,
  myId: null,             // id de jugador asignado por el host (para clientes)
  conns: new Map(),       // host: playerId -> DataConnection
  hostConn: null,         // cliente: conexión al host
  handlers: {},
  nextId: 2, // los pid de clientes empiezan en 2 (el host es 1)

  on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); },
  emit(type, data) { (this.handlers[type] || []).forEach(f => f(data)); },

  /* ---------- Utilidades ---------- */
  randCode(n = 5) {
    const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin caracteres ambiguos
    let s = "";
    for (let i = 0; i < n; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  },

  roomPeerId(code) { return CFG.PEER_PREFIX + code.toUpperCase(); },

  /* ---------- HOST: crear sala ---------- */
  hostRoom(code, onReady, onFail) {
    this.isHost = true;
    this.roomCode = code.toUpperCase();
    this.myId = 1;
    this.nextId = 2; // el host es pid 1; clientes desde 2
    const peer = new Peer(this.roomPeerId(this.roomCode), { debug: 1 });
    this.peer = peer;
    peer.on("open", () => onReady(this.roomCode));
    peer.on("error", (err) => {
      if (err.type === "unavailable-id") onFail("Ese código ya existe en el mundo. Prueba otro.");
      else if (err.type === "peer-unavailable") { /* destino no encontrado */ }
      else onFail("Error de red: " + err.type);
    });
    peer.on("connection", (conn) => {
      conn.on("open", () => {
        // esperar primer mensaje 'hello' para registrar
      });
      conn.on("data", (raw) => {
        let m; try { m = JSON.parse(raw); } catch (e) { return; }
        if (m.t === "hello") {
          // límites de sala
          const current = this.conns.size;
          if (current >= CFG.MAX_PLAYERS - 1) {
            this.sendTo(conn, { t: "err", code: "full", msg: "La sala está llena (5/5)." });
            setTimeout(() => conn.close(), 400);
            return;
          }
          const pid = this.nextId++;
          conn._pid = pid;
          this.conns.set(pid, conn);
          this.sendTo(conn, { t: "welcome", pid: pid, code: this.roomCode });
          this.emit("join", { pid, name: m.name, conn });
        } else if (conn._pid) {
          m._pid = conn._pid;
          this.emit("msg", m);
        }
      });
      conn.on("close", () => {
        if (conn._pid) {
          this.conns.delete(conn._pid);
          this.emit("leave", conn._pid);
        }
      });
    });
  },

  /* ---------- CLIENTE: unirse ---------- */
  joinRoom(code, name, onReady, onFail) {
    this.isHost = false;
    this.roomCode = code.toUpperCase();
    const peer = new Peer({ debug: 1 });
    this.peer = peer;
    let failed = false;
    const fail = (msg) => { if (!failed) { failed = true; onFail(msg); try { peer.destroy(); } catch (e) {} } };
    peer.on("open", () => {
      const conn = peer.connect(this.roomPeerId(this.roomCode), { reliable: true });
      this.hostConn = conn;
      const to = setTimeout(() => fail("No se encontró la sala " + this.roomCode + ". ¿Es correcto el código?"), 12000);
      conn.on("open", () => {
        clearTimeout(to);
        this.sendTo(conn, { t: "hello", name: name });
        onReady();
      });
      conn.on("data", (raw) => {
        let m; try { m = JSON.parse(raw); } catch (e) { return; }
        this.emit("msg", m);
      });
      conn.on("close", () => {
        if (!failed) this.emit("hostlost");
      });
    });
    peer.on("error", (err) => {
      if (err.type === "peer-unavailable") fail("No se encontró la sala " + this.roomCode + ".");
      else fail("Error de red: " + err.type);
    });
  },

  /* ---------- Envío ---------- */
  sendTo(conn, obj) { try { if (conn.open) conn.send(JSON.stringify(obj)); } catch (e) {} },

  /* Host -> un jugador */
  to(pid, obj) {
    const c = this.conns.get(pid);
    if (c) this.sendTo(c, obj);
  },

  /* Host -> todos */
  broadcast(obj) {
    for (const [pid, c] of this.conns) this.sendTo(c, obj);
  },

  /* Host + broadcast (incluye efectos locales del propio host) */
  broadcastAll(obj) { this.broadcast(obj); this.emit("msg", obj); },

  /* Cliente -> host */
  toHost(obj) {
    if (this.hostConn) this.sendTo(this.hostConn, obj);
    if (this.isHost) this.emit("msg", Object.assign({ _pid: this.myId }, obj)); // loopback host
  },

  close() {
    try { if (this.peer) this.peer.destroy(); } catch (e) {}
    this.peer = null; this.conns.clear(); this.hostConn = null;
    this.nextId = 2;
  },
};
