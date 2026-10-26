// ============================================================
// FNAF 1 MP — Lobby: crear / unirse / elegir rol / empezar
// El creador es el GUARDIA (host técnico). Los demás eligen
// entre FOXY, BONNIE, CHICA y FREDDY. Roles sin jugador
// quedan controlados por la IA original del juego.
// ============================================================

(function () {
    const ROLES = [
        { id: 'guard', name: 'GUARDIA', img: 'assets/roles/guard.png' },
        { id: 'foxy', name: 'FOXY', img: 'assets/roles/foxy.png' },
        { id: 'bonnie', name: 'BONNIE', img: 'assets/roles/bonnie.png' },
        { id: 'chica', name: 'CHICA', img: 'assets/roles/chica.png' },
        { id: 'freddy', name: 'FREDDY', img: 'assets/roles/freddy.png' }
    ];

    const $ = (id) => document.getElementById(id);
    const scrHome = $('scr-home'), scrRoom = $('scr-room');
    let mode = null;          // 'host' | 'client'
    let code = null;
    let peer = null;
    let players = [];         // [{name, role}]
    let myRole = null;
    let myName = null;
    let conns = [];           // host: [{conn, entry}]
    let started = false;

    // ---------- utilidades UI ----------
    function askName(def) {
        let n = sessionStorage.getItem('fnafm-name');
        if (!n) {
            n = prompt('Tu nombre:', def || ('Jugador' + Math.floor(Math.random() * 90 + 10)));
            if (n === null) n = def || 'Jugador';
            sessionStorage.setItem('fnafm-name', n);
        }
        return n;
    }

    function renderRoles() {
        const cont = $('roles');
        cont.innerHTML = '';
        ROLES.forEach(r => {
            const div = document.createElement('div');
            div.className = 'role' + (r.id === 'guard' ? ' g' : '') + (myRole === r.id ? ' selected' : '');
            const who = players.find(p => p.role === r.id);
            let whoTxt = '';
            if (who) whoTxt = who.name + (who.role === myRole ? ' (tú)' : '');
            if (r.id === 'guard' && mode === 'host') whoTxt = myName + ' (tú · host)';
            div.innerHTML = '<img class="rpic" src="' + r.img + '"><div class="rname">' + r.name + '</div><div class="rwho">' + whoTxt + '</div>';
            if (r.id !== 'guard' || mode === 'host') {
                if (!who || who.role === myRole) {
                    div.addEventListener('click', () => pickRole(r.id));
                } else {
                    div.classList.add('locked');
                }
            } else {
                div.classList.add('locked');
            }
            cont.appendChild(div);
        });
        $('players').innerHTML = players.length
            ? 'Jugadores: ' + players.map(p => p.name + ' (' + roleName(p.role) + ')').join(' · ')
            : '';
        $('b-start').classList.toggle('hidden', mode !== 'host');
    }

    function roleName(id) { const r = ROLES.find(x => x.id === id); return r ? r.name : id; }

    function pickRole(role) {
        if (mode === 'host') { myRole = role; players = hostPlayers(); renderRoles(); return; }
        sendToHost({ t: 'pick', role });
    }

    function hostPlayers() {
        const list = [{ name: myName, role: 'guard' }];
        conns.forEach(c => { if (c.role) list.push({ name: c.name, role: c.role }); });
        return list;
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
        $('room-label').textContent = mode === 'host' ? 'PARTIDA CREADA — comparte este código:' : 'CÓDIGO DE LA PARTIDA:';
        renderRoles();
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

    // ---------- HOST ----------
    function hostStart() {
        mode = 'host';
        code = MP.makeCode();
        myName = askName('Guardia');
        myRole = 'guard';
        peer = MP.lobbyHost(code);
        peer.on('open', () => {
            $('home-status').textContent = 'Sala lista.';
            enterRoom();
        });
        peer.on('connection', (conn) => {
            conn.on('data', (d) => {
                const m = (typeof d === 'string') ? JSON.parse(d) : d;
                if (m.t === 'hello') {
                    const entry = { conn, name: m.name, role: null };
                    conns.push(entry);
                    conn.__e = entry;
                    conn.send(JSON.stringify({ t: 'welcome', players: hostPlayers() }));
                    players = hostPlayers();
                    renderRoles();
                } else if (m.t === 'pick') {
                    const e = conn.__e;
                    if (!e) return;
                    // validar rol único
                    const taken = hostPlayers().some(p => p.role === m.role);
                    if (!taken && m.role !== 'guard') {
                        e.role = m.role;
                        conn.send(JSON.stringify({ t: 'picked', ok: true, role: m.role, players: hostPlayers() }));
                    } else {
                        conn.send(JSON.stringify({ t: 'picked', ok: false }));
                        return;
                    }
                    players = hostPlayers();
                    broadcast({ t: 'players', players });
                    renderRoles();
                } else if (m.t === 'leave') {
                    conns = conns.filter(c => c.conn !== conn);
                    players = hostPlayers();
                    broadcast({ t: 'players', players });
                    renderRoles();
                }
            });
            conn.on('close', () => {
                conns = conns.filter(c => c.conn !== conn);
                players = hostPlayers();
                broadcast({ t: 'players', players });
                renderRoles();
            });
        });
        peer.on('error', (e) => {
            $('home-status').innerHTML = '<span class="err">Error de red: ' + e.type + ' — reintenta.</span>';
        });
    }

    // ---------- CLIENTE ----------
    function clientStart(c) {
        mode = 'client';
        code = c;
        myName = askName();
        let tries = 0;
        function attempt() {
            tries++;
            if (tries > 20) { $('home-status').innerHTML = '<span class="err">No se encontró la partida.</span>'; return; }
            const p = MP.lobbyConnect(code);
            let got = false;
            p.on('open', () => {
                const conn = p.connect(MP.LOBBY_PREFIX + code, { reliable: true });
                p.__hostConn = conn;
                conn.on('open', () => {
                    got = true;
                    peer = p;
                    conn.send(JSON.stringify({ t: 'hello', name: myName }));
                    enterRoom();
                });
                conn.on('data', (d) => {
                    const m = (typeof d === 'string') ? JSON.parse(d) : d;
                    if (m.t === 'welcome' || m.t === 'players' || (m.t === 'picked' && m.ok)) {
                        if (m.players) players = m.players;
                        renderRoles();
                    }
                    if (m.t === 'picked' && m.ok) myRole = m.role;
                    if (m.t === 'picked' && !m.ok) alert('Ese rol ya está tomado.');
                    if (m.t === 'start') { sessionStorage.setItem('fnafm-role', myRole); goGame(); }
                });
                conn.on('close', () => {
                    if (started) return;
                    $('room-status').textContent = 'Conexión perdida...';
                    setTimeout(() => { if (!started) window.location.reload(); }, 2000);
                });
            });
            p.on('error', (e) => {
                if (e.type === 'peer-unavailable') { try { p.destroy(); } catch (x) { } setTimeout(attempt, 1500); }
            });
        }
        attempt();
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
        // el guardia no puede empezar sin roles... puede empezar como sea (los vacíos son IA)
        broadcast({ t: 'start' });
        setTimeout(goGame, 250);
    });
    $('b-leave').addEventListener('click', () => {
        if (mode === 'client') sendToHost({ t: 'leave' });
        setTimeout(() => window.location.href = '../index.html', 200);
    });
})();
