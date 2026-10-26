# 🐻 FNAF 1 MULTIJUGADOR

**Five Nights at Freddy's 1 — Multijugador** · 2 a 5 jugadores · peer-to-peer en el navegador (WebRTC).

Basado en el **port HTML5 del FNAF 1 original** (assets auténticos: cámaras, animatrónicos, sonidos y jumpscares extraídos del juego).

> NOT OFFICIAL FNAF PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH SCOTT CAWTHON.

---

## 🎮 Cómo jugar

1. **Un jugador crea la sala** (`Nueva partida`) → será el **Guardia** y recibe un **código de sala**.
2. Los demás (2-5 jugadores) pulsan `Unirse a partida` e introducen el código.
3. En el lobby, cada jugador elige su animatrónico (o se le asigna uno al empezar): **Bonnie, Chica, Freddy o Foxy**.
4. El anfitrión pulsa `EMPEZAR LA NOCHE` (mínimo 1 guardia + 1 animatrónico).

### 🛡️ Guardia (anfitrión)
- Oficina clásica: **paneles laterales con puertas y luces**, escritorio y **monitor de cámaras** con el mapa del local.
- Energía limitada: puertas, luces y cámaras consumen. Si llega a 0%… la oscuridad.
- Reloj de 12 AM a 6 AM. **Gana si sobrevive hasta las 6:00 AM.**
- Atajos: `ESPACIO` cámaras · `A`/`D` puertas · `Z`/`X` luces (mantener) — o con el ratón/táctil: franja `▲ CÁMARAS ▲` y botones `PUERTA`/`LUZ`.

### 🐻 Animatrónicos (sin mapa)
- Vista inmersiva en primera persona: **ves tu ubicación** y te mueves con **placas de puerta** en los bordes de la pantalla (`IR AL COMEDOR`, `AL PASILLO OESTE`…) a ubicaciones contiguas, con cooldown.
- **Bonnie** → ala oeste (puerta izquierda) · **Chica** → ala este + cocina (puerta derecha) · **Freddy** → lento pero puede usar cualquier lado (su risa lo delata) · **Foxy** → avanza por fases en la Cala Pirata (si el guardia mira la CAM 1C, no avanza) y luego **corre en línea recta** por el pasillo izquierdo.
- **Anti-camping**: en la puerta de la oficina solo puedes quedarte **12 segundos** (cuenta atrás visible). Al agotarse, repliegue forzoso.
- **Habilidad: SUSTO** (se recarga en momentos aleatorios): **jumpscare animado con los frames originales** del juego, inofensivo, que ciega el monitor del guardia 2-3 s.
- **Ganan** si llegan a la puerta de la oficina mientras está **abierta** y ejecutan la **CAPTURA** antes de las 6 AM.

### ⚡ Sin relleno
Solo juegan los animatrónicos con jugador. Si solo están el guardia y Bonnie, nadie más aparece — ni siquiera en el apagón (en la oscuridad ataca únicamente un animatrónico real: Freddy si hay jugador de Freddy, o quien esté en una puerta).

---

## 🌐 Arquitectura de red

```
        [Host = Guardia = autoridad]
        id: fnafm-room-<CÓDIGO>
       /       |        \        \
 Jugador 2   Jugador 3  Jugador 4  Jugador 5   (WebRTC · Peer.js)
```

- **Salas por código**: el host crea una sala PeerJS y comparte el código (5 caracteres).
- **Simulación autoritativa en el host**: reloj, energía, validación de movimientos, capturas y victorias se resuelven en el host y se difunden por snapshots (5 Hz).
- Los clientes envían intenciones (`mover`, `fase`, `carrera`, `susto`, `captura`) y el host las valida.

---

## 🕹️ Tecnologías

HTML + CSS + JS vanilla · Peer.js (WebRTC) · assets del FNAF 1 (port HTML5 de irv77) · sin backend, sin build.

**GitHub Pages:** <https://axcgamestudios2.github.io/fnafm/>
