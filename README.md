# Five Nights at Freddy's 1 — MULTIJUGADOR

FNAF 1 multijugador basado en el port HTML5 original (Clickteam Fusion).
**El gameplay del guardia es 100% el original**: mecánicas, UI, cámaras, puertas,
energía, noches, jumpscares y muerte — sin ningún cambio. El multijugador se
agrega *por encima* del juego sin reprogramar nada de su lógica interna: el
movimiento de los jugadores usa el **sistema REAL del juego** (marcadores
invisibles sobre anclajes de sala), así que el juego pinta las **fotos
originales de cada sala EN VIVO** en las cámaras del guardia.

## Cómo funciona

1. Abre la página principal e **inicia sesión con tu cuenta axc** (gratuita,
   sirve en todas las páginas de axcStudios; tu usuario pasa a ser tu nombre
   de jugador)
2. Pulsa **MULTIJUGADOR** → **CREAR PARTIDA** → obtienes un código de 5 letras
   para invitar a tus amigos
3. Tus amigos entran con **UNIRSE A PARTIDA** → eligen rol:
   **FOXY**, **BONNIE**, **CHICA** o **FREDDY**
4. Los roles sin jugador quedan controlados por la **IA original** del juego
5. El **GUARDIA se sortea al azar** entre todos al pulsar **EMPEZAR** y
   comienza la partida

## Roles

| Rol | Experiencia | Habilidad especial (Q) | Extra |
|-----|-------------|------------------------|-------|
| **Guardia** | Juego original intacto (cámaras, puertas, luces, energía) + **ARSENAL** que crece cada noche | ver [El arsenal del guardia](#el-arsenal-del-guardia) | Ve jumpscares inofensivos |
| **Foxy** | Primera persona en la Cueva del Pirata; se asoma por cortinas y corre a la oficina | **SPRINT**: avanzas más rápido 5s | **No puede asomarse ni correr mientras el guardia lo mire en la CAM 1C** (canon del juego original). Si ya salió sin ser visto, verlo en los pasillos no lo frena |
| **Bonnie** | Primera persona, recorre la ruta oeste hasta la puerta izquierda | **INTERFERENCIA**: sabotea las cámaras del guardia 3s | |
| **Chica** | Primera persona, ruta este: baños → cocina → puerta derecha | **RUIDO EN COCINA**: sonidos de cazuelas para despistar | |
| **Freddy** | Primera persona, ruta este… **oeste** — va por LOS DOS LADOS | **RISA SOMBRÍA**: su risa y las luces de la oficina parpadean | En el lado oeste deja una SEÑAL DE PRESENCIA; muere por apagón como el original |

Todos los animatrónicos tienen además **[J] JUMPSCARE INOFENSIVO**: muestra al
guardia el jumpscare original del animatrónico (imagen + grito) pero la noche
continúa — es solo para asustar.

## El arsenal del guardia

Una habilidad **nueva cada noche** — la noche 5 las tienes todas:

| Noche | Habilidad | Atajo | Efecto |
|-------|-----------|-------|--------|
| **N1** | ⚡ **DESTELLO** | `F` | Aturde a TODOS los animatrónicos 5s y **echa del marco de la puerta a los acampadores** (rebote directo al comedor). 2 cargas, +1 por hora, recarga 12s |
| **N2** | 🔋 **CÉLULA** | `E` | +25% de energía real (1 por noche) |
| **N3** | 📡 **ESCÁNER** | `R` | Revela la posición de todos los animatrónicos 10s (2 cargas) |
| **N4** | ☕ **CAFÉ** | `T` | El reloj corre **x3** durante 12s (acorta la noche) |
| **N5** | 🔫 **PISTOLA** | `ESPACIO` | 3 balas: cuando un animatrónico irrumpa (o Foxy arranque la carrera) tienes una **ventana de 2s** para disparar — el impacto lo manda de vuelta al escenario con sus sistemas reiniciados 45s |

El destello no interrumpe cadenas de kill ya en marcha (si un animatrónico ya
irrumpió, solo la pistola o la puerta te salvan). Cerrar la puerta dentro de la
ventana de la pistola también cuenta como salvación.

### Balanceo

- Animatrónicos: **6s por sala** en noche 1, acelerando hasta **3s** en noches
  avanzadas, con tirada de **PASO RÁPIDO** (8%/noche) que acorta el siguiente
  movimiento (Foxy mantiene su sprint de 3s)
- Anti-camping: **8s** máximo en el marco de la puerta
- Puerta cerrada: el animatrónico se retira en **5-7s**
- El kill del animatrónico es **100% decisión del jugador**: el guion interno
  del juego no puede colar a nadie dentro de la oficina sin pulsar
  ENTRAR Y ATACAR

## Los animatrónicos (primera persona)

- Ven los **escenarios originales** de la pizzería (las vistas reales del juego)
- En cada puerta aparece **"AVANZAR A ..."** para moverse de escenario
- Ven en su HUD la hora, la energía del guardia y el estado de las puertas
- **⚠ TE ESTÁN VIENDO ⚠** cuando el guardia mira su cámara en tu sala
- Ven la luz de la puerta cuando el guardia la enciende en tu pasillo
- En las esquinas del pasillo pueden **ENTRAR A LA OFICINA**: si la puerta está
  abierta, el juego original ejecuta el ataque (kill real); si la cierras a
  tiempo, el animatrónico se retira — todo con la lógica nativa del juego

## Cuentas axc (SSO)

Una sola cuenta gratuita para todas las páginas de axcStudios:

- **Chip de cuenta** arriba a la derecha (iniciar sesión / avatar + cerrar sesión)
- La sesión dura **30 días** y se restaura entre páginas del mismo sitio
- Sin sesión, el launcher y el lobby abren el modal liquid-glass de axc
  (login/registro) y **la acción que pulsaste continúa sola** al autenticarte
- En multijugador **tu usuario es tu nombre de jugador** (sin prompts manuales)
- **Degradación suave (fail-open)**: si el CDN de axc o el servidor de cuentas
  no responden, se juega igual con un aviso

## Técnica

- **Peer.js** (WebRTC): el guardia actúa de host y relay en estrella
- El "puente" del guardia lee el estado interno del juego (puertas, energía,
  cámaras, reloj, contadores de animatrónicos) y teleporta los **marcadores
  invisibles** del juego original sobre los anclajes de sala (ingeniería
  inversa del `Application.ccj`), congelando los niveles de IA de los roles
  con jugador: cero peleas con el guion interno
- **Vigilante de conexión de 12s** en todo el sistema de red (lobby y juego):
  los cuelgues silenciosos de PeerJS se entierran y se reintenta limpio hasta
  15 veces con contador y motivo en pantalla; la sala del anfitrión se
  re-registra sola si el broker corta el socket
- Sin `?mp=` en la URL, el juego del guardia ni siquiera carga el código
  multijugador: modo un jugador 100% intacto
- Assets originales (escenarios, jumpscares, sonidos) extraídos del propio
  juego

## Controles

- Guardia: como el original (mouse). `-=` pantalla completa · arsenal:
  `F` destello · `E` célula · `R` escáner · `T` café · `ESPACIO` pistola
- Animatrónicos: clicks en los botones de avance / `J` jumpscare / `Q` especial

---

NOT OFFICIAL FNAF PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH SCOTT CAWTHON.
Port HTML5 original por irv77 (github.com/irv77/hd_fnaf).
