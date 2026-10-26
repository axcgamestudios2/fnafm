// ============================================================
// FNAF 1 MP — Cliente del ANIMATRÓNICO (primera persona)
// Recorre la pizzería original en primera persona, avanza de
// escenario en escenario por las puertas, y ataca a la oficina
// con la lógica ORIGINAL del juego (el host escribe los
// contadores internos; nada se reprograma).
//
// v2:
//  - Movimiento OPTIMISTA con caminata en 1ª persona (sin delay)
//  - CAMINATA sincronizada con lo que ve el guardia (950ms)
//  - Botones nunca más se traban (reseteos por estado + timeouts)
//  - Minimapa en vivo con todos los animatrónicos
//  - HUD renovado por rol
// ============================================================

(function () {
    'use strict';

    const params = new URLSearchParams(window.location.search);
    const ROOM = params.get('mp');
    const ROLE = params.get('role');
    const NAME = params.get('name') || 'Animatrónico';
    if (!ROOM || !ROLE || !['foxy', 'bonnie', 'chica', 'freddy'].includes(ROLE)) {
        window.location.href = 'lobby.html';
        return;
    }

    // ------------------- Mapa original FNAF 1 -------------------
    const ROOM_NAME = {
        '1A': 'ESCENARIO (1A)',
        '1B': 'ÁREA DE COMEDOR (1B)',
        '1C': 'CUEVA DEL PIRATA (1C)',
        '5': 'ENTRE BASTIDORES (5)',
        '3': 'ALMACÉN (3)',
        '2A': 'PASILLO OESTE (2A)',
        '2B': 'ESQUINA OESTE (2B)',
        '7': 'BAÑOS (7)',
        '6': 'COCINA (6)',
        '4A': 'PASILLO ESTE (4A)',
        '4B': 'ESQUINA ESTE (4B)'
    };
    const ADJACENCY = {
        '1A': ['1B'],
        '1B': ['1A', '1C', '5', '2A', '7'],
        '1C': ['1B'],
        '5': ['1B'],
        '3': ['2A'],
        '2A': ['1B', '3', '2B'],
        '2B': ['2A'],
        '7': ['1B', '6'],
        '6': ['7', '4A'],
        '4A': ['6', '4B'],
        '4B': ['4A']
    };
    // flecha de dirección para el botón de navegación
    const NAV_ARROW = {
        '1A': { '1B': '↓' },
        '1B': { '1A': '↑', '1C': '←', '5': '↖', '2A': '↓', '7': '→' },
        '1C': { '1B': '→' },
        '5': { '1B': '↘' },
        '3': { '2A': '→' },
        '2A': { '1B': '↑', '3': '←', '2B': '↓' },
        '2B': { '2A': '↑' },
        '7': { '1B': '←', '6': '↓' },
        '6': { '7': '↑', '4A': '→' },
        '4A': { '6': '←', '4B': '↓' },
        '4B': { '4A': '↑' }
    };
    const CAM_VIEWING = { '1A': 1, '1B': 2, '1C': 99, '5': 5, '3': 33, '2A': 3, '2B': 22, '4A': 4, '4B': 42, '6': 6, '7': 7 };
    // índice de actividad -> sala (mapa inverso del juego)
    const IDX_ROOM = {
        bonnie: { 0: '1A', 2: '1B', 3: '5', 4: '2A', 5: '3', 6: '2B' },
        chica: { 0: '1A', 2: '1B', 3: '7', 4: '6', 5: '4A', 6: '4B' },
        freddy: { 0: '1A', 2: '1B', 3: '7', 4: '6', 5: '4A', 6: '4B' }
    };

    const SPEC_INFO = {
        foxy: { name: 'SPRINT', desc: 'Corres rápido entre escenarios (5s)' },
        bonnie: { name: 'INTERFERENCIA', desc: 'Saboteas las cámaras del guardia (3s)' },
        chica: { name: 'RUIDO EN COCINA', desc: 'Haces ruido de cazuelas para confundir al guardia' },
        freddy: { name: 'RISA SOMBRÍA', desc: 'Tu risa llena la oficina y hace parpadear las luces' }
    };

    // ------------------- Minimapa -------------------
    // [x, y, ancho, alto] en % del contenedor
    const MAP_POS = {
        '5': [2, 16, 22, 14], '1A': [32, 2, 32, 14], '7': [70, 10, 26, 14],
        '1C': [2, 34, 22, 13], '1B': [32, 20, 32, 22], '3': [2, 52, 18, 13],
        '6': [70, 27, 26, 16], '2A': [28, 46, 20, 22], '4A': [50, 46, 20, 22],
        '2B': [28, 70, 20, 11], '4B': [50, 70, 20, 11], 'OFF': [36, 83, 28, 15]
    };
    const MAP_LABEL = {
        '5': 'BASTIDORES', '1A': 'ESCENARIO', '7': 'BAÑOS', '1C': 'C. PIRATA',
        '1B': 'COMEDOR', '3': 'ALMACÉN', '6': 'COCINA', '2A': 'P. OESTE',
        '4A': 'P. ESTE', '2B': 'ESQ. O', '4B': 'ESQ. E'
    };
    const PIP_OFFSET = { foxy: [-4, -4], bonnie: [4, -4], chica: [-4, 4], freddy: [4, 4] };
    const DOOR_POS = { L: [33, 90], R: [67, 90] };

    const $ = (id) => document.getElementById(id);
    const view = $('view'), glitch = $('glitch'), watched = $('watched');
    const nav = $('nav'), screenEl = $('screen'), toastEl = $('toast');

    // ------------------- Estado del cliente -------------------
    const WALK_MS = 950;   // igual que la caminata que ve el guardia
    const cli = {
        room: (ROLE === 'foxy') ? '1C' : '1A',
        phase: 'connecting',
        night: 1,
        state: null,
        foxPeek: 0,
        attackBusy: false,
        atDoor: false,
        enteredOffice: false,
        attackAt: 0,
        walking: false,
        walkDest: null,
        walkFrom: null,
        pendingMove: null,
        sprintUntil: 0,
        cooldown: { jumpscare: 0, special: 0 },
        connected: false,
        lastMoveSent: 0
    };
    let net = null;
    const roomBox = {}, pips = {};
    let doorBarL = null, doorBarR = null, mapBuilt = false;

    // ------------------- Pantallas / toast -------------------
    function showScreen(html) {
        screenEl.innerHTML = html;
        screenEl.style.display = 'flex';
    }
    function hideScreen() {
        screenEl.style.display = 'none';
    }
    function toast(msg, ms) {
        toastEl.textContent = msg;
        toastEl.classList.add('on');
        clearTimeout(toastEl.__t);
        toastEl.__t = setTimeout(() => toastEl.classList.remove('on'), ms || 2600);
    }
    function roleIconTag() {
        return '<img class="roleicon" src="assets/roles/' + ROLE + '.png">';
    }

    // ------------------- Minimapa -------------------
    function buildMinimap() {
        const mm = $('minimap');
        Object.keys(MAP_POS).forEach(r => {
            const m = MAP_POS[r];
            const d = document.createElement('div');
            d.className = 'mroom' + (r === 'OFF' ? ' office' : '');
            d.style.left = m[0] + '%'; d.style.top = m[1] + '%';
            d.style.width = m[2] + '%'; d.style.height = m[3] + '%';
            d.textContent = r === 'OFF' ? 'OFICINA' : MAP_LABEL[r];
            if (r === 'OFF') {
                const bl = document.createElement('div'); bl.className = 'doorbar l'; d.appendChild(bl);
                const br = document.createElement('div'); br.className = 'doorbar r'; d.appendChild(br);
                doorBarL = bl; doorBarR = br;
            }
            mm.appendChild(d);
            roomBox[r] = d;
        });
        ['foxy', 'bonnie', 'chica', 'freddy'].forEach(role => {
            const p = document.createElement('div');
            p.className = 'mpip';
            p.style.display = 'none';
            p.innerHTML = '<img src="assets/roles/' + role + '.png" alt="' + role + '">';
            mm.appendChild(p);
            pips[role] = p;
        });
        mapBuilt = true;
    }

    function centerOf(r) {
        const m = MAP_POS[r];
        return m ? [m[0] + m[2] / 2, m[1] + m[3] / 2] : null;
    }

    function updateMinimap(s) {
        if (!mapBuilt || !s) return;
        Object.keys(roomBox).forEach(r => {
            if (r !== 'OFF') roomBox[r].classList.toggle('here', r === cli.room);
        });
        if (doorBarL) doorBarL.classList.toggle('closed', !!s.doorL);
        if (doorBarR) doorBarR.classList.toggle('closed', !!s.doorR);
        ['foxy', 'bonnie', 'chica', 'freddy'].forEach(role => {
            const pip = pips[role];
            if (!pip) return;
            let pos = null, running = false;
            if (role === ROLE) {
                const act = s.positions ? s.positions[role] : null;
                if (act != null && act >= 7) pos = DOOR_POS[role === 'bonnie' ? 'L' : 'R'];
                else pos = centerOf(cli.room);
            } else if (role === 'foxy') {
                const fp = s.positions ? s.positions.foxy : null;
                if (fp === 4) { pos = centerOf('2A'); running = true; }
                else pos = centerOf('1C');
            } else {
                const act = s.positions ? s.positions[role] : null;
                if (act != null && act >= 7) pos = DOOR_POS[role === 'bonnie' ? 'L' : 'R'];
                else pos = centerOf(IDX_ROOM[role][act]);
            }
            if (!pos) { pip.style.display = 'none'; return; }
            pip.style.display = 'block';
            pip.classList.toggle('running', running);
            pip.classList.toggle('self', role === ROLE);
            const off = PIP_OFFSET[role];
            pip.style.left = (pos[0] + off[0]) + '%';
            pip.style.top = (pos[1] + off[1]) + '%';
        });
    }

    // ------------------- Vista / navegación -------------------
    function setRoomImage(room) {
        view.style.backgroundImage = 'url(assets/rooms/' + room + '.png)';
    }

    function setView(room) {
        cli.room = room;
        setRoomImage(room);
        $('roomname').textContent = ROOM_NAME[room] || room;
        glitch.classList.add('on');
        setTimeout(() => glitch.classList.remove('on'), 320);
        playLocal('footstep.mp3', 0.4);
        renderNav();
    }

    // Caminata en 1ª persona: empieza YA (optimista), dura igual
    // que la caminata que ve el guardia en sus cámaras (WALK_MS).
    function startWalk(dest) {
        const from = cli.room;
        const fast = Date.now() < cli.sprintUntil;
        const dur = fast ? Math.round(WALK_MS / 2) : WALK_MS;
        cli.walking = true;
        cli.walkDest = dest;
        cli.walkFrom = from;
        renderNav(); // bloquea botones mientras caminas
        view.classList.remove('walk', 'fast');
        void view.offsetWidth; // reinicia la animación CSS
        view.classList.add('walk');
        view.classList.toggle('fast', fast);
        $('roomname').textContent = 'Caminando a ' + (ROOM_NAME[dest] || dest) + '...';
        const steps = fast ? 2 : 4;
        for (let i = 0; i < steps; i++) {
            setTimeout(() => { if (cli.walking) playLocal('footstep.mp3', 0.32); }, 60 + i * (dur / steps));
        }
        // a mitad de camino se ve la sala nueva
        setTimeout(() => {
            if (!cli.walking || cli.walkDest !== dest) return;
            setRoomImage(dest);
            glitch.classList.add('on');
            setTimeout(() => glitch.classList.remove('on'), 220);
        }, Math.round(dur * 0.45));
        // fin de la caminata
        setTimeout(() => {
            if (!cli.walking || cli.walkDest !== dest) return;
            cli.walking = false;
            cli.room = dest;
            view.classList.remove('walk', 'fast');
            $('roomname').textContent = ROOM_NAME[dest] || dest;
            renderNav();
        }, dur);
    }

    // Vista en primera persona del MARCO DE LA PUERTA de la oficina
    function setDoorView() {
        const left = (ROLE === 'bonnie');
        setRoomImage(left ? 'doorL' : 'doorR');
        $('roomname').textContent = left
            ? 'MARCO DE LA PUERTA IZQUIERDA'
            : 'MARCO DE LA PUERTA DERECHA';
    }

    function cancelWalk(msg) {
        if (!cli.walking) { if (msg) toast(msg); return; }
        cli.walking = false;
        view.classList.remove('walk', 'fast');
        const back = cli.walkFrom || cli.room;
        cli.room = back;
        setRoomImage(back);
        $('roomname').textContent = ROOM_NAME[back] || back;
        renderNav();
        if (msg) toast(msg);
    }

    function navDisabled() {
        return cli.walking || cli.attackBusy || cli.atDoor || cli.phase !== 'night';
    }

    function mkNavBtn(cls, arrow, label, onClick, disabled) {
        const b = document.createElement('button');
        b.className = 'navbtn' + (cls ? ' ' + cls : '');
        b.innerHTML = '<span class="dir">' + arrow + '</span><span>' + label + '</span>';
        b.disabled = !!disabled;
        b.addEventListener('click', onClick);
        nav.appendChild(b);
        return b;
    }

    function renderNav() {
        nav.innerHTML = '';
        if (ROLE === 'foxy') return renderFoxyNav();
        const here = cli.room;
        const opts = ADJACENCY[here] || [];
        opts.forEach(dest => {
            if (dest === '1C') return; // la cueva es territorio de Foxy
            const arrow = (NAV_ARROW[here] && NAV_ARROW[here][dest]) || '•';
            mkNavBtn('', arrow, ROOM_NAME[dest] || dest, () => tryMove(dest), navDisabled());
        });
        if (here === '2B' && ROLE === 'bonnie') mkNavBtn('attack', '▶', 'ENTRAR A LA OFICINA', doAttack, cli.attackBusy);
        if (here === '4B' && (ROLE === 'chica' || ROLE === 'freddy')) mkNavBtn('attack', '▶', 'ENTRAR A LA OFICINA', doAttack, cli.attackBusy);
        // retirada voluntaria del marco de la puerta
        if (cli.atDoor || cli.attackBusy) mkNavBtn('', '◁', 'RETIRARSE DE LA PUERTA', retreatFromDoor, false);
    }

    function retreatFromDoor() {
        if (!cli.atDoor && !cli.attackBusy) return;
        if (!net || !cli.connected) return;
        net.send({ t: 'ability', kind: 'doorRetreat' });
        toast('Caminas de regreso al comedor...');
    }

    function renderFoxyNav() {
        // Foxy: asomarse (máximo 3) y correr
        mkNavBtn('', '◑', 'ASOMARSE FUERA DE LA CORTINA', () => {
            if (navDisabled()) return;
            net && net.send({ t: 'move', to: 'peek' });
        }, cli.foxPeek >= 3 || cli.attackBusy || cli.phase !== 'night');
        mkNavBtn('attack', '!', '¡CORRER A LA OFICINA!', doAttack, cli.foxPeek < 1 || cli.attackBusy || cli.phase !== 'night');
        if (cli.foxPeek > 0) {
            mkNavBtn('', '◁', 'VOLVER TRAS LA CORTINA', () => {
                cli.foxPeek = 0;
                setFoxPeek(0);
                net && net.send({ t: 'ability', kind: 'foxyRetreat' });
                toast('Vuelves detrás de la cortina');
            }, cli.attackBusy);
        }
        const overlays = ['(Tras la cortina)', '(Asomado)', '(Medio fuera)', '(Fuera de la cortina)'];
        if (!cli.walking) $('roomname').textContent = ROOM_NAME['1C'] + ' ' + (overlays[cli.foxPeek] || '');
    }

    function tryMove(dest) {
        if (!net || !cli.connected || cli.phase !== 'night') return;
        if (cli.walking) { toast('Ya te estás moviendo...'); return; }
        if (cli.attackBusy || cli.atDoor) { toast('Estás en la puerta de la oficina: no puedes irte así.'); return; }
        const now = Date.now();
        const pace = now < cli.sprintUntil ? 250 : 400;
        if (now - cli.lastMoveSent < pace) { toast('Demasiado rápido...'); return; }
        cli.lastMoveSent = now;
        cli.pendingMove = dest;
        net.send({ t: 'move', to: dest });
        startWalk(dest); // optimista: camina YA, el host confirma en breve
    }

    function doAttack() {
        if (!net || !cli.connected || cli.phase !== 'night' || cli.attackBusy || cli.walking) return;
        net.send({ t: 'attack' });
        cli.attackBusy = true;
        cli.attackAt = Date.now();
        renderNav();
        if (ROLE === 'foxy') {
            toast('¡¡CORREEES!! Te disparas por el pasillo oeste!');
            playLocal('sprint.mp3', 0.7);
        } else {
            toast('Sales de la esquina hacia la puerta de la oficina...');
        }
        glitch.classList.add('on');
        setTimeout(() => glitch.classList.remove('on'), 900);
        // seguridad: si el host/juego no resuelve en 10.5s, liberar el botón
        setTimeout(() => {
            if (cli.attackBusy && cli.phase === 'night' && Date.now() - cli.attackAt >= 10500) {
                cli.attackBusy = false;
                cli.atDoor = false;
                renderNav();
                toast('Te retiras de la puerta sin éxito...');
            }
        }, 10600);
    }

    // ------------------- Habilidades -------------------
    $('ab-jump').addEventListener('click', () => useAbility('jumpscare'));
    $('ab-spec').addEventListener('click', () => useAbility('special'));
    document.addEventListener('keydown', (e) => {
        if (e.key === 'j' || e.key === 'J') useAbility('jumpscare');
        if (e.key === 'q' || e.key === 'Q') useAbility('special');
    });

    function useAbility(kind) {
        if (!net || !cli.connected || cli.phase !== 'night') return;
        const now = Date.now();
        const cd = kind === 'jumpscare' ? 15000 : 20000;
        if (now - cli.cooldown[kind] < cd) {
            toast('Aún en espera...');
            return;
        }
        cli.cooldown[kind] = now;
        if (kind === 'jumpscare') {
            net.send({ t: 'ability', kind: 'jumpscare' });
            toast('¡JUMPSCARE! El guardia ve tu cara original... pero sigue vivo.');
            playLocal('scream.mp3', 0.5);
        } else {
            net.send({ t: 'ability', kind: 'special' });
            if (ROLE === 'foxy') {
                cli.sprintUntil = Date.now() + 5000;
                playLocal('sprint.mp3', 0.6);
                toast('¡SPRINT! Avanzas mucho más rápido durante 5 segundos.');
            } else {
                toast(SPEC_INFO[ROLE].name + ': ' + SPEC_INFO[ROLE].desc);
            }
        }
        updateAbilityUI();
    }


    function updateAbilityUI() {
        const now = Date.now();
        const cdJ = Math.max(0, 15000 - (now - cli.cooldown.jumpscare));
        const cdS = Math.max(0, 20000 - (now - cli.cooldown.special));
        $('cd-jump').textContent = cdJ > 0 ? Math.ceil(cdJ / 1000) + 's' : 'listo';
        $('cd-spec').textContent = cdS > 0 ? Math.ceil(cdS / 1000) + 's' : 'listo';
        $('fill-jump').style.width = (cdJ / 150) + '%';
        $('fill-spec').style.width = (cdS / 200) + '%';
        $('ab-jump').disabled = cdJ > 0 || cli.phase !== 'night';
        $('ab-spec').disabled = cdS > 0 || cli.phase !== 'night';
        $('spec-name').textContent = SPEC_INFO[ROLE].name;
    }
    setInterval(updateAbilityUI, 250);

    // ------------------- HUD -------------------
    function updateHud(s) {
        if (!s) return;
        const hours = ['12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM', '6 AM'];
        const h = Math.floor((s.minute || 0) / 60);
        $('h-hour').textContent = hours[Math.min(h, 6)];
        $('h-night').textContent = 'NOCHE ' + (s.night || cli.night);

        const pct = (s.powerPct != null) ? s.powerPct : 0;
        $('h-power').textContent = pct + '%';
        $('pfill').style.width = Math.max(0, Math.min(100, pct)) + '%';
        $('hb-power').classList.toggle('pw-low', pct <= 20);

        const dl = $('d-l'), dr = $('d-r');
        dl.textContent = s.doorL ? '◀ CERRADA' : '◀ ABIERTA';
        dl.classList.toggle('closed', !!s.doorL);
        dr.textContent = s.doorR ? 'CERRADA ▶' : 'ABIERTA ▶';
        dr.classList.toggle('closed', !!s.doorR);

        // ¿te están mirando?
        const myViewing = CAM_VIEWING[cli.room];
        const beingWatched = s.viewing !== 0 && s.viewing === myViewing;
        watched.classList.toggle('on', !!beingWatched && cli.phase === 'night');

        // luces del pasillo
        const inHall = ['2A', '2B', '4A', '4B'].includes(cli.room);
        const lightOn = inHall && ((cli.room[0] === '2' && s.lightL) || (cli.room[0] === '4' && s.lightR));
        document.body.classList.toggle('light-on', !!lightOn);
        if (lightOn && Date.now() - (cli._lightToastAt || 0) > 5000) {
            cli._lightToastAt = Date.now();
            toast('¡La luz de la puerta se enciende! El guardia está revisando tu pasillo...');
        }

        updateMinimap(s);
    }

    // ------------------- Fases -------------------
    function setPhase(p, data) {
        cli.phase = p;
        updateAbilityUI();
        if (p === 'night') {
            hideScreen();
            toast('La noche ' + (data && data.night ? data.night : cli.night) + ' ha comenzado. ¡A cazar!');
            setView(cli.room);
        } else if (p === 'death') {
            const by = (data && data.by) || 'un animatrónico';
            const iWin = by === ROLE;
            cli.attackBusy = false;
            cli.atDoor = false;
            cli.enteredOffice = false;
            cli.walking = false;
            view.classList.remove('walk', 'fast');
            showScreen(
                roleIconTag() +
                '<h1 class="' + (iWin ? 'win' : 'dead') + '">' + (iWin ? '¡ATRAPASTE AL GUARDIA!' : 'FIN DE LA NOCHE') + '</h1>' +
                '<div class="sub">' + (iWin
                    ? 'Tu jumpscare original se ha cobrado otra víctima. ' + (ROLE === 'foxy' ? 'Corriste por el pasillo y nadie cerró la puerta a tiempo.' : 'Entraste por la puerta y el guardia no pudo cerrarla a tiempo.')
                    : 'El guardia fue atrapado por ' + by.toUpperCase() + '. Buen trabajo de equipo.') + '</div>' +
                '<div class="sub">Esperando al guardia para la revancha...</div>');
        } else if (p === 'win') {
            cli.attackBusy = false;
            cli.atDoor = false;
            cli.enteredOffice = false;
            showScreen(
                roleIconTag() +
                '<h1 class="win">6 AM</h1>' +
                '<div class="sub">El guardia sobrevivió la noche... esta vez.<br>Esperando la siguiente noche...</div>');
        } else if (p === 'menu') {
            // revancha en camino
        }
    }

    // ------------------- Posiciones desde el estado (fuente de verdad = juego) -------------------
    function syncPosition(s) {
        if (!s || !s.positions) return;
        if (ROLE === 'foxy') {
            const fp = s.positions.foxy;
            if (fp != null && fp < 4 && fp !== cli.foxPeek) {
                cli.foxPeek = fp;
                setFoxPeek(fp);
            }
            view.classList.toggle('running', (fp === 4 || fp === 5) && cli.attackBusy);
            // tras la corrida, el juego devuelve a Foxy a la cortina
            if (fp === 0 && cli.attackBusy) {
                cli.attackBusy = false;
                cli.foxPeek = 0;
                setFoxPeek(0);
                toast('La puerta estaba CERRADA. Vuelves a la cueva (¡y le chupaste energía!).');
                renderNav();
            }
            return;
        }
        const act = s.positions[ROLE];
        const room = IDX_ROOM[ROLE][act];
        if (act != null && act >= 7 && cli.phase === 'night') {
            // estás en el marco de la puerta (7) o DENTRO de la oficina (8):
            // el juego original controla todo lo que sigue
            if (!cli.atDoor) {
                cli.atDoor = true;
                setDoorView();
                renderNav();
                toast('Te asomas al marco de la puerta de la oficina...');
            }
            if (act >= 8 && !cli.enteredOffice) {
                cli.enteredOffice = true;
                toast('¡ENTRASTE A LA OFICINA! Cuando el guardia baje el monitor... ¡adiós guardia!');
                playLocal('footstep.mp3', 0.55);
            }
            // aviso: el guardia cerró la puerta mientras estás en el marco
            const myDoorClosed = (ROLE === 'bonnie') ? s.doorL : s.doorR;
            if (act === 7 && myDoorClosed && !cli.enteredOffice && Date.now() - (cli._doorShutAt || 0) > 6000) {
                cli._doorShutAt = Date.now();
                toast('¡El guardia cerró la puerta! Te retirarán al comedor...');
            }
            return;
        }
        if ((cli.atDoor || cli.attackBusy) && cli.phase === 'night') {
            // el host/juego te retiró de la puerta: liberar botones
            const wasDoor = cli.atDoor;
            cli.atDoor = false;
            cli.attackBusy = false;
            cli.enteredOffice = false;
            if (wasDoor) {
                const r = room || cli.room;   // por si el contador aún no define sala
                cli.room = r;
                setView(r);   // imagen + nombre de sala correctos (siempre)
            }
            renderNav();
            toast(wasDoor ? 'Puerta cerrada: te retiras al comedor. Podrás volver a intentarlo.' : 'Te retiran de la puerta.');
        }
        if (room && room !== cli.room && !cli.walking) {
            cli.room = room;
            setView(room);
        } else if (room && room !== cli.room && cli.walking) {
            cli.room = room; // reconciliar en silencio; la imagen cambia al final de la caminata
        }
    }

    function setFoxPeek(level) {
        setRoomImage('1C');
        view.style.filter = 'brightness(' + (0.7 + level * 0.15) + ') saturate(' + (0.9 + level * 0.12) + ')';
        renderNav();
    }

    // ------------------- Sonidos locales -------------------
    function playLocal(file, vol) {
        try {
            const au = new Audio('assets/sfx/' + file);
            au.volume = vol != null ? vol : 0.6;
            au.play().catch(() => { });
        } catch (e) { }
    }

    // ------------------- Red -------------------
    function connect() {
        showScreen('<h1>Conectando...</h1><div class="sub">Sala ' + ROOM + '</div>');
        net = new MP.Client();
        net.connect(ROOM, NAME, ROLE,
            function onReady() {
                cli.connected = true;
            },
            function onFail() {
                showScreen('<h1 class="dead">Sin conexión</h1><div class="sub">No se pudo conectar con el guardia.<br><br><a href="lobby.html" style="color:#ffd34d;">&gt; volver al lobby</a></div>');
            });

        net.on('welcome', (m) => {
            cli.night = m.night || 1;
            if (m.room) { cli.room = m.room; }
            const inNight = m.phase === 'night';
            setPhase(inNight ? 'night' : 'wait');
            if (!inNight) {
                showScreen(
                    roleIconTag() +
                    '<h1 style="color:var(--rc)">' + ROLE.toUpperCase() + '</h1>' +
                    '<div class="sub">Conectado como <b>' + ROLE.toUpperCase() + '</b> en la sala ' + ROOM + '.<br>' +
                    SPEC_INFO[ROLE].name + ': ' + SPEC_INFO[ROLE].desc + '<br><br>' +
                    'Esperando a que el guardia comience la noche...</div>');
            }
        });
        net.on('state', (m) => {
            cli.state = m.s;
            // late-join: si la noche ya empezó, entrar
            if (m.s && m.s.phase === 'night' && cli.phase !== 'night') setPhase('night');
            updateHud(m.s);
            syncPosition(m.s);
        });
        net.on('phase', (m) => {
            if (m.p === 'night') {
                cli.night = m.night || cli.night;
                cli.attackBusy = false;
                cli.atDoor = false;
                cli.enteredOffice = false;
                cli.walking = false;
                view.classList.remove('walk', 'fast', 'running');
                cli.foxPeek = 0;
                cli.room = (ROLE === 'foxy') ? '1C' : '1A'; // nueva noche: todos al inicio
                if (ROLE !== 'foxy') view.style.filter = '';
                cli.state = null;
            }
            setPhase(m.p, m);
        });
        net.on('moveOk', (m) => {
            if (ROLE === 'foxy') {
                if (m.progress != null) {
                    cli.foxPeek = m.progress;
                    setFoxPeek(m.progress);
                    if (m.progress > 0) toast('Te asomas... el guardia puede verte en la CAM 1C');
                }
                return;
            }
            cli.pendingMove = null; // confirmado por el host
            if (!cli.walking && m.room && m.room !== cli.room) setView(m.room); // corrección del juego
        });
        net.on('moveBad', (m) => {
            const why = m && m.why;
            if (cli.walking) {
                cancelWalk(why === 'demasiado-rapido'
                    ? 'Dejas un momento entre pasos...'
                    : 'No puedes avanzar ahí desde tu posición actual.');
            } else {
                toast(why === 'max-cortina'
                    ? 'Ya estás completamente fuera de la cortina'
                    : 'No puedes avanzar ahí.');
            }
        });
        net.on('atk', (m) => {
            if (m && m.ok === false) {
                cli.attackBusy = false;
                cli.atDoor = false;
                renderNav();
                if (m.why === 'puerta-cerrada') toast('¡La puerta estaba CERRADA! Tu ataque rebota.');
                else if (m.why === 'cooldown') toast('El ataque aún se enfría (12s entre intentos)...');
                else if (m.why === 'lejos') toast('Debes estar en la esquina del pasillo para entrar.');
                else if (m.why === 'asomate-primero') toast('Asímate primero fuera de la cortina.');
                else toast('Aún no puedes atacar.');
            }
        });
        net.on('ability', (m) => {
            // efecto de habilidad de OTRO animatrónico (opcional)
        });
        net.on('__disconnect', () => {
            if (cli.phase !== 'menu') {
                showScreen('<h1 class="dead">Conexión perdida</h1><div class="sub">El guardia se desconectó.<br>Reintentando...</div>');
            }
        });
    }

    // ------------------- Arranque -------------------
    document.body.className = ROLE;
    $('role-icon').src = 'assets/roles/' + ROLE + '.png';
    $('role-name').textContent = ROLE.toUpperCase();
    $('role-player').textContent = NAME;
    buildMinimap();
    updateAbilityUI();
    connect();
})();
