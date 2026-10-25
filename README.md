# 🐻 FNAF 1 MULTIJUGADOR

**Five Nights at Freddy's 1 — Multijugador** · 2 a 5 jugadores · peer-to-peer en el navegador (WebRTC).

Basado en el **port HTML5 del FNAF 1 original** (assets auténticos: cámaras, animatrónicos, sonidos y jumpscares extraídos del juego).

> NOT OFFICIAL FNAF PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH SCOTT CAWTHON.

---

## 🎮 Cómo jugar

1. **Un jugador crea la sala** (botón `🛡️ CREAR SALA`) → será el **Guardia** y recibe un **código de sala**.
2. Los demás (2-5 jugadores) pulsan `🐻 UNIRSE A UNA SALA` e introducen el código.
3. En el lobby, cada jugador elige su animatrónico (o se le asigna uno al empezar): **Bonnie, Chica, Freddy o Foxy**.
4. El anfitrión pulsa `🌙 EMPEZAR LA NOCHE` (mínimo 1 guardia + 1 animatrónico).

### 🛡️ Guardia (anfitrión)
- Vista en primera persona de la oficina: **puertas laterales, luces de pasillo y monitor de cámaras** desplegable.
- Energía limitada: puertas, luces y cámaras consumen. Si llega a 0%… la oscuridad.
- Reloj de 12 AM a 6 AM. **Gana si sobrevive hasta las 6:00 AM.**
- Atajos: `ESPACIO` cámaras · `A`/`D` puertas · `Z`/`X` luces (mantener).

### 🐻 Animatrónicos
- **Vista inmersiva en primera persona, SIN mapa**: ves lo que ve tu personaje y te mueves por las **PUERTAS del borde de la pantalla** — placas que dicen `▼ IR AL PASILLO OESTE`, `▶ IR A LA COCINA`, `▲ IR AL ESCENARIO`… (solo destinos contiguos, con cooldown por movimiento).
- **Bonnie** → ala oeste (puerta izquierda) · **Chica** → ala este + cocina (puerta derecha) · **Freddy** → lento pero puede usar cualquier lado (su risa lo delata) · **Foxy** → avanza por fases en la Cala Pirata (si el guardia mira la CAM 1C, no avanza) y luego **corre en línea recta** por el pasillo izquierdo.
- **⏱ No se puede acampar en la puerta**: al llegar a la puerta de la oficina empieza una cuenta atrás visible (12 s). Si se agota, el **repliegue es FORZOSO** (vuelves a la esquina del pasillo — o a la Cala Pirata si eres Foxy — con cooldown de castigo). Desde la esquina ves si la puerta está abierta o cerrada.
- **Habilidad: SUSTO** (se recarga en momentos aleatorios de la noche): jumpscare inofensivo que bloquea el monitor del guardia 2-3 s.
- **Ganan** si llegan a la puerta de la oficina mientras está **abierta** y ejecutan la **CAPTURA** antes de las 6 AM.

---

## 🌐 Arquitectura de red

```
        [Host = Guardia = autoridad]
        id: fnafm-room-<CÓDIGO>
       /       |        \        \
 Jugador 2   Jugador 3  Jugador 4  Jugador 5   (WebRTC · Peer.js)
```

- **Peer.js** (WebRTC data channels), topología en estrella: todo el tráfico pasa por el host, que ejecuta la simulación autoritativa (10 Hz) y difunde snapshots (5 Hz).
- Señalización vía broker público de PeerJS — **no se necesita servidor propio**. Hosting 100% estático (GitHub Pages).

## 📦 Contenido

```
index.html        · pantalla/menú/lobby/oficina/fin
css/style.css     · estética VHS/CRT oscura
js/config.js      · mapa, adyacencias, personajes, imágenes
js/net.js         · capa Peer.js (salas, protocolo de mensajes)
js/game.js        · simulación del host (energía, reloj, validaciones)
js/guard.js       · oficina del guardia (puertas/luces/monitor) — intacta
js/anim.js        · vista inmersiva del animatrónico (POV + puertas + temporizador)
js/fx.js           · jumpscare, estática, mapa SVG compartido
js/audio.js       · sonidos auténticos del FNAF 1
resources/        · 105 imágenes + 19 sonidos del juego original
peer.min.js       · PeerJS 1.5.4 (vendorizada)
```

## 🚀 Ejecutar en local

Cualquier servidor estático, p. ej.:

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

Abre la página en 2-5 navegadores/pestañas (o dispositivos en la misma red o por Internet) y juega.

## 🧰 Créditos

- Assets del juego: port HTML5 del **FNAF 1** de [irv77/hd_fnaf](https://github.com/irv77/hd_fnaf) (extraídos y reorganizados).
- FNAF es creación de **Scott Cawthon**.
- Multijugador: **Peer.js** (MIT).
