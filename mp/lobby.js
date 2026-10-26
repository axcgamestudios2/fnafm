// ============================================================
// FNAF 1 MP — Lobby: crear / unirse / roles ALEATORIOS
// - El creador de la partida es SIEMPRE el GUARDIA (obligatorio).
// - Los que se unen reciben un animatrónico ALEATORIO
//   (FOXY, BONNIE, CHICA o FREDDY) asignado automáticamente.
// - Sin selector de personaje.
// - Roles sin jugador quedan controlados por la IA original.
// - Creación robusta: feedback inmediato, timeout y reintentos
//   con código nuevo si el servidor de red falla.
// ============================================================

(function () {
    const ROLES = [
        { id: 'guard', name: 'GUARDIA', img: 'assets/roles/guard.png', color: '#7ec8ff' },
        { id: 'foxy', name: 'FOXY', img: 'assets/roles/foxy.png', color: '#ff7043' },
        { id: 'bonnie', name: 'BONNIE', img: 'assets/roles/bonnie.png', color: '#a98bff' },
        { id: 'chica', name: 'CHICA', img: 'assets/roles/chica.png', color: '#ffd54d' },
        { id: 'freddy', name: 'FREDDY', img: 'assets/roles/freddy.png', color: '#c49a6c' }
    ];
    const ANIM_IDS = ['foxy', 'bonnie', 'chica', 'freddy'];
    const ABILITIES = {
        guard: 'Sobrevive la noche con puertas, luces y cámaras (juego ORIGINAL).',
        foxy: 'SPRINT: corres rápido entre escenarios · Jumpscare inofensivo',
        bonnie: 'INTERFERENCIA: saboteas las cámaras del guardia · Jumpscare inofensivo',
        chica: 'RUIDO EN COCINA: confundes al guardia con cazuelas · Jumpscare inofensivo',
        freddy: 'RISA SOMBRÍA: luces que parpadean en la oficina · Jumpscare inofensivo'
    };

    const $ = (id) => document.getElementById(id);
    const scrHome = $('scr-home'), scrRoom = $('scr-room');
    let mode = null;          // 'host' | 'client'
    let code = null;
    let peer = null;
    let players = [];         // [{name, role}]
    let myRole = null;
    let myName = null;
    let conns = [];           // host: [{conn, name, role}]
    let started = false;
    let creating = false;     // host: creación en curso

    function roleInfo(id) { return ROLES.find(r => r.id === id) || { name: id, img: '', color: '#999' }; }
    function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

    // Espera a que PeerJS esté disponible (el HTML lo carga con CDNs de respaldo)
    function netReady(cb) {
        if (typeof Peer !== 'undefined') return cb(true);
        let waited = 0;
        const iv = setInterval(() => {
            waited += 200;
            if (typeof Peer !== 'undefined') { clearInterval(iv); cb(true); }
            else if (waited > 8000) { clearInterval(iv); cb(false); }
        }, 200);
    }

    function netFailMsg() {
        return '<span class="err">No se pudo cargar el módulo de red (PeerJS). ' +
            'Revisa tu conexión a internet y recarga la página.</span>';
    }

    // ---------- utilidades UI ----------
    function askName(def) {
        let n = sessionStorage.getItem('fnafm-name');
        if (!n) {
            n = prompt('Tu nombre:', def || ('Jugador' + Math.floor(Math.random() * 90 + 10)));
            if (n === null) n = def || 'Jugador';
            n = n.slice(0, 12) || 'Jugador';
            sessionStorage.setItem('fnafm-name', n);
        }
        return n;
    }

    function lockHome(lock) {
        $('b-create').disabled = lock;
        $('b-join').disabled = lock;
        $('in-code').disabled = lock;
    }

    // Lista de jugadores con icono y color de rol
    function renderPlayers() {
        const cont = $('plist');
        cont.innerHTML = '';
        players.forEach(p => {
            const r = roleInfo(p.role);
            const div = document.createElement('div');
            div.className = 'prow' + (p.name === myName && p.role === myRole ? ' me' : '');
            div.innerHTML =
                '<img class="pic" src="' + r.img + '">' +
                '<span class="pname" style="color:' + r.color + ';">' + p.name + '</span>' +
                '<span class="ptag">' + r.name + '</span>';
            cont.appendChild(div);
        });
        // marcador de "esperando" si hay huecos
        const animCount = players.filter(p => p.role !== 'guard').length;
        $('room-status').textContent = mode === 'host'
            ? (animCount === 0
                ? 'Esperando animatrónicos... (también puedes empezar solo: los roles vacíos serán IA)'
                : animCount + '/4 animatrónicos conectados. Pulsa EMPEZAR cuando quieras.')
            : 'Esperando a que el guardia empiece la noche...';
    }

    function showMyRole() {
        const box = $('myrole');
        if (!myRole) { box.classList.add('hidden'); return; }
        const r = roleInfo(myRole);
        box.classList.remove('hidden');
        box.innerHTML =
            '<div class="mrlabel">' + (mode === 'host' ? 'TU ROL (ANFITRIÓN)' : 'TU ROL (ALEATORIO)') + '</div>' +
            '<img class="mrpic" src="' + r.img + '">' +
            '<div class="mrname" style="color:' + r.color + '; border-color:' + r.color + ';">' + r.name + '</div>' +
            '<div class="mrdesc">' + ABILITIES[myRole] + '</div>';
    }

    function broadcast(obj) {
        const s = JSON.stringify(obj);
        conns.forEach(c => { try { c.conn.open && c.conn.send(s); } catch (e) { } });
    }

    function sendToHost(obj) {
        try { peer && peer.__hostConn && peer.__hostConn.open && peer.__hostConn.send(JSON.stringify(obj)); } catch (e) { }
    }

    function enterRoom() {
        scrHome.classList.add('hidden');
        scrRoom.classList.remove('hidden');
        $('room-code').textContent = code;
        $('room-label').textContent = mode === 'host'
            ? 'PARTIDA CREADA — comparte este código:'
            : 'CÓDIGO DE LA PARTIDA:';
        // El botón EMPEZAR solo existe para el ANFITRIÓN (guardia)
        $('b-start').classList.toggle('hidden', mode !== 'host');
        renderPlayers();
        showMyRole();
    }

    function goGame() {
        if (started) return;
        started = true;
        if (mode === 'host') {
            window.location.href = '../1/index.html?mp=' + code + '&name=' + encodeURIComponent(myName);
        } else {
            window.location.href = 'anim.html?mp=' + code + '&role=' + myRole + '&name=' + encodeURIComponent(myName);
        }
    }

    // ---------- HOST (guardia obligatorio) ----------
    function hostStart() {
        if (creating) return;
        netReady((ok) => {
            if (!ok) { $('home-status').innerHTML = netFailMsg(); return; }
            creating = true;
            mode = 'host';
            myName = askName('Guardia');
            myRole = 'guard'; // el anfitrión es SIEMPRE el guardia
            players = [{ name: myName, role: 'guard' }];
            lockHome(true);
            createRoom(1);
        });
    }

    function createRoom(attempt) {
        code = MP.makeCode();
        $('home-status').textContent = 'CREANDO SALA ' + code + '...'
            + (attempt > 1 ? ' (intento ' + attempt + '/4)' : '');

        peer = MP.lobbyHost(code);
        let opened = false;
        let settled = false;

        // Timeout: si el servidor de red no responde, reintentar con OTRO código
        const timeout = setTimeout(() => {
            if (settled) return;
            settled = true;
            try { peer.destroy(); } catch (e) { }
            retryOrFail('el servidor de red no responde');
        }, 9000);

        function retryOrFail(reason) {
            if (attempt < 4) {
                setTimeout(() => createRoom(attempt + 1), 700);
            } else {
                creating = false;
                lockHome(false);
                $('home-status').innerHTML = '<span class="err">No se pudo crear la sala (' + reason +
                    '). Revisa tu conexión y reintenta.</span>';
            }
        }

        peer.on('open', () => {
            if (settled) return;
            settled = true; opened = true;
            clearTimeout(timeout);
            enterRoom();
        });

        peer.on('connection', (conn) => {
            conn.on('data', (d) => {
                const m = (typeof d === 'string') ? JSON.parse(d) : d;
                if (m.t === 'hello') {
                    // asignación ALEATORIA de rol libre
                    const taken = conns.map(c => c.role);
                    const free = shuffle(ANIM_IDS.filter(r => !taken.includes(r)));
                    if (free.length === 0) {
                        conn.send(JSON.stringify({ t: 'full' }));
                        setTimeout(() => { try { conn.close(); } catch (e) { } }, 400);
                        return;
                    }
                    const role = free[0];
                    const entry = { conn, name: (m.name || 'Jugador').slice(0, 12), role };
                    conns.push(entry);
                    conn.__e = entry;
                    players = hostPlayers();
                    conn.send(JSON.stringify({ t: 'welcome', role: role, players: players }));
                    broadcast({ t: 'players', players: players });
                    renderPlayers();
                } else if (m.t === 'leave') {
                    conns = conns.filter(c => c.conn !== conn);
                    players = hostPlayers();
                    broadcast({ t: 'players', players: players });
                    renderPlayers();
                }
            });
            conn.on('close', () => {
                conns = conns.filter(c => c.conn !== conn);
                players = hostPlayers();
                broadcast({ t: 'players', players: players });
                renderPlayers();
            });
        });

        peer.on('error', (e) => {
            // Errores ANTES de abrir la sala → reintentar con otro código
            if (!opened && !settled) {
                settled = true;
                clearTimeout(timeout);
                try { peer.destroy(); } catch (x) { }
                retryOrFail('error de red: ' + e.type);
                return;
            }
            // Errores después de abrir (p.ej. un cliente cae) → la sala sigue en pie
            if (opened) {
                $('room-status').textContent = 'Aviso de red: ' + e.type + ' (la sala sigue abierta)';
                setTimeout(() => { if (!started) renderPlayers(); }, 1500);
            }
        });
    }

    function hostPlayers() {
        const list = [{ name: myName, role: 'guard' }];
        conns.forEach(c => list.push({ name: c.name, role: c.role }));
        return list;
    }

    // ---------- CLIENTE (rol aleatorio) ----------
    function clientStart(c) {
        netReady((ok) => {
            if (!ok) { $('home-status').innerHTML = netFailMsg(); return; }
            mode = 'client';
            code = c;
            myName = askName();
            lockHome(true);
            $('home-status').textContent = 'BUSCANDO PARTIDA ' + code + '...';
            let tries = 0;
            attempt();

            function attempt() {
                tries++;
                if (tries > 12) {
                    lockHome(false);
                    $('home-status').innerHTML = '<span class="err">No se encontró la partida ' + code +
                        '. Comprueba el código y que el anfitrión siga en el lobby.</span>';
                    return;
                }
                const p = MP.lobbyConnect(code);
                p.on('open', () => {
                    const conn = p.connect(MP.LOBBY_PREFIX + code, { reliable: true });
                    p.__hostConn = conn;
                    conn.on('open', () => {
                        peer = p;
                        conn.send(JSON.stringify({ t: 'hello', name: myName }));
                        $('home-status').textContent = 'Conectando con la sala...';
                    });
                    conn.on('data', (d) => {
                        const m = (typeof d === 'string') ? JSON.parse(d) : d;
                        if (m.t === 'full') {
                            $('home-status').innerHTML = '<span class="err">PARTIDA COMPLETA (4 animatrónicos + guardia).</span>';
                            setTimeout(() => { try { p.destroy(); } catch (e) { } }, 300);
                            return;
                        }
                        if (m.t === 'welcome') {
                            myRole = m.role;              // rol ALEATORIO asignado por el anfitrión
                            if (m.players) players = m.players;
                            enterRoom();
                        }
                        if (m.t === 'players') {
                            players = m.players || players;
                            renderPlayers();
                        }
                        if (m.t === 'start') goGame();
                    });
                    conn.on('close', () => {
                        if (started) return;
                        $('room-status').textContent = 'Conexión perdida...';
                        setTimeout(() => { if (!started) window.location.reload(); }, 2000);
                    });
                });
                p.on('error', (e) => {
                    if (e.type === 'peer-unavailable') { try { p.destroy(); } catch (x) { } setTimeout(attempt, 1500); }
                    else if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' || e.type === 'socket-closed') {
                        try { p.destroy(); } catch (x) { } setTimeout(attempt, 2500);
                    }
                });
            }
        });
    }

    // ---------- eventos ----------
    $('b-create').addEventListener('click', hostStart);
    $('b-join').addEventListener('click', () => {
        const c = $('in-code').value.trim().toUpperCase();
        if (c.length !== 5) { $('home-status').innerHTML = '<span class="err">Introduce un código de 5 caracteres.</span>'; return; }
        clientStart(c);
    });
    $('in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('b-join').click(); });

    $('b-start').addEventListener('click', () => {
        if (mode !== 'host') return;
        if (!players.some(p => p.role === 'guard')) { // a fuerza hay guardia
            alert('Error: falta el guardia.');
            return;
        }
        $('b-start').disabled = true;
        $('room-status').textContent = '¡EMPEZANDO LA NOCHE!';
        broadcast({ t: 'start' });
        setTimeout(goGame, 300);
    });
    $('b-leave').addEventListener('click', () => {
        if (mode === 'client') sendToHost({ t: 'leave' });
        setTimeout(() => window.location.href = '../index.html', 200);
    });
})();
