# Five Nights at Freddy's 1 — MULTIJUGADOR

FNAF 1 multijugador basado en el port HTML5 original (Clickteam Fusion).
**El gameplay del guardia es 100% el original**: mecánicas, UI, cámaras, puertas,
energía, noches, jumpscares y muerte — sin ningún cambio. El multijugador se
agrega *por encima* del juego sin reprogramar nada de su lógica interna.

## Cómo funciona

1. Abre la página principal y pulsa **MULTIJUGADOR**
2. **CREAR PARTIDA** → obtienes un código de 5 letras → tú eres el **GUARDIA**
3. Tus amigos entran con **UNIRSE A PARTIDA** → eligen rol:
   **FOXY**, **BONNIE**, **CHICA** o **FREDDY**
4. Los roles sin jugador quedan controlados por la **IA original** del juego
5. El guardia pulsa **EMPEZAR NOCHE** y comienza la partida

## Roles

| Rol | Experiencia | Habilidad especial (Q) | Extra |
|-----|-------------|------------------------|-------|
| **Guardia** | Juego original intacto (cámaras, puertas, luces, energía) | — | Ve jumpscares inofensivos |
| **Foxy** | Primera persona en la Cueva del Pirata; se asoma por cortinas y corre a la oficina | **SPRINT**: avanzas más rápido 5s | Su corrida es el ataque original |
| **Bonnie** | Primera persona, recorre la ruta oeste hasta la puerta izquierda | **INTERFERENCIA**: sabotea las cámaras del guardia 3s | |
| **Chica** | Primera persona, ruta este: baños → cocina → puerta derecha | **RUIDO EN COCINA**: sonidos de cazuelas para despistar | |
| **Freddy** | Primera persona, ruta este como Chica | **RISA SOMBRÍA**: su risa y las luces de la oficina parpadean | Muere por apagón como el original |

Todos los animatrónicos tienen además **[J] JUMPSCARE INOFENSIVO**: muestra al
guardia el jumpscare original del animatrónico (imagen + grito) pero la noche
continúa — es solo para asustar.

## Los animatrónicos (primera persona)

- Ven los **escenarios originales** de la pizzería (las vistas reales del juego)
- En cada puerta aparece **"AVANZAR A ..."** para moverse de escenario
- Ven en su HUD la hora, la energía del guardia y el estado de las puertas
- **⚠ TE ESTÁN VIENDO ⚠** cuando el guardia mira su cámara en tu sala
- Ven la luz de la puerta cuando el guardia la enciende en tu pasillo
- En las esquinas del pasillo pueden **ENTRAR A LA OFICINA**: si la puerta está
  abierta, el juego original ejecuta el ataque (kill real); si la cierras a
  tiempo, el animatrónico se retira — todo con la lógica nativa del juego

## Técnica

- **Peer.js** (WebRTC): el guardia actúa de host y relay en estrella
- El "puente" del guardia lee el estado interno del juego (puertas, energía,
  cámaras, reloj, contadores de animatrónicos) y escribe en los contadores
  internos del propio juego (bonnie activity, fox progress...) para que los
  movimientos de los jugadores usen la lógica original de representación,
  cámaras, retiradas y muerte
- Sin `?mp=` en la URL, el juego del guardia ni siquiera carga el código
  multijugador: modo un jugador 100% intacto
- Assets originales (escenarios, jumpscares, sonidos) extraídos del propio
  juego

## Controles

- Guardia: como el original (mouse). `-=` para pantalla completa
- Animatrónicos: clicks en los botones de avance / `J` jumpscare / `Q` especial

---

NOT OFFICIAL FNAF PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH SCOTT CAWTHON.
Port HTML5 original por irv77 (github.com/irv77/hd_fnaf).
