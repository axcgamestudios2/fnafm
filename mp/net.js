// ============================================================
// FNAF 1 MULTIJUGADOR — Capa de red (Peer.js)
// Arquitectura estrella: el GUARDIA es el host y relay autoritativo.
// IDs de peer: lobby => fnafml-<CODE>   |   juego => fnafmg-<CODE>
// ============================================================

const MP = (function () {
    const LOBBY_PREFIX = 'fnafml-';
    const GAME_PREFIX = 'fnafmg-';

    function makeCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let s = '';
        for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
        return s;
    }

    // ---------- HOST (guardia) ----------
    function Host() {
        this.peer = null;
        this.conns = [];        // [{conn, name, role}]
        this.handlers = {};
        this.open = false;
    }
    Host.prototype.start = function (code, onReady, onClient) {
        const self = this;
        this.code = code;
        this.peer = new Peer(GAME_PREFIX + code, { debug: 0 });
        this.peer.on('open', function (id) {
            self.open = true;
            if (onReady) onReady(id);
        });
        this.peer.on('connection', function (conn) {
            conn.on('open', function () { });
            conn.on('data', function (d) {
                const parsed = (typeof d === 'string') ? JSON.parse(d) : d;
                if (parsed.t === '__join') {
                    const entry = { conn, name: parsed.name, role: parsed.role };
                    self.conns.push(entry);
                    conn.__mpEntry = entry;
                    if (onClient) onClient(entry);
                } else if (self.handlers[parsed.t]) {
                    const entry = conn.__mpEntry || { conn, name: '?', role: '?' };
                    self.handlers[parsed.t].forEach(h => h(parsed, entry));
                }
            });
            conn.on('close', function () {
                const entry = conn.__mpEntry;
                self.conns = self.conns.filter(c => c.conn !== conn);
                if (self.handlers.__disconnect) self.handlers.__disconnect.forEach(h => h(entry));
            });
        });
        this.peer.on('error', function (err) {
            if (self.handlers.__error) self.handlers.__error.forEach(h => h(err));
        });
    };
    Host.prototype.on = function (type, fn) {
        (this.handlers[type] = this.handlers[type] || []).push(fn);
    };
    Host.prototype.send = function (entry, msg) {
        try { if (entry.conn.open) entry.conn.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch (e) { }
    };
    Host.prototype.broadcast = function (msg) {
        const s = JSON.stringify(msg);
        this.conns.forEach(c => { try { if (c.conn.open) c.conn.send(s); } catch (e) { } });
    };
    Host.prototype.destroy = function () { try { this.peer.destroy(); } catch (e) { } };

    // ---------- CLIENTE (animatrónicos) ----------
    function Client() {
        this.peer = null;
        this.conn = null;
        this.handlers = {};
        this.open = false;
    }
    Client.prototype.connect = function (code, name, role, onReady, onFail) {
        const self = this;
        this.code = code;
        let attempts = 0;
        let cancelled = false;
        this.cancel = function () { cancelled = true; try { if (self.peer) self.peer.destroy(); } catch (e) { } };

        function tryConnect() {
            if (cancelled) return;
            attempts++;
            if (attempts > 150) { if (onFail) onFail('sin-conexion'); return; }
            const peer = new Peer(null, { debug: 0 });
            self.peer = peer;
            peer.on('open', function () {
                const conn = peer.connect(GAME_PREFIX + code, { reliable: true });
                self.conn = conn;
                conn.on('open', function () {
                    self.open = true;
                    conn.send(JSON.stringify({ t: '__join', name: name, role: role }));
                    if (onReady) onReady();
                });
                conn.on('data', function (d) {
                    const parsed = (typeof d === 'string') ? JSON.parse(d) : d;
                    if (self.handlers[parsed.t]) self.handlers[parsed.t].forEach(h => h(parsed));
                    if (self.handlers.__any) self.handlers.__any.forEach(h => h(parsed));
                });
                conn.on('close', function () {
                    self.open = false;
                    if (self.handlers.__disconnect) self.handlers.__disconnect.forEach(h => h());
                    if (!cancelled) setTimeout(tryConnect, 1500);
                });
                conn.on('error', function () { if (!cancelled) setTimeout(tryConnect, 1500); });
            });
            peer.on('error', function (err) {
                if (err.type === 'peer-unavailable') {
                    try { peer.destroy(); } catch (e) { }
                    setTimeout(tryConnect, 2500);
                } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
                    try { peer.destroy(); } catch (e) { }
                    setTimeout(tryConnect, 3000);
                }
            });
        }
        tryConnect();
    };
    Client.prototype.on = function (type, fn) {
        (this.handlers[type] = this.handlers[type] || []).push(fn);
    };
    Client.prototype.send = function (msg) {
        try { if (this.conn && this.conn.open) this.conn.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); } catch (e) { }
    };
    Client.prototype.destroy = function () { try { this.cancel && this.cancel(); this.peer && this.peer.destroy(); } catch (e) { } };

    // ---------- LOBBY ----------
    function lobbyHost(code) { return new Peer(LOBBY_PREFIX + code, { debug: 0 }); }
    function lobbyConnect(code) { return new Peer(null, { debug: 0 }); }

    return { makeCode, Host, Client, lobbyHost, lobbyConnect, GAME_PREFIX, LOBBY_PREFIX };
})();
