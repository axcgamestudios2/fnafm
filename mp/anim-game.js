// ============================================================
// FNAF 1 MP — Cliente del ANIMATRÓNICO (primera persona)
// Recorre la pizzería original en primera persona, avanza de
// escenario en escenario por las puertas, y ataca a la oficina
// con la lógica ORIGINAL del juego (el host escribe los
// contadores internos; nada se reprograma).
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
    const CAM_VIEWING = { '1A': 1, '1B': 2, '1C': 99, '5': 5, '3': 33, '2A': 3, '2B': 22, '4A': 4, '4B': 42, '6': 6, '7': 7 };

    const SPEC_INFO = {
        foxy: { name: 'SPRINT', desc: 'Corres rápido entre escenarios (5s)' },
        bonnie: { name: 'INTERFERENCIA', desc: 'Saboteas las cámaras del guardia (3s)' },
        chica: { name: 'RUIDO EN COCINA', desc: 'Haces ruido de cazuelas para confundir al guardia' },
        freddy: { name: 'RISA SOMBRÍA', desc: 'Tu risa llena la oficina y hace parpadear las luces' }
    };

    const $ = (id) => document.getElementById(id);
    const view = $('view'), glitch = $('glitch'), watched = $('watched');
    const nav = $('nav'), screenEl = $('screen'), toastEl = $('toast');

    // ------------------- Estado del cliente -------------------
    const cli = {
        room: (ROLE === 'foxy') ? '1C' : '1A',
        phase: 'connecting',
        night: 1,
        state: null,
        foxPeek: 0,
        attackBusy: false,
        sprintUntil: 0,
        cooldown: { jumpscare: 0, special: 0 },
        connected: false,
        lastMoveSent: 0
    };
    let net = null;

    // ------------------- Pantallas -------------------
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

    // ------------------- Vista / navegación -------------------
    function setView(room) {
        const wasLight = document.body.classList.contains('light-on');
        cli.room = room;
        view.style.backgroundImage = 'url(assets/rooms/' + room + '.png)';
        $('roomname').textContent = ROOM_NAME[room] || room;
        glitch.classList.add('on');
        setTimeout(() => glitch.classList.remove('on'), 320);
        playLocal('footstep.mp3', 0.4);
        renderNav();
    }

    function renderNav() {
        nav.innerHTML = '';
        if (ROLE === 'foxy') return renderFoxyNav();
        const here = cli.room;
        const opts = ADJACENCY[here] || [];
        opts.forEach(dest => {
            if (dest === '1C') return; // la cueva es territorio de Foxy
            const b = document.createElement('button');
            b.className = 'navbtn';
            b.textContent = 'AVANZAR A ' + (ROOM_NAME[dest] || dest);
            b.addEventListener('click', () => tryMove(dest));
            nav.appendChild(b);
        });
        // botón de ataque en las esquinas
        if (here === '2B' && ROLE === 'bonnie') addAttackBtn('ENTRAR A LA OFICINA');
        if (here === '4B' && (ROLE === 'chica' || ROLE === 'freddy')) addAttackBtn('ENTRAR A LA OFICINA');
    }

    function renderFoxyNav() {
        // Foxy: asomarse (máximo 3) y correr
        const peekB = document.createElement('button');
        peekB.className = 'navbtn';
        peekB.textContent = 'ASOMARSE FUERA DE LA CORTINA';
        peekB.disabled = cli.foxPeek >= 3 || cli.attackBusy;
        peekB.addEventListener('click', () => {
            net && net.send({ t: 'move', to: 'peek' });
        });
        nav.appendChild(peekB);

        const runB = document.createElement('button');
        runB.className = 'navbtn attack';
        runB.textContent = '¡CORRER A LA OFICINA!';
        runB.disabled = cli.foxPeek < 1 || cli.attackBusy;
        runB.addEventListener('click', () => doAttack());
        nav.appendChild(runB);

        // retroceder cortina
        if (cli.foxPeek > 0) {
            const back = document.createElement('button');
            back.className = 'navbtn';
            back.textContent = 'VOLVER TRAS LA CORTINA';
            back.addEventListener('click', () => {
                cli.foxPeek = 0;
                setFoxPeek(0);
                // el host lee el estado; para retroceder enviamos reset
                net && net.send({ t: 'ability', kind: 'foxyRetreat' });
                toast('Vuelves detrás de la cortina');
            });
            nav.appendChild(back);
        }
        // vista según nivel de cortina
        const overlays = ['(Tras la cortina)', '(Asomado)', '(Medio fuera)', '(Fuera de la cortina)'];
        $('roomname').textContent = ROOM_NAME['1C'] + ' ' + (overlays[cli.foxPeek] || '');
    }

    function addAttackBtn(label) {
        const b = document.createElement('button');
        b.className = 'navbtn attack';
        b.textContent = label;
        b.disabled = cli.attackBusy;
        b.addEventListener('click', doAttack);
        nav.appendChild(b);
    }

    function tryMove(dest) {
        if (!net || !cli.connected) return;
        const now = Date.now();
        const cd = now < cli.sprintUntil ? 500 : 1200;
        if (now - cli.lastMoveSent < cd) return;
        cli.lastMoveSent = now;
        net.send({ t: 'move', to: dest });
    }

    function doAttack() {
        if (!net || cli.attackBusy) return;
        net.send({ t: 'attack' });
        cli.attackBusy = true;
        renderNav();
        if (ROLE === 'foxy') {
            toast('¡¡CORREEEES!! ¡Te disparas por el pasillo oeste!');
            playLocal('sprint.mp3', 0.7);
        } else {
            toast('Entras a la oscuridad de la puerta... la oficina huele a guardia.');
        }
        // animación de "corriendo"
        glitch.classList.add('on');
        setTimeout(() => glitch.classList.remove('on'), 900);
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
        $('ab-jump').disabled = cdJ > 0 || cli.phase !== 'night';
        $('ab-spec').disabled = cdS > 0 || cli.phase !== 'night';
        $('spec-name').textContent = SPEC_INFO[ROLE].name;
    }
    setInterval(updateAbilityUI, 250);

    // ------------------- HUD -------------------
    function updateHud(s) {
        if (!s) return;
        const h = Math.floor((s.minute || 0) / 60);
        const hours = ['12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM', '6 AM'];
        $('h-hour').textContent = hours[Math.min(h, 6)] + ' · Noche ' + (s.night || cli.night);
        const pw = document.getElementById('h-power');
        pw.textContent = 'ENERGÍA: ' + (s.powerPct != null ? s.powerPct : '--') + '%';
        pw.classList.toggle('pw-low', (s.powerPct || 100) <= 20);
        $('h-doors').textContent = 'PUERTAS: I ' + (s.doorL ? 'CERRADA' : 'ABIERTA') + ' / D ' + (s.doorR ? 'CERRADA' : 'ABIERTA');

        // ¿te están mirando?
        const myViewing = CAM_VIEWING[cli.room];
        const beingWatched = s.viewing !== 0 && s.viewing === myViewing && cli.room !== null;
        watched.classList.toggle('on', !!beingWatched && cli.phase === 'night');

        // luces del pasillo
        const inHall = ['2A', '2B', '4A', '4B'].includes(cli.room);
        const lightOn = inHall && ((cli.room[0] === '2' && s.lightL) || (cli.room[0] === '4' && s.lightR));
        document.body.classList.toggle('light-on', !!lightOn);
        if (lightOn && !cli._lightToastAt || Date.now() - cli._lightToastAt > 4000) {
            cli._lightToastAt = Date.now();
            toast('¡La luz de la puerta se enciende! El guardia está revisando tu pasillo...');
        }
    }

    // ------------------- Fases -------------------
    function setPhase(p, data) {
        cli.phase = p;
        updateAbilityUI();
        if (p === 'night') {
            hideScreen();
            toast('La noche ' + (data && data.night ? data.night : '') + ' ha comenzado. ¡A cazar!');
            setView(cli.room);
        } else if (p === 'death') {
            const by = (data && data.by) || 'un animatrónico';
            const iWin = by === ROLE;
            cli.attackBusy = false;
            showScreen(
                '<h1 class="' + (iWin ? 'win' : 'dead') + '">' + (iWin ? '¡ATRAPASTE AL GUARDIA!' : 'FIN DE LA NOCHE') + '</h1>' +
                '<div class="sub">' + (iWin
                    ? 'Tu jumpscare original se ha cobrado otra víctima. ' + (ROLE === 'foxy' ? 'Corriste por el pasillo y nadie cerró la puerta a tiempo.' : 'Entraste por la puerta y el guardia no pudo cerrarla a tiempo.')
                    : 'El guardia fue atrapado por ' + by.toUpperCase() + '. Buen trabajo de equipo.') + '</div>' +
                '<div class="sub">Esperando al guardia para la revancha...</div>');
        } else if (p === 'win') {
            cli.attackBusy = false;
            showScreen(
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
            // tras la corrida, el juego devuelve a Foxy a la cortina
            if (fp === 0 && cli.attackBusy) {
                cli.attackBusy = false;
                cli.foxPeek = 0;
                setFoxPeek(0);
                toast('La puerta estaba CERRADA. Vuelves a la cueva (¡y le chupaste energía!).');
                renderNav();
            }
        } else {
            const act = s.positions[ROLE];
            // mapeo inverso del índice de actividad
            const IDX = {
                bonnie: { 0: '1A', 2: '1B', 3: '5', 4: '2A', 5: '3', 6: '2B' },
                chica: { 0: '1A', 2: '1B', 3: '7', 4: '6', 5: '4A', 6: '4B' },
                freddy: { 0: '1A', 2: '1B', 3: '7', 4: '6', 5: '4A', 6: '4B' }
            }[ROLE];
            const room = IDX[act];
            if (room && room !== cli.room) {
                cli.room = room;
                setView(room);
            }
            if (act === 7 && cli.attackBusy) {
                toast('Estás en el marco de la puerta... decide, guardia.');
            }
        }
    }

    function setFoxPeek(level) {
        // el nivel cambia lo que se ve de la cueva
        view.style.backgroundImage = 'url(assets/rooms/1C.png)';
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
                    '<h1>' + ROLE.toUpperCase() + '</h1>' +
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
                cli.foxPeek = 0;
                cli.room = (ROLE === 'foxy') ? '1C' : '1A'; // nueva noche: todos al inicio
                cli.state = null;
            }
            setPhase(m.p, m);
        });
        net.on('moveOk', (m) => {
            if (m.room && m.room !== '1C' && ROLE !== 'foxy') { cli.room = m.room; setView(m.room); }
            if (ROLE === 'foxy' && m.progress != null) { cli.foxPeek = m.progress; setFoxPeek(m.progress); toast('Te asomas... el guardía puede verte en la cámara 1C'); }
        });
        net.on('moveBad', (m) => {
            toast(m && m.why === 'max-cortina' ? 'Ya estás completamente fuera de la cortina' : 'No puedes avanzar ahí desde tu posición actual');
        });
        net.on('atk', (m) => {
            if (m && m.ok === false) {
                cli.attackBusy = false;
                toast(m.why === 'lejos' ? 'Debes estar en la esquina del pasillo para entrar' : (m.why === 'asomate-primero' ? 'Asímate primero fuera de la cortina' : 'Aún no puedes atacar'));
                renderNav();
            }
        });
        net.on('anim', (m) => {
            // otros animatrónicos se movieron (opcional: mostrar un indicador)
        });
        net.on('__disconnect', () => {
            if (cli.phase !== 'menu') {
                showScreen('<h1 class="dead">Conexión perdida</h1><div class="sub">El guardia se desconectó.<br>Reintentando...</div>');
            }
        });
    }

    // arrancar
    $('roletag').textContent = 'JUGANDO COMO: ' + ROLE.toUpperCase();
    updateAbilityUI();
    connect();
})();
