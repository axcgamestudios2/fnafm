// ============================================================
// FNAF 1 MULTIJUGADOR — Capa de red (Peer.js)
// Arquitectura estrella: el GUARDIA es el host y relay autoritativo.
// IDs de peer: lobby => fnafml-<CODE>   |   juego => fnafmg-<CODE>
// ============================================================

const MP = (function () {
    const LOBBY_PREFIX = 'fnafml-';
    const GAME_PREFIX = 'fnafmg-';
    // Vigilante por intento (ms): cubre el cuelgue SILENCIOSO de PeerJS
    // (broker que no responde, ICE sin contestación) que antes dejaba el
    // "Conectando..." eterno. Se puede acortar en pruebas: MP.WATCHDOG = 3000
    const WATCHDOG = 12000;

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
        this.__stop = false;
        let spinN = 0;

        // Giro con reintentos: si el broker no da id (lentitud, "unavailable-id"
        // por un registro viejo tras recargar), se reintenta con el MISMO código
        function spin() {
            if (self.__stop) return;
            spinN++;
            const peer = new Peer(GAME_PREFIX + code, { debug: 0 });
            self.peer = peer;
            let opened = false;
            let watchdog = null;

            function retry(delay) {
                if (opened || self.__stop) return;
                clearTimeout(watchdog);
                try { peer.destroy(); } catch (e) { }
                if (spinN >= 5) {
                    if (self.handlers.__error) self.handlers.__error.forEach(h => h({ type: 'host-sin-servidor' }));
                    return;
                }
                setTimeout(spin, delay || 2000);
            }

            watchdog = setTimeout(retry, (typeof MP !== 'undefined' && MP.WATCHDOG) || WATCHDOG);

            peer.on('open', function (id) {
                opened = true;
                clearTimeout(watchdog);
                self.open = true;
                if (onReady) onReady(id);
            });
            peer.on('connection', function (conn) {
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
            peer.on('disconnected', function () {
                // el broker cortó el socket: re-registrar el MISMO id para
                // que los clientes puedan seguir entrando
                if (opened && !self.__stop) { try { peer.reconnect(); } catch (e) { } }
            });
            peer.on('error', function (err) {
                if (self.handlers.__error) self.handlers.__error.forEach(h => h(err));
                if (!opened) {
                    // 'unavailable-id': registro viejo del mismo código aún vivo
                    // en el servidor (p. ej. recarga del guardia) → esperar más
                    retry(err && err.type === 'unavailable-id' ? 4000 : 2000);
                }
            });
        }
        spin();
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
    Host.prototype.destroy = function () {
        this.__stop = true;
        try { this.peer.destroy(); } catch (e) { }
    };

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

            let ok = false;        // canal abierto en este intento
            let dead = false;      // intento descartado
            let watchdog = null;
            const peer = new Peer(null, { debug: 0 });
            self.peer = peer;

            function retry(delay) {
                if (ok || dead || cancelled) return;
                dead = true;
                clearTimeout(watchdog);
                try { peer.destroy(); } catch (e) { }
                setTimeout(tryConnect, delay || 2000);
            }

            // VIGILANTE: si en 12s no se abrió el canal, enterrar el intento
            // y reintentar limpio (antes: "Conectando..." eterno sin error)
            watchdog = setTimeout(function () { retry(1500); }, (typeof MP !== 'undefined' && MP.WATCHDOG) || WATCHDOG);

            peer.on('open', function () {
                if (dead) return;
                const conn = peer.connect(GAME_PREFIX + code, { reliable: true });
                self.conn = conn;
                conn.on('open', function () {
                    if (dead) return;
                    ok = true;
                    clearTimeout(watchdog);
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
                    // reconexión: enterrar ESTE intento (antes el peer viejo
                    // quedaba vivo y se acumulaban) y volver a empezar
                    if (!cancelled && !dead) {
                        dead = true;
                        clearTimeout(watchdog);
                        try { peer.destroy(); } catch (e) { }
                        setTimeout(tryConnect, 1500);
                    }
                });
                conn.on('error', function () { if (!ok) retry(1500); });
            });
            peer.on('disconnected', function () {
                // el broker cortó el socket: intentar re-registrar; si no
                // se recupera, el vigilante entierra el intento
                if (!ok && !dead) { try { peer.reconnect(); } catch (e) { } }
            });
            peer.on('error', function (err) {
                if (ok) return;
                const t = (err && err.type) || '?';
                if (t === 'peer-unavailable') retry(2500);
                else if (t === 'network' || t === 'server-error' || t === 'socket-error' ||
                    t === 'socket-closed' || t === 'socket-timeout') retry(3000);
                else retry(2500);   // CUALQUIER otro error también reintenta
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

    return { makeCode, Host, Client, lobbyHost, lobbyConnect, GAME_PREFIX, LOBBY_PREFIX, WATCHDOG };
})();
