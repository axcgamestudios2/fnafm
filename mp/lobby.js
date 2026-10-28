// ============================================================
// FNAF 1 MP — Lobby: crear / unirse / roles ALEATORIOS
// - CUENTA axc (SSO) obligatoria para jugar: el USUARIO de la
//   cuenta se usa como nombre de jugador (una sola cuenta para
//   todas las páginas de axcStudios — tienda, axcOS, juegos).
// - El GUARDIA se sortea ALEATORIAMENTE al pulsar EMPEZAR entre
//   TODOS los jugadores — anfitrión incluido (puede tocarle a
//   cualquiera; el anfitrión no es guardia por obligación).
// - Los demás reciben un animatrónico ALEATORIO (FOXY, BONNIE,
//   CHICA o FREDDY) re-sorteado también al empezar.
// - Sin selector de personaje.
// - Roles sin jugador quedan controlados por la IA original.
// - Creación robusta: feedback inmediato, timeout y reintentos
//   con código nuevo si el servidor de red falla.
// - Degradación suave del SSO: si la biblioteca no carga o el
//   servidor de cuentas está caído, se juega igual (con aviso).
// ============================================================

(function () {
    const ROLES = [
        { id: 'guard', name: 'GUARDIA', img: 'assets/roles/guard.png', color: '#7ec8ff' },
        { id: 'foxy', name: 'FOXY', img: 'assets/roles/foxy.png', color: '#ff7043' },
        { id: 'bonnie', name: 'BONNIE', img: 'assets/roles/bonnie.png', color: '#a98bff' },
        { id: 'chica', name: 'CHICA', img: 'assets/roles/chica.png', color: '#ffd54d' },
        { id: 'freddy', name: 'FREDDY', img: 'assets/roles/freddy.png', color: '#c49a6c' }
    ];
    const HOST_INFO = { name: 'ANFITRIÓN', color: '#9a9a9a' };
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

    // ---------- Sistema de cuentas axc (SSO) ----------
    // La sesión es obligatoria para crear/unirse a partidas; el
    // usuario de la cuenta se convierte en el nombre del jugador.
    // Si el sistema no está disponible (CDN o textdb caídos) el
    // juego NO se bloquea: se juega con degradación suave.
    let axcBooting = true;      // AXC.init() en curso (restaurando sesión)
    let axcPending = null;      // acción a ejecutar cuando haya sesión

    function axcLibsOk() { return !!(window.AXC && window.AXC_UI); }

    function axcServerDown() {
        try { return !!(window.AXC && AXC.state.db === false); } catch (e) { return false; }
    }

    // Puerta: exige sesión antes de ejecutar la acción pedida
    function axcGate(next) {
        if (!axcLibsOk()) return next();                    // biblioteca no cargada → no bloquear
        if (AXC.state.user) return next();                  // sesión activa → a jugar
        if (axcServerDown()) {                              // servidor de cuentas caído → avisar y jugar
            try { AXC_UI.toast('Servidor de cuentas no disponible: jugando sin cuenta'); } catch (e) { }
            return next();
        }
        axcPending = next;                                  // guardar la acción...
        if (axcBooting) {
            $('home-status').textContent = 'Conectando con tu cuenta axc...';
        } else {
            AXC_UI.openAuth('login');                       // ...y pedir la sesión
        }
    }

    // Se llama al arrancar y en cada cambio de sesión
    function axcOnAuth(u) {
        axcBooting = false;
        if (u && axcPending) {
            try { AXC_UI.closeAuth(); } catch (e) { }
            const act = axcPending; axcPending = null;
            act();                                          // continuar lo que el jugador pulsó
            return;
        }
        if (u && mode === null && !started) {
            $('home-status').innerHTML = 'Sesión: <b>' + String(u.u).slice(0, 16) +
                '</b> — tu usuario será tu nombre en la partida.';
        }
    }

    function axcBoot() {
        if (!axcLibsOk()) { axcBooting = false; return; }  // CDN caído: degradar sin bloquear
        try {
            AXC_UI.init({
                chip: '#accountChip',
                onAuth: axcOnAuth
            });
            setTimeout(() => { axcBooting = false; }, 12000); // red de seguridad
        } catch (e) { axcBooting = false; }
    }

    // ---------- utilidades UI ----------
    // Nombre de jugador = USUARIO de la cuenta axc (el login es
    // obligatorio para llegar aquí; el prompt manual quedó eliminado)
    function askName(def) {
        let n = null;
        try { if (window.AXC && AXC.state.user) n = AXC.state.user.u; } catch (e) { }
        if (!n) n = sessionStorage.getItem('fnafm-name');
        if (!n) n = def || 'Jugador';
        n = String(n).slice(0, 12) || 'Jugador';
        try { sessionStorage.setItem('fnafm-name', n); } catch (e) { }
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
            const isHost = (p.role === 'host');
            const r = isHost ? HOST_INFO : roleInfo(p.role);
            const div = document.createElement('div');
            div.className = 'prow' + (p.name === myName && p.role === myRole ? ' me' : '');
            div.innerHTML =
                '<img class="pic" src="' + (isHost ? 'assets/roles/guard.png' : r.img) + '">' +
                '<span class="pname" style="color:' + r.color + ';">' + p.name + '</span>' +
                '<span class="ptag">' + r.name + (isHost ? ' · ¿guardia? se sortea al EMPEZAR' : '') + '</span>';
            cont.appendChild(div);
        });
        // marcador de "esperando" si hay huecos
        const animCount = players.filter(p => p.role !== 'host' && p.role !== 'guard').length;
        $('room-status').textContent = mode === 'host'
            ? (animCount === 0
                ? 'Esperando jugadores... (también puedes empezar solo: los roles vacíos serán IA)'
                : animCount + '/4 animatrónicos. El GUARDIA se sortea al pulsar EMPEZAR.')
            : 'Esperando a que el anfitrión empiece la noche (guardia aleatorio)...';
    }

    function showMyRole() {
        const box = $('myrole');
        if (!myRole || myRole === 'host') { box.classList.add('hidden'); return; }
        const r = roleInfo(myRole);
        box.classList.remove('hidden');
        box.innerHTML =
            '<div class="mrlabel">TU ROL PROVISIONAL (ALEATORIO)</div>' +
            '<img class="mrpic" src="' + r.img + '">' +
            '<div class="mrname" style="color:' + r.color + '; border-color:' + r.color + ';">' + r.name + '</div>' +
            '<div class="mrdesc">Se re-sortea al EMPEZAR junto al GUARDIA. ' + ABILITIES[myRole] + '</div>';
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

    function goGame(m) {
        if (started) return;
        started = true;
        // El rol lo decide el SORTEO del EMPEZAR: puede ser guardia o
        // animatrónico — para CUALQUIER jugador, anfitrión incluido.
        const role = (m && m.role) || myRole;
        const name = encodeURIComponent(myName);
        if (role === 'guard') {
            window.location.href = '../1/index.html?mp=' + code + '&name=' + name;
        } else {
            window.location.href = 'anim.html?mp=' + code + '&role=' + role + '&name=' + name;
        }
    }

    // ---------- HOST (crea la sala; el guardia se SORTEA al empezar) ----------
    function hostStart() {
        if (creating) return;
        netReady((ok) => {
            if (!ok) { $('home-status').innerHTML = netFailMsg(); return; }
            creating = true;
            mode = 'host';
            myName = askName('Jugador');
            myRole = 'host';    // anfitrión de la SALA — su rol de juego se sortea al EMPEZAR
            players = [{ name: myName, role: 'host' }];
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
        const list = [{ name: myName, role: 'host' }];
        conns.forEach(c => list.push({ name: c.name, role: c.role }));
        return list;
    }

    // ---------- EMPEZAR: SORTEO ALEATORIO DEL GUARDIA (v2) ----------
    // "Si no hay ningún guardia y se empieza, se le cambia a cualquiera
    //  aleatoriamente — al host también le puede tocar, pero aleatorio."
    function drawRolesAndStart() {
        // todos los jugadores (anfitrión + clientes) en una bolsa
        const everyone = [{ name: myName, conn: null }]
            .concat(conns.map(c => ({ name: c.name, conn: c.conn })));
        const bag = shuffle(everyone.slice());
        const guardP = bag[0];                       // guardia = primer sacado
        const pool = shuffle(ANIM_IDS.slice());       // resto: animatrónicos al azar
        const roleOf = new Map();
        bag.forEach(pp => roleOf.set(pp, pp === guardP ? 'guard' : pool.shift()));

        // repartir por red (a cada cliente SU rol) y navegar cada quien
        conns.forEach(c => {
            const pp = everyone.find(e => e.conn === c.conn);
            const r = roleOf.get(pp) || 'foxy';
            try { c.conn.send(JSON.stringify({ t: 'start', role: r })); } catch (e) { }
        });
        myRole = roleOf.get(everyone[0]);             // el rol del propio anfitrión
        setTimeout(() => goGame({ role: myRole }), 250);
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
                        if (m.t === 'start') goGame(m);   // m.role = guardia O animatrónico (sorteo)
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
    // Todo pasa por la puerta de la cuenta axc (SSO)
    $('b-create').addEventListener('click', () => axcGate(hostStart));
    $('b-join').addEventListener('click', () => {
        const c = $('in-code').value.trim().toUpperCase();
        if (c.length !== 5) { $('home-status').innerHTML = '<span class="err">Introduce un código de 5 caracteres.</span>'; return; }
        axcGate(() => clientStart(c));
    });
    $('in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('b-join').click(); });

    $('b-start').addEventListener('click', () => {
        if (mode !== 'host') return;
        $('b-start').disabled = true;
        $('room-status').textContent = '¡SORTEANDO EL GUARDIA Y EMPEZANDO LA NOCHE!';
        drawRolesAndStart();
    });
    $('b-leave').addEventListener('click', () => {
        if (mode === 'client') sendToHost({ t: 'leave' });
        setTimeout(() => window.location.href = '../index.html', 200);
    });

    // Arranque del sistema de cuentas axc (SSO)
    axcBoot();
})();
