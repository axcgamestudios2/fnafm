/* ============================================================
   FNAF 1 MULTIJUGADOR — LOBBY
   Crear/unirse a sala, código de sala, lista de jugadores,
   selección de animatrónicos y comienzo de la noche.
   ============================================================ */
"use strict";

const Lobby = {
  music: null,

  show() {
    UI.show("s-lobby");
    document.getElementById("lobby-title").textContent =
      Net.isHost ? "SALA CREADA" : "CONECTADO";
    Lobby.renderCharPicker();
    Lobby.refreshCharStates();
  },

  /* ---- HOST ---- */
  hostFlow() {
    const code = Net.randCode();
    Lobby.show(); // pantalla visible durante la conexión (se re-render al abrir)
    document.getElementById("room-code").textContent = "·····";
    setStatus("Creando sala vía PeerJS…");
    Net.hostRoom(code, (okCode) => {
      Lobby.show(); // re-render con isHost ya activo (título + nota de guardia)
      document.getElementById("room-code").textContent = okCode;
      Game.addPlayer(1, App.myName + " (tú)");
      Game.players[1].char = null;
      setStatus("Sala lista. Comparte el código: <b>" + okCode + "</b>");
      Lobby.renderPlayers();
      App.checkStart();
    }, (err) => {
      setStatus(err, true);
    });
  },

  /* ---- CLIENTE ---- */
  joinFlow(code) {
    Lobby.show();
    document.getElementById("room-code").textContent = code.toUpperCase();
    setStatus("Conectando con el host…");
    Net.joinRoom(code, App.myName, () => {
      setStatus("Conectado. Esperando al anfitrión…");
    }, (err) => {
      setStatus(err, true);
      App.backToMenu(err);
    });
  },

  /* ---- Render de la lista de jugadores + tarjetas ---- */
  renderPlayers() {
    const list = document.getElementById("lobby-players");
    list.innerHTML = "";
    const mine = Net.isHost ? 1 : Net.myId;
    for (const pid in Game.players) {
      const p = Game.players[pid];
      const row = document.createElement("div");
      row.className = "player-row" + (+pid === mine ? " me" : "") + (p.connected ? "" : " off");
      // tarjeta: nombre + rol
      const roleTxt = (+pid === 1)
        ? "GUARDIA (anfitrión)"
        : (p.char ? CHARS[p.char].name + " — " + CHARS[p.char].fullName : "… eligiendo animatrónico");
      row.innerHTML =
        '<div class="pr-name">' + esc(p.name) + (p.connected ? "" : " (desconectado)") + "</div>" +
        '<div class="pr-role">' + roleTxt + "</div>";
      list.appendChild(row);
    }
    // contador
    document.getElementById("lobby-count").textContent =
      Object.keys(Game.players).filter(p => Game.players[p].connected).length + "/" + CFG.MAX_PLAYERS;
    // ¿puede empezar? (host)
    App.checkStart();
  },

  /* ---- Tarjetas de personaje (solo clientes) ---- */
  renderCharPicker() {
    const wrap = document.getElementById("char-picker");
    wrap.innerHTML = "";
    if (Net.isHost) {
      wrap.innerHTML = '<div class="host-note">Tú eres el <b>GUARDIA</b>.<br>ESPACIO abre las cámaras · A/D cierran puertas · Z/X encienden luces (mantener).<br>También puedes usar la franja de CÁMARAS y los botones PUERTA/LUZ de la pantalla.<br>Los demás eligen animatrónico (o se les asigna uno al empezar): cada uno tiene una habilidad única y un SUSTO inofensivo EXTRA que cegará tu monitor un instante.</div>';
      return;
    }
    for (const chId of CHAR_ORDER) {
      const c = CHARS[chId];
      const card = document.createElement("button");
      card.className = "char-card";
      card.dataset.char = chId;
      card.innerHTML =
        '<img src="' + IMG(c.portrait) + '" alt="' + c.name + '">' +
        '<div class="cc-name" style="color:' + c.color + '">' + c.name + "</div>" +
        '<div class="cc-desc">' + c.desc + "</div>";
      card.onclick = () => {
        AudioMan.play("click", 0.5);
        Net.toHost({ t: "pick", char: chId });
      };
      wrap.appendChild(card);
    }
    Lobby.refreshCharStates();
  },

  /* Marca ocupados/selección propia */
  refreshCharStates() {
    const myChar = Game.players[Net.isHost ? 1 : Net.myId] ? Game.players[Net.isHost ? 1 : Net.myId].char : null;
    document.querySelectorAll(".char-card").forEach(card => {
      const chId = card.dataset.char;
      const takenBy = Object.values(Game.players).find(p => p.char === chId && p.connected);
      const isMine = myChar === chId;
      card.classList.toggle("taken", !!takenBy && !isMine);
      card.classList.toggle("mine", isMine);
      const tag = card.querySelector(".cc-state");
      if (tag) tag.remove();
      if (isMine) card.insertAdjacentHTML("beforeend", '<div class="cc-state mine">ELEGIDO</div>');
      else if (takenBy) card.insertAdjacentHTML("beforeend", '<div class="cc-state">OCUPADO (' + esc(takenBy.name) + ")</div>");
    });
  },
};

function setStatus(html, isErr) {
  const el = document.getElementById("lobby-status");
  el.innerHTML = html || "";
  el.classList.toggle("err", !!isErr);
}
function esc(s) {
  return String(s || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
