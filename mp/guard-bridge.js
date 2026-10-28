// ============================================================
// FNAF 1 MP — Puente del GUARDIA (v9 · marcadores nativos)
// Se carga en 1/index.html SOLO cuando ?mp=<CODIGO> existe.
// Sin el parámetro, el juego queda 100% original (un jugador).
//
// ⚠️ v9 — INGENIERÍA INVERSA COMPLETA del juego original:
// El juego NO usa contadores de posición. El sistema REAL es:
//   · Cada animatrónico tiene un MARCADOR invisible ('bonnie',
//     'chica', 'freddy bear') cuya posición sobre los ANCLAJES
//     de sala ('1B dining area', 'cam 4B', ...) define su sala.
//   · Las cámaras re-renderizan EN VIVO comparando marcador ↔
//     anclaje (colisión por marco) y fijando la animación del
//     sprite de cámara 'Active 3' (61=Freddy comedor, 62=baños,
//     63=pasillo E, 64=esquina E, 65=Freddy en oficina...).
//   · 'X activity' es el NIVEL DE IA (tirada random(20)+1 < nivel
//     cada ~5s) — NO la posición. La vieja v8 escribía el nivel
//     creyendo que era la sala: Freddy jamás se movía de cámara.
//   · Ataques nativos: 'ready to attack left/right' (marco de
//     puerta) → 'got you left/right' (dentro) → el juego mata
//     solo (botones muertos + monitor forzado + XSCREAM).
//     Freddy: 'freddy got in' → apagón original. Foxy: fox
//     progress 4 (carrera) → 5 (ataque) → kill nativo.
// El puente ahora MUEVE LOS MARCADORES (hot-spot del anclaje) y
// congela los niveles de IA de los roles con jugador; todo el
// render, el audio de cocina, las luces y los kills son del
// motor ORIGINAL. Verificado en vivo con VLM + pixel-diff.
//
// v9 además:
//   · FREDDY va por LOS DOS LADOS (oeste y este). El arte nativo
//     de Freddy solo existe al este; en salas oeste se muestra un
//     "eco de presencia" (rostro original semitransparente).
//   · PROGRESIÓN DE NOCHES: el ritmo de movimiento acelera cada
//     noche y hay tirada de "paso rápido" cada vez más probable.
//   · HABILIDADES DEL GUARDIA por noche: N1 ⚡DESTELLO · N2 🔋CÉLULA ·
//     N3 📡ESCÁNER · N4 ☕CAFÉ · N5 🔫PISTOLA (3 balas, 2s).
//   · Sin bucles que pelean con el juego: cero cuelgues por
//     destello durante un ataque (bug v8 arreglado de raíz).
// ============================================================

(function () {
    'use strict';

    const params = new URLSearchParams(window.location.search);
    const ROOM = params.get('mp');
    if (!ROOM) return; // un jugador: no hacer nada

    const BRIDGE_VERSION = 'v9-markers-freddy-both-sides';
    try { console.log('[MP] guard-bridge ' + BRIDGE_VERSION); } catch (e) { }

    const MY_NAME = params.get('name') || 'Guardia';
    // esta página vive en /1/ → los recursos MP están en ../mp/
    const MP_URL = '../mp/';

    // ---------------------------------------------------------
    // Constantes del juego (ingeniería inversa — ver cabecera)
    // ---------------------------------------------------------
    const CAM_VIEWING = { '1A': 1, '1B': 2, '1C': 99, '5': 5, '3': 33, '2A': 3, '2B': 22, '4A': 4, '4B': 42, '6': 6, '7': 7 };
    const VIEWING_ROOM = {};
    Object.keys(CAM_VIEWING).forEach(k => { VIEWING_ROOM[CAM_VIEWING[k]] = k; });

    // marcador (objeto lógico) de cada rol
    const MARKER = { bonnie: 'bonnie', chica: 'chica', freddy: 'freddy bear' };
    // anclajes de sala: la posición del marcador sobre estos objetos
    // define la sala (los eventos de cámara y ataque lo leen por colisión)
    const ANCHOR = {
        '1A': '1A show stage', '1B': '1B dining area', '5': '5 backstage',
        '2A': 'cam 2A', '3': 'cam 3 closet', '2B': 'cam 2B',
        '7': 'cam 7 bathrooms', '6': 'cam 6 kitchen',
        '4A': 'cam 4A', '4B': 'cam 4B',
        doorL: 'ready to attack left', inL: 'got you left',
        doorR: 'ready to attack right', inR: 'got you right',
        fredIn: 'freddy got in'
    };
    // salas "oeste": Freddy puede ir, pero el juego original no tiene
    // arte de cámara para él ahí → eco de presencia + aviso
    const WEST_ROOMS = ['5', '2A', '3', '2B'];
    const DOOR_IMG = { L: { open: 103, closed: 102 }, R: { open: 119, closed: 118 } };

    // salas legales por rol (Freddy: AMBOS lados)
    const LEGAL_ROOMS = {
        bonnie: ['1A', '1B', '5', '2A', '3', '2B'],
        chica: ['1A', '1B', '7', '6', '4A', '4B'],
        freddy: ['1A', '1B', '5', '2A', '3', '2B', '7', '6', '4A', '4B']
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

    // ---------------------------------------------------------
    // Balanceo — progresión por noche (host y cliente usan las
    // MISMAS fórmulas; el jugador ve la cuenta atrás correcta)
    // ---------------------------------------------------------
    function nightMoveCd(night) {
        return Math.max(3000, 6000 - 600 * Math.max(0, (night || 1) - 1));
    }
    function nightFastChance(night) {
        return Math.min(0.40, 0.08 * Math.max(0, (night || 1) - 1));
    }
    const MOVE_CD_BASE = 6000;   // noche 1 (compatibilidad cliente viejo)
    const DOOR_MAX_MS = 8000;    // anti-camping en el marco de la puerta
    const BURST_MS = 1200;       // ventana de irrupción (cerrar a tiempo)

    // ===== habilidades del guardia (una nueva cada noche) =====
    const STUN_MS = 5000;        // N1 ⚡ destello
    const STUN_MAX = 2;
    const STUN_CD_MS = 12000;
    const CELL_AMOUNT = 25;      // N2 🔋 célula de energía
    const CELL_MAX = 1;
    const SCAN_MS = 10000;       // N3 📡 escáner
    const SCAN_MAX = 2;
    const SCAN_CD_MS = 20000;
    const COFFEE_MS = 12000;     // N4 ☕ café: reloj acelerado
    const COFFEE_MAX = 1;
    const GUN_BULLETS = 3;       // N5 🔫 pistola
    const GUN_WINDOW_MS = 2000;  // 2s para disparar
    const GUN_LOCK_MS = 45000;   // reinicio de sistemas del alcanzado
    const KILL_FALLBACK_MS = 30000; // red de seguridad: nunca colgar

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

    async function loadScriptFB(urls) {
        for (let i = 0; i < urls.length; i++) {
            if (await loadScript(urls[i])) {
                if (typeof window.Peer !== 'undefined') return true;
            }
        }
        return typeof window.Peer !== 'undefined';
    }

    // Precarga de imágenes de overlay (jumpscare + estática): decodificar
    // ANTES evita el tirón de la primera vez (bug "screenshot súper trabada").
    const preloaded = {};
    function preloadOverlays() {
        ['bonnie', 'chica', 'foxy', 'freddy'].forEach(r => {
            if (!preloaded[r]) {
                const i = new Image();
                i.src = MP_URL + 'assets/jumpscares/' + r + '.png';
                preloaded[r] = i;
            }
        });
        if (!preloaded.static) {
            const i = new Image();
            i.src = 'resources/background.gif';
            preloaded.static = i;
        }
        // eco de presencia de Freddy (rostro original)
        if (!preloaded.freddyGhost) {
            const i = new Image();
            i.src = MP_URL + 'assets/jumpscares/freddy.png';
            preloaded.freddyGhost = i;
        }
    }

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
    function setRS(name, val) {
        const o = find(name);
        if (o && typeof o.rsValue === 'number') { o.rsValue = val; return true; }
        return false;
    }
    function img(name) { const o = find(name); return (o && o.roc) ? o.roc.rcImage : null; }
    function altVal(name, idx, val) {
        const o = find(name);
        if (!o || !o.rov || !o.rov.rvValues) return false;
        if (val === undefined) return o.rov.rvValues[idx];
        o.rov.rvValues[idx] = val;
        return true;
    }

    // ---------------------------------------------------------
    // ⭐ SISTEMA DE MARCADORES (v9): mover = teletransportar el
    // marcador del rol al punto-caliente del anclaje de la sala.
    // El render de cámaras/luces/puertas del juego original se
    // actualiza EN VIVO por sus propios eventos (verificado E2E).
    // ---------------------------------------------------------
    let bridgeWriting = false;
    function tp(role, code) {
        const m = find(MARKER[role]);
        const a = find(ANCHOR[code]);
        if (!m || !a) { log('tp(' + role + ',' + code + '): objeto no encontrado'); return false; }
        m.hoX = a.hoX;
        m.hoY = a.hoY;
        if (m.roc) m.roc.rcChanged = true;
        // pose variante (los renders de comedor/baños usan alt#3 = 1|2)
        try {
            if (m.rov && m.rov.rvValues) m.rov.rvValues[3] = (Math.random() < 0.5 ? 1 : 2);
        } catch (e) { }
        return true;
    }

    // ¿en qué sala está el marcador? (colisión por bounding-box,
    // la misma lectura que hacen los eventos del juego)
    function markerRoom(role) {
        const m = find(MARKER[role]);
        if (!m) return null;
        let best = null;
        Object.keys(ANCHOR).forEach(code => {
            const a = find(ANCHOR[code]);
            if (!a) return;
            if (Math.abs(m.hoX - a.hoX) <= 40 && Math.abs(m.hoY - a.hoY) <= 40) {
                best = code;
            }
        });
        return best;
    }

    // congelar la IA nativa de un rol con jugador: su nivel de
    // tirada a 0 y blindado contra el guion por hora (2/3/4 AM
    // suben activity +1). El jugador es la única autoridad.
    const lockedCounters = {};
    function freezeRoleAI(role) {
        const names = role === 'foxy' ? ['fox activity', 'foxy AI']
            : [role + ' activity', { bonnie: 'bonie AI', chica: 'chica AI', freddy: 'freddy AI' }[role]];
        names.forEach(nm => {
            const o = find(nm);
            if (!o) return;
            setRS(nm, 0);
            if (o.__mpLockAI) return;
            let v = 0;
            Object.defineProperty(o, 'rsValue', {
                configurable: true, enumerable: true,
                get: function () { return v; },
                set: function (nv) {
                    if (bridgeWriting) { v = nv; return; }
                    // escritura del guion → ignorada (nivel congelado en 0)
                }
            });
            o.__mpLockAI = true;
            lockedCounters[nm] = o;
        });
    }
    function unfreezeRoleAI(role) {
        const names = role === 'foxy' ? ['fox activity', 'foxy AI']
            : [role + ' activity', { bonnie: 'bonie AI', chica: 'chica AI', freddy: 'freddy AI' }[role]];
        names.forEach(nm => {
            const o = lockedCounters[nm];
            if (!o) return;
            delete lockedCounters[nm];
            try {
                const v = o.rsValue;
                delete o.rsValue;
                o.rsValue = v;
                o.__mpLockAI = false;
            } catch (e) { }
        });
    }
    function setAISafe(name, val) {
        bridgeWriting = true;
        try { setRS(name, val); } finally { bridgeWriting = false; }
    }

    // ---------------------------------------------------------
    // gameClick / hover sintéticos (pipeline REAL de input)
    // ---------------------------------------------------------
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

    function gameHover(fx, fy) {
        const a = app();
        if (!a) return;
        const rect = a.canvas.getBoundingClientRect();
        const cx = rect.left + fx * (rect.width / a.gaCxWin);
        const cy = rect.top + fy * (rect.height / a.gaCyWin);
        const mk = (x, y) => new PointerEvent('pointermove', {
            bubbles: true, cancelable: true, composed: true,
            clientX: x, clientY: y, button: 0, buttons: 0,
            pointerId: 1, pointerType: 'mouse', isPrimary: true, view: window
        });
        a.canvas.dispatchEvent(mk(cx - 5, cy));
        a.canvas.dispatchEvent(mk(cx + 5, cy));
        a.canvas.dispatchEvent(mk(cx, cy));
    }

    // ---------------------------------------------------------
    // Estado
    // ---------------------------------------------------------
    const state = {
        phase: 'boot',
        night: 1,
        players: {},
        aiDefaults: null,
        lastDeathBy: null
    };

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

    function readState() {
        const a = app();
        if (!a || !a.run) return null;
        const rooms = {};
        Object.keys(state.players).forEach(role => {
            rooms[role] = state.players[role] ? state.players[role].room : null;
        });
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
            lightL: lightHold.L,
            lightR: lightHold.R,
            rooms: rooms,
            foxPeek: (state.players.foxy) ? (state.players.foxy.foxPeek || 0) : null,
            foxyRunning: !!(state.players.foxy && state.players.foxy.running)
        };
    }

    // ---------------------------------------------------------
    // Red
    // ---------------------------------------------------------
    let host = null;

    async function startHost() {
        await loadScriptFB([
            'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
            'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js'
        ]);
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
                doorSince: 0, foxPeek: 0, running: false,
                stunUntil: 0, gunLockUntil: 0, nextCd: 0
            };
            // conexión a mitad de noche: congelar su IA y recolocar su marcador
            if (state.phase === 'night' && app() && app().currentFrame === 2) {
                freezeRoleAI(role);
                tp(role, state.players[role].room);
            }
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
                unfreezeRoleAI(entry.role);       // el guion vuelve a mandar
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
        preloadOverlays();
        startHost();
        startLoops();
    }

    function startLoops() {
        setInterval(() => {
            const a = app();
            if (!a) return;
            const f = a.currentFrame;
            if (f === lastFrame) return;
            const prev = lastFrame;
            lastFrame = f;
            handleFrameChange(f, prev);
        }, 300);

        // bucle principal 10 Hz: estado + habilidades + vigilancia
        setInterval(() => {
            if (!host || !host.open) return;
            const s = readState();
            if (!s) return;
            host.broadcast({ t: 'state', s });
            updateBadge(s);
            tickStunRecharge(s);
            updateArsenalUI(s);
            updateFreddyGhost(s);
            if (state.phase === 'night') {
                watchDoors(s);
                tickPistolWindow();
                tickCoffee();
                tickKillFallback();
            }
        }, 100);

        // retirada original: puerta cerrada demasiado tiempo en el marco
        setInterval(() => {
            if (state.phase !== 'night') return;
            const now = Date.now();
            Object.keys(state.players).forEach(role => {
                if (role === 'foxy') return;
                const p = state.players[role];
                if (p.room !== 'doorL' && p.room !== 'doorR') { p.doorClosedSince = 0; p.retractAt = 0; return; }
                const doorClosed = (p.room === 'doorL')
                    ? (img('left door') === DOOR_IMG.L.closed)
                    : (img('right door') === DOOR_IMG.R.closed);
                if (!doorClosed) { p.doorClosedSince = 0; p.retractAt = 0; return; }
                if (!p.doorClosedSince) {
                    p.doorClosedSince = now;
                    p.retractAt = now + 5000 + Math.floor(Math.random() * 2000);
                    return;
                }
                if (p.retractAt && now >= p.retractAt) retractFromDoor(role, 'puerta cerrada demasiado tiempo', 'corner');
            });
        }, 500);

        // autoridad de marcadores (red de seguridad, 1 Hz): si el guion
        // movió el marcador de un jugador (IA congelada = no debería),
        // se recoloca en su sala real. Los ANCLAJES DE PUERTA se excluyen:
        // ahí mandan el flujo de ataque propio y los eventos nativos del
        // juego (p. ej. [213] ready→got you), y pelearlos revierte kills.
        setInterval(() => {
            if (state.phase !== 'night' || !app() || app().currentFrame !== 2) return;
            const DOOR_CODES = ['doorL', 'doorR', 'inL', 'inR', 'fredIn'];
            Object.keys(state.players).forEach(role => {
                const p = state.players[role];
                if (role === 'foxy') return;
                if (DOOR_CODES.indexOf(p.room) !== -1) return;   // flujo de puerta/kill
                const at = markerRoom(role);
                if (at && DOOR_CODES.indexOf(at) === -1 && at !== p.room && ANCHOR[p.room]) {
                    tp(role, p.room);
                    log('marcador de ' + role + ' desviado a ' + at + ' — recolocado en ' + p.room);
                }
            });
        }, 1000);
    }

    function handleFrameChange(f, prev) {
        // Periódico del principio: avanza solo tras dejar leerlo
        if (f === 9) {
            setTimeout(() => {
                const a = app();
                if (a && a.currentFrame === 9) {
                    gameClick(640, 360);
                    log('Periódico avanzado automáticamente');
                }
            }, 2800);
        }

        if (f === 2 && state.phase !== 'night') {
            state.phase = 'night';
            state.night = rs('night number') || state.night;
            preloadOverlays();
            state.aiDefaults = {
                freddy: rs('freddy AI'), bonnie: rs('bonie AI'),
                chica: rs('chica AI'), foxy: rs('foxy AI')
            };
            // congelar la IA de los roles con jugador DESPUÉS de que el
            // guion de inicio de noche escriba sus niveles por defecto
            Object.keys(state.players).forEach(role => { state.players[role].aiFrozen = false; });
            setTimeout(() => {
                if (state.phase === 'night' && app() && app().currentFrame === 2) {
                    Object.keys(state.players).forEach(role => {
                        freezeRoleAI(role);
                        state.players[role].aiFrozen = true;
                    });
                    setAISafe('move who?', 0);
                    log('IA nativa congelada para los roles con jugador');
                }
            }, 1200);

            // reset de habilidades del guardia para la nueva noche
            resetArsenal();

            // posiciones de arranque: todos al escenario (cueva para Foxy)
            Object.keys(state.players).forEach(role => {
                const p = state.players[role];
                p.room = (role === 'foxy') ? '1C' : '1A';
                p.lastMove = 0;
                p.attackAt = 0;
                p.doorClosedSince = 0;
                p.retractAt = 0;
                p.doorSince = 0;
                p.foxPeek = 0;
                p.running = false;
                p.stunUntil = 0;
                p.gunLockUntil = 0;
                p.nextCd = 0;
                p.killAt = 0;
                if (role !== 'foxy') tp(role, p.room);
            });
            gun.windowRole = null;
            gun.windowUntil = 0;
            gun.pendingIn = null;
            host && host.broadcast({ t: 'phase', p: 'night', night: state.night });
            log('Noche ' + state.night + ' iniciada — ritmo ' + (nightMoveCd(state.night) / 1000) + 's/sala');
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

    function detectKiller() {
        const bys = [];
        Object.keys(state.players).forEach(role => {
            const p = state.players[role];
            if (!p) return;
            if (role === 'foxy' && (p.running || rs('fox progress') >= 4)) bys.push('foxy');
            if (p.room === 'inL' || p.room === 'inR' || p.room === 'fredIn') bys.push(role);
        });
        if (bys.length) return bys[0];
        if (rs('fox progress') != null && rs('fox progress') >= 4) return 'foxy';
        // roles sin jugador (IA nativa): leer sus marcadores
        ['bonnie', 'chica', 'freddy'].forEach(role => {
            if (state.players[role]) return;
            const at = markerRoom(role);
            if (at === 'inL' || at === 'inR' || at === 'fredIn') bys.push(role);
        });
        if (bys.length) return bys[0];
        // apagón (energía a 0): fue Freddy
        if (rs('power down') === 1 || (rs('power left 2') === 0)) return 'freddy';
        return 'desconocido';
    }

    // ---------------------------------------------------------
    // Control de la IA / movimientos
    // ---------------------------------------------------------
    function freezeAI(role) {
        const counter = { freddy: 'freddy AI', bonnie: 'bonie AI', chica: 'chica AI', foxy: 'foxy AI' }[role];
        setAISafe(counter, 0);
    }
    function restoreAI(role) {
        const counter = { freddy: 'freddy AI', bonnie: 'bonie AI', chica: 'chica AI', foxy: 'foxy AI' }[role];
        const def = state.aiDefaults ? state.aiDefaults[role] : null;
        if (def != null) setAISafe(counter, def);
    }

    function roomOf(role) { return state.players[role] ? state.players[role].room : null; }

    function lockedOut(p, now) {
        const stunL = (p.stunUntil || 0) - now;
        const gunL = (p.gunLockUntil || 0) - now;
        return { yes: stunL > 0 || gunL > 0, stunL: stunL, gunL: gunL };
    }

    function handleMove(m, entry) {
        const role = entry.role;
        const p = state.players[role];
        if (!p || state.phase !== 'night') return;
        const now = Date.now();
        const lock = lockedOut(p, now);
        if (lock.yes) {
            const why = lock.gunL > 0 ? 'reiniciando' : 'aturdido';
            const wait = Math.ceil(Math.max(lock.stunL, lock.gunL) / 1000);
            try { entry.conn.send(JSON.stringify({ t: 'moveBad', why: why, wait: wait })); } catch (e) { }
            return;
        }
        // ritmo por noche + tirada de paso rápido (más probable cada noche)
        const cd = p.fastNext ? Math.round(nightMoveCd(state.night) / 2) : nightMoveCd(state.night);
        if (now - p.lastMove < cd) {
            try { entry.conn.send(JSON.stringify({ t: 'moveBad', why: 'demasiado-rapido', wait: Math.ceil((cd - (now - p.lastMove)) / 1000) })); } catch (e) { }
            return;
        }

        if (role === 'foxy') return handleFoxyMove(p, entry, now);

        const room = m.to;
        const adj = ADJACENCY[room];
        const current = roomOf(role);
        const legal = LEGAL_ROOMS[role];
        if (!adj || !adj.includes(current) || legal.indexOf(room) === -1) {
            try { entry.conn.send(JSON.stringify({ t: 'moveBad', why: 'no-adyacente' })); } catch (e) { }
            return;
        }
        if (tp(role, room)) {
            p.room = room;
            p.lastMove = now;
            // tirada de paso rápido para el PRÓXIMO movimiento
            p.fastNext = Math.random() < nightFastChance(state.night);
            p.nextCd = p.fastNext ? Math.round(nightMoveCd(state.night) / 2) : nightMoveCd(state.night);
            try { entry.conn.send(JSON.stringify({ t: 'moveOk', room: room, cd: p.nextCd, fast: !!p.fastNext })); } catch (e) { }
            host.broadcast({ t: 'anim', role: role, room: room, from: current });
            // risa original de Freddy al moverse (canon FNAF1)
            if (role === 'freddy') playSfx('freddy_laugh.mp3', 0.4);
            log(role + ' → ' + room + (p.fastNext ? ' (¡paso rápido!)' : ''));
        }
    }

    function handleFoxyMove(p, entry, now) {
        // 👁 CANON: Foxy no puede asomarse mientras el guardia lo mira
        // en la CAM 1C. Una vez fuera, que lo vean no lo frena.
        if (rs('viewing') === 99) {
            try { entry.conn.send(JSON.stringify({ t: 'moveBad', why: 'observado', wait: 1 })); } catch (e) { }
            log('FOXY bloqueado: el guardia lo mira en la CAM 1C');
            return;
        }
        const cur = (p.foxPeek != null) ? p.foxPeek : rs('fox progress');
        if (cur == null) return;
        if (cur >= 2) {
            try { entry.conn.send(JSON.stringify({ t: 'moveBad', why: 'max-cortina' })); } catch (e) { }
            return;
        }
        const next = cur + 1;
        setRS('fox progress', next);
        p.foxPeek = next;
        p.lastMove = now;
        try { entry.conn.send(JSON.stringify({ t: 'moveOk', room: '1C', progress: next })); } catch (e) { }
    }

    // ---------------------------------------------------------
    // Ataques — todo nativo vía marcadores
    // ---------------------------------------------------------
    function handleAttack(m, entry) {
        const role = entry.role;
        const p = state.players[role];
        if (!p || state.phase !== 'night') return;
        const now = Date.now();
        const lock = lockedOut(p, now);
        if (lock.yes) {
            const why = lock.gunL > 0 ? 'reiniciando' : 'aturdido';
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: why, wait: Math.ceil(Math.max(lock.stunL, lock.gunL) / 1000) })); } catch (e) { }
            return;
        }

        if (role === 'foxy') return handleFoxyAttack(p, entry, now);

        // ===== FREDDY: se cuela desde CUALQUIERA de las dos esquinas =====
        if (role === 'freddy') {
            if (now - (p.attackAt || 0) < 10000) {
                try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'cooldown', wait: Math.ceil((10000 - (now - (p.attackAt || 0))) / 1000) })); } catch (e) { }
                return;
            }
            const side = roomOf(role) === '2B' ? 'L' : 'R';
            if (roomOf(role) !== '4B' && roomOf(role) !== '2B') {
                try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'lejos' })); } catch (e) { }
                return;
            }
            const doorRClosed = side === 'R'
                ? (img('right door') === DOOR_IMG.R.closed)
                : (img('left door') === DOOR_IMG.L.closed);
            if (doorRClosed) {
                try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'puerta-cerrada' })); } catch (e) { }
                log('FREDDY rebotó: puerta ' + (side === 'R' ? 'derecha' : 'izquierda') + ' cerrada');
                return;
            }
            p.attackAt = now;
            p.doorSide = side;
            p.burstUntil = now + BURST_MS;
            p.burstKind = 'freddy';
            playSfx('knock.mp3', 0.3);
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: true, burst: BURST_MS })); } catch (e) { }
            log('FREDDY se cuela por la puerta ' + (side === 'R' ? 'derecha' : 'izquierda'));
            return;
        }

        // ===== BONNIE / CHICA =====
        // irrumpir desde el marco
        if ((p.room === 'doorL' || p.room === 'doorR') && m && m.door) {
            const side = p.room === 'doorL' ? 'L' : 'R';
            const doorClosed = side === 'L'
                ? (img('left door') === DOOR_IMG.L.closed)
                : (img('right door') === DOOR_IMG.R.closed);
            if (doorClosed) {
                playSfx('doorSlam.mp3', 0.8);
                retractFromDoor(role, 'puerta cerrada al irrumpir', 'dining');
                try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'puerta-cerrada' })); } catch (e) { }
                return;
            }
            p.burstUntil = now + BURST_MS;
            p.burstKind = 'burst';
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: true, burst: BURST_MS })); } catch (e) { }
            log(role.toUpperCase() + ' IRRUMPE hacia la oficina (ventana ' + BURST_MS + 'ms)');
            return;
        }

        // aproximación: desde la esquina hasta el marco
        if (now - (p.attackAt || 0) < 10000) {
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'cooldown', wait: Math.ceil((10000 - (now - (p.attackAt || 0))) / 1000) })); } catch (e) { }
            return;
        }
        const expected = (role === 'bonnie') ? '2B' : '4B';
        if (roomOf(role) !== expected) {
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'lejos' })); } catch (e) { }
            return;
        }
        const side = (role === 'bonnie') ? 'L' : 'R';
        const doorClosed = side === 'L'
            ? (img('left door') === DOOR_IMG.L.closed)
            : (img('right door') === DOOR_IMG.R.closed);
        if (doorClosed) {
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'puerta-cerrada' })); } catch (e) { }
            log(role + ' rebotó: puerta cerrada');
            return;
        }
        // al marco de la puerta (anclaje 'ready to attack'): el juego
        // muestra la cara en la luz, cambia la vista de oficina y el
        // guardia todavía puede cerrar la puerta
        if (tp(role, side === 'L' ? 'doorL' : 'doorR')) {
            p.room = side === 'L' ? 'doorL' : 'doorR';
            p.attackAt = now;
            p.doorSince = now;
            playSfx('knock.mp3', 0.3);
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: true })); } catch (e) { }
            log(role.toUpperCase() + ' se asoma al marco de la puerta ' + (side === 'L' ? 'izquierda' : 'derecha'));
        }
    }

    function handleFoxyAttack(p, entry, now) {
        if (now - (p.attackAt || 0) < 12000) {
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'cooldown' })); } catch (e) { }
            return;
        }
        const cur = (p.foxPeek != null) ? p.foxPeek : rs('fox progress');
        if (cur == null || cur < 1) {
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'asomate-primero' })); } catch (e) { }
            return;
        }
        // 👁 CANON: no puede correr si lo están viendo en la 1C
        if (rs('viewing') === 99) {
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'observado' })); } catch (e) { }
            log('FOXY bloqueado: el guardia lo mira en la CAM 1C (correr)');
            return;
        }
        p.attackAt = now;
        // 🔫 noche 5+: si el guardia tiene balas y la puerta izquierda está
        // abierta, se abre la ventana de DISPARO antes de soltar la carrera
        const doorLOpen = (img('left door') !== DOOR_IMG.L.closed);
        if (state.night >= 5 && gun.bullets > 0 && doorLOpen && !gun.windowRole) {
            openGunWindow('foxy');
            p.runPending = true;   // la carrera real sale al cerrar la ventana
            p.running = true;
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: true })); } catch (e) { }
            log('FOXY arranca la carrera — el guardia puede disparar (' + GUN_WINDOW_MS / 1000 + 's)');
            return;
        }
        releaseFoxyRun(p);
        try { entry.conn.send(JSON.stringify({ t: 'atk', ok: true })); } catch (e) { }
    }

    function releaseFoxyRun(p) {
        setRS('fox progress', 4);      // carrera REAL del juego (2A → ataque)
        p.running = true;
        p.runPending = false;
        p.foxPeek = 0;
        log('FOXY corre por el pasillo oeste');
    }

    // Vigilancia de puertas/ataques en curso (100 ms):
    //  · irrupciones: resolver el burst → ventana de pistola → ANCLAJE
    //    'got you'/'freddy got in' → el juego mata SOLO (nativo)
    //  · anti-camping en el marco
    //  · Foxy: fox progress 4/5 → atribución de kill + ventana pistola AI
    function watchDoors(s) {
        const now = Date.now();
        Object.keys(state.players).forEach(role => {
            const p = state.players[role];
            if (!p) return;

            // burst de irrupción en curso → resolver
            if (p.burstUntil && now >= p.burstUntil) {
                p.burstUntil = 0;
                const kind = p.burstKind;
                p.burstKind = null;
                const side = p.doorSide || (role === 'bonnie' ? 'L' : 'R');
                const doorClosed = side === 'L'
                    ? (img('left door') === DOOR_IMG.L.closed)
                    : (img('right door') === DOOR_IMG.R.closed);
                if (doorClosed) {
                    // el guardia cerró durante la irrupción: rebote
                    playSfx('doorSlam.mp3', 0.8);
                    retractFromDoor(role, 'puerta cerrada durante la irrupción', 'dining');
                    try { p.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'puerta-cerrada' })); } catch (e) { }
                    return;
                }
                // 🔫 ventana de pistola (noche 5+, con balas): el "entró a
                // tu oficina" del usuario — 2s para disparar ANTES de que
                // el anclaje letal se active. Sin balas: kill directo.
                if (state.night >= 5 && gun.bullets > 0 && !gun.windowRole) {
                    if (gun.pendingIn) { /* ya hay cola: esperar */ }
                    else {
                        p.pendingInCode = (kind === 'freddy') ? 'fredIn' : (side === 'L' ? 'inL' : 'inR');
                        openGunWindow(role);
                        return;
                    }
                }
                completeEntry(role, (kind === 'freddy') ? 'fredIn' : (side === 'L' ? 'inL' : 'inR'));
                return;
            }

            // anti-camping en el marco de la puerta
            if (p.room === 'doorL' || p.room === 'doorR') {
                if (!p.doorSince) p.doorSince = now;
                else if (now - p.doorSince > DOOR_MAX_MS) {
                    p.doorSince = 0;
                    retractFromDoor(role, 'tiempo agotado en la puerta', 'corner');
                    log(role.toUpperCase() + ' retirado de la puerta por tiempo (anti-camping)');
                }
            } else {
                p.doorSince = 0;
            }

            // Foxy (IA o jugador): detectar carrera → ventana de pistola
            const fp = rs('fox progress');
            if (role === 'foxy' && p.running !== true && fp === 4 && state.night >= 5 && gun.bullets > 0 && !gun.windowRole) {
                p.running = true;
                openGunWindow('foxy');
            }
            if (role === 'foxy' && p.running && fp != null && fp < 4) {
                // la carrera terminó (rebote por puerta cerrada / kill)
                p.running = false;
                p.foxPeek = 0;
                try { p.conn.send(JSON.stringify({ t: 'foxyDone', ok: rs('fox progress') === 0 })); } catch (e) { }
            }
        });
    }

    // entrada completada: anclaje letal + aviso + nudged monitor-down
    function completeEntry(role, code) {
        const p = state.players[role];
        if (!p) return;
        tp(role, code);
        p.room = code;
        p.killAt = Date.now();
        host.broadcast({ t: 'anim', role: role, room: code });
        if (code === 'fredIn') {
            // Freddy DENTRO: la cadena ORIGINAL del juego (rostro en la
            // oscuridad + XSCREAM) se dispara al bajar el monitor — un
            // empujoncito al 'put down' acelera el momento. Si el dado
            // del juego tarda (random(4) por segundo), el APAGÓN
            // original (v6, verificado E2E) garantiza el kill a los ~9s.
            setTimeout(() => {
                if (state.phase === 'night' && app() && app().currentFrame === 2) setRS('put down', 1);
            }, 2600);
            setTimeout(() => {
                if (state.phase === 'night' && app() && app().currentFrame === 2) triggerPowerOut();
            }, 9000);
            log('FREDDY dentro — kill original en camino');
        } else {
            // Bonnie/Chica dentro: el juego actualiza su estado de puerta
            // (control room view) SOLO con el monitor ARRIBA y mata al
            // BAJARLO ([224]→cuenta atrás→XSCREAM). Un ciclo de monitor
            // forzado (subir→dejar que crv=2 → bajar) ejecuta la cadena
            // ORIGINAL completa con el revele de la puerta.
            setTimeout(() => { monitorCycleForKill(); }, 2200);
            log(role.toUpperCase() + ' DENTRO de la oficina — kill original en camino');
        }
        try { p.conn.send(JSON.stringify({ t: 'entered' })); } catch (e) { }
    }

    // Ciclo de monitor FORZADO para disparar la cadena de muerte nativa:
    // los eventos de estado de puerta ([18]-[22]) solo evalúan con
    // viewing > 0; la muerte ([224]→[228]) se dispara al volver a 0.
    // Subimos el monitor un instante (crv se actualiza) y lo bajamos por
    // el pipeline propio del juego ('put down').
    function monitorCycleForKill() {
        if (state.phase !== 'night' || !app() || app().currentFrame !== 2) return;
        const v = rs('viewing');
        if (v == null || v === 0) {
            setRS('flip it', 1);
            setRS('set viewing to', 1);
        }
        setTimeout(() => {
            if (state.phase === 'night' && app() && app().currentFrame === 2) {
                setRS('put down', 1);
            }
        }, 500);
    }

    // red de seguridad anti-cuelgue: si un kill nativo tarda demasiado
    // (p. ej. el guion bloqueado), salto directo al frame de muerte.
    function tickKillFallback() {
        const now = Date.now();
        Object.keys(state.players).forEach(role => {
            const p = state.players[role];
            if (!p || !p.killAt) return;
            if (now - p.killAt > KILL_FALLBACK_MS) {
                p.killAt = 0;
                const a = app();
                if (a && a.currentFrame === 2) {
                    try { a.nextFrame = 3; a.startTheFrame(); } catch (e) { }
                    log('kill de RESPALDO: salto directo al frame de muerte (' + role + ')');
                }
            }
        });
    }

    function triggerPowerOut() {
        setRS('power left', 0);
        setRS('power left 2', 0);
        setRS('power down', 1);
        log('APAGÓN — la secuencia ORIGINAL de Freddy está en marcha');
    }

    // ---------------------------------------------------------
    // Retirada de la puerta (marcador → sala)
    // ---------------------------------------------------------
    function retractFromDoor(role, why, dest) {
        const p = state.players[role];
        if (!p) return;
        const corner = (role === 'bonnie' || (role === 'freddy' && p.doorSide === 'L')) ? '2B'
            : ((role === 'freddy' && p.doorSide === 'R') ? '4B' : (role === 'bonnie' ? '2B' : '4B'));
        const target = (dest === 'corner') ? corner : '1B';
        tp(role, target);
        p.room = target;
        p.doorClosedSince = 0;
        p.retractAt = 0;
        p.burstUntil = 0;
        p.burstKind = null;
        p.doorSince = 0;
        p.killAt = 0;
        try { p.conn.send(JSON.stringify({ t: 'doorOut', room: target, why: why || '' })); } catch (e) { }
        try { p.conn.send(JSON.stringify({ t: 'moveOk', room: target })); } catch (e) { }
        host.broadcast({ t: 'anim', role: role, room: target });
        log(role + ' se retira de la puerta → ' + target + ' (' + why + ')');
    }

    // ---------------------------------------------------------
    // Habilidades de los ANIMATRÓNICOS (retiradas, jumpscare...)
    // ---------------------------------------------------------
    function handleAbility(m, entry) {
        const role = entry.role;
        const p = state.players[role];
        if (!p || state.phase !== 'night') return;
        const now = Date.now();
        const lock = lockedOut(p, now);
        if (lock.yes && m.kind !== 'doorRetreat' && m.kind !== 'foxyRetreat') return;

        if (m.kind === 'doorRetreat') {
            if (p.room === 'doorL' || p.room === 'doorR') {
                retractFromDoor(role, 'decisión del jugador', 'corner');
            } else {
                try { entry.conn.send(JSON.stringify({ t: 'doorOut', room: roomOf(role) || '1B', why: 'no-estaba' })); } catch (e) { }
            }
            return;
        }

        if (m.kind === 'foxyRetreat') {
            if (now - (p.lastRetreat || 0) < 2000) return;
            p.lastRetreat = now;
            setRS('fox progress', 0);
            p.foxPeek = 0;
            p.running = false;
            try { entry.conn.send(JSON.stringify({ t: 'moveOk', room: '1C', progress: 0 })); } catch (e) { }
            return;
        }

        const kind = m.kind;
        const cd = kind === 'jumpscare' ? 15000 : 20000;
        if (now - (p.cooldown[kind] || 0) < cd) return;
        p.cooldown[kind] = now;

        if (kind === 'jumpscare') {
            showHarmlessJumpscare(role);
            host.broadcast({ t: 'ability', role: role, kind: 'jumpscare' });
            log('Jumpscare inofensivo de ' + role);
        } else {
            if (role === 'foxy') p.sprintUntil = now + 5000;
            applySpecial(role);
            host.broadcast({ t: 'ability', role: role, kind: 'special' });
        }
    }

    function applySpecial(role) {
        switch (role) {
            case 'bonnie': showStaticInterference(3000); break;
            case 'chica': playSfx('kitchen.mp3', 0.55); break;
            case 'freddy': playSfx('freddy_laugh.mp3', 0.9); officeFlicker(2600); break;
        }
    }

    // =========================================================
    // ARSENAL DEL GUARDIA — una habilidad nueva cada noche
    //   N1 ⚡ DESTELLO  ·  N2 🔋 CÉLULA  ·  N3 📡 ESCÁNER
    //   N4 ☕ CAFÉ  ·  N5 🔫 PISTOLA
    // =========================================================
    const stun = { charges: STUN_MAX, cdUntil: 0, lastTod: -1 };
    const cell = { charges: CELL_MAX };
    const scan = { charges: SCAN_MAX, cdUntil: 0, until: 0 };
    const coffee = { charges: COFFEE_MAX, until: 0, tickAt: 0 };
    const gun = { bullets: GUN_BULLETS, windowRole: null, windowUntil: 0, pendingIn: null };

    function resetArsenal() {
        stun.charges = STUN_MAX; stun.cdUntil = 0; stun.lastTod = -1;
        cell.charges = CELL_MAX;
        scan.charges = SCAN_MAX; scan.cdUntil = 0; scan.until = 0;
        coffee.charges = COFFEE_MAX; coffee.until = 0; coffee.tickAt = 0;
        gun.bullets = GUN_BULLETS; gun.windowRole = null; gun.windowUntil = 0; gun.pendingIn = null;
        hideScanOverlay();
        hideGunPrompt();
    }

    // ---- ⚡ N1: DESTELLO (aturde y echa a los acampadores) ----
    function doGuardStun() {
        if (state.phase !== 'night' || !app() || app().currentFrame !== 2) return;
        const now = Date.now();
        if (stun.charges <= 0 || now < stun.cdUntil) return;
        stun.charges--;
        stun.cdUntil = now + STUN_CD_MS;
        playZap();
        showStunFlash();
        let stunned = 0, bounced = 0;
        Object.keys(state.players).forEach(role => {
            const p = state.players[role];
            if (!p) return;
            p.stunUntil = now + STUN_MS;
            stunned++;
            if (role === 'foxy') return;
            // solo echa a quien acampa en el MARCO; las cadenas de kill
            // (dentro de la oficina) son del juego original y no se tocan
            if ((p.room === 'doorL' || p.room === 'doorR') && !p.burstUntil) {
                retractFromDoor(role, 'destello del guardia', 'dining');
                bounced++;
            }
        });
        host && host.broadcast({ t: 'guardStun', ms: STUN_MS });
        log('⚡ DESTELLO: ' + stunned + ' aturdido(s) ' + STUN_MS / 1000 + 's, ' + bounced + ' echado(s) de la puerta');
        overlayDiv('mp-stuntoast',
            '<div style="color:#bfe0ff;font-family:monospace;text-align:center;font-size:2.4vw;text-shadow:0 0 1.2vw #3d80ff;">⚡ ¡DESTELLO!</div>' +
            '<div style="color:#dfefff;font-family:monospace;font-size:1.05vw;margin-top:0.8vh;">Animatrónicos aturdidos — ' +
            (bounced ? bounced + ' echado(s) de tu puerta' : 'nadie estaba en las puertas') + '</div>', 1900);
    }

    // ---- 🔋 N2: CÉLULA DE ENERGÍA (+25%) ----
    // ojo con las unidades: 'power left' va en décimas de punto (0-999,
    // 974 ≈ 97%) y 'power left 2' es su derivado de pantalla — solo se
    // recarga el contador real.
    function doCell() {
        if (state.phase !== 'night' || !app() || app().currentFrame !== 2) return;
        if (cell.charges <= 0) return;
        const power = rs('power left');
        if (power == null || power <= 0 || rs('power down') === 1) { log('🔋 sin energía que recargar'); return; }
        cell.charges--;
        const np = Math.min(990, power + 250);   // +25% en unidades reales
        setRS('power left', np);
        playSfx('doorSlam.mp3', 0.35);
        log('🔋 CÉLULA: energía ' + Math.round(power / 10) + '% → ' + Math.round(np / 10) + '%');
        overlayDiv('mp-celltoast',
            '<div style="color:#9dffc4;font-family:monospace;text-align:center;font-size:2.2vw;text-shadow:0 0 1.2vw #2bd66f;">🔋 ENERGÍA RECARGADA</div>' +
            '<div style="color:#d9ffe9;font-family:monospace;font-size:1.05vw;margin-top:0.8vh;">+' + CELL_AMOUNT + '% de batería de repuesto</div>', 1700);
    }

    // ---- 📡 N3: ESCÁNER (posiciones 10s) ----
    function doScan() {
        if (state.phase !== 'night' || !app() || app().currentFrame !== 2) return;
        const now = Date.now();
        if (scan.charges <= 0 || now < scan.cdUntil) return;
        scan.charges--;
        scan.cdUntil = now + SCAN_CD_MS;
        scan.until = now + SCAN_MS;
        playZap();
        log('📡 ESCÁNER: rastreo de animatrónicos activo ' + SCAN_MS / 1000 + 's');
        showScanOverlay();
    }

    const ROOM_LABEL = {
        '1A': 'ESCENARIO', '1B': 'COMEDOR', '1C': 'CUEVA DEL PIRATA', '5': 'BASTIDORES',
        '3': 'ALMACÉN', '2A': 'PASILLO OESTE', '2B': 'ESQUINA OESTE', '7': 'BAÑOS',
        '6': 'COCINA', '4A': 'PASILLO ESTE', '4B': 'ESQUINA ESTE',
        'doorL': '⚠ MARCO PUERTA IZQ.', 'doorR': '⚠ MARCO PUERTA DER.',
        'inL': '☠ ¡EN TU OFICINA!', 'inR': '☠ ¡EN TU OFICINA!', 'fredIn': '☠ ¡EN TU OFICINA!'
    };
    function showScanOverlay() {
        let d = document.getElementById('mp-scan');
        if (!d) {
            d = document.createElement('div');
            d.id = 'mp-scan';
            d.style.cssText = 'position:fixed;right:1.4vw;top:2vh;z-index:99998;font-family:monospace;background:linear-gradient(180deg,rgba(6,20,14,.94),rgba(2,10,8,.96));border:.14vw solid #1f6e4a;padding:1vh 1.1vw;box-shadow:0 0 1.6vw rgba(43,214,111,.25);clip-path:polygon(.6vw 0,100% 0,100% calc(100% - .6vw),calc(100% - .6vw) 100%,0 100%,0 .6vw);';
            document.body.appendChild(d);
        }
        d.style.display = 'block';
        renderScanList();
    }
    function renderScanList() {
        const d = document.getElementById('mp-scan');
        if (!d) return;
        let rows = '';
        Object.keys(state.players).forEach(role => {
            const p = state.players[role];
            const room = p ? p.room : null;
            const danger = (room === 'inL' || room === 'inR' || room === 'fredIn' || (role === 'foxy' && p && p.running));
            const watch = (role === 'foxy') ? 'CUEVA DEL PIRATA' : (ROOM_LABEL[room] || '—');
            rows += '<div style="display:flex;align-items:center;gap:.6vw;margin:.55vh 0;">' +
                '<img src="' + MP_URL + 'assets/roles/' + role + '.png" style="height:2.6vh;">' +
                '<span style="font-size:.95vw;letter-spacing:.1vw;color:' + (danger ? '#ff7d7d' : '#8dffc0') + ';">' +
                role.toUpperCase() + '</span>' +
                '<span style="font-size:.85vw;color:#bfffd9;letter-spacing:.06vw;">' +
                (role === 'foxy' && p && p.running ? '¡CORRIENDO!' : watch) + '</span></div>';
        });
        d.innerHTML = '<div style="display:flex;align-items:center;gap:.4vw;font-size:.68vw;letter-spacing:.26vw;color:#5ecf97;margin-bottom:.6vh;">' +
            '<b style="width:.5vw;height:.5vw;border-radius:50%;background:#2bd66f;box-shadow:0 0 .5vw #2bd66f;animation:mpstundot 1.2s infinite;"></b>Rastreo activo</div>' + rows;
    }
    function hideScanOverlay() {
        const d = document.getElementById('mp-scan');
        if (d) d.style.display = 'none';
    }

    // ---- ☕ N4: CAFÉ (el reloj corre x3 durante 12s) ----
    function doCoffee() {
        if (state.phase !== 'night' || !app() || app().currentFrame !== 2) return;
        if (coffee.charges <= 0 || coffee.until) return;
        coffee.charges--;
        coffee.until = Date.now() + COFFEE_MS;
        coffee.tickAt = 0;
        playZap();
        log('☕ CAFÉ: el tiempo corre más rápido durante ' + COFFEE_MS / 1000 + 's');
        overlayDiv('mp-coffeetoast',
            '<div style="color:#ffd9a3;font-family:monospace;text-align:center;font-size:2.2vw;text-shadow:0 0 1.2vw #d98a2b;">☕ ¡CAFÉ!</div>' +
            '<div style="color:#fff3e2;font-family:monospace;font-size:1.05vw;margin-top:0.8vh;">El reloj corre x3 — ' + COFFEE_MS / 1000 + 's de cafeína</div>', 1700);
    }
    function tickCoffee() {
        if (!coffee.until) return;
        const now = Date.now();
        if (now >= coffee.until) { coffee.until = 0; return; }
        if (now - coffee.tickAt >= 500) {
            coffee.tickAt = now;
            const m = rs('minute counter');
            if (m != null) setRS('minute counter', Math.min(90, m + 2));
        }
    }

    // ---- 🔫 N5: PISTOLA (3 balas · 2s · repesca al escenario) ----
    function openGunWindow(role) {
        gun.windowRole = role;
        gun.windowUntil = Date.now() + GUN_WINDOW_MS;
        showGunPrompt(role);
        playSfx('knock.mp3', 0.5);
        log('🔫 ¡' + role.toUpperCase() + ' en la oficina! Tienes ' + GUN_WINDOW_MS / 1000 + 's para disparar');
    }
    function tickPistolWindow() {
        if (!gun.windowRole) return;
        const now = Date.now();
        if (now < gun.windowUntil) {
            updateGunPrompt();
            return;
        }
        // ventana agotada sin disparo → el ataque continúa (kill nativo),
        // pero si el guardia aprovechó la ventana para CERRAR la puerta,
        // el ataque rebota (juego justo: cerrar a tiempo siempre salva)
        const role = gun.windowRole;
        gun.windowRole = null;
        gun.windowUntil = 0;
        hideGunPrompt();
        const p = state.players[role];
        if (p) {
            if (role === 'foxy') {
                if (p.runPending) releaseFoxyRun(p);   // el juego decide con la puerta real
            } else if (p.pendingInCode) {
                const code = p.pendingInCode;
                p.pendingInCode = null;
                const sideL = (code === 'inL' || (code === 'fredIn' && p.doorSide === 'L'));
                const doorClosed = sideL
                    ? (img('left door') === DOOR_IMG.L.closed)
                    : (img('right door') === DOOR_IMG.R.closed);
                if (doorClosed) {
                    playSfx('doorSlam.mp3', 0.8);
                    retractFromDoor(role, 'puerta cerrada durante el disparo', 'dining');
                    try { p.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'puerta-cerrada' })); } catch (e) { }
                } else {
                    completeEntry(role, code);
                }
            }
        }
    }
    function doShoot() {
        if (state.phase !== 'night' || state.night < 5) return;
        if (!gun.windowRole || Date.now() > gun.windowUntil) return;
        if (gun.bullets <= 0) return;
        const role = gun.windowRole;
        gun.bullets--;
        gun.windowRole = null;
        gun.windowUntil = 0;
        hideGunPrompt();
        playGunshot();
        showMuzzleFlash();
        const p = state.players[role];
        if (p) {
            p.pendingInCode = null;
            p.runPending = false;
            p.burstUntil = 0;
            p.burstKind = null;
            p.killAt = 0;
            p.gunLockUntil = Date.now() + GUN_LOCK_MS;
            p.stunUntil = Date.now() + GUN_LOCK_MS;
            if (role === 'foxy') {
                setRS('fox progress', 0);
                p.foxPeek = 0;
                p.running = false;
            } else {
                // repesca: de vuelta al escenario con "reinicio de sistemas"
                tp(role, '1A');
                p.room = '1A';
                p.doorSince = 0;
            }
            try { p.conn.send(JSON.stringify({ t: 'gunShot', role: role, ms: GUN_LOCK_MS })); } catch (e) { }
            host.broadcast({ t: 'anim', role: role, room: p.room });
        }
        log('🔫 ¡DISPARO A ' + role.toUpperCase() + '! Balas restantes: ' + gun.bullets);
        overlayDiv('mp-guntoast',
            '<div style="color:#ffd34d;font-family:monospace;text-align:center;font-size:2.6vw;text-shadow:0 0 1.4vw #d98a2b;">🔫 ¡LE HAS DADO!</div>' +
            '<div style="color:#fff0d3;font-family:monospace;font-size:1.1vw;margin-top:0.8vh;">' + role.toUpperCase() + ' vuelve al escenario — reinicio de sistemas ' + GUN_LOCK_MS / 1000 + 's</div>' +
            '<div style="color:#c9a76a;font-family:monospace;font-size:.95vw;margin-top:.5vh;">Balas restantes: ' + gun.bullets + '/' + GUN_BULLETS + '</div>', 2400);
    }
    function playGunshot() {
        // disparo sintetizado (WebAudio): no depende de assets
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            const ctx = new AC();
            const dur = 0.28;
            const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
            const data = buf.getChannelData(0);
            for (let i = 0; i < data.length; i++) {
                const t = i / data.length;
                data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.2);
            }
            const src = ctx.createBufferSource();
            src.buffer = buf;
            const flt = ctx.createBiquadFilter();
            flt.type = 'lowpass';
            flt.frequency.setValueAtTime(3200, ctx.currentTime);
            flt.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + dur);
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.9, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
            src.connect(flt); flt.connect(g); g.connect(ctx.destination);
            src.start();
            setTimeout(() => { try { ctx.close(); } catch (e) { } }, 600);
        } catch (e) { }
    }
    function showMuzzleFlash() {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;inset:0;z-index:99998;background:radial-gradient(circle at 50% 55%, #fff 0%, #ffd34d 18%, rgba(255,160,60,.45) 34%, transparent 60%);pointer-events:none;opacity:1;transition:opacity .4s;';
        document.body.appendChild(d);
        requestAnimationFrame(() => { d.style.opacity = '0'; });
        setTimeout(() => d.remove(), 500);
        document.body.style.transition = 'none';
        const shake = document.createElement('div');
        shake.style.cssText = 'position:fixed;inset:0;z-index:99997;pointer-events:none;box-shadow:inset 0 0 12vw rgba(255,200,80,.35);';
        document.body.appendChild(shake);
        setTimeout(() => shake.remove(), 350);
    }

    function showGunPrompt(role) {
        let d = document.getElementById('mp-gunprompt');
        if (!d) {
            d = document.createElement('div');
            d.id = 'mp-gunprompt';
            d.style.cssText = 'position:fixed;left:50%;top:16vh;transform:translateX(-50%);z-index:99999;font-family:monospace;text-align:center;pointer-events:none;';
            document.body.appendChild(d);
        }
        d.style.display = 'block';
        d.dataset.role = role;
        updateGunPrompt();
    }
    function updateGunPrompt() {
        const d = document.getElementById('mp-gunprompt');
        if (!d || !gun.windowRole) return;
        const left = Math.max(0, gun.windowUntil - Date.now());
        const pct = Math.max(0, Math.min(100, (left / GUN_WINDOW_MS) * 100));
        const role = gun.windowRole;
        d.innerHTML =
            '<div style="font-size:2.6vw;color:#ff5d5d;text-shadow:0 0 1.6vw red;letter-spacing:.12vw;animation:mpgunblink .22s infinite;">☠ ¡' + role.toUpperCase() + ' EN TU OFICINA!</div>' +
            '<div style="margin-top:1.2vh;display:inline-block;border:.22vw solid #ffd34d;background:rgba(20,12,2,.82);padding:1.2vh 2.2vw;cursor:pointer;pointer-events:auto;' +
            'clip-path:polygon(.8vw 0,100% 0,100% calc(100% - .8vw),calc(100% - .8vw) 100%,0 100%,0 .8vw);box-shadow:0 0 2.2vw rgba(255,211,77,.5);" onclick="window.__mpShoot && window.__mpShoot()">' +
            '<span style="font-size:2vw;color:#ffd34d;letter-spacing:.2vw;font-weight:bold;">🔫 DISPARAR</span>' +
            '<span style="font-size:.85vw;color:#c9a76a;display:block;margin-top:.3vh;">clic o tecla [ESPACIO] · ' + gun.bullets + ' balas</span></div>' +
            '<div style="margin-top:1vh;width:26vw;height:1vh;background:#180d04;border:.1vw solid #7a5b23;margin-left:auto;margin-right:auto;">' +
            '<div style="height:100%;width:' + pct + '%;background:linear-gradient(90deg,#d98a2b,#ffd34d);box-shadow:0 0 .8vw #ffb52b;"></div></div>' +
            '<div style="font-size:.9vw;color:#ffbibi;color:#ffcaa1;margin-top:.5vh;">' + (left / 1000).toFixed(1) + 's</div>';
    }
    function hideGunPrompt() {
        const d = document.getElementById('mp-gunprompt');
        if (d) d.style.display = 'none';
    }

    // ---- eco de presencia de Freddy en salas OESTE ----
    function updateFreddyGhost(s) {
        let d = document.getElementById('mp-fghost');
        const fp = state.players.freddy;
        const room = fp ? fp.room : null;
        let show = false;
        if (room && s && state.phase === 'night' && app() && app().currentFrame === 2) {
            const v = s.viewing;
            if (v != null && v > 0) {
                const vr = VIEWING_ROOM[v];
                if (vr && WEST_ROOMS.indexOf(vr) !== -1 && room === vr) show = true;
            }
            // en el marco de la puerta izquierda con la luz: el juego no
            // tiene arte de Freddy ahí — el eco lo delata
            if (v === 0 && room === 'doorL' && lightHold.L) show = true;
        }
        if (!show) { if (d) d.style.display = 'none'; return; }
        if (!d) {
            d = document.createElement('div');
            d.id = 'mp-fghost';
            d.style.cssText = 'position:fixed;inset:0;z-index:9998;pointer-events:none;';
            d.innerHTML =
                '<img src="' + MP_URL + 'assets/jumpscares/freddy.png" style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.9);height:70vh;opacity:.32;filter:contrast(1.15) brightness(.9);animation:mpfghost 2.6s infinite;">' +
                '<div style="position:absolute;left:50%;bottom:12vh;transform:translateX(-50%);font-family:monospace;font-size:1.3vw;letter-spacing:.34vw;color:#e8d6b0;text-shadow:0 0 1vw rgba(232,214,176,.5);animation:mpgunblink 1.1s infinite;">⚠ SEÑAL DE PRESENCIA ⚠</div>';
            document.body.appendChild(d);
        }
        d.style.display = 'block';
        // aviso sonoro al entrar a una sala oeste (una vez por sala)
        const p = state.players.freddy;
        if (p && p.room !== p._ghostSaid) {
            p._ghostSaid = p.room;
            playSfx('freddy_laugh.mp3', 0.35);
        }
    }

    // recarga del destello por hora del juego ('time of day')
    function tickStunRecharge(s) {
        if (state.phase !== 'night' || s == null || s.tod == null) return;
        const tod = s.tod;
        if (stun.lastTod < 0) { stun.lastTod = tod; return; }
        if (tod > stun.lastTod || (tod < stun.lastTod && tod > 0)) {
            stun.lastTod = tod;
            if (stun.charges < STUN_MAX) {
                stun.charges++;
                log('⚡ DESTELLO recargado (hora ' + tod + ') — cargas: ' + stun.charges);
                const n = document.getElementById('mp-arsenal');
                if (n) { n.classList.add('recharged'); setTimeout(() => n.classList.remove('recharged'), 2000); }
            }
        } else {
            stun.lastTod = tod;
        }
        // escáner en curso → repintar la lista en vivo
        if (scan.until && Date.now() < scan.until) {
            renderScanList();
        } else if (scan.until) {
            scan.until = 0;
            hideScanOverlay();
        }
    }

    // =========================================================
    // UI del ARSENAL (panel lateral del guardia)
    // =========================================================
    function buildArsenal() {
        const d = document.createElement('div');
        d.id = 'mp-arsenal';
        d.style.cssText = 'position:fixed;left:1.4vw;bottom:2vh;z-index:99998;display:none;font-family:monospace;';
        document.body.appendChild(d);
    }

    function abilityRow(id, icon, name, key, hint, charges, max, ready) {
        const pips = (max && max > 1)
            ? '<span class="mp-pips">' + Array.from({ length: max }, (_, i) => '<i class="' + (i < charges ? 'on' : '') + '"></i>').join('') + '</span>'
            : (max === 1 ? '<span class="mp-pips"><i class="' + (charges > 0 ? 'on' : '') + '"></i></span>' : '');
        return '<button id="' + id + '" class="mp-abtn' + (ready ? ' go' : '') + '"' + (ready ? '' : ' disabled') + '>' +
            '<span class="mp-aicon">' + icon + '</span>' +
            '<span class="mp-atxt"><b>' + name + '</b><small>clic o [' + key + ']</small></span>' + pips + '</button>';
    }

    function updateArsenalUI(s) {
        const d = document.getElementById('mp-arsenal');
        if (!d) return;
        const atNight = state.phase === 'night' && app() && app().currentFrame === 2;
        d.style.display = atNight ? 'block' : 'none';
        if (!atNight) return;
        const night = state.night || 1;
        const now = Date.now();
        const stunCd = Math.max(0, stun.cdUntil - now);
        const stunReady = stun.charges > 0 && stunCd <= 0;
        const cellReady = night >= 2 && cell.charges > 0;
        const scanCd = Math.max(0, scan.cdUntil - now);
        const scanReady = night >= 3 && scan.charges > 0 && scanCd <= 0;
        const coffeeReady = night >= 4 && coffee.charges > 0 && !coffee.until;
        const gunReady = night >= 5 && gun.bullets > 0 && !!gun.windowRole;

        let html = '<div class="mp-arshead"><b></b>ARSENAL NOCHE ' + night + '</div>';
        html += abilityRow('mp-btn-stun', '⚡', 'DESTELLO', 'F',
            'Aturde a todos 5s y echa a los acampadores', stun.charges, STUN_MAX, stunReady);
        if (night >= 2) html += abilityRow('mp-btn-cell', '🔋', 'CÉLULA', 'E',
            '+25% de energía (1 por noche)', cell.charges, CELL_MAX, cellReady);
        if (night >= 3) html += abilityRow('mp-btn-scan', '📡', 'ESCÁNER', 'R',
            'Revela posiciones 10s', scan.charges, SCAN_MAX, scanReady);
        if (night >= 4) html += abilityRow('mp-btn-coffee', '☕', 'CAFÉ', 'T',
            'El reloj corre x3 durante 12s', coffee.charges, COFFEE_MAX, coffeeReady);
        if (night >= 5) html += abilityRow('mp-btn-gun', '🔫', 'PISTOLA', 'ESPACIO',
            '3 balas · 2s cuando entren', gun.bullets, GUN_BULLETS, gunReady);
        if (stunCd > 0) html += '<div class="mp-cd">⚡ recargando ' + Math.ceil(stunCd / 1000) + 's</div>';
        if (scanCd > 0) html += '<div class="mp-cd">📡 recargando ' + Math.ceil(scanCd / 1000) + 's</div>';
        if (coffee.until) html += '<div class="mp-cd">☕ activo ' + Math.ceil((coffee.until - now) / 1000) + 's</div>';
        if (night < 5) html += '<div class="mp-next">🔒 noche 5: PISTOLA</div>';
        else if (night < 4) html += '<div class="mp-next">🔒 noche 4: CAFÉ</div>';
        else if (night < 3) html += '<div class="mp-next">🔒 noche 3: ESCÁNER</div>';
        else if (night < 2) html += '<div class="mp-next">🔒 noche 2: CÉLULA</div>';

        const rebuild = d.__html !== html;
        if (rebuild) {
            d.__html = html;
            d.innerHTML = html;
            const bs = document.getElementById('mp-btn-stun');
            const bc = document.getElementById('mp-btn-cell');
            const bsc = document.getElementById('mp-btn-scan');
            const bcf = document.getElementById('mp-btn-coffee');
            const bg = document.getElementById('mp-btn-gun');
            if (bs) bs.onclick = doGuardStun;
            if (bc) bc.onclick = doCell;
            if (bsc) bsc.onclick = doScan;
            if (bcf) bcf.onclick = doCoffee;
            if (bg) bg.onclick = doShoot;
        } else {
            // solo refrescar estados 'go'
            const set = (id, ready) => {
                const b = document.getElementById(id);
                if (b) { b.disabled = !ready; b.classList.toggle('go', !!ready); }
            };
            set('mp-btn-stun', stunReady);
            set('mp-btn-cell', cellReady);
            set('mp-btn-scan', scanReady);
            set('mp-btn-coffee', coffeeReady);
            set('mp-btn-gun', gunReady);
        }
    }

    // ---------------------------------------------------------
    // Efectos del guardia (destello / zap / overlays)
    // ---------------------------------------------------------
    function playZap() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            const ctx = new AC();
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(1750, ctx.currentTime);
            o.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.38);
            g.gain.setValueAtTime(0.45, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.42);
            o.connect(g); g.connect(ctx.destination);
            o.start(); o.stop(ctx.currentTime + 0.45);
            setTimeout(() => { try { ctx.close(); } catch (e) { } }, 700);
        } catch (e) { }
    }

    function showStunFlash() {
        const d = document.createElement('div');
        d.style.cssText = 'position:fixed;inset:0;z-index:99998;background:#fff;pointer-events:none;opacity:0.95;transition:opacity 0.55s;transform:translateZ(0);';
        document.body.appendChild(d);
        requestAnimationFrame(() => { d.style.opacity = '0'; });
        setTimeout(() => d.remove(), 700);
        const b = document.createElement('div');
        b.style.cssText = 'position:fixed;inset:0;z-index:99997;background:radial-gradient(ellipse at center, rgba(120,180,255,0.30), rgba(30,50,110,0.14) 62%, transparent);pointer-events:none;';
        document.body.appendChild(b);
        setTimeout(() => b.remove(), 950);
        for (let i = 0; i < 3; i++) {
            const arc = document.createElement('div');
            arc.className = 'mp-arc';
            arc.style.top = (12 + Math.random() * 76) + '%';
            arc.style.animationDelay = (i * 0.12 + Math.random() * 0.1) + 's';
            document.body.appendChild(arc);
            setTimeout(() => arc.remove(), 1100);
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
            '<img src="' + MP_URL + 'assets/jumpscares/' + role + '.png" style="height:105vh;width:100vw;object-fit:cover;will-change:transform;transform:translateZ(0);backface-visibility:hidden;animation:mpshake .09s infinite;">', 1600);
        playSfx('scream.mp3', 0.95);
        setTimeout(() => { d.remove(); showStaticInterference(450); }, 1550);
    }

    function showStaticInterference(ms) {
        const d = overlayDiv('mp-static', '', ms || 3000);
        d.style.background = 'url(resources/background.gif)';
        d.style.backgroundSize = 'cover';
        d.style.opacity = '0.8';
        d.style.transform = 'translateZ(0)';
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
        buildArsenal();
        window.addEventListener('keydown', (e) => {
            if (e.key === 'f' || e.key === 'F') doGuardStun();
            if (e.key === 'e' || e.key === 'E') doCell();
            if (e.key === 'r' || e.key === 'R') doScan();
            if (e.key === 't' || e.key === 'T') doCoffee();
            if (e.key === ' ') { e.preventDefault(); doShoot(); }
        });
        window.__mpShoot = doShoot;
    }

    function hourText(s) {
        if (!s || s.tod == null) return '';
        // el reloj del demo cuenta 12 (medianoche) → 1 → 2 ... → 6 (6 AM)
        const h = (s.tod === 12) ? 0 : s.tod;
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

    // estilos del arsenal + animaciones
    (function injectStyle() {
        const st = document.createElement('style');
        st.textContent =
            '@keyframes mpshake{0%{transform:translate(0,0) scale(1.02)}25%{transform:translate(-14px,9px) scale(1.05)}50%{transform:translate(11px,-13px) scale(1.03)}75%{transform:translate(-9px,-8px) scale(1.06)}100%{transform:translate(13px,10px) scale(1.02)}}' +
            '@keyframes mpstundot{0%,100%{opacity:1;box-shadow:0 0 .5vw #6db4ff}50%{opacity:.3;box-shadow:0 0 .15vw #6db4ff}}' +
            '@keyframes mpgunblink{0%,100%{opacity:1}50%{opacity:.45}}' +
            '@keyframes mpfghost{0%,100%{opacity:.18;transform:translate(-50%,-50%) scale(.88)}50%{opacity:.38;transform:translate(-50%,-50%) scale(.94)}}' +
            '@keyframes mparcsweep{0%{opacity:0;transform:scaleX(.15)}25%{opacity:1}100%{opacity:0;transform:scaleX(1.05)}}' +
            '@keyframes mpabtnpulse{0%,100%{box-shadow:0 0 .6vw rgba(255,211,77,.25)}50%{box-shadow:0 0 1.8vw rgba(255,211,77,.8)}}' +
            '@keyframes mprecharge{0%{transform:translateY(0)}45%{transform:translateY(-.55vh)}100%{transform:translateY(0)}}' +
            '#mp-arsenal .mp-arshead{display:flex;align-items:center;gap:.4vw;font-size:.68vw;letter-spacing:.26vw;color:#d8c9a3;margin-bottom:.5vh}' +
            '#mp-arsenal .mp-arshead b{display:inline-block;width:.5vw;height:.5vw;border-radius:50%;background:#ffd34d;box-shadow:0 0 .5vw #ffd34d;animation:mpstundot 1.6s infinite}' +
            '#mp-arsenal .mp-abtn{display:flex;align-items:center;gap:.6vw;width:17vw;margin-top:.6vh;background:linear-gradient(180deg,rgba(10,16,34,.95),rgba(4,8,18,.96));border:.14vw solid #3a3323;color:#bfe0ff;font-size:1vw;padding:.9vh 1.1vw;letter-spacing:.07vw;text-shadow:0 0 .5vw rgba(160,200,255,.35);cursor:pointer;transition:border-color .15s,transform .15s,box-shadow .15s;clip-path:polygon(.6vw 0,100% 0,100% calc(100% - .6vw),calc(100% - .6vw) 100%,0 100%,0 .6vw);box-shadow:0 .4vh 1.8vw rgba(0,0,0,.6),inset 0 1px 0 rgba(200,200,255,.06);text-align:left}' +
            '#mp-arsenal .mp-abtn .mp-aicon{font-size:1.55vw;line-height:1;text-shadow:0 0 .8vw rgba(255,211,77,.7)}' +
            '#mp-arsenal .mp-abtn .mp-atxt{display:flex;flex-direction:column;line-height:1.25}' +
            '#mp-arsenal .mp-abtn .mp-atxt b{font-size:1.05vw;letter-spacing:.14vw}' +
            '#mp-arsenal .mp-abtn .mp-atxt small{font-size:.6vw;color:#8fb8e8;letter-spacing:.12vw}' +
            '#mp-arsenal .mp-abtn.go{border-color:#ffd34d;animation:mpabtnpulse 1.6s infinite}' +
            '#mp-arsenal .mp-abtn.go .mp-aicon{filter:drop-shadow(0 0 .6vw #ffd34d)}' +
            '#mp-arsenal .mp-abtn:not(:disabled):hover{transform:translateY(-.3vh);border-color:#ffe08a}' +
            '#mp-arsenal .mp-abtn:disabled{cursor:default;opacity:.55}' +
            '#mp-arsenal .mp-pips{display:flex;gap:.32vw;margin-left:auto}' +
            '#mp-arsenal .mp-pips i{width:.5vw;height:.95vw;transform:skewX(-16deg);background:#191610;border:.07vw solid #3a3323;transition:background .25s,box-shadow .25s}' +
            '#mp-arsenal .mp-pips i.on{background:linear-gradient(180deg,#ffe08a,#d98a2b);border-color:#ffd34d;box-shadow:0 0 .55vw rgba(255,211,77,.85)}' +
            '#mp-arsenal .mp-cd{font-size:.72vw;color:#8fb8e8;margin-top:.45vh;letter-spacing:.05vw}' +
            '#mp-arsenal .mp-next{font-size:.68vw;color:#5a7ea8;margin-top:.6vh;letter-spacing:.08vw}' +
            '#mp-arsenal.recharged .mp-pips i{animation:mprecharge .5s 2}' +
            '.mp-arc{position:fixed;left:0;right:0;height:2px;z-index:99998;pointer-events:none;background:linear-gradient(90deg,transparent,rgba(170,215,255,.95) 28%,#fff 50%,rgba(170,215,255,.95) 72%,transparent);filter:drop-shadow(0 0 6px rgba(109,180,255,.95));animation:mparcsweep .55s ease-out forwards;opacity:0}';
        document.head.appendChild(st);
    })();

    // debug/inspección (útil para pruebas; no afecta al juego)
    window.__MP = {
        state, readState, find, rs, img, app, gameClick,
        host: () => host,
        tp: tp, markerRoom: markerRoom,
        gun: () => gun, arsenal: () => ({ stun: stun, cell: cell, scan: scan, coffee: coffee, gun: gun })
    };

})();
