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
//
// v6 (render nativo):
//   - ELIMINADO todo el sistema de marcadores (applyMarkers/YOU_SPOT):
//     se descubrió que los marcadores del juego (bonnie/chica/freddy
//     bear) son objetos LÓGICOS INVISIBLES — teletransportarlos no
//     renderiza nada y solo peleaba con los eventos internos del juego
//     (bug "sale en dos lados / duplicado").
//   - Las cámaras del juego usan imágenes variantes con los personajes
//     PINTADOS DENTRO (escenario sin Bonnie, cocina con Chica...). El
//     juego las selecciona en las transiciones nativas de cámara
//     ("set viewing to"). El puente ahora pulsa ese contador tras cada
//     movimiento para que la ocupación se re-renderice EN VIVO.
//   - Mapa de contadores de FREDDY corregido (sus valores 0-2 son todos
//     ESCENARIO; su ruta va desplazada +1 respecto a Chica). Su marco de
//     puerta es el valor 8.
//   - Cuenta atrás de movimiento (balanceo) y límite de tiempo en la
//     puerta (anti-camping).
//
// v8 (render 100% nativo — "usa el movimiento real de los animatronicos"):
//   - INGENIERÍA INVERSA COMPLETA del juego original (FNAF1HTML5.cch):
//     se localizó el objeto-imagen de cámara y se verificó CON PÍXELES
//     que el juego renderiza a los animatrónicos EN TODAS las cámaras
//     y EN VIVO (sin transición) con solo escribir los contadores.
//     Los mapas de contadores REALES (verificados uno a uno):
//       bonnie: 0=escenario, 1=comedor, 2=bastidores, 3=pasillo O,
//               4=almacén, 5=esquina O, 6=puerta O, 7=marco, 8=oficina
//       chica:  0=escenario, 1=comedor, 2=baños, 3=cocina, 4=pasillo E,
//               5=esquina E, 6=puerta E, 7=marco, 8=oficina
//       freddy: 0/1/2=escenario, 3=comedor, 4=baños, 5=cocina,
//               6=pasillo E, 7=esquina E, 8=puerta E
//       fox:    0=cortina, 1=asomado, 2=medio fuera,
//               3=¡CARRERA LETAL!, 4=ataque
//   - ELIMINADOS todos los overlays inventados de cámaras y puertas
//     (caras de jumpscare recortadas): ahora el guardia ve EXACTAMENTE
//     lo que el juego original pinta (fotos reales de cada sala con el
//     animatrónico dentro, cara en primer plano en esquinas/almacén,
//     Foxy asomándose en la cueva, cocina solo-audio).
//   - Asomo de Foxy capeado a 2: el valor 3 dispara la CARRERA REAL del
//     juego (mataba al guardia "solo" — verificado en vivo dos veces).
// ============================================================

(function () {
    'use strict';

    const params = new URLSearchParams(window.location.search);
    const ROOM = params.get('mp');
    if (!ROOM) return; // un jugador: no hacer nada

    const BRIDGE_VERSION = 'v8-render-nativo-real';
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
    // ⚠️ Mapa REAL de contadores (ingeniería inversa v8 — verificado
    // píxel a píxel contra el render nativo del juego en TODAS las cámaras):
    //   Bonnie: 0=1A, 1=1B, 2=5(bastidores), 3=2A, 4=3(almacén), 5=2B,
    //           6=puerta O (aún visible en 2B), 7=marco, 8=oficina
    //   Chica:  0=1A, 1=1B, 2=7(baños), 3=6(cocina), 4=4A, 5=4B,
    //           6=puerta E, 7=marco, 8=oficina
    //   Freddy: desplazado +1: 0/1/2=1A, 3=1B, 4=7, 5=6, 6=4A, 7=4B, 8=puerta E
    const ROOM_INDEX = {
        bonnie: { '1A': 0, '1B': 1, '5': 2, '2A': 3, '3': 4, '2B': 5 },
        chica: { '1A': 0, '1B': 1, '7': 2, '6': 3, '4A': 4, '4B': 5 },
        freddy: { '1A': 0, '1B': 3, '7': 4, '6': 5, '4A': 6, '4B': 7 }
    };
    const INDEX_ROOM = {
        bonnie: { 0: '1A', 1: '1B', 2: '5', 3: '2A', 4: '3', 5: '2B', 6: '2B', 7: 'doorL', 8: 'doorIn' },
        chica: { 0: '1A', 1: '1B', 2: '7', 3: '6', 4: '4A', 5: '4B', 6: '4B', 7: 'doorR', 8: 'doorIn' },
        freddy: { 0: '1A', 1: '1A', 2: '1A', 3: '1B', 4: '7', 5: '6', 6: '4A', 7: '4B', 8: 'doorR', 9: 'doorIn' }
    };
    // valor de contador que significa "en el marco de la puerta"
    const DOOR_FRAME = { bonnie: 7, chica: 7, freddy: 8 };
    const DOOR_IMG = { L: { open: 103, closed: 102 }, R: { open: 119, closed: 118 } };

    // Balanceo (v7.2): los animatrónicos cruzaban la pizzería demasiado
    // rápido y podían acampar en la puerta para agotar la energía.
    // Cuenta atrás entre movimientos (ms). Con SPRINT (Foxy) se halva.
    const MOVE_CD = 6000;
    // Máximo de tiempo permitido plantado en el marco de la puerta (ms)
    // — "no deben poder estar mucho tiempo en la puerta, es trampa".
    const DOOR_MAX_MS = 8000;

    // ===== ⚡ DESTELLO DEL GUARDIA (v7.2 — botón antipánico) =====
    // El guardia estaba desbalanceado: los animatrónicos llegan rápido y
    // acampan en la puerta para que se le agote la energía cerrándola.
    // El DESTELLO aturde a TODOS los animatrónicos un rato (no pueden ni
    // moverse ni atacar) y ECHA del marco de la puerta a quien esté
    // acampando (rebote directo al comedor). Cargas: arranca con 2 y se
    // recarga +1 cada hora de la noche (máx. acumuladas). Atajo: [F].
    const STUN_MS = 5000;        // duración del aturdimiento
    const STUN_MAX = 2;          // cargas máximas acumuladas
    const STUN_CD_MS = 12000;    // espera entre destellos

    // ---------------------------------------------------------
    // REFRESCO NATIVO DE CÁMARAS (v6):
    // el juego elige la IMAGEN VARIANTE de cada cámara (con/sin cada
    // animatrónico pintado) en las transiciones de "set viewing to".
    // Al moverse un jugador, si el guardia está mirando una sala
    // afectada, re-pulsamos ese contador para que la ocupación se
    // re-renderice EN VIVO con el motor ORIGINAL del juego.
    // ---------------------------------------------------------
    // estado de la habilidad del guardia
    const stun = { charges: STUN_MAX, cdUntil: 0, lastHour: -1, hintShown: false };

    // ---------------------------------------------------------
    // v8: EL JUEGO RENDERIZA SOLO — no hay overlays de cámaras.
    // Verificado con diffs de píxel en TODAS las cámaras: al escribir
    // un contador de actividad, la cámara que el guardia esté mirando
    // se actualiza EN VIVO con la FOTO ORIGINAL de esa sala con ese
    // animatrónico pintado DENTRO (motor original del juego, sin
    // transición de cámara). El sistema de overlays con capturas de
    // jumpscare (v7.1) fue ELIMINADO por completo.
    // ---------------------------------------------------------

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
            '@keyframes mpstunready{0%,100%{box-shadow:0 0 .6vw rgba(80,150,255,.3)}50%{box-shadow:0 0 1.8vw rgba(80,150,255,.8)}}' +
            '#mp-stun-btn.go{animation:mpstunready 1.6s infinite}#mp-stun-btn:disabled{cursor:default}' +
            '#mp-stun.recharged #mp-stun-btn{animation:mpstunready .35s 5}';
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

    // v8: BLOQUEO DE ESCRITURA DEL GUION. El guion por hora del juego
    // escribe los contadores de actividad CONTINUAMENTE (verificado en
    // vivo: "guion movió a bonnie (3)" cada ~300 ms). Revertirlo con el
    // bucle de autoridad hacía OSCILAR el contador y el render de las
    // cámaras parpadeaba (a veces mostraba la sala vacía un fotograma).
    // Solución: mientras un rol tiene JUGADOR, se instala un accessor
    // en la propiedad rsValue del contador que IGNORA las escrituras
    // del guion dentro del rango de salas (el jugador es la autoridad)
    // y solo deja pasar las de la cadena de puerta/kill del juego
    // (valores >= marco) y las del propio puente (bridgeWriting).
    let bridgeWriting = false;
    function setRS(name, val) {
        const o = find(name);
        if (o && typeof o.rsValue === 'number') {
            bridgeWriting = true;
            try { o.rsValue = val; } finally { bridgeWriting = false; }
            return true;
        }
        return false;
    }

    const protectedCounters = {};
    function protectCounter(role) {
        const name = (role === 'foxy') ? 'fox progress' : ACTIVITY_COUNTER[role];
        if (!name) return;
        const o = find(name);
        if (!o || o.__mpLock) return;
        const frame = (role === 'foxy') ? 4 : DOOR_FRAME[role];   // foxy: 4 = ataque
        let v = o.rsValue;
        Object.defineProperty(o, 'rsValue', {
            configurable: true,
            enumerable: true,
            get: function () { return v; },
            set: function (nv) {
                if (bridgeWriting || nv === v || nv >= frame || (role === 'foxy' && v >= 4)) {
                    v = nv;
                    return;
                }
                // escritura del guion dentro del mapa: IGNORADA — el
                // jugador manda y el render de las cámaras queda estable
            }
        });
        o.__mpLock = true;
        protectedCounters[role] = o;
        log('contador de ' + role + ' protegido contra el guion');
    }
    function unprotectCounter(role) {
        const o = protectedCounters[role];
        if (!o) return;
        delete protectedCounters[role];
        try {
            const v = o.rsValue;
            delete o.rsValue;      // quita el accessor
            o.rsValue = v;         // restaura la propiedad simple
            o.__mpLock = false;
        } catch (e) { }
    }
    function unprotectAll() {
        Object.keys(protectedCounters).forEach(unprotectCounter);
    }

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

    // HOVER sintético (v6.5): el juego original BAJA el monitor al pasar el
    // ratón por la pestaña inferior — el runtime escucha pointermove ahí.
    // Bajar el monitor por el pipeline REAL de input es lo que dispara el
    // kill nativo con fiabilidad (E2E: subir clic + hover pestaña → kill).
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

    // ARMADO NATIVO DEL HELPER DE ATAQUE (v6.1): el juego ejecuta su cadena
    // de muerte al bajar el monitor si el helper 'ready to attack left/right'
    // está VISIBLE. El asalto de la IA propia lo activa; los writes externos
    // no. Se arma al asomarse al marco y se desarma al retirarse/salir.
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
    // v8: VISTA DE PUERTA CON LUZ eliminada (overlay inventado).
    // Verificado en vivo contra el juego original: con la luz
    // encendida y Bonnie en el marco (contador 7), el juego pinta el
    // vano ILUMINADO VACÍO — este port no tiene arte de "animatrónico
    // en el vano". Las pistas del guardia son las ORIGINALES: la cara
    // de Bonnie en la CAM 2B/4B (nativa), el golpecito de puerta
    // (sfx) y el monitor. El hook de luces se conserva solo para
    // informar el estado lightL/lightR a los clientes.
    // ---------------------------------------------------------

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

    // Forzar el kill: el juego mata al guardia con la TRANSICIÓN real
    // "monitor baja" (hover en la pestaña inferior, pipeline de input del
    // juego) con un animatrónico en el marco + helper armado. Se mezcla
    // el hover REAL (v6.5, verificadísimo E2E) con la escritura directa
    // del contador como respaldo, y se repite hasta que el kill llega.
    function forceMonitorCycle() {
        let n = 0;
        (function cycle() {
            const a = app();
            if (!a || a.currentFrame !== 2 || n++ >= 8) return;  // murió o límite
            const v = rs('viewing');
            if (v === 0 || v == null) {
                setRS('viewing', 1);                 // subir (write: no dispara kill)
                setTimeout(cycle, 1600);
            } else {
                gameHover(640, 700);                 // BAJAR por el pipeline REAL
                setRS('viewing', 0);                 // respaldo: asegurar el valor
                setTimeout(cycle, 2400);
            }
        })();
    }

    // RESPALDO DETERMINISTA (v6.5): si pasados DEADLINE_MS el juego no ha
    // ejecutado el kill por su cuenta (ciclos de monitor / apagón), se
    // salta directo al frame de muerte — verificado: nextFrame=3 +
    // startTheFrame() → jumpscare + game over. Nunca se queda colgado.
    const KILL_DEADLINE_MS = 25000;
    function killFallback() {
        const a = app();
        if (!a || a.currentFrame !== 2) return false;
        try { a.nextFrame = 3; a.startTheFrame(); } catch (e) { return false; }
        log('kill de RESPALDO: salto directo al frame de muerte');
        return true;
    }
    // ---------------------------------------------------------
    // KILL NATIVO DE FREDDY (v6): su cadena de muerte en FNAF1 es el
    // APAGÓN — al quedarse sin energía, la oficina queda a oscuras,
    // suena la marcha del Toreador y Freddy acabó con el guardia.
    // Verificado en vivo: escribir power=0 dispara la secuencia
    // ORIGINAL del juego (frame 4 = jumpscare de Freddy, death by=freddy).
    // ---------------------------------------------------------
    function triggerPowerOut() {
        setRS('power left', 0);
        setRS('power left 2', 0);
        setRS('power down', 1);
        log('APAGÓN — la secuencia ORIGINAL de Freddy está en marcha');
    }

    function watchDoorAssaults() {
        const now = Date.now();
        Object.keys(state.players).forEach(role => {
            const p = state.players[role];
            if (!p || !p.doorAssault) return;
            const idx = rs(ACTIVITY_COUNTER[role]);
            const frame = DOOR_FRAME[role];          // 7 (bonnie/chica) | 8 (freddy)
            const office = frame + 1;                // "dentro de la oficina" del juego
            const atDoor = (idx === frame);
            if (role !== 'freddy' && idx === office) {
                // "dentro de la oficina" SOLO cuenta si el JUGADOR irrumpió
                // (burst/kill en curso). Si fue el guion del juego el que lo
                // coló, el bucle de autoridad lo devuelve al marco (v7.2) y NO
                // hay kill — el kill es SIEMPRE decisión del jugador.
                if ((p.burstDoneAt || p.burstUntil || p.killForced) && !p.officeKillAt) {
                    p.officeKillAt = now;
                    if (!p.killForced) {
                        // el juego lo metió a mitad de la irrupción: asegurar el
                        // kill original (ciclo de monitor + respaldo de deadline)
                        p.killForced = true;
                        p.killDeadline = now + KILL_DEADLINE_MS;
                        forceMonitorCycle();
                    }
                    host && host.broadcast({ t: 'anim', role, room: 'doorIn' });
                    log(role.toUpperCase() + ' ENTRÓ a la oficina — kill original en camino');
                }
            } else if (idx != null && idx < frame) {
                // el juego/retirada lo sacó de la puerta
                p.doorAssault = false;
                p.burstUntil = 0;
                p.burstDoneAt = 0;
                p.officeKillAt = 0;
                p.killForced = false;
                p.doorSince = 0;
                p.killDeadline = 0;
                setHelperVisible(role, false);
                // aceptar UNA VEZ la retirada del juego (guardia cerró la
                // puerta y el juego original lo echó) y avisar al cliente
                const back = roomFromIndex(role, idx);
                if (back && p.room !== back) {
                    p.room = back;
                    p.roomChangedAt = performance.now();
                    try { p.conn.send(JSON.stringify({ t: 'moveOk', room: back })); } catch (e) { }
                    host.broadcast({ t: 'anim', role, room: back });
                }
            } else if (atDoor && p.burstUntil) {
                // irrupción en curso del jugador: resolver al terminar
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
                    p.doorSince = 0;
                    log(role.toUpperCase() + ' irrumpió con la puerta abierta — kill en camino');
                }
            } else if (atDoor && p.burstDoneAt && !p.killForced) {
                // margen de gracia para que el guardia cierre la puerta
                if (now - p.burstDoneAt < 1500) return;
                const stillClosed = (role === 'bonnie')
                    ? (img('left door') === DOOR_IMG.L.closed)
                    : (img('right door') === DOOR_IMG.R.closed);
                if (stillClosed) {
                    // se salvó justo: no matar — la retracción lo devuelve
                    p.burstDoneAt = 0;
                    setHelperVisible(role, false);
                    return;
                }
                p.killForced = true;
                p.officeKillAt = now;
                p.killDeadline = now + (role === 'freddy' ? 45000 : KILL_DEADLINE_MS);
                if (role === 'freddy') {
                    // Freddy NO tiene kill por contadores: su muerte canónica
                    // es el APAGÓN (secuencia original del juego, ~15-25s de
                    // oscuridad + Toreador + jumpscare de Freddy).
                    triggerPowerOut();
                    log('Freddy cortó la luz — apagón letal en camino');
                } else {
                    forceMonitorCycle();
                    log('ciclo de monitor forzado — el juego ejecuta el kill original');
                }
            } else if (atDoor && !p.burstUntil && !p.burstDoneAt) {
                // en el marco sin irrumpir aún: mantener el helper armado
                // (el juego tiende a re-ocultarlo con sus propios eventos)
                setHelperVisible(role, true);
                // LÍMITE DE TIEMPO EN LA PUERTA (anti-camping): si se queda
                // plantado en el marco sin irrumpir, el host lo retira a la
                // esquina. "No deben poder estar mucho tiempo en la puerta".
                if (!p.doorSince) {
                    p.doorSince = now;
                } else if (now - p.doorSince > DOOR_MAX_MS) {
                    p.doorSince = 0;
                    setHelperVisible(role, false);
                    retractFromDoor(role, 'tiempo agotado en la puerta', 'corner');
                    log(role.toUpperCase() + ' retirado de la puerta por tiempo (anti-camping)');
                }
            }
            // RESPALDO del kill: deadline agotado sin muerte → salto directo
            // al frame de muerte (nunca dejar al guardia vivo por bug).
            if (p.killForced && p.killDeadline && now >= p.killDeadline) {
                p.killDeadline = 0;
                if (killFallback()) {
                    p.officeKillAt = p.officeKillAt || now;
                }
            }
        });
    }

    // ---------------------------------------------------------
    // ⚡ HABILIDAD DEL GUARDIA: DESTELLO (v7.2, balanceo)
    // ---------------------------------------------------------
    function playZap() {
        // zumbido eléctrico sintetizado (WebAudio): no depende de assets
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
    }

    function buildStunButton() {
        const d = document.createElement('div');
        d.id = 'mp-stun';
        d.style.cssText = 'position:fixed;left:1.4vw;bottom:2vh;z-index:99998;font-family:monospace;display:none;';
        d.innerHTML =
            '<button id="mp-stun-btn" title="DESTELLO [F]: aturde a TODOS los animatrónicos 5s y echa del marco de la puerta a quien acampe (vuelve al comedor). Se recarga 1 carga cada hora de la noche (máx ' + STUN_MAX + ')." ' +
            'style="display:flex;align-items:center;gap:0.55vw;background:rgba(8,12,24,0.9);border:0.16vw solid #6db4ff;color:#bfe0ff;font-size:1vw;padding:0.8vh 1vw;letter-spacing:0.07vw;text-shadow:0 0 0.5vw rgba(109,180,255,0.5);">' +
            '<span style="font-size:1.45vw;line-height:1;">⚡</span><span>DESTELLO</span>' +
            '<span id="mp-stun-n" style="color:#fff;background:rgba(109,180,255,0.25);padding:0.15vh 0.5vw;border:0.08vw solid rgba(109,180,255,0.6);">x' + STUN_MAX + '</span>' +
            '</button>' +
            '<div id="mp-stun-cd" style="font-size:0.72vw;color:#8fb8e8;margin-top:0.4vh;letter-spacing:0.05vw;"></div>';
        document.body.appendChild(d);
        document.getElementById('mp-stun-btn').addEventListener('click', doGuardStun);
        // primer uso de la sesión: explicar la habilidad
        if (!stun.hintShown) {
            const h = document.createElement('div');
            h.style.cssText = 'font-size:0.72vw;color:#7aa8d8;margin-top:0.4vh;max-width:16vw;line-height:1.5;';
            h.textContent = 'Aturde a todos los animatrónicos 5s y echa a quien acampe en tu puerta. +1 carga cada hora.';
            d.appendChild(h);
        }
    }

    function updateStunUI(s) {
        const d = document.getElementById('mp-stun');
        if (!d) return;
        const atNight = state.phase === 'night' && app() && app().currentFrame === 2;
        d.style.display = atNight ? 'block' : 'none';
        if (!atNight) return;
        const btn = document.getElementById('mp-stun-btn');
        const cdEl = document.getElementById('mp-stun-cd');
        const cd = Math.max(0, stun.cdUntil - Date.now());
        const ready = stun.charges > 0 && cd <= 0;
        btn.disabled = !ready;
        btn.classList.toggle('go', ready);
        document.getElementById('mp-stun-n').textContent = 'x' + stun.charges;
        if (cdEl) cdEl.textContent = ready
            ? 'LISTO — clic o [F]'
            : (stun.charges <= 0 ? 'sin cargas — +1 cada hora' : 'recargando ' + Math.ceil(cd / 1000) + 's');
    }

    function tickStunRecharge(s) {
        // +1 carga por cada hora de la noche (12→1→2→3→4→5 AM)
        if (state.phase !== 'night' || !s || s.minute == null) return;
        const hour = Math.floor(s.minute / 60);
        if (stun.lastHour < 0) { stun.lastHour = hour; return; }
        if (hour > stun.lastHour) {
            stun.lastHour = hour;
            if (stun.charges < STUN_MAX) {
                stun.charges++;
                log('⚡ DESTELLO recargado (hora ' + hour + ') — cargas: ' + stun.charges);
                const n = document.getElementById('mp-stun');
                if (n) { n.classList.add('recharged'); setTimeout(() => n.classList.remove('recharged'), 2000); }
            }
        }
    }

    function doGuardStun() {
        if (state.phase !== 'night' || !app() || app().currentFrame !== 2) return;
        const now = Date.now();
        if (stun.charges <= 0) { log('⚡ DESTELLO sin cargas'); return; }
        if (now < stun.cdUntil) { log('⚡ DESTELLO recargando'); return; }
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
            if (role === 'foxy') return;   // Foxy no tiene marco de puerta
            const idx = rs(ACTIVITY_COUNTER[role]);
            if (idx == null) return;
            const killing = p.killForced || p.officeKillAt;   // cadena de kill ya en marcha: no interrumpirla
            if (!killing && idx === DOOR_FRAME[role]) {
                // acampando/irrumpiendo en el marco: el destello lo ECHA al comedor
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
                roomChangedAt: 0, doorSince: 0, foxPeek: 0
            };
            // conexión a mitad de noche: blindar su contador contra el guion
            if (state.phase === 'night' && app() && app().currentFrame === 2) {
                protectCounter(role);
                freezeAI(role);
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
                setHelperVisible(entry.role, false);   // evitar el kill fantasma
                unprotectCounter(entry.role);          // el guion vuelve a mandar
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
            tickStunRecharge(s);
            updateStunUI(s);
            if (state.phase === 'night') {
                watchDoorAssaults();
            }
        }, 100);

        // -----------------------------------------------------
        // AUTORIDAD DEL JUGADOR (300 ms):
        // el juego demo mueve a los animatrónicos por GUION en cada cambio
        // de hora — aunque su IA esté en 0 (verificado en vivo: Chica
        // 0→1 a la 1AM con todos los AI=0). Sin esto, el guion teletransporta
        // a los JUGADORES cada hora. Aquí el jugador manda: si el guion (o
        // cualquier evento del juego) mueve el contador de un rol con
        // jugador, se revierte a su sala real y se re-renderiza la cámara.
        // Los roles SIN jugador conservan la IA/guion originales.
        // -----------------------------------------------------
        setInterval(() => {
            if (state.phase !== 'night' || !app() || app().currentFrame !== 2) return;
            Object.keys(state.players).forEach(role => {
                const p = state.players[role];
                if (role === 'foxy') {
                    // Foxy: el progreso de cortina lo decide el jugador
                    const fp = rs('fox progress');
                    if (fp == null || fp >= 4) return;   // carrera/ataque: lógica del juego
                    if (fp !== p.foxPeek) {
                        setRS('fox progress', p.foxPeek);
                        log('guion movió a Foxy (' + fp + ') — revertido (' + p.foxPeek + ')');
                    }
                    return;
                }
                // Cadena de kill DEL JUGADOR en curso (irrupción/burst/kill):
                // ahí manda la cadena original y no se toca nada. El simple
                // asomo (doorAssault sin burst) SÍ se protege contra el guion.
                if (p.burstUntil || p.burstDoneAt || p.killForced || p.officeKillAt) return;
                const idx = rs(ACTIVITY_COUNTER[role]);
                if (idx == null || p.room == null) return;
                // v7.2: ESTADOS DE PUERTA con autoridad del jugador. Descubierto
                // en vivo: el guion del juego CUELÁ al jugador DENTRO de la
                // oficina (7→8→9) tras unos segundos con la puerta abierta, sin
                // que pulse IRRUMPIR — y con la IA congelada la cadena de kill
                // del juego se queda COLGADA (guardia vivo, animatrónico en el
                // limbo). El kill SOLO puede llegar por decisión del jugador.
                if (idx >= DOOR_FRAME[role]) {
                    if (p.doorAssault) {
                        // asomado en el marco por decisión propia: el guion puede
                        // rebobinarlo a su sala o colarlo dentro; solo lo segundo
                        // es ilegal — lo devolvemos al marco con el helper armado.
                        if (idx > DOOR_FRAME[role]) {
                            setRS(ACTIVITY_COUNTER[role], DOOR_FRAME[role]);
                            setHelperVisible(role, true);
                            log('guion metió a ' + role + ' (' + idx + ') — revertido al marco (autoridad del jugador)');
                        }
                    } else {
                        // ni siquiera se asomó: teletransporte del guion a la
                        // puerta → devolver a su sala real
                        const back = ROOM_INDEX[role][p.room];
                        if (back != null) {
                            setRS(ACTIVITY_COUNTER[role], back);
                            log('guion teletransportó a ' + role + ' a la puerta — revertido a ' + p.room);
                        }
                    }
                    return;
                }
                const expected = ROOM_INDEX[role][p.room];
                if (expected == null || idx === expected) return;
                setRS(ACTIVITY_COUNTER[role], expected);
                log('guion movió a ' + role + ' (' + idx + ') — revertido a ' + p.room + ' (' + expected + ')');
            });
        }, 300);

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
                if (idx !== DOOR_FRAME[role]) { p.doorClosedSince = 0; p.retractAt = 0; return; }
                const doorClosed = (role === 'bonnie')
                    ? (img('left door') === DOOR_IMG.L.closed)
                    : (img('right door') === DOOR_IMG.R.closed);
                if (!doorClosed) { p.doorClosedSince = 0; p.retractAt = 0; return; }
                if (!p.doorClosedSince) {
                    // BALANCEO v7.2: se cansa antes con la puerta cerrada (5-7s)
                    // — menos energía gastada por el guardia por cada acampe.
                    p.doorClosedSince = now;
                    p.retractAt = now + 5000 + Math.floor(Math.random() * 2000);
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
            // v8: blindar los contadores de los jugadores contra el guion
            // por hora DEL JUEGO (escribe sin parar; antes oscilaba el
            // contador y parpadeaba el render de las cámaras). Se hace con
            // un pequeño retraso para no pisar el reset de inicio de noche.
            unprotectAll();
            setTimeout(() => {
                if (state.phase === 'night' && app() && app().currentFrame === 2) {
                    Object.keys(state.players).forEach(protectCounter);
                }
            }, 1200);
            // ⚡ reset de la habilidad del guardia para la nueva noche
            stun.charges = STUN_MAX;
            stun.cdUntil = 0;
            stun.lastHour = -1;
            Object.keys(state.players).forEach(role => { state.players[role].stunUntil = 0; });
            // posiciones iniciales reales desde el juego
            Object.keys(state.players).forEach(role => {
                const p = state.players[role];
                // ojo: al cambiar de frame los contadores aún no existen
                // (rs() devuelve null) → conservar la posición de arranque
                const fromCounter = roomFromIndex(role, rs(ACTIVITY_COUNTER[role]));
                p.room = (role === 'foxy') ? '1C' : (fromCounter || '1A');
                p.roomChangedAt = 0;
                p.attackAt = 0;
                p.doorClosedSince = 0;
                p.retractAt = 0;
                p.doorAssault = false;
                p.burstUntil = 0;
                p.burstDoneAt = 0;
                p.officeKillAt = 0;
                p.killForced = false;
                p.doorSince = 0;
                p.killDeadline = 0;
                p.foxPeek = 0;
            });
            host && host.broadcast({ t: 'phase', p: 'night', night: state.night });
            log('Noche ' + state.night + ' iniciada');
            hideOverlay();
        }
        if (prev === 2 && KNOWN_FRAMES[f] === undefined) {
            state.phase = 'death';
            state.lastDeathBy = detectKiller();
            unprotectAll();       // el reset de la próxima noche debe poder escribir
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
            unprotectAll();       // liberar contadores para la próxima noche
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
        for (const r of ['bonnie', 'chica', 'freddy']) if (pos[r] != null && pos[r] >= DOOR_FRAME[r]) return r;
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
        // ⚡ DESTELLO: aturdido → no puede moverse
        if (now < (p.stunUntil || 0)) {
            try { entry.conn.send(JSON.stringify({ t: 'moveBad', why: 'aturdido', wait: Math.ceil((p.stunUntil - now) / 1000) })); } catch (e) { }
            return;
        }
        // BALANCEO (v6): cuenta atrás real entre movimientos — antes eran
        // 450ms y podían cruzar la pizzería en segundos ("avanzan rapidísimo").
        // El cliente muestra la cuenta atrás en los botones; con SPRINT se halva.
        const cd = p.sprintUntil && now < p.sprintUntil ? MOVE_CD / 2 : MOVE_CD;
        if (now - p.lastMove < cd) {
            try { entry.conn.send(JSON.stringify({ t: 'moveBad', why: 'demasiado-rapido', wait: Math.ceil((cd - (now - p.lastMove)) / 1000) })); } catch (e) { }
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
            try { entry.conn.send(JSON.stringify({ t: 'moveOk', room })); } catch (e) { }
            host.broadcast({ t: 'anim', role, room, from: current });
            // risa original de Freddy al moverse (canon FNAF1)
            if (role === 'freddy') playSfx('freddy_laugh.mp3', 0.4);
            log(role + ' → ' + room);
        }
    }

    function handleFoxyMove(p, entry, now) {
        // Foxy: el progreso de cortina lo decide el JUGADOR (p.foxPeek): el guion
        // por hora del juego demo también escribe 'fox progress' y no debe
        // colarse aquí (el bucle de autoridad lo revierte).
        // v8: el asomo se capea a 2 — ¡el valor 3 dispara la CARRERA REAL
        // del juego y mataba al guardia "solo" (verificado 2 veces)!
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
        // Foxy asomándose es visible en la CAM 1C (render nativo en vivo)
        try { entry.conn.send(JSON.stringify({ t: 'moveOk', room: '1C', progress: next })); } catch (e) { }
    }

    function handleAttack(m, entry) {
        const role = entry.role;
        const p = state.players[role];
        if (!p || state.phase !== 'night') return;
        const now = Date.now();
        // ⚡ DESTELLO: aturdido → no puede atacar
        if (now < (p.stunUntil || 0)) {
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'aturdido', wait: Math.ceil((p.stunUntil - now) / 1000) })); } catch (e) { }
            return;
        }

        if (role === 'foxy') {
            if (now - (p.attackAt || 0) < 12000) {
                try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'cooldown' })); } catch (e) { }
                return;
            }
            const cur = (p.foxPeek != null) ? p.foxPeek : rs('fox progress');
            if (cur == null || cur < 1) {
                try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'asomate-primero' })); } catch (e) { }
                return;
            }
            setRS('fox progress', 4);
            p.attackAt = now;
            p.foxPeek = 0;   // la carrera consume el asomo
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: true })); } catch (e) { }
            log('FOXY corre por el pasillo oeste');
            return;
        }

        // ===== FREDDY: se cuela DESDE LA ESQUINA (sin marco de puerta) =====
        // Canon FNAF1: Freddy no se asoma a la puerta — si la puerta derecha
        // está ABIERTA, cruza y se mete en la oficina; su kill es el APAGÓN
        // (secuencia original del juego). Si está cerrada, rebota al comedor.
        if (role === 'freddy') {
            if (now - (p.attackAt || 0) < 10000) {
                try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'cooldown', wait: Math.ceil((10000 - (now - (p.attackAt || 0))) / 1000) })); } catch (e) { }
                return;
            }
            if (roomOf(role) !== '4B') {
                try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'lejos' })); } catch (e) { }
                return;
            }
            const doorRClosed = (img('right door') === DOOR_IMG.R.closed);
            if (doorRClosed) {
                try { entry.conn.send(JSON.stringify({ t: 'atk', ok: false, why: 'puerta-cerrada' })); } catch (e) { }
                log('FREDDY rebotó: puerta derecha cerrada');
                return;
            }
            setRS(ACTIVITY_COUNTER[role], 8);   // "dentro de la oficina"
            p.attackAt = now;
            p.doorAssault = true;
            p.burstUntil = now + BURST_MS;
            p.doorSince = 0;
            playSfx('knock.mp3', 0.3);
            try { entry.conn.send(JSON.stringify({ t: 'atk', ok: true, burst: BURST_MS })); } catch (e) { }
            log('FREDDY se cuela en la oficina por la puerta derecha');
            return;
        }

        const atFrame = rs(ACTIVITY_COUNTER[role]) === DOOR_FRAME[role];

        // ===== ATAQUE DESDE EL MARCO DE LA PUERTA (irrupción) =====
        // El jugador ya se asomó (marco) y decide irrumpir. El guardia
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
        setRS(ACTIVITY_COUNTER[role], DOOR_FRAME[role]);
        p.attackAt = now;
        p.roomChangedAt = 0;
        p.doorAssault = true;
        p.burstUntil = 0;
        p.doorSince = 0;
        p.killDeadline = 0;
        setHelperVisible(role, true);      // armar el helper nativo del kill
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
        setRS(ACTIVITY_COUNTER[role], ROOM_INDEX[role][target]);
        p.room = target;
        p.roomChangedAt = performance.now();
        p.doorClosedSince = 0;
        p.retractAt = 0;
        p.doorAssault = false;
        p.burstUntil = 0;
        p.burstDoneAt = 0;
        p.officeKillAt = 0;
        p.killForced = false;
        p.doorSince = 0;
        p.killDeadline = 0;
        setHelperVisible(role, false);     // desarmar el helper (fix kill fantasma)
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
            if (rs(ACTIVITY_COUNTER[role]) === DOOR_FRAME[role]) {
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
            p.foxPeek = 0;
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
        buildStunButton();
        window.addEventListener('keydown', (e) => {
            if (e.key === 'f' || e.key === 'F') doGuardStun();
        });
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
