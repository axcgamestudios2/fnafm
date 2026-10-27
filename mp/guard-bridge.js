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

    const BRIDGE_VERSION = 'v6.5-kill-respaldo';
    try { console.log('[MP] guard-bridge ' + BRIDGE_VERSION); } catch (e) { }

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
    const AI_COUNTER = {
        bonnie: 'bonie AI', chica: 'chica AI', freddy: 'freddy AI', foxy: 'foxy AI'
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

    // (v6) hallazgo clave de ingeniería inversa: los "you spots" NO
    // renderizan nada — los marcadores internos viven ocultos en otra
    // capa y las cámaras pintan a los animatrónicos con los FRAMES de
    // los objetos de cámara, que solo cambian con la IA nativa del
    // juego. Por eso el guardia no veía moverse a los jugadores.

    // ---------------------------------------------------------
    // RENDERIZADO DE JUGADORES EN CÁMARAS (v6):
    // el juego original SOLO cambia las imágenes de las cámaras
    // ('1B dining area', 'cam 4B', ...) cuando la IA mueve a un
    // animatrónico con sus propios eventos. Con los contadores
    // escritos desde fuera (jugador) esos eventos NUNCA corren y el
    // guardia no ve a nadie moverse (bug: "no se ve en la cámara que
    // te moviste" / "la posición de Freddy en las cámaras"). Los
    // marcadores internos ('freddy bear', etc.) viven OCULTOS en otra
    // capa y jamás se dibujan en las cámaras. Solución: overlay DOM
    // propio por sala, con la pose original de cada animatrónico.
    // ---------------------------------------------------------
    const CAM_ROOM = VIEWING_CAM;          // viewing -> sala
    // [x%, y% del canvas, altura %, variante] por sala y rol.
    // variante: 'stand' = cuerpo completo de pie (assets/cams/<rol>-stand.png,
    // generado con IA + recorte por luminancia) | 'face' = cara en primer
    // plano (assets/cams/<rol>.png, viñeta del jumpscare original).
    // y más arriba = más lejos; h pequeño = figura lejana.
    const CAM_ANCHOR = {
        '1A': { bonnie: [35, 20, 58, 'stand'], chica: [63, 20, 58, 'stand'], freddy: [49, 18, 64, 'stand'] },
        '1B': { bonnie: [46, 26, 34, 'stand'], chica: [46, 26, 34, 'stand'], freddy: [47, 27, 36, 'stand'] },
        '5':  { bonnie: [44, 14, 66, 'face'] },
        '3':  { bonnie: [48, 12, 70, 'face'] },
        '2A': { bonnie: [47, 20, 40, 'stand'] },
        '2B': { bonnie: [50, 8, 80, 'face'] },
        '7':  { chica: [50, 22, 34, 'stand'], freddy: [50, 22, 36, 'stand'] },
        '6':  { /* cocina: SOLO AUDIO en el original: nunca visible */ },
        '4A': { chica: [50, 20, 40, 'stand'], freddy: [50, 19, 38, 'stand'] },
        '4B': { chica: [52, 12, 66, 'face'], freddy: [50, 6, 98, 'face'] }
    };
    const CAM_FILTER = {
        '1B': 'brightness(.45) contrast(1.18) saturate(.8)',
        '4A': 'brightness(.38) contrast(1.25) saturate(.65)',
        '4B': 'brightness(.85) contrast(1.08)',
        '7':  'brightness(.5) contrast(1.2)',
        '5':  'brightness(.55) contrast(1.15)',
        default: 'brightness(.5) contrast(1.15) saturate(.85)'
    };

    function updateCamViews() {
        const a = app();
        if (!a || !a.canvas) return;
        const id = 'mp-camview';
        let box = document.getElementById(id);
        const viewing = rs('viewing');
        if (state.phase !== 'night' || !viewing || viewing === 0) {
            if (box) box.remove();
            return;
        }
        const room = CAM_ROOM[viewing] || null;
        if (!room) { if (box) box.remove(); return; }
        const rect = a.canvas.getBoundingClientRect();
        if (!box) {
            box = document.createElement('div');
            box.id = id;
            box.style.cssText = 'position:fixed;z-index:99990;pointer-events:none;overflow:hidden;';
            document.body.appendChild(box);
        }
        box.style.left = rect.left + 'px';
        box.style.top = rect.top + 'px';
        box.style.width = rect.width + 'px';
        box.style.height = rect.height + 'px';

        // quién debe verse en esta sala
        const present = [];
        const now = performance.now();
        Object.keys(state.players).forEach(role => {
            const p = state.players[role];
            if (!p) return;
            if (role === 'foxy') {
                const fp = rs('fox progress');
                if (room === '1C' && fp >= 1 && fp <= 3) {
                    const h = [0, 24, 36, 50][fp] || 24;
                    present.push({ role, x: 52, y: 26, h, filter: 'brightness(' + (0.4 + fp * 0.12) + ') contrast(1.15)', walkIn: false, sprite: 'foxy-stand' });
                } else if (room === '2A' && fp === 4) {
                    present.push({ role, x: 47, y: 12, h: 74, filter: 'brightness(.4) contrast(1.3) blur(1px)', run: true, walkIn: false, sprite: 'foxy-run' });
                }
                return;
            }
            if (p.room !== room) return;
            const idx = rs(ACTIVITY_COUNTER[role]);
            if (idx != null && idx >= 7) return;   // en la puerta: lo pinta la vista de puerta
            const anchor = CAM_ANCHOR[room] && CAM_ANCHOR[room][role];
            if (!anchor) return;
            present.push({
                role, x: anchor[0], y: anchor[1], h: anchor[2],
                filter: CAM_FILTER[room] || CAM_FILTER.default,
                walkIn: p.roomChangedAt && (now - p.roomChangedAt < 1100),
                walkPlayed: p.walkPlayed,
                sprite: (anchor[3] === 'face' ? role : role + '-stand')
            });
            if (p.roomChangedAt && (now - p.roomChangedAt < 1100)) p.walkPlayed = p.room;
        });

        const html = present.map((q, i) => {
            const off = (i % 2 === 0) ? -5 : 5;
            const anim =
                (q.run ? 'animation:mpfoxrun .55s infinite alternate;' : '') +
                (q.walkIn && !q.walkPlayed ? 'animation:mpwalkin .95s ease-out;' : '');
            return '<img src="' + MP_URL + 'assets/cams/' + q.sprite + '.png" ' +
                'style="position:absolute;left:' + (q.x + off) + '%;top:' + (q.y + (i > 1 ? -6 : 0)) + '%;height:' + q.h + '%;' +
                'transform:translateX(-50%);object-fit:contain;object-position:bottom center;filter:' + q.filter + ';' + anim + '">';
        }).join('');
        if (box.__h !== html) { box.__h = html; box.innerHTML = html; }
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

    async function loadScriptFB(urls) {
        for (let i = 0; i < urls.length; i++) {
            if (await loadScript(urls[i])) {
                // ¿de verdad se cargó? (un CDN caído puede ejecutar onerror tarde)
                if (typeof window.Peer !== 'undefined') return true;
            }
        }
        return typeof window.Peer !== 'undefined';
    }

    // Precarga de imágenes de overlay (jumpscare + estática): decodificar
    // ANTES de que hagan falta evita el tirón de lag/engelote de la primera
    // vez (bug: "la parte de la screenshot súper trabada").
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
    }

    // estilos de overlays
    (function injectStyle() {
        const st = document.createElement('style');
        st.textContent = '@keyframes mpshake{0%{transform:translate(0,0) scale(1.02)}25%{transform:translate(-14px,9px) scale(1.05)}50%{transform:translate(11px,-13px) scale(1.03)}75%{transform:translate(-9px,-8px) scale(1.06)}100%{transform:translate(13px,10px) scale(1.02)}}' +
            '@keyframes mpwalkin{0%{opacity:0;transform:translateX(-160%) translateY(4%)}55%{opacity:.9}100%{opacity:1;transform:translateX(-50%) translateY(0)}}' +
            '@keyframes mpfoxrun{0%{transform:translateX(-50%) scale(1)}100%{transform:translateX(-50%) scale(1.07,.94)}}';
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

    // HOVER sintético: el FNAF original baja el monitor AL PASAR EL RATÓN
    // por la pestaña inferior (no con clic). El runtime escucha pointermove
    // (Runtime.js línea ~16394), así que un pointermove sintético ahí baja
    // el monitor de verdad — verificado: up-click + hover(640,700) -> KILL.
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

    // (v6) applyMarkers eliminado: el juego reposiciona sus marcadores
    // internos solo con su propia IA; teletransportarlos no renderiza
    // nada en cámaras (viven ocultos en otra capa) y solo pelea con la
    // lógica propia del juego. El renderizado de jugadores ahora es el
    // overlay DOM updateCamViews().

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

    // ---------------------------------------------------------
    // ARMADO NATIVO DEL KILL (v6.1): el juego solo ejecuta su cadena de
    // muerte (bajar monitor -> jumpscare original) si el helper
    // 'ready to attack left/right' está VISIBLE. El asalto de la IA
    // propia del juego lo activa; los writes externos del contador NO.
    // E2E: rtl visible + ba=7 + un ciclo de monitor -> frame 3 (muerte).
    // ---------------------------------------------------------
    const ATTACK_HELPER = { bonnie: 'ready to attack left', chica: 'ready to attack right' };

    function setHelperVisible(role, visible) {
        const name = ATTACK_HELPER[role];
        if (!name) return;                 // freddy usa el kill de apagón
        const o = find(name);
        if (!o || !o.ros) return;
        const VIS = 0x20, HID = 0x1, INACT = 0x2;
        const cur = o.ros.rsFlags;
        const want = visible ? ((cur | VIS) & ~HID & ~INACT) : (cur & ~VIS);
        if (cur !== want) {
            o.ros.rsFlags = want;
            if (o.roc) o.roc.rcChanged = true;
            log((visible ? 'ARMO ' : 'DESARMO ') + name);
        }
    }

    // ---------------------------------------------------------
    // VISTA DE PUERTA/PASILLO CON LA LUZ (como el juego original):
    // si el guardia MANTIENE la luz con la puerta abierta, ve al
    // animatrónico según lo cerca que esté:
    //   pasillo (índice 4/5) → silueta lejana y apagada al fondo
    //   esquina (índice 6)   → asomado en el vano de la puerta
    //   marco (índice 7/8)   → cara en primer plano
    //   Foxy corriendo (progreso 4) también aparece en el pasillo O.
    // Antes solo se veía el caso "índice 7": por eso "no salía el
    // animatrónico en tu perspectiva aunque estuviera ahí".
    // ---------------------------------------------------------
    function updateDoorViews() {
        const a = app();
        if (!a || !a.canvas) return;
        ['L', 'R'].forEach(side => {
            const id = 'mp-doorview-' + side;
            let d = document.getElementById(id);
            const doorOpen = (side === 'L')
                ? (img('left door') !== DOOR_IMG.L.closed)
                : (img('right door') !== DOOR_IMG.R.closed);
            const lightOn = lightHold[side];
            if (!lightOn || !doorOpen || state.phase !== 'night' || rs('viewing') !== 0) {
                if (d) d.remove();
                return;
            }
            // recopilar animatrónicos visibles por este lado, por proximidad
            const cands = [];
            Object.keys(state.players).forEach(r => {
                if (r === 'foxy') {
                    if (side !== 'L') return;               // Foxy corre por el pasillo OESTE
                    const fp = rs('fox progress');
                    if (fp === 4) cands.push({ role: r, prox: 1, run: true });
                    else if (fp === 5) cands.push({ role: r, prox: 3 });
                    return;
                }
                const expected = (r === 'bonnie') ? 'L' : 'R';
                if (expected !== side) return;
                const idx = rs(ACTIVITY_COUNTER[r]);
                if (idx === 7 || idx === 8) cands.push({ role: r, prox: 3 });
                else if (idx === 6) cands.push({ role: r, prox: 2 });
                else if ((side === 'L' && idx === 4) || (side === 'R' && idx === 5)) cands.push({ role: r, prox: 1 });
            });
            if (!cands.length) { if (d) d.remove(); return; }
            cands.sort((x, y) => y.prox - x.prox);
            const best = cands[0];
            // posición relativa al canvas (el despacho es panorámico y scrollea)
            const rect = a.canvas.getBoundingClientRect();
            const scale = rect.width / a.gaCxWin;
            const scroll = a.run ? (a.run.rhWindowX || 0) : 0;
            let x1, x2;
            if (side === 'L') { x1 = 95 - scroll; x2 = 330 - scroll; }
            else { x1 = 1270 - scroll; x2 = 1500 - scroll; }
            const cssX1 = rect.left + Math.max(0, x1) * scale;
            const cssX2 = rect.left + Math.min(a.gaCxWin, x2) * scale;
            if (!d) {
                d = document.createElement('div');
                d.id = id;
                d.style.cssText = 'position:fixed;z-index:99997;pointer-events:none;display:flex;align-items:flex-end;overflow:hidden;';
                document.body.appendChild(d);
            }
            d.style.left = cssX1 + 'px';
            d.style.width = Math.max(30, cssX2 - cssX1) + 'px';
            d.style.top = (rect.top + rect.height * 0.12) + 'px';
            d.style.height = (rect.height * 0.82) + 'px';
            // estilo según proximidad (más lejos = más pequeño y apagado)
            // sprites: viñeta de la cara (assets/cams/<rol>.png, transparencia
            // suave) — antes se usaba la escena completa del jumpscare y la
            // puerta se veía mal ("su posición está mal hecha")
            const base = 'flex:1;min-width:0;object-fit:contain;object-position:bottom center;';
            const byProx = {
                3: base + 'height:100%;filter:brightness(.9) contrast(1.1);',
                2: base + 'height:84%;align-self:flex-end;filter:brightness(.7) contrast(1.12) saturate(.85);margin:0 8%;',
                1: base + 'height:46%;align-self:flex-end;filter:brightness(.45) contrast(1.25) saturate(.6);margin:0 16%;opacity:.85;' +
                    (best.run ? 'transform:scaleX(1.12);' : '')
            };
            const html = '<img src="' + MP_URL + 'assets/cams/' + best.role + '.png" ' +
                'style="' + byProx[best.prox] + '">';
            if (d.__h !== html) { d.__h = html; d.innerHTML = html; }
        });
    }

    // Vigilante del ASALTO A LA PUERTA (100 ms). Flujo con AGENCIA del jugador:
    //   ataque desde esquina → 7 (marco de la puerta, el guardia puede cerrar)
    //   el jugador decide: IRRUMPIR (1.2s) o RETIRARSE (vuelve a la esquina)
    //   irrupción con la puerta abierta → margen de gracia (1.5s) → UN ciclo
    //     de monitor forzado (subir→bajar): el kill ORIGINAL del juego se
    //     dispara al BAJAR el monitor con el animatrónico en el marco
    //     (mecánica original: en la puerta + bajar monitor = jumpscare).
    //     El contador NUNCA se escribe a 8 desde fuera: un setRS(8) externo
    //     cancela la cadena original y el kill nunca llega.
    //   si el guardia cierra durante la irrupción (o en el margen) → rebote.
    const BURST_MS = 1200;

    // Forzar el kill: el juego mata al guardia al BAJAR el monitor con un
    // animatrónico en el marco. HALLAZGO v6.2 (E2E): las escrituras directas
    // del contador 'viewing' NO generan la transición REAL del tablet del
    // juego y el kill no dispara; los CICLOS REALES por el pipeline de
    // input sí (verificado E2E: clic subir en (442,691) + HOVER en la
    // pestaña (640,700) -> kill instantáneo). Además el juego necesita
    // varios segundos tras el armado del helper (v6.1: retraso p.killAt).
    function forceMonitorCycle() {
        let n = 0;
        (function cycle() {
            const a = app();
            if (!a || a.currentFrame !== 2 || n++ >= 8) return;  // murió o límite
            gameClick(442, 691);                    // subir monitor (clic real)
            setTimeout(() => {
                const a2 = app();
                if (!a2 || a2.currentFrame !== 2) return;
                gameHover(640, 700);                // hover pestaña: BAJAR -> kill
                setTimeout(cycle, 2600);
            }, 1600);
        })();
    }
    function watchDoorAssaults() {
        const now = Date.now();
        Object.keys(state.players).forEach(role => {
            const p = state.players[role];
            if (!p || !p.doorAssault) return;
            const idx = rs(ACTIVITY_COUNTER[role]);
            if (idx === 8) {
                // el juego lo metió dentro por sí solo: kill original en curso
                if (!p.officeKillAt) {
                    p.officeKillAt = now;
                    host && host.broadcast({ t: 'anim', role, room: 'doorIn' });
                    log(role.toUpperCase() + ' ENTRÓ a la oficina — kill original en camino');
                }
            } else if (idx != null && idx < 7) {
                // el juego/retirada lo sacó de la puerta
                setHelperVisible(role, false);
                p.doorAssault = false;
                p.burstUntil = 0;
                p.burstDoneAt = 0;
                p.officeKillAt = 0;
                p.killForced = false;
                p.killAt = 0;
                p.killDeadline = 0;
                p.killCycling = false;
            } else if (idx === 7 && p.burstUntil) {
                // irrupción en curso del jugador: resolver al terminar
                // (mantener el helper armado: el juego lo re-esconde)
                setHelperVisible(role, true);
                if (now < p.burstUntil) return;
                p.burstUntil = 0;
                const doorClosed = (role === 'bonnie')
                    ? (img('left door') === DOOR_IMG.L.closed)
                    : (img('right door') === DOOR_IMG.R.closed);
                if (doorClosed) {
                    // el guardia cerró durante la irrupción: rebote al comedor
                    playSfx('doorSlam.mp3', 0.8);
                    retractFromDoor(role, 'puerta cerrada durante la irrupción', 'dining');
                    try { p.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'puerta-cerrada' })); } catch (e) { }
                } else {
                    // irrumpió con la puerta abierta: tras un margen de gracia,
                    // forzar UN ciclo de monitor — el kill ORIGINAL del juego
                    // se dispara al bajar el monitor con él en el marco.
                    p.burstDoneAt = now;
                    log(role.toUpperCase() + ' irrumpió con la puerta abierta — kill en camino');
                }
            } else if (idx === 7 && p.burstDoneAt && !p.killForced) {
                // margen de gracia para que el guardia cierre la puerta
                setHelperVisible(role, true);
                if (now - p.burstDoneAt < 1500) return;
                const stillClosed = (role === 'bonnie')
                    ? (img('left door') === DOOR_IMG.L.closed)
                    : (img('right door') === DOOR_IMG.R.closed);
                if (stillClosed) {
                    // se salvó justo: no matar — la retracción lo devuelve
                    p.burstDoneAt = 0;
                    return;
                }
                p.killForced = true;
                p.officeKillAt = now;
                if (role === 'freddy') {
                    // HALLAZGO (v6): para FREDDY no existe kill nativo por
                    // contadores — el 8 solo dispara su cadena con el asalto
                    // de su PROPIA IA, y los ciclos de monitor no le afectan
                    // (verificado: fa=8 inerte, ciclos inútiles). Su kill
                    // ORIGINAL y 100% fiable es el del APAGÓN: el juego
                    // apaga la oficina, suena la marcha del Toreador y
                    // Freddy ejecuta su jumpscare — exactamente como en el
                    // juego original. E2E verificado end-to-end.
                    setRS('freddy activity', 8);
                    setRS('power left', 0);
                    setRS('power left 2', 0);
                    log('FREDDY DENTRO — apagón: el juego ejecuta el kill original de Freddy');
                } else {
                    // BONNIE/CHICA: el juego necesita varios SEGUNDOS tras el
                    // armado del helper para progresar su cadena de asalto
                    // interna (formación rtl/gyl) antes de que la transición
                    // de monitor ejecute el kill (hallazgo v6.1). Plan:
                    //   +12s  -> ciclos de monitor (kill nativo si el juego
                    //            responde — a menudo basta con que el guardia
                    //            real baje su propio monitor, armado ya el helper)
                    //   +54s  -> RESPALDO determinista: salto directo al frame
                    //            de muerte (verificado: nextFrame=3 +
                    //            startTheFrame() -> jumpscare + game over)
                    p.killAt = now + 12000;
                    p.killDeadline = now + 54000;
                    log(role.toUpperCase() + ' DENTRO — kill original en camino (armado nativo)');
                }
            } else if (idx === 7) {
                // en el marco sin irrumpir aún: mantener el helper armado
                // (el juego tiende a re-ocultarlo con sus propios eventos)
                setHelperVisible(role, true);
                if (p.killForced && !p.killCycling && now >= (p.killAt || 0)) {
                    p.killCycling = true;
                    forceMonitorCycle();
                    log('kill nativo: ciclos de monitor (el juego está armado)');
                }
                if (p.killForced && now >= (p.killDeadline || 0)) {
                    // RESPALDO: el juego no respondió a los ciclos — salto
                    // directo al frame de muerte (determinista, verificado)
                    const a = app();
                    if (a && a.currentFrame === 2) {
                        try { a.nextFrame = 3; a.startTheFrame(); } catch (e) { }
                        log('kill de respaldo: salto al frame de muerte');
                    }
                    p.killDeadline = 0;
                }
            }
        });
    }

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
                // desarmar el helper de puerta: si queda visible tras la
                // desconexión, el juego mataría al guardia con un asalto
                // FANTASMA (bug real detectado en E2E)
                setHelperVisible(entry.role, false);
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
        preloadOverlays();          // decodificar overlays antes de la 1ª noche
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

        setInterval(() => {
            if (!host || !host.open) return;
            const s = readState();
            if (!s) return;
            if (s.frame === 2) { state.lastPositions = s.positions; state.lastState = s; }
            host.broadcast({ t: 'state', s });
            updateBadge(s);
            if (state.phase === 'night') {
                updateCamViews();
                watchDoorAssaults();
                updateDoorViews();
            } else {
                updateCamViews();   // limpia overlays fuera de la noche
                updateDoorViews();
            }
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
        // Periódico del principio ("Help Wanted"): en el original no hay ninguna
        // pista de que hay que hacer CLIC para continuar y el guardia se
        // quedaba clavado aquí ("la parte de la screenshot súper trabada").
        // En multijugador se avanza solo tras dejar leerlo un momento.
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
            preloadOverlays();      // recalcular cache por si la red llegó tarde
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
                p.doorClosedSince = 0;
                p.retractAt = 0;
                p.doorAssault = false;
                p.burstUntil = 0;
                p.burstDoneAt = 0;
                p.officeKillAt = 0;
                p.killForced = false;
                p.killAt = 0;
                p.killDeadline = 0;
                p.killCycling = false;
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
        if (pos.foxy === 4 || pos.foxy === 5) return 'foxy';   // 5 = sprint activo
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
        // El host es MÁS permisivo que el cliente (600ms/400ms en cliente):
        // así el propio botón del cliente regula el ritmo y nunca hay
        // rechazos que hagan "rebobinar" la caminata optimista.
        const cd = p.sprintUntil && now < p.sprintUntil ? 300 : 450;
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
            try { entry.conn.send(JSON.stringify({ t: 'moveOk', room })); } catch (e) { }
            host.broadcast({ t: 'anim', role, room, from: current });
            // fidelidad al original: la risa de Freddy suena en cada paso
            // que da (el guardia la oye desde la oficina)
            if (role === 'freddy') playSfx('freddy_laugh.mp3', 0.4);
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

        if (role === 'foxy') {
            if (now - (p.attackAt || 0) < 12000) {
                try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'cooldown' })); } catch (e) { }
                return;
            }
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

        const atFrame = rs(ACTIVITY_COUNTER[role]) === 7;

        // ===== ATAQUE DESDE EL MARCO DE LA PUERTA (irrupción) =====
        // El jugador ya se asomó (act=7) y decide irrumpir. El guardia
        // tiene BURST_MS para cerrar la puerta. Sin cooldown: el
        // contrajuego del guardia es cerrar a tiempo.
        if (atFrame && m && m.door) {
            const doorClosed = (role === 'bonnie')
                ? (img('left door') === DOOR_IMG.L.closed)
                : (img('right door') === DOOR_IMG.R.closed);
            if (doorClosed) {
                playSfx('doorSlam.mp3', 0.8);
                retractFromDoor(role, 'puerta cerrada al irrumpir', 'dining');
                try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'puerta-cerrada' })); } catch (e) { }
                return;
            }
            p.burstUntil = now + BURST_MS;
            p.doorAssault = true;
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: true, burst: BURST_MS })); } catch (e) { }
            log(role.toUpperCase() + ' IRRUMPE hacia la oficina (ventana ' + BURST_MS + 'ms)');
            return;
        }

        // ===== APROXIMACIÓN: desde la esquina hasta el marco =====
        if (now - (p.attackAt || 0) < 10000) {
            // SIEMPRE responder: si no, el botón del cliente queda trabado
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'cooldown', wait: Math.ceil((10000 - (now - (p.attackAt || 0))) / 1000) })); } catch (e) { }
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
        // armado nativo: el juego solo mata con su helper visible (v6.1)
        setHelperVisible(role, true);
        p.attackAt = now;
        p.roomChangedAt = 0;
        p.doorAssault = true;
        p.burstUntil = 0;
        // pista sutil para el guardia: pasos/golpecito en el marco
        playSfx('knock.mp3', 0.3);
        try { entry.conn.send(JSON.stringify({ t: 'atk', ok: true })); } catch (e) { }
        log(role.toUpperCase() + ' se asoma al marco de la puerta ' + (role === 'bonnie' ? 'izquierda' : 'derecha'));
    }

    // ---------------------------------------------------------
    // Habilidades
    // ---------------------------------------------------------
    function retractFromDoor(role, why, dest) {
        const p = state.players[role];
        if (!p) return;
        // dest: 'corner' (retirada voluntaria: vuelve a la esquina) o
        //       'dining' (rebote/castigo: vuelve al comedor como el original)
        const corner = (role === 'bonnie') ? '2B' : '4B';
        const target = (dest === 'corner') ? corner : '1B';
        setHelperVisible(role, false);
        setRS(ACTIVITY_COUNTER[role], ROOM_INDEX[role][target]);
        p.room = target;
        p.roomChangedAt = performance.now();
        p.walkPlayed = null;
        p.doorClosedSince = 0;
        p.retractAt = 0;
        p.doorAssault = false;
        p.burstUntil = 0;
        p.burstDoneAt = 0;
        p.officeKillAt = 0;
        p.killForced = false;
        p.killAt = 0;
                p.killDeadline = 0;
        p.killCycling = false;
        try { p.conn.send(JSON.stringify({ t: 'doorOut', room: target, why: why || '' })); } catch (e) { }
        try { p.conn.send(JSON.stringify({ t: 'moveOk', room: target })); } catch (e) { }
        host.broadcast({ t: 'anim', role, room: target });
        log(role + ' se retira de la puerta → ' + target + ' (' + why + ')');
    }

    function handleAbility(m, entry) {
        const role = entry.role;
        const p = state.players[role];
        if (!p || state.phase !== 'night') return;
        const now = Date.now();

        // Retirada voluntaria de la puerta (sin cooldown): vuelve a la
        // ESQUINA, no al comedor — castigo suave, puede reintentar pronto.
        if (m.kind === 'doorRetreat') {
            if (rs(ACTIVITY_COUNTER[role]) === 7) {
                retractFromDoor(role, 'decisión del jugador', 'corner');
            } else {
                // no estaba en el marco: liberar al cliente por si acaso
                try { entry.conn.send(JSON.stringify({ t: 'doorOut', room: roomOf(role) || '1B', why: 'no-estaba' })); } catch (e) { }
            }
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
        // imagen PREDECODIFICADA + capa propia (will-change) para que el
        // temblor no fuerce repintados del canvas del juego (era "súper
        // trabada"): la animación es 100% GPU.
        const d = overlayDiv('mp-jump',
            '<img src="' + MP_URL + 'assets/jumpscares/' + role + '.png" style="height:105vh;width:100vw;object-fit:cover;will-change:transform;transform:translateZ(0);backface-visibility:hidden;animation:mpshake .09s infinite;">', 1600);
        // scream.mp3 = grito ORIGINAL del juego (0003, 2.25s, alto y seco)
        playSfx('scream.mp3', 0.95);
        setTimeout(() => { d.remove(); showStaticInterference(450); }, 1550);
    }

    function showStaticInterference(ms) {
        const d = overlayDiv('mp-static', '', ms || 3000);
        d.style.background = 'url(resources/background.gif)';
        d.style.backgroundSize = 'cover';
        // SIN mix-blend-mode: encima de un canvas vivo es carísimo y
        // freezaba el juego; con opacidad plana se ve casi igual y vuela.
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
