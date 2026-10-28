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
//
// v3 (balanceo + freddy):
//  - Mapa de FREDDY corregido (sus contadores 0-2 son ESCENARIO; su
//    ruta va desplazada +1 — antes todas sus salas estaban mal).
//  - CUENTA ATRÁS de movimiento entre salas (balanceo: antes podía
//    cruzar la pizzería en segundos). Visible en los botones.
//  - LÍMITE de tiempo en el marco de la puerta con cuenta atrás
//    visible (anti-camping: el host te retira pasados 10s).
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
    // ⚠️ v8: mapa REAL verificado contra el render nativo del juego:
    //   bonnie: 0=1A, 1=1B, 2=5(bastidores), 3=2A, 4=3(almacén), 5=2B,
    //           6=puerta O, 7=marco, 8=oficina
    //   chica:  0=1A, 1=1B, 2=7(baños), 3=6(cocina), 4=4A, 5=4B,
    //           6=puerta E, 7=marco, 8=oficina
    //   freddy: desplazado +1: 0/1/2=1A, 3=1B, 4=7, 5=6, 6=4A, 7=4B, 8=puerta
    const IDX_ROOM = {
        bonnie: { 0: '1A', 1: '1B', 2: '5', 3: '2A', 4: '3', 5: '2B', 6: '2B', 7: 'doorL', 8: 'doorIn' },
        chica: { 0: '1A', 1: '1B', 2: '7', 3: '6', 4: '4A', 5: '4B', 6: '4B', 7: 'doorR', 8: 'doorIn' },
        freddy: { 0: '1A', 1: '1A', 2: '1A', 3: '1B', 4: '7', 5: '6', 6: '4A', 7: '4B', 8: 'doorR', 9: 'doorIn' }
    };
    // valor de "estás en el marco de la puerta" por rol
    const DOOR_ACT = { bonnie: 7, chica: 7, freddy: 8 };

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
    const DOOR_CD = 10000; // espera entre aproximaciones a la puerta
    const BURST_MS = 1200; // ventana de irrupción (igual que el host)
    // BALANCEO (v7.2 — igual que el host): cuenta atrás entre pasos.
    const MOVE_CD = 6000;
    // Máximo en el marco de la puerta antes de que el host te retire
    const DOOR_MAX_MS = 8000;
    const cli = {
        room: (ROLE === 'foxy') ? '1C' : '1A',
        phase: 'connecting',
        night: 1,
        state: null,
        foxPeek: 0,
        attackBusy: false,
        atDoor: false,
        doorSide: null,        // 'L' | 'R' mientras estás en el marco
        enteredOffice: false,
        bursting: false,       // irrupción en curso (1.2s)
        burstAt: 0,
        attackAt: 0,
        lastDoorAt: 0,         // cooldown local del botón ASOMARSE
        walking: false,
        walkDest: null,
        walkFrom: null,
        pendingMove: null,
        sprintUntil: 0,
        runShown: false,       // vista de carrera de Foxy activa
        doorSince: 0,         // cuándo llegaste al marco (para la cuenta atrás)
        cooldown: { jumpscare: 0, special: 0 },
        stunUntil: 0,           // ⚡ DESTELLO del guardia activo hasta esta fecha
        connected: false,
        lastMoveSent: 0
    };
    let net = null;
    let wasStunned = false;   // ⚡ para restaurar los botones al acabar el destello
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
                if (act != null && act >= DOOR_ACT[role]) pos = DOOR_POS[role === 'bonnie' ? 'L' : 'R'];
                else pos = centerOf(cli.room);
            } else if (role === 'foxy') {
                const fp = s.positions ? s.positions.foxy : null;
                if (fp === 4) { pos = centerOf('2A'); running = true; }
                else pos = centerOf('1C');
            } else {
                const act = s.positions ? s.positions[role] : null;
                if (act != null && act >= DOOR_ACT[role]) pos = DOOR_POS[role === 'bonnie' ? 'L' : 'R'];
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
        // la cocina es SOLO AUDIO en el juego original: el guardia nunca
        // te ve aquí, solo te oye (cacerolas). Se lo avisamos al jugador.
        if (room === '6' && Date.now() - (cli._kitchenToastAt || 0) > 15000) {
            cli._kitchenToastAt = Date.now();
            toast('COCINA sin cámara: el guardia solo puede OÍRTE aquí.', 3600);
        }
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
        cli.doorSide = left ? 'L' : 'R';
        setRoomImage(left ? 'doorL' : 'doorR');
        document.body.classList.add('atdoor');
        cli.doorSince = Date.now();   // cuenta atrás del límite de puerta
        $('roomname').textContent = left
            ? 'MARCO DE LA PUERTA IZQUIERDA'
            : 'MARCO DE LA PUERTA DERECHA';
    }

    function leaveDoorView() {
        document.body.classList.remove('atdoor');
        view.classList.remove('bursting');
        cli.doorSince = 0;
        updateDoorBanner(null, true);
    }

    function myDoorClosed(s) {
        s = s || cli.state;
        if (!s) return false;
        return cli.doorSide === 'L' ? !!s.doorL : !!s.doorR;
    }

    // Banner de estado de la puerta mientras estás en el marco
    function updateDoorBanner(s, hide) {
        const el = $('doorbanner');
        if (!el) return;
        if (hide || !cli.atDoor) { el.className = ''; el.style.display = 'none'; return; }
        // cuenta atrás del límite de tiempo en la puerta (anti-camping)
        let timeLeft = '';
        if (!cli.enteredOffice && !cli.bursting && cli.doorSince) {
            const left = Math.max(0, Math.ceil((DOOR_MAX_MS - (Date.now() - cli.doorSince)) / 1000));
            timeLeft = '<small>⏱ Tiempo en la puerta: ' + left + 's — luego te retiran</small>';
        }
        if (cli.enteredOffice) {
            el.className = 'in';
            el.innerHTML = '☠ ¡ESTÁS DENTRO DE LA OFICINA! ☠<small>El guardia está perdido — jumpscare original en camino</small>';
        } else if (cli.bursting) {
            el.className = 'burst';
            el.innerHTML = '¡IRRUPIENDO EN LA OFICINA!<small>El guardia aún puede cerrar la puerta...</small>';
        } else if (myDoorClosed(s)) {
            el.className = 'closed';
            el.innerHTML = 'PUERTA CERRADA<small>No puedes entrar — retírate y espera tu momento</small>' + timeLeft;
        } else {
            el.className = 'open';
            el.innerHTML = 'PUERTA ABIERTA<small>El guardia está expuesto — ¡PUEDES ATACAR!</small>' + timeLeft;
        }
        el.style.display = 'block';
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
        return cli.walking || cli.attackBusy || cli.atDoor || cli.phase !== 'night' || Date.now() < cli.stunUntil;
    }

    // ⚡ ¿aturdido por el DESTELLO del guardia?
    function stunned() { return Date.now() < cli.stunUntil; }

    function stunLeft() { return Math.max(0, cli.stunUntil - Date.now()); }

    function mkNavBtn(cls, arrow, label, onClick, disabled, sub) {
        const b = document.createElement('button');
        b.className = 'navbtn' + (cls ? ' ' + cls : '');
        b.innerHTML = '<span class="dir">' + arrow + '</span><span class="txt">' + label +
            (sub ? '<small>' + sub + '</small>' : '') + '</span>';
        b.disabled = !!disabled;
        b.__sub = sub || '';
        if (onClick) b.addEventListener('click', onClick);
        nav.appendChild(b);
        return b;
    }

    function doorCdLeft() {
        return Math.max(0, DOOR_CD - (Date.now() - cli.lastDoorAt));
    }

    function renderNav() {
        nav.innerHTML = '';
        if (ROLE === 'foxy') return renderFoxyNav();
        if (cli.atDoor) return renderDoorNav();
        const here = cli.room;
        // salas legales para este rol (el mapa del juego es distinto por
        // animatrónico: bonnie va al oeste, chica/freddy al este). Antes se
        // mostraban botones del "otro lado" que el host rechazaba y la
        // caminata se rebobinaba — bug: "aparece 1 segundo y se regresa".
        const legal = Object.values(IDX_ROOM[ROLE] || {});
        const opts = (ADJACENCY[here] || []).filter(dest =>
            dest !== '1C' && legal.indexOf(dest) !== -1);
        opts.forEach(dest => {
            const arrow = (NAV_ARROW[here] && NAV_ARROW[here][dest]) || '•';
            const b = mkNavBtn('', arrow, ROOM_NAME[dest] || dest, () => tryMove(dest), navDisabled());
            b.__moveBtn = true;   // la cuenta atrás de movimiento se pinta aquí
        });
        // aproximación a la puerta desde la esquina del pasillo
        const atCorner = (here === '2B' && ROLE === 'bonnie') || (here === '4B' && (ROLE === 'chica' || ROLE === 'freddy'));
        if (atCorner) {
            const cd = doorCdLeft();
            if (ROLE === 'freddy') {
                // CANON FNAF1: Freddy NO se asoma al marco — se cuela directo
                // si la puerta derecha está abierta; su kill es el APAGÓN.
                const doorShut = cli.state && cli.state.doorR;
                const b = mkNavBtn('attack kill', '◉', '¡COLARSE EN LA OFICINA!', freddySlipAttack,
                    cd > 0 || cli.attackBusy || navDisabled() || !!doorShut,
                    cd > 0 ? ('enfriando ' + Math.ceil(cd / 1000) + 's')
                        : (doorShut ? 'la puerta derecha está CERRADA' : 'canon: Freddy corta la luz'));
                b.id = 'btn-door';
            } else {
                const side = (ROLE === 'bonnie') ? 'puerta izquierda' : 'puerta derecha';
                const b = mkNavBtn('attack', '◑', 'ASOMARSE A LA PUERTA', doAttack,
                    cd > 0 || cli.attackBusy || navDisabled(),
                    cd > 0 ? ('enfriando ' + Math.ceil(cd / 1000) + 's') : side);
                b.id = 'btn-door';
            }
        }
    }

    // ---- Botones EXCLUSIVOS del marco de la puerta ----
    function renderDoorNav() {
        if (cli.enteredOffice) {
            mkNavBtn('wait', '☠', '¡DENTRO DE LA OFICINA!', null, true, 'El guardia ya no puede hacer nada...');
            return;
        }
        if (ROLE === 'freddy') {
            // Freddy se cuela en UN paso: dentro del flujo de colada no hay
            // segunda decisión (el apagón del host ejecuta el kill original).
            mkNavBtn('burst', '»', '¡COLÁNDOSE EN LA OFICINA!', null, true,
                cli.bursting ? 'el guardia aún puede cerrar la puerta...' : 'esperando...');
            return;
        }
        if (cli.bursting) {
            mkNavBtn('burst', '»', '¡IRRUPIENDO!', null, true, 'El guardia puede cerrar la puerta...');
            return;
        }
        const closed = myDoorClosed();
        mkNavBtn('attack kill', '▶', '¡ENTRAR Y ATACAR!', attackFromDoor, closed,
            closed ? 'la puerta está cerrada' : 'el guardia no reacciona a tiempo');
        mkNavBtn('', '◁', 'RETIRARSE A LA ESQUINA', retreatFromDoor, false);
    }

    function retreatFromDoor() {
        if (!cli.atDoor && !cli.attackBusy) return;
        if (!net || !cli.connected) return;
        net.send({ t: 'ability', kind: 'doorRetreat' });
        toast('Te retiras de la puerta de vuelta a la esquina...');
        // respaldo: si el host no contesta en 1.5s, reintentar una vez
        setTimeout(() => {
            if (cli.atDoor && cli.phase === 'night') {
                net && net.send({ t: 'ability', kind: 'doorRetreat' });
            }
        }, 1500);
    }

    function renderFoxyNav() {
        // Foxy: asomarse (máximo 2 — el valor 3 dispara la carrera REAL
        // del juego y mataba al guardia sin que Foxy atacara) y correr
        const peekBtn = mkNavBtn('', '◑', 'ASOMARSE FUERA DE LA CORTINA', () => {
            if (navDisabled()) return;
            if (stunned()) { toast('⚡ ¡Aturdido por el destello! Espera ' + Math.ceil(stunLeft() / 1000) + 's...'); return; }
            if (Date.now() - cli.lastMoveSent < (Date.now() < cli.sprintUntil ? MOVE_CD / 2 : MOVE_CD)) return;
            cli.lastMoveSent = Date.now();
            net && net.send({ t: 'move', to: 'peek' });
        }, cli.foxPeek >= 2 || cli.attackBusy || cli.phase !== 'night',
            cli.foxPeek >= 2 ? 'ya estás medio fuera — ¡CORRE!' : 'el guardia te ve en la CAM 1C');
        peekBtn.__moveBtn = true;
        mkNavBtn('attack', '!', '¡CORRER A LA OFICINA!', doAttack, cli.foxPeek < 1 || cli.attackBusy || cli.phase !== 'night',
            cli.foxPeek < 1 ? 'asómate primero' : 'por el pasillo oeste');
        if (cli.foxPeek > 0 && !cli.attackBusy) {
            mkNavBtn('', '◁', 'VOLVER TRAS LA CORTINA', () => {
                cli.foxPeek = 0;
                setFoxPeek(0);
                net && net.send({ t: 'ability', kind: 'foxyRetreat' });
                toast('Vuelves detrás de la cortina');
            }, false);
        }
        const overlays = ['(Tras la cortina)', '(Asomado)', '(Medio fuera)'];
        if (!cli.walking) $('roomname').textContent = ROOM_NAME['1C'] + ' ' + (overlays[cli.foxPeek] || '');
    }

    function tryMove(dest) {
        if (!net || !cli.connected || cli.phase !== 'night') return;
        if (stunned()) { toast('⚡ ¡Aturdido por el destello! Espera ' + Math.ceil(stunLeft() / 1000) + 's para moverte...'); return; }
        if (cli.walking) { toast('Ya te estás moviendo...'); return; }
        if (cli.attackBusy || cli.atDoor) { toast('Estás en la puerta de la oficina: usa sus botones.'); return; }
        const now = Date.now();
        // BALANCEO (v3): cuenta atrás entre pasos — el cliente regula con el
        // MISMO ritmo que el host para que nunca haya rechazos/rebobinados.
        const pace = now < cli.sprintUntil ? MOVE_CD / 2 : MOVE_CD;
        if (now - cli.lastMoveSent < pace) {
            toast('Cuenta atrás: espera ' + Math.ceil((pace - (now - cli.lastMoveSent)) / 1000) + 's para moverte...');
            return;
        }
        cli.lastMoveSent = now;
        cli.pendingMove = dest;
        net.send({ t: 'move', to: dest });
        startWalk(dest); // optimista: camina YA, el host confirma en breve
    }

    // ---- Aproximación desde la esquina hasta el marco de la puerta ----
    function doAttack() {
        if (!net || !cli.connected || cli.phase !== 'night' || cli.attackBusy || cli.walking || cli.atDoor) return;
        if (stunned()) { toast('⚡ ¡Aturdido por el destello! No puedes atacar...'); return; }
        net.send({ t: 'attack' });
        cli.attackBusy = true;
        cli.attackAt = Date.now();
        cli.lastDoorAt = Date.now();
        renderNav();
        toast('Cruzas la esquina y te asomas al marco de la puerta...');
        glitch.classList.add('on');
        setTimeout(() => glitch.classList.remove('on'), 600);
        // seguridad: si el host/juego no resuelve en 6s, liberar el botón
        setTimeout(() => {
            if (cli.attackBusy && !cli.atDoor && cli.phase === 'night' && Date.now() - cli.attackAt >= 5800) {
                cli.attackBusy = false;
                renderNav();
                toast('No lograste llegar al marco...');
            }
        }, 6100);
    }

    // ---- FREDDY: colarse en la oficina desde la esquina (canon) ----
    // Freddy no usa el marco: si la puerta derecha está abierta, entra y
    // el host ejecuta el APAGÓN original (oscuridad + Toreador + kill).
    function freddySlipAttack() {
        if (!net || !cli.connected || cli.phase !== 'night' || cli.attackBusy || cli.walking || cli.atDoor) return;
        if (stunned()) { toast('⚡ ¡Aturdido por el destello! No puedes colarte...'); return; }
        if (cli.state && cli.state.doorR) {
            toast('¡La puerta derecha está CERRADA! No puedes colarte.');
            return;
        }
        net.send({ t: 'attack', door: true });
        cli.attackBusy = true;
        cli.attackAt = Date.now();
        cli.lastDoorAt = Date.now();
        renderNav();
        toast('Cruzas la esquina en silencio y te cuelas en la oscuridad...');
        glitch.classList.add('on');
        setTimeout(() => glitch.classList.remove('on'), 600);
        // seguridad: si el host no resuelve en 6s, liberar el botón
        setTimeout(() => {
            if (cli.attackBusy && !cli.atDoor && cli.phase === 'night' && Date.now() - cli.attackAt >= 5800) {
                cli.attackBusy = false;
                renderNav();
                toast('No lograste colarte...');
            }
        }, 6100);
    }

    // ---- Irrupción: ataque DESDE el marco de la puerta ----
    function attackFromDoor() {
        if (!net || !cli.connected || !cli.atDoor || cli.bursting || cli.enteredOffice) return;
        if (stunned()) { toast('⚡ ¡Aturdido por el destello! No puedes irrumpir...'); return; }
        if (myDoorClosed()) { toast('¡La puerta está CERRADA! Retírate y espera.'); return; }
        net.send({ t: 'attack', door: true });
        cli.bursting = true;
        cli.burstAt = Date.now();
        view.classList.add('bursting');
        playLocal('sprint.mp3', 0.8);
        renderNav();
        updateDoorBanner();
        toast('¡TE LANZAS HACIA EL INTERIOR DE LA OFICINA!');
        // Al terminar la irrupción sin rebote: estás DENTRO — el temporizador
        // ORIGINAL del juego ejecutará el kill (si el guardia cierra a tiempo,
        // el host te rebota con doorOut y todo se limpia en ese momento).
        setTimeout(() => {
            if (cli.bursting && cli.phase === 'night' && cli.atDoor) {
                cli.bursting = false;
                cli.enteredOffice = true;
                view.classList.remove('bursting');
                renderNav();
                updateDoorBanner();
                toast('¡ENTRASTE A LA OFICINA! El guardia ya no puede hacer nada...');
            }
        }, BURST_MS + 250);
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
        if (stunned()) { toast('⚡ ¡Aturdido por el destello! Ni tus habilidades responden...'); return; }
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
            playLocal('scream.mp3', 0.7);
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


    function moveCdLeft() {
        const pace = Date.now() < cli.sprintUntil ? MOVE_CD / 2 : MOVE_CD;
        return Math.max(0, pace - (Date.now() - cli.lastMoveSent));
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

        // ⚡ DESTELLO: mientras estás aturdido, TODOS los botones bloqueados
        const stunL = stunLeft();
        const navBtns = nav.querySelectorAll('button');
        if (stunL > 0 && cli.phase === 'night') {
            updateStunBar();
            navBtns.forEach(b => {
                b.disabled = true;
                let small = b.querySelector('small');
                if (!small) { small = document.createElement('small'); b.querySelector('.txt').appendChild(small); }
                small.textContent = '⚡ aturdido ' + Math.ceil(stunL / 1000) + 's';
                b.classList.add('cooling');
            });
            $('ab-jump').disabled = true;
            $('ab-spec').disabled = true;
            wasStunned = true;
            return;   // cegado: nada más que pintar
        }
        updateStunBar();          // oculta la barra si ya terminó
        if (wasStunned) { wasStunned = false; renderNav(); }   // restaurar botones

        // CUENTA ATRÁS DE MOVIMIENTO sobre los botones de sala (balanceo):
        // deshabilitados y con el tiempo restante hasta el próximo paso.
        const mcd = moveCdLeft();
        navBtns.forEach(b => {
            if (!b.__moveBtn) return;
            let small = b.querySelector('small');
            if (mcd > 0 && cli.phase === 'night') {
                b.disabled = true;
                b.__wasCooling = true;
                if (!small) {
                    small = document.createElement('small');
                    b.querySelector('.txt').appendChild(small);
                }
                small.textContent = '⏱ en ' + Math.ceil(mcd / 1000) + 's';
                b.classList.add('cooling');
            } else {
                b.classList.remove('cooling');
                if (small && small.textContent.indexOf('⏱') === 0) {
                    small.textContent = b.__sub || '';
                    if (!b.__sub) small.remove();
                }
                if (b.__wasCooling) {
                    b.__wasCooling = false;
                    renderNav();      // fin de la cuenta atrás: restaurar botones
                }
            }
        });

        // refresco en vivo del cooldown del botón ASOMARSE (sin re-render)
        const b = $('btn-door');
        if (b) {
            const cd = doorCdLeft();
            const small = b.querySelector('small');
            if (cd > 0) {
                b.disabled = true;
                if (small) small.textContent = 'enfriando ' + Math.ceil(cd / 1000) + 's';
            } else if (small && small.textContent.indexOf('enfriando') === 0) {
                renderNav();
            }
        }
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

        // banner de la puerta + compañeros de sala
        if (cli.atDoor) updateDoorBanner(s);
        updateCompanions(s);

        updateMinimap(s);
    }

    // ¿Quién más está en tu misma sala? (presencia en primera persona)
    function updateCompanions(s) {
        const box = $('mates');
        if (!box || !s || !s.positions) return;
        const here = [];
        ['foxy', 'bonnie', 'chica', 'freddy'].forEach(r => {
            if (r === ROLE) return;
            const pos = s.positions[r];
            if (pos == null) return;
            let room = null;
            if (r === 'foxy') room = (pos >= 4) ? '2A' : '1C';
            else if (pos < DOOR_ACT[r]) room = IDX_ROOM[r][pos] || null;
            if (room === cli.room) here.push(r);
        });
        if (here.length) {
            box.innerHTML = here.map(r =>
                '<img src="assets/roles/' + r + '.png" alt="' + r.toUpperCase() + '" title="' + r.toUpperCase() + ' está aquí">').join('');
            box.style.display = 'flex';
        } else {
            box.style.display = 'none';
        }
    }

    // ------------------- Fases -------------------
    function resetDoorState() {
        cli.attackBusy = false;
        cli.atDoor = false;
        cli.enteredOffice = false;
        cli.bursting = false;
        cli.runShown = false;
        cli.walking = false;
        cli.doorSince = 0;
        view.classList.remove('walk', 'fast', 'running', 'bursting');
        leaveDoorView();
    }

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
            resetDoorState();
            if (iWin) playLocal('scream.mp3', 0.85);
            const winMsg = ROLE === 'freddy'
                ? 'Apagaste la oficina y el Toreador sonó en la oscuridad. El guardia nunca te vio llegar.'
                : (ROLE === 'foxy'
                    ? 'Corriste por el pasillo y nadie cerró la puerta a tiempo.'
                    : 'Irrumpiste en la oficina y el guardia no pudo cerrarla a tiempo.');
            showScreen(
                roleIconTag() +
                '<h1 class="' + (iWin ? 'win' : 'dead') + '">' + (iWin ? '¡ATRAPASTE AL GUARDIA!' : 'FIN DE LA NOCHE') + '</h1>' +
                '<div class="sub">' + (iWin
                    ? 'Tu jumpscare original se ha cobrado otra víctima. ' + winMsg
                    : 'El guardia fue atrapado por ' + by.toUpperCase() + '. Buen trabajo de equipo.') + '</div>' +
                '<div class="sub">Esperando al guardia para la revancha...</div>');
        } else if (p === 'win') {
            resetDoorState();
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
            // CARRERA de Foxy: imagen de sprint por el pasillo + animación
            if ((fp === 4 || fp === 5) && cli.attackBusy) {
                if (!cli.runShown) {
                    cli.runShown = true;
                    setRoomImage('run');
                    view.classList.add('running');
                    $('roomname').textContent = '¡CORRIENDO POR EL PASILLO OESTE!';
                    toast('¡¡CORREEES!! El guardia todavía puede cerrar la puerta...');
                }
            } else if (cli.runShown && fp != null && fp < 4) {
                // la carrera terminó (rebote o nueva noche)
                cli.runShown = false;
                view.classList.remove('running');
                setFoxPeek(cli.foxPeek);
                renderNav();
            }
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
        const doorVal = DOOR_ACT[ROLE];          // 7 (bonnie/chica) | 8 (freddy)
        if (act != null && act >= doorVal && cli.phase === 'night') {
            // estás en el marco de la puerta (marco) o DENTRO de la oficina:
            // el juego original controla todo lo que sigue
            if (!cli.atDoor) {
                cli.atDoor = true;
                cli.attackBusy = false;   // llegaste: dejan de aplicar los botones de esquina
                setDoorView();
                renderNav();
                updateDoorBanner(s);
                playLocal('footstep.mp3', 0.5);
                toast('Te asomas al marco de la puerta... vigila el estado de la puerta.');
            }
            if (act >= doorVal + 1 && !cli.enteredOffice) {
                cli.enteredOffice = true;
                cli.bursting = false;
                view.classList.remove('bursting');
                renderNav();
                updateDoorBanner(s);
                toast('¡ENTRASTE A LA OFICINA! Cuando el guardia baje el monitor... ¡adiós guardia!');
                playLocal('footstep.mp3', 0.55);
            }
            // v7.2: el guion del juego puede "colarte" dentro un instante — el
            // host (autoridad del jugador) te devuelve al marco. No te quedes
            // clavado en la UI de "DENTRO DE LA OFICINA" por un espejismo.
            if (cli.enteredOffice && !cli.bursting && act === doorVal) {
                cli.enteredOffice = false;
                view.classList.remove('bursting');
                renderNav();
                updateDoorBanner(s);
            }
            // aviso: el guardia cerró la puerta mientras estás en el marco
            const myDoorClosed = (ROLE === 'bonnie') ? s.doorL : s.doorR;
            if (act === doorVal && myDoorClosed && !cli.enteredOffice && !cli.bursting &&
                Date.now() - (cli._doorShutAt || 0) > 6000) {
                cli._doorShutAt = Date.now();
                toast('¡El guardia cerró la puerta! Retírate o espera a que la abra...');
            }
            return;
        }
        if ((cli.atDoor || cli.attackBusy) && cli.phase === 'night') {
            // el host/juego te retiró de la puerta: liberar botones
            const wasDoor = cli.atDoor;
            cli.atDoor = false;
            cli.attackBusy = false;
            cli.enteredOffice = false;
            cli.bursting = false;
            leaveDoorView();
            if (wasDoor) {
                const r = room || cli.room;   // por si el contador aún no define sala
                cli.room = r;
                setView(r);   // imagen + nombre de sala correctos (siempre)
            }
            renderNav();
            toast(wasDoor ? 'Vuelves a la sala. Podrás volver a intentarlo.' : 'Te retiran de la puerta.');
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

    // ------------------- ⚡ DESTELLO DEL GUARDIA -------------------
    function playZapLocal() {
        // zumbido eléctrico sintetizado — el mismo que oye el guardia
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            const ctx = new AC();
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(1750, ctx.currentTime);
            o.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.38);
            g.gain.setValueAtTime(0.4, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42);
            o.connect(g); g.connect(ctx.destination);
            o.start(); o.stop(ctx.currentTime + 0.45);
            setTimeout(() => { try { ctx.close(); } catch (e) { } }, 700);
        } catch (e) { }
    }

    function stunFlash() {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;inset:0;z-index:8;background:#fff;pointer-events:none;opacity:0.9;transition:opacity .5s;';
        document.body.appendChild(d);
        requestAnimationFrame(() => { d.style.opacity = '0'; });
        setTimeout(() => d.remove(), 600);
    }

    function updateStunBar() {
        let el = $('stunbar');
        if (!el) return;
        const left = stunLeft();
        if (left <= 0 || cli.phase !== 'night') { el.style.display = 'none'; return; }
        el.style.display = 'block';
        const t = Math.ceil(left / 1000);
        const html = '⚡ ATURDIDO POR EL DESTELLO ⚡<small>El guardia te cegó — puedes moverte de nuevo en ' + t + 's</small>';
        if (el.__h !== html) { el.__h = html; el.innerHTML = html; }
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

        // PeerJS ahora se carga con CDN de respaldo (asíncrono): hay que
        // esperar a que exista antes de crear la conexión, o muere aquí.
        const t0 = Date.now();
        (function waitPeer() {
            if (typeof window.Peer === 'undefined') {
                if (Date.now() - t0 > 15000) {
                    showScreen('<h1 class="dead">Sin conexión</h1><div class="sub">No se pudo cargar la red (PeerJS).<br>Revisa tu internet y vuelve a entrar.<br><br><a href="lobby.html" style="color:#ffd34d;">&gt; volver al lobby</a></div>');
                    return;
                }
                setTimeout(waitPeer, 120);
                return;
            }
            net.connect(ROOM, NAME, ROLE,
                function onReady() {
                    cli.connected = true;
                },
                function onFail() {
                    showScreen('<h1 class="dead">Sin conexión</h1><div class="sub">No se pudo conectar con el guardia.<br><br><a href="lobby.html" style="color:#ffd34d;">&gt; volver al lobby</a></div>');
                });
            // AUTO-CURACIÓN: a veces PeerJS se queda en un bucle de reconexión
            // mudo (p. ej. tras una recarga del guardia). Si en 25s no llegó
            // el 'welcome' de ESTA conexión, recargar UNA sola vez (flag rc=1).
            cli.gotWelcome = false;
            if (window.location.search.indexOf('rc=') === -1) {
                const checkT0 = Date.now();
                const iv = setInterval(() => {
                    if (cli.gotWelcome) { clearInterval(iv); return; }
                    if (Date.now() - checkT0 > 25000) {
                        clearInterval(iv);
                        window.location.href = window.location.href + '&rc=1';
                    }
                }, 2000);
            }
        })();

        net.on('welcome', (m) => {
            cli.gotWelcome = true;
            cli.night = m.night || 1;
            if (m.room) { cli.room = m.room; }
            const inNight = m.phase === 'night';
            if (inNight) {
                // reconexión a mitad de noche: limpiar TODO estado de puerta
                // heredado de la noche/anterior conexión (bug: el cliente
                // quedaba pegado en "DENTRO DE LA OFICINA" para siempre)
                resetDoorState();
            }
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
            // late-join: si la noche ya empezó, entrar (con estado limpio)
            if (m.s && m.s.phase === 'night' && cli.phase !== 'night') { resetDoorState(); setPhase('night'); }
            updateHud(m.s);
            syncPosition(m.s);
        });
        net.on('phase', (m) => {
            if (m.p === 'night') {
                cli.night = m.night || cli.night;
                resetDoorState();
                cli.foxPeek = 0;
                cli.stunUntil = 0;   // ⚡ nueva noche: el destello se limpia
                const sb = $('stunbar'); if (sb) sb.style.display = 'none';
                cli.room = (ROLE === 'foxy') ? '1C' : '1A'; // nueva noche: todos al inicio
                if (ROLE !== 'foxy') view.style.filter = '';
                cli.state = null;
            }
            setPhase(m.p, m);
        });
        net.on('doorOut', (m) => {
            // el host confirmó la salida de la puerta (voluntaria o rebote)
            const wasBurst = cli.bursting;
            const why = (m.why || '');
            cli.atDoor = false;
            cli.attackBusy = false;
            cli.enteredOffice = false;
            cli.bursting = false;
            leaveDoorView();
            if (m.room) {
                cli.room = m.room;
                setView(m.room);
            }
            renderNav();
            if (why.indexOf('tiempo') >= 0) {
                toast('⏱ ¡TIEMPO AGOTADO! No puedes acampar en la puerta: vuelves a ' + (ROOM_NAME[m.room] || 'la esquina') + '.');
                playLocal('knock.mp3', 0.5);
            } else if (why.indexOf('destello') >= 0) {
                toast('⚡ ¡El DESTELLO del guardia te cegó y te echó de la puerta de vuelta al ' + (ROOM_NAME[m.room] || 'comedor') + '!');
                playLocal('doorSlam.mp3', 0.6);
            } else if (wasBurst || why.indexOf('irrupci') >= 0) {
                toast('¡La puerta se cerró justo a tiempo! Rebotas hacia el ' + (ROOM_NAME[m.room] || 'comedor') + '.');
                playLocal('doorSlam.mp3', 0.7);
            } else {
                toast('Te retiras con cuidado a la esquina...');
            }
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
                    ? 'Cuenta atrás de movimiento: ' + (m.wait || 1) + 's antes del próximo paso.'
                    : (why === 'aturdido'
                        ? '⚡ ¡DESTELLO del guardia! Aturdido ' + (m.wait || 5) + 's — caminata cancelada.'
                        : 'No puedes avanzar ahí desde tu posición actual.'));
            } else {
                toast(why === 'max-cortina'
                    ? 'Ya estás completamente fuera de la cortina'
                    : (why === 'aturdido'
                        ? '⚡ ¡DESTELLO del guardia! Aturdido ' + (m.wait || 5) + 's...'
                        : (why === 'demasiado-rapido'
                            ? 'Cuenta atrás de movimiento: ' + (m.wait || 1) + 's antes del próximo paso.'
                            : 'No puedes avanzar ahí.')));
            }
        });
        net.on('atk', (m) => {
            if (m && m.ok === false) {
                // fallo del ataque: liberar TODOS los estados de puerta
                const wasBurst = cli.bursting;
                cli.attackBusy = false;
                cli.atDoor = false;
                cli.bursting = false;
                view.classList.remove('bursting');
                if (m.why === 'puerta-cerrada') {
                    if (wasBurst) playLocal('doorSlam.mp3', 0.7);
                    toast('¡La puerta estaba CERRADA! Tu ataque rebota.');
                }
                else if (m.why === 'aturdido') toast('⚡ ¡DESTELLO del guardia! No puedes atacar (' + (m.wait || 5) + 's)...');
                else if (m.why === 'cooldown') toast('El ataque aún se enfría (' + (m.wait || 10) + 's entre intentos)...');
                else if (m.why === 'lejos') toast('Debes estar en la esquina del pasillo para asomarte.');
                else if (m.why === 'asomate-primero') toast('Asímate primero fuera de la cortina.');
                else toast('Aún no puedes atacar.');
                leaveDoorView();
                renderNav();
            } else if (m && m.ok === true && m.burst) {
                // el host aceptó la irrupción/colada: mantener el estado hasta resolución
                cli.bursting = true;
                playLocal('sprint.mp3', 0.8);
                view.classList.add('bursting');
                // FREDDY (colada): tras la embestida ya está DENTRO — el
                // apagón del host ejecuta el kill original.
                setTimeout(() => {
                    if (cli.bursting && cli.phase === 'night' && !cli.enteredOffice) {
                        cli.bursting = false;
                        cli.enteredOffice = true;
                        view.classList.remove('bursting');
                        renderNav();
                        updateDoorBanner();
                        if (ROLE === 'freddy') {
                            toast('¡ESTÁS DENTRO! Cortas la luz... el Toreador suena en la oscuridad.');
                        } else {
                            toast('¡ENTRASTE A LA OFICINA! El guardia ya no puede hacer nada...');
                        }
                    }
                }, BURST_MS + 250);
            }
        });
        net.on('ability', (m) => {
            // efecto de habilidad de OTRO animatrónico (opcional)
        });
        // ⚡ DESTELLO del guardia: todos los animatrónicos quedan aturdidos
        net.on('guardStun', (m) => {
            const ms = (m && m.ms) || 5000;
            cli.stunUntil = Date.now() + ms;
            stunFlash();
            playZapLocal();
            glitch.classList.add('on');
            setTimeout(() => glitch.classList.remove('on'), 700);
            updateStunBar();
            renderNav();   // botones deshabilitados con la cuenta atrás
            toast('⚡ ¡EL GUARDIA USÓ SU DESTELLO! Aturdido ' + Math.ceil(ms / 1000) + 's — no puedes moverte ni atacar.', 4500);
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
