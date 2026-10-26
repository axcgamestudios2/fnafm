// ============================================================
// FNAF 1 MP — Puente del GUARDIA
// Se carga en 1/index.html SOLO cuando ?mp=<CODIGO> existe.
// Sin el parámetro, el juego queda 100% original (un jugador).
//
// El puente:
//   1. Captura la instancia del Runtime sin modificar el juego
//   2. Hostea la red PeerJS (estrella) con los animatrónicos
//   3. Lee el estado del juego (puertas, luces, poder, hora, cámaras)
//      y lo difunde a 10 Hz
//   4. Ejecuta los movimientos/ataques de los jugadores escribiendo
//      los contadores INTERNOS del juego (bonnie activity, etc.),
//      de modo que TODA la lógica (cámaras, kill, retiradas) es la
//      ORIGINAL del juego — no se reprograma nada.
//   5. Superpone jumpscares inofensivos y efectos de habilidades
// ============================================================

(function () {
    'use strict';

    const params = new URLSearchParams(window.location.search);
    const ROOM = params.get('mp');
    if (!ROOM) return; // un jugador: no hacer nada

    const MY_NAME = params.get('name') || 'Guardia';
    // esta página vive en /1/ → los recursos MP están en ../mp/
    const MP_URL = '../mp/';

    // ---------------------------------------------------------
    // Constantes del juego (descubiertas por ingeniería inversa)
    // ---------------------------------------------------------
    const CAM_VIEWING = { '1A': 1, '1B': 2, '1C': 99, '5': 5, '3': 33, '2A': 3, '2B': 22, '4A': 4, '4B': 42, '6': 6, '7': 7 };
    const VIEWING_CAM = {};
    Object.keys(CAM_VIEWING).forEach(k => { VIEWING_CAM[CAM_VIEWING[k]] = k; });

    const ACTIVITY_COUNTER = {
        bonnie: 'bonnie activity',
        chica: 'chica activity',
        freddy: 'freddy activity',
        foxy: null // foxy usa 'fox progress'
    };
    const ROOM_INDEX = {
        bonnie: { '1A': 0, '1B': 2, '5': 3, '2A': 4, '3': 5, '2B': 6 },
        chica: { '1A': 0, '1B': 2, '7': 3, '6': 4, '4A': 5, '4B': 6 },
        freddy: { '1A': 0, '1B': 2, '7': 3, '6': 4, '4A': 5, '4B': 6 }
    };
    const INDEX_ROOM = {
        bonnie: { 0: '1A', 2: '1B', 3: '5', 4: '2A', 5: '3', 6: '2B', 7: 'doorL' },
        chica: { 0: '1A', 2: '1B', 3: '7', 4: '6', 5: '4A', 6: '4B', 7: 'doorR' },
        freddy: { 0: '1A', 2: '1B', 3: '7', 4: '6', 5: '4A', 6: '4B', 7: 'doorR' }
    };
    const DOOR_IMG = { L: { open: 103, closed: 102 }, R: { open: 119, closed: 118 } };

    // Puntos de render por vista ("you" spots, verificados empíricamente):
    // teletransportar el marcador de un animatrónico aquí lo RENDERIZA en la
    // imagen de esa cámara (comprobado con diff de píxeles anti-ruido).
    const YOU_SPOT = {
        '1A': [983, 353], '1B': [1283, 409], '1C': [1251, 487], '5': [1159, 436],
        '3': [899, 585], '2A': [1207, 603], '2B': [1166, 643], '4A': [1229, 604],
        '4B': [1189, 644], '6': [1243, 568], '7': [1214, 437]
    };
    const PARK_SPOT = [2000, 2000]; // invisible en todas las vistas
    const MARKER = { bonnie: 'bonnie', chica: 'chica', freddy: 'freddy bear' };
    // Botones de sala: puntos de espera del juego original (tablet abajo)
    const BUTTON_SPOT = {
        '1A': [983, 353], '1B': [963, 409], '1C': [931, 487], '5': [857, 436],
        '3': [899, 585], '2A': [983, 603], '2B': [983, 643], '4A': [1089, 604],
        '4B': [1089, 644], '6': [1186, 568], '7': [1195, 437]
    };
    // salas de esquina: desde ahí se ataca (el juego camina al marcador a la
    // puerta y ejecuta la muerte original)
    const CORNER_ROOMS = ['2B', '4B'];

    // ---------------------------------------------------------
    // Animación de CAMINATA de los marcadores en las cámaras:
    // en vez de teletransportarse, el animatrónico entra caminando
    // hasta su punto de render con un balanceo de pasos (bob).
    // ---------------------------------------------------------
    const markerAnim = {};   // role -> {fromX, fromY, tx, ty, start, dur}
    let lastViewing = null;
    let viewChangedAt = 0;
    const WALK_MS = 950;     // debe coincidir con la caminata del cliente animatrónico

    function stepMarkers(now) {
        // seguimiento de cambios de cámara (para decidir teletransporte vs caminata)
        const viewing = rs('viewing');
        if (viewing !== lastViewing) { lastViewing = viewing; viewChangedAt = now; }
        Object.keys(markerAnim).forEach(role => {
            const a = markerAnim[role];
            const o = find(MARKER[role]);
            if (!o || !o.roc) { delete markerAnim[role]; return; }
            const k = Math.min(1, (now - a.start) / a.dur);
            let x = a.fromX + (a.tx - a.fromX) * k;
            let y = a.fromY + (a.ty - a.fromY) * k;
            if (k < 1) {
                // balanceo de pasos: 2.5 pasos por segundo
                y += Math.sin(now / 62) * 4.5;
            }
            o.hoX = x;
            o.hoY = y;
            o.roc.rcChanged = true;
            if (k >= 1) delete markerAnim[role];
        });
    }

    function startMarkerLoop() {
        function tick(t) {
            try { stepMarkers(t); } catch (e) { }
            requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    // ---------------------------------------------------------
    // Captura de la instancia del Runtime (sin tocar el juego)
    // ---------------------------------------------------------
    let rt = null;
    (function trapRuntime() {
        let _R;
        Object.defineProperty(window, 'Runtime', {
            configurable: true,
            enumerable: true,
            get: function () { return _R; },
            set: function (v) {
                // Runtime.js asigna window['Runtime'] = (function Runtime(...){...})
                // Esa función, llamada con new, monta la app en `this` (__scope).
                _R = function () {
                    v.apply(this, arguments);   // define __scope.application = CRunApp(...)
                    rt = this;                  // capturar la instancia real
                    onRuntimeReady();
                    return this;
                };
            }
        });
    })();

    function loadScript(src) {
        return new Promise(res => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => res(true);
            s.onerror = () => res(false);
            document.head.appendChild(s);
        });
    }

    // estilos de overlays
    (function injectStyle() {
        const st = document.createElement('style');
        st.textContent = '@keyframes mpshake{0%{transform:translate(0,0) scale(1.02)}25%{transform:translate(-14px,9px) scale(1.05)}50%{transform:translate(11px,-13px) scale(1.03)}75%{transform:translate(-9px,-8px) scale(1.06)}100%{transform:translate(13px,10px) scale(1.02)}}';
        document.head.appendChild(st);
    })();

    // ---------------------------------------------------------
    // Utilidades del runtime
    // ---------------------------------------------------------
    function app() { return rt ? rt.application : null; }
    function find(name) {
        const a = app();
        if (!a || !a.run) return null;
        for (let i = 0; i < a.run.rhNObjects; i++) {
            const o = a.run.rhObjectList[i];
            if (o && o.hoOiList && o.hoOiList.oilName === name) return o;
        }
        return null;
    }
    function rs(name) { const o = find(name); return (o && typeof o.rsValue === 'number') ? o.rsValue : null; }
    function setRS(name, val) { const o = find(name); if (o && typeof o.rsValue === 'number') { o.rsValue = val; return true; } return false; }
    function img(name) { const o = find(name); return (o && o.roc) ? o.roc.rcImage : null; }

    function gameClick(fx, fy) {
        const a = app();
        if (!a) return;
        const canvas = a.canvas;
        const rect = canvas.getBoundingClientRect();
        const clientX = rect.left + fx * (rect.width / a.gaCxWin);
        const clientY = rect.top + fy * (rect.height / a.gaCyWin);
        const mk = (type, btns) => new PointerEvent(type, {
            bubbles: true, cancelable: true, composed: true,
            clientX, clientY, button: 0, buttons: btns,
            pointerId: 1, pointerType: 'mouse', isPrimary: true, view: window
        });
        canvas.dispatchEvent(mk('pointerdown', 1));
        canvas.dispatchEvent(mk('pointerup', 0));
    }

    // ---------------------------------------------------------
    // Estado
    // ---------------------------------------------------------
    const state = {
        phase: 'boot',
        night: 1,
        players: {},
        aiDefaults: null,
        lastDeathBy: null,
        lastPositions: null   // últimas posiciones leídas en el frame del gameplay
    };

    function lightState(name) {
        // luces: se detectan por el estado de mantener presionado el botón
        // (implementado con hooks de puntero más abajo)
        if (name === 'light on left') return lightHold.L;
        if (name === 'light on right') return lightHold.R;
        return false;
    }

    // Detección de luces: el guardia MANTIENE el botón de luz presionado
    const lightHold = { L: false, R: false };
    const LIGHT_BTN = { L: [54, 449], R: [1548, 454] };
    (function hookLights() {
        const iv = setInterval(() => {
            const a = app();
            if (!a || !a.canvas) return;
            clearInterval(iv);
            const canvas = a.canvas;
            const toFrame = (e) => {
                const rect = canvas.getBoundingClientRect();
                const fx = (e.clientX - rect.left) * (a.gaCxWin / rect.width);
                const fy = (e.clientY - rect.top) * (a.gaCyWin / rect.height);
                return [fx + (a.run ? a.run.rhWindowX : 0), fy];
            };
            const hit = (p, b) => Math.abs(p[0] - b[0]) < 60 && Math.abs(p[1] - b[1]) < 60;
            canvas.addEventListener('pointerdown', (e) => {
                const p = toFrame(e);
                if (hit(p, LIGHT_BTN.L)) lightHold.L = true;
                if (hit(p, LIGHT_BTN.R)) lightHold.R = true;
            });
            const off = () => { lightHold.L = false; lightHold.R = false; };
            canvas.addEventListener('pointerup', off);
            canvas.addEventListener('pointerleave', off);
        }, 500);
    })();

    // Coloca los marcadores de los animatrónicos con jugador según la vista
    // actual del guardia:
    //  - sala siendo vista → punto de render (se ve en la cámara, verificado)
    //  - esquina (2B/4B) → su botón: el ataque del juego ORIGINAL necesita
    //    arrancar desde ahí para caminar a la puerta y ejecutar el kill
    //  - resto → lejos (invisible)
    // Si el animatrónico LLEGA a la sala que el guardia está viendo, entra
    // CAMINANDO desde un lateral (animación) en vez de teletransportarse.
    // Durante un ataque (counter>=7) y para Foxy, manda la lógica del juego.
    function applyMarkers() {
        const now = performance.now();
        const viewing = rs('viewing');
        const viewedRoom = VIEWING_CAM[viewing] || null;
        const sameViewForAwhile = (now - viewChangedAt) > 400;
        Object.keys(state.players).forEach(role => {
            if (role === 'foxy') return; // Foxy: fox progress + lógica propia
            const p = state.players[role];
            if (!p.room) return;
            const idx = rs(ACTIVITY_COUNTER[role]);
            if (idx !== null && idx >= 7) { delete markerAnim[role]; return; } // en la puerta/ataque: el juego controla
            if (markerAnim[role]) return; // está caminando: no interrumpir
            const o = find(MARKER[role]);
            if (!o || !o.roc) return;
            let spot;
            if (viewedRoom === p.room && YOU_SPOT[p.room]) {
                spot = YOU_SPOT[p.room];
                // ¿acaba de entrar a esta sala mientras el guardia la mira? → caminar
                const justArrived = p.roomChangedAt && (now - p.roomChangedAt < 1500) && p.walkPlayed !== p.room;
                if (sameViewForAwhile && justArrived) {
                    p.walkPlayed = p.room;
                    markerAnim[role] = {
                        fromX: spot[0] - 250, fromY: spot[1] - 46,
                        tx: spot[0], ty: spot[1],
                        start: now, dur: WALK_MS
                    };
                    log(role + ' entra caminando a ' + p.room);
                    return;
                }
                p.walkPlayed = p.room;
            } else if (CORNER_ROOMS.includes(p.room)) {
                spot = BUTTON_SPOT[p.room];
            } else {
                spot = PARK_SPOT;
            }
            o.hoX = spot[0];
            o.hoY = spot[1];
            o.roc.rcChanged = true;
        });
    }

    function readState() {
        const a = app();
        if (!a || !a.run) return null;
        return {
            frame: a.currentFrame,
            phase: state.phase,
            night: rs('night number'),
            power: rs('power left'),
            powerPct: rs('power left 2'),
            usage: rs('usage meter'),
            minute: rs('minute counter'),
            tod: rs('time of day'),
            viewing: rs('viewing'),
            doorL: img('left door') === DOOR_IMG.L.closed,
            doorR: img('right door') === DOOR_IMG.R.closed,
            lightL: lightState('light on left'),
            lightR: lightState('light on right'),
            positions: {
                bonnie: rs('bonnie activity'),
                chica: rs('chica activity'),
                freddy: rs('freddy activity'),
                foxy: rs('fox progress')
            }
        };
    }

    // ---------------------------------------------------------
    // Red
    // ---------------------------------------------------------
    let host = null;

    async function startHost() {
        await loadScript('https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js');
        await loadScript(MP_URL + 'net.js');
        if (typeof MP === 'undefined') { log('ERROR: no se pudo cargar la red'); return; }

        host = new MP.Host();
        host.start(ROOM, function onReady() {
            state.phase = 'lobby';
            log('Red lista. Sala: ' + ROOM);
            updateBadge(null);
        }, function onClient(entry) {
            const role = entry.role;
            if (!['foxy', 'bonnie', 'chica', 'freddy'].includes(role)) return;
            state.players[role] = {
                role, name: entry.name, conn: entry.conn,
                room: (role === 'foxy') ? '1C' : '1A',
                lastMove: 0, attackAt: 0, cooldown: {},
                roomChangedAt: 0, walkPlayed: null
            };
            try {
                entry.conn.send(JSON.stringify({
                    t: 'welcome', night: state.night, phase: state.phase,
                    room: state.players[role].room
                }));
            } catch (e) { }
            log('Conectado: ' + entry.name + ' como ' + role.toUpperCase());
        });

        host.on('move', (m, entry) => handleMove(m, entry));
        host.on('attack', (m, entry) => handleAttack(m, entry));
        host.on('ability', (m, entry) => handleAbility(m, entry));
        host.on('__disconnect', (entry) => {
            if (entry && entry.role && state.players[entry.role]) {
                restoreAI(entry.role);
                delete state.players[entry.role];
                log(entry.role + ' desconectado — control a la IA');
            }
        });
        host.on('__error', (e) => log('Error de red: ' + e.type));
    }

    // ---------------------------------------------------------
    // Ciclo de la noche
    // ---------------------------------------------------------
    const KNOWN_FRAMES = { 0: 'title', 2: 'gameplay', 9: 'ad' };
    let lastFrame = null;

    function onRuntimeReady() {
        log('Juego listo. Multijugador: sala ' + ROOM);
        showMpBadge();
        startHost();
        startLoops();
    }

    function startLoops() {
        startMarkerLoop();   // caminata suave de marcadores (60 fps)
        setInterval(() => {
            const a = app();
            if (!a) return;
            const f = a.currentFrame;
            if (f === lastFrame) return;
            const prev = lastFrame;
            lastFrame = f;
            handleFrameChange(f, prev);
        }, 300);

        setInterval(() => {
            if (!host || !host.open) return;
            const s = readState();
            if (!s) return;
            if (s.frame === 2) { state.lastPositions = s.positions; state.lastState = s; }
            host.broadcast({ t: 'state', s });
            updateBadge(s);
            if (state.phase === 'night') applyMarkers();
        }, 100);

        // sincronizar posiciones desde el juego (retiradas tras ataque bloqueado, etc.)
        setInterval(() => {
            if (state.phase !== 'night') return;
            const now = performance.now();
            Object.keys(state.players).forEach(role => {
                const p = state.players[role];
                if (role === 'foxy') return;
                const idx = rs(ACTIVITY_COUNTER[role]);
                if (idx == null || idx === 7) return; // en la puerta: lo maneja la retracción
                const r = roomFromIndex(role, idx);
                if (r && p.room !== r) {
                    p.room = r;
                    p.roomChangedAt = now;   // el juego lo retiró: puede volver a verse caminando
                    p.walkPlayed = null;
                    try { p.conn.send(JSON.stringify({ t: 'moveOk', room: r })); } catch (e) { }
                    host.broadcast({ t: 'anim', role, room: r });
                }
            });
        }, 1000);

        // RETIRADA ORIGINAL de la puerta: en el juego original, si el guardia
        // cierra la puerta, el animatrónico se cansa y vuelve al comedor. Con la
        // IA congelada ese evento del juego nunca dispara, así que el host lo
        // reproduce con el mismo comportamiento (7-10s con la puerta cerrada).
        setInterval(() => {
            if (state.phase !== 'night') return;
            const now = Date.now();
            Object.keys(state.players).forEach(role => {
                if (role === 'foxy') return;
                const p = state.players[role];
                const idx = rs(ACTIVITY_COUNTER[role]);
                if (idx !== 7) { p.doorClosedSince = 0; p.retractAt = 0; return; }
                const doorClosed = (role === 'bonnie')
                    ? (img('left door') === DOOR_IMG.L.closed)
                    : (img('right door') === DOOR_IMG.R.closed);
                if (!doorClosed) { p.doorClosedSince = 0; p.retractAt = 0; return; }
                if (!p.doorClosedSince) {
                    p.doorClosedSince = now;
                    p.retractAt = now + 7000 + Math.floor(Math.random() * 3000);
                    return;
                }
                if (p.retractAt && now >= p.retractAt) retractFromDoor(role, 'puerta cerrada demasiado tiempo');
            });
        }, 500);
    }

    function handleFrameChange(f, prev) {
        if (f === 2 && state.phase !== 'night') {
            state.phase = 'night';
            state.night = rs('night number') || state.night;
            state.aiDefaults = {
                freddy: rs('freddy AI'), bonnie: rs('bonie AI'),
                chica: rs('chica AI'), foxy: rs('foxy AI')
            };
            Object.keys(state.players).forEach(role => freezeAI(role));
            // posiciones iniciales reales desde el juego
            Object.keys(state.players).forEach(role => {
                const p = state.players[role];
                p.room = (role === 'foxy') ? '1C' : roomFromIndex(role, rs(ACTIVITY_COUNTER[role]));
                p.roomChangedAt = 0;
                p.walkPlayed = null;
                p.attackAt = 0;
                delete markerAnim[role];
            });
            host && host.broadcast({ t: 'phase', p: 'night', night: state.night });
            log('Noche ' + state.night + ' iniciada');
            hideOverlay();
        }
        if (prev === 2 && KNOWN_FRAMES[f] === undefined) {
            state.phase = 'death';
            state.lastDeathBy = detectKiller();
            host && host.broadcast({ t: 'phase', p: 'death', by: state.lastDeathBy });
            log('Muerte — te atrapó: ' + state.lastDeathBy);
            showDeathOverlay();
        }
        if (f === 0 && state.phase === 'death') {
            state.phase = 'menu';
            host && host.broadcast({ t: 'phase', p: 'menu' });
            showRevanchaOverlay();
        }
        const a = app();
        if (prev === 2 && a.frame && a.frame.frameName && /6\s*am|6am/i.test(a.frame.frameName || '')) {
            state.phase = 'win';
            host && host.broadcast({ t: 'phase', p: 'win' });
            log('6 AM — noche superada');
        }
    }

    function roomFromIndex(role, idx) {
        const map = INDEX_ROOM[role];
        if (!map || idx == null) return null;
        const r = map[idx];
        return (r && r.startsWith('door')) ? (role === 'bonnie' ? '2B' : '4B') : r;
    }

    function detectKiller() {
        const pos = state.lastPositions || {};
        if (pos.foxy === 4) return 'foxy';
        for (const r of ['bonnie', 'chica', 'freddy']) if (pos[r] != null && pos[r] >= 7) return r;
        // apagón (energía a 0): fue Freddy
        if (state.lastState && (state.lastState.powerPct === 0 || state.lastState.power === 0)) return 'freddy';
        return 'desconocido';
    }

    // ---------------------------------------------------------
    // Control de la IA / movimientos
    // ---------------------------------------------------------
    function freezeAI(role) {
        const counter = { freddy: 'freddy AI', bonnie: 'bonie AI', chica: 'chica AI', foxy: 'foxy AI' }[role];
        setRS(counter, 0);
    }
    function restoreAI(role) {
        const counter = { freddy: 'freddy AI', bonnie: 'bonie AI', chica: 'chica AI', foxy: 'foxy AI' }[role];
        const def = state.aiDefaults ? state.aiDefaults[role] : null;
        if (def != null) setRS(counter, def);
    }

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

    function roomOf(role) { return state.players[role] ? state.players[role].room : null; }

    function handleMove(m, entry) {
        const role = entry.role;
        const p = state.players[role];
        if (!p || state.phase !== 'night') return;
        const now = Date.now();
        const cd = p.sprintUntil && now < p.sprintUntil ? 350 : 500;
        if (now - p.lastMove < cd) {
            try { entry.conn.send(JSON.stringify({ t: 'moveBad', why: 'demasiado-rapido' })); } catch (e) { }
            return;
        }

        if (role === 'foxy') return handleFoxyMove(p, entry, now);

        const room = m.to;
        const adj = ADJACENCY[room];
        const current = roomOf(role);
        if (!adj || !adj.includes(current) || ROOM_INDEX[role][room] === undefined) {
            try { entry.conn.send(JSON.stringify({ t: 'moveBad', why: 'no-adyacente' })); } catch (e) { }
            return;
        }
        const ok = setRS(ACTIVITY_COUNTER[role], ROOM_INDEX[role][room]);
        if (ok) {
            p.room = room;
            p.lastMove = now;
            p.roomChangedAt = performance.now();
            p.walkPlayed = null;
            applyMarkers();
            try { entry.conn.send(JSON.stringify({ t: 'moveOk', room })); } catch (e) { }
            host.broadcast({ t: 'anim', role, room, from: current });
            log(role + ' → ' + room);
        }
    }

    function handleFoxyMove(p, entry, now) {
        const cur = rs('fox progress');
        if (cur == null) return;
        if (cur >= 3) {
            try { entry.conn.send(JSON.stringify({ t: 'moveBad', why: 'max-cortina' })); } catch (e) { }
            return;
        }
        setRS('fox progress', cur + 1);
        p.lastMove = now;
        try { entry.conn.send(JSON.stringify({ t: 'moveOk', room: '1C', progress: cur + 1 })); } catch (e) { }
    }

    function handleAttack(m, entry) {
        const role = entry.role;
        const p = state.players[role];
        if (!p || state.phase !== 'night') return;
        const now = Date.now();
        if (now - (p.attackAt || 0) < 12000) {
            // SIEMPRE responder: si no, el botón del cliente queda trabado
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'cooldown' })); } catch (e) { }
            return;
        }

        if (role === 'foxy') {
            const cur = rs('fox progress');
            if (cur == null || cur < 1) {
                try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'asomate-primero' })); } catch (e) { }
                return;
            }
            setRS('fox progress', 4);
            p.attackAt = now;
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: true })); } catch (e) { }
            log('FOXY corre por el pasillo oeste');
            return;
        }
        const expected = (role === 'bonnie') ? '2B' : '4B';
        if (roomOf(role) !== expected) {
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'lejos' })); } catch (e) { }
            return;
        }
        // si la puerta ya está cerrada, el animatrónico no entra (como el original)
        const doorClosed = (role === 'bonnie')
            ? (img('left door') === DOOR_IMG.L.closed)
            : (img('right door') === DOOR_IMG.R.closed);
        if (doorClosed) {
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'puerta-cerrada' })); } catch (e) { }
            log(role + ' rebotó: puerta cerrada');
            return;
        }
        setRS(ACTIVITY_COUNTER[role], 7);
        p.attackAt = now;
        p.roomChangedAt = 0;
        try { entry.conn.send(JSON.stringify({ t: 'atk', ok: true })); } catch (e) { }
        log(role.toUpperCase() + ' entra por la puerta ' + (role === 'bonnie' ? 'izquierda' : 'derecha'));
    }

    // ---------------------------------------------------------
    // Habilidades
    // ---------------------------------------------------------
    function retractFromDoor(role, why) {
        const p = state.players[role];
        if (!p) return;
        setRS(ACTIVITY_COUNTER[role], 2);   // comportamiento original: vuelve al comedor
        p.room = roomFromIndex(role, 2) || '1B';
        p.roomChangedAt = performance.now();
        p.walkPlayed = null;
        p.doorClosedSince = 0;
        p.retractAt = 0;
        try { p.conn.send(JSON.stringify({ t: 'moveOk', room: p.room })); } catch (e) { }
        host.broadcast({ t: 'anim', role, room: p.room });
        log(role + ' se retira de la puerta (' + why + ') — como el original');
    }

    function handleAbility(m, entry) {
        const role = entry.role;
        const p = state.players[role];
        if (!p || state.phase !== 'night') return;
        const now = Date.now();

        // Retirada voluntaria de la puerta (sin cooldown)
        if (m.kind === 'doorRetreat') {
            if (rs(ACTIVITY_COUNTER[role]) === 7) retractFromDoor(role, 'decisión del jugador');
            return;
        }

        // Foxy retrocede tras la cortina (sin cooldown largo)
        if (m.kind === 'foxyRetreat') {
            if (now - (p.lastRetreat || 0) < 2000) return;
            p.lastRetreat = now;
            setRS('fox progress', 0);
            try { entry.conn.send(JSON.stringify({ t: 'moveOk', room: '1C', progress: 0 })); } catch (e) { }
            return;
        }

        const kind = m.kind;
        const cd = kind === 'jumpscare' ? 15000 : 20000;
        if (now - (p.cooldown[kind] || 0) < cd) return;
        p.cooldown[kind] = now;

        if (kind === 'jumpscare') {
            showHarmlessJumpscare(role);
            host.broadcast({ t: 'ability', role, kind });
            log('Jumpscare inofensivo de ' + role);
        } else {
            if (role === 'foxy') p.sprintUntil = now + 5000;
            applySpecial(role);
            host.broadcast({ t: 'ability', role, kind: 'special' });
        }
    }

    function applySpecial(role) {
        switch (role) {
            case 'bonnie': showStaticInterference(3000); break;
            case 'chica': playSfx('kitchen.mp3', 0.55); break;
            case 'freddy': playSfx('freddy_laugh.mp3', 0.9); officeFlicker(2600); break;
        }
    }

    // ---------------------------------------------------------
    // Overlays del guardia
    // ---------------------------------------------------------
    function overlayDiv(cls, html, ms) {
        const d = document.createElement('div');
        d.className = 'mp-overlay ' + (cls || '');
        d.innerHTML = html || '';
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;pointer-events:none;';
        document.body.appendChild(d);
        if (ms) setTimeout(() => d.remove(), ms);
        return d;
    }

    function showHarmlessJumpscare(role) {
        const d = overlayDiv('mp-jump',
            '<img src="' + MP_URL + 'assets/jumpscares/' + role + '.png" style="height:105vh;width:100vw;object-fit:cover;animation:mpshake .09s infinite;">', 1300);
        playSfx('scream.mp3', 0.6);
        setTimeout(() => { d.remove(); showStaticInterference(400); }, 1250);
    }

    function showStaticInterference(ms) {
        const d = overlayDiv('mp-static', '', ms || 3000);
        d.style.background = 'url(resources/background.gif)';
        d.style.backgroundSize = 'cover';
        d.style.opacity = '0.85';
        d.style.mixBlendMode = 'screen';
        d.style.zIndex = '9998';
    }

    function officeFlicker(ms) {
        const d = overlayDiv('mp-flicker', '', ms);
        d.style.background = 'black';
        d.style.opacity = '0';
        d.style.transition = 'opacity 0.12s';
        let on = false;
        const iv = setInterval(() => {
            on = !on;
            d.style.opacity = on ? String(0.2 + Math.random() * 0.35) : '0';
        }, 160);
        setTimeout(() => { clearInterval(iv); d.remove(); }, ms);
    }

    function playSfx(file, vol) {
        try {
            const au = new Audio(MP_URL + 'assets/sfx/' + file);
            au.volume = vol != null ? vol : 0.8;
            au.play().catch(() => { });
        } catch (e) { }
    }

    function showMpBadge() {
        const d = document.createElement('div');
        d.id = 'mp-badge';
        d.style.cssText = 'position:fixed;top:8px;right:12px;z-index:99999;color:#ffd34d;font-family:monospace;font-size:13px;background:rgba(0,0,0,0.55);padding:6px 10px;pointer-events:none;text-shadow:0 0 6px rgba(255,211,77,.4);';
        d.textContent = 'MP [' + ROOM + '] ' + MY_NAME;
        document.body.appendChild(d);
    }

    function hourText(s) {
        if (!s || s.minute == null) return '';
        const h = Math.floor(s.minute / 60);
        const names = ['12 AM', '1 AM', '2 AM', '3 AM', '4 AM', '5 AM', '6 AM'];
        return names[Math.min(h, 6)];
    }

    function updateBadge(s) {
        const d = document.getElementById('mp-badge');
        if (!d) return;
        const anims = Object.keys(state.players).length;
        d.textContent = 'MP [' + ROOM + '] · ' + (s && s.powerPct != null ? s.powerPct + '% · ' : '') +
            (s ? hourText(s) + ' · ' : '') + 'anims: ' + anims;
    }

    function showDeathOverlay() {
        overlayDiv('mp-death',
            '<div style="color:#fff;font-family:monospace;text-align:center;font-size:5vw;text-shadow:0 0 2vw red;">TE ATRAPARON</div>', 4000);
    }

    function showRevanchaOverlay() {
        const d = document.createElement('div');
        d.id = 'mp-revancha';
        d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.82);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:monospace;color:#cfcfcf;';
        d.innerHTML =
            '<div style="font-size:3.4vw;color:#ff5d5d;text-shadow:0 0 1.4vw red;">FIN DE LA NOCHE</div>' +
            '<div style="font-size:1.6vw;margin:1.6vh 0 3vh 0;">Te atrapó: ' + (state.lastDeathBy || '?') + '</div>' +
            '<button id="mp-again" style="font-family:monospace;font-size:2vw;color:#ffd34d;background:transparent;border:2px solid #ffd34d;padding:1vh 3vw;cursor:pointer;">&gt; JUGAR REVANCHA</button>' +
            '<div style="font-size:1vw;color:#777;margin-top:2.4vh;">Los animatrónicos te están esperando...</div>';
        document.body.appendChild(d);
        document.getElementById('mp-again').addEventListener('click', () => {
            d.remove();
            startNextNight();
        });
    }

    function startNextNight() {
        const step = () => {
            const a = app();
            if (!a) { setTimeout(step, 500); return; }
            const f = a.currentFrame;
            if (f === 0) { gameClick(275, 420); setTimeout(step, 2200); return; }
            if (f === 9) { gameClick(640, 360); setTimeout(step, 1800); return; }
            if (f === 2) { hideOverlay(); return; }
            setTimeout(step, 900);
        };
        step();
    }

    function hideOverlay() {
        const d = document.getElementById('mp-revancha');
        if (d) d.remove();
    }

    function log(m) { try { console.log('[MP] ' + m); } catch (e) { } }

    // debug/inspección (útil para pruebas; no afecta al juego)
    window.__MP = {
        state,
        readState,
        find,
        rs,
        img,
        app,
        gameClick,
        host: () => host
    };

})();
