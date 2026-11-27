// ===== AYUDAS (cada archivo trae las suyas, así ninguno depende de otro) =====

// número limpio, sin @s.whatsapp.net, @lid ni :dispositivo -> "5215512345678"
const soloNumero = (jid: string = ""): string => jid.split("@")[0].split(":")[0];

// quién mandó el comando (si lo mandó el propio bot, es su número)
function ejecutor(sock: any, msg: any): string {
  if (msg.key.fromMe) return sock.user.id.split(":")[0] + "@s.whatsapp.net";
  const k = msg.key;
  return k.participantAlt || k.participant || k.remoteJidAlt || k.remoteJid;
}

// saca el mensaje de sus envolturas (temporales, ver una vez) y devuelve su contexto
function contextoDe(msg: any): any {
  let m = msg.message;
  for (let i = 0; i < 5; i++) {
    const dentro =
      m?.ephemeralMessage?.message ||
      m?.viewOnceMessage?.message ||
      m?.viewOnceMessageV2?.message ||
      m?.viewOnceMessageV2Extension?.message ||
      m?.documentWithCaptionMessage?.message;
    if (!dentro) break;
    m = dentro;
  }
  return m?.extendedTextMessage?.contextInfo || m?.imageMessage?.contextInfo || m?.videoMessage?.contextInfo || {};
}

// busca un participante del grupo, sea que llegue como @lid o como número
function buscar(participants: any[], jid: string): any {
  const n = soloNumero(jid);
  return participants.find((p) => soloNumero(p.id) === n || (!!p.phoneNumber && soloNumero(p.phoneNumber) === n));
}

// el bot dentro de los participantes del grupo (se compara su número y su LID)
function botEnGrupo(sock: any, participants: any[]): any {
  const yo = [sock.user?.id, sock.user?.lid].filter(Boolean).map((j: string) => soloNumero(j));
  return participants.find((p) => [p.id, p.phoneNumber, p.lid].filter(Boolean).some((j: string) => yo.includes(soloNumero(j))));
}

const esAdmin = (p: any): boolean => p?.admin === "admin" || p?.admin === "superadmin";

// la decoración 3 de decoracion.md (la de los switches): comando + estado
const decoracion3 = (comando: string, estado: string): string =>
  `𝄡᜴🕯️꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙲꙲꙲꙲꙲꙱  𒑡 _*${comando} 𝄞 ${estado}*_`;

// plantilla de los errores: el texto corto del error va en ${errorBreve}
const plantillaError = (errorBreve: string): string => `> _*#𝄞ׄ᧠ᩕ🌺ׄᩛ̸̷ꫂ̶̸̅͢ᤦ ${errorBreve}*_`;

// ===== COMANDO: @delete (alias @dw y @d) =====
// uso: responde al mensaje que quieres borrar y escribe @delete
export default {
  name: "delete",
  aliases: ["dw", "d"],
  description: "Borra el mensaje al que respondiste (solo admins; el bot debe ser admin)",

  async execute(sock: any, msg: any, args: string[], extra: { chat: string }) {
    const chat = extra.chat;
    const fallo = (texto: string) => sock.sendMessage(chat, { text: plantillaError(texto) });

    if (!chat.endsWith("@g.us")) return fallo("este comando solo funciona en grupos");

    const participants = (await sock.groupMetadata(chat)).participants;
    if (!esAdmin(buscar(participants, ejecutor(sock, msg)))) return fallo("solo administradores pueden usar este comando");

    if (!esAdmin(botEnGrupo(sock, participants))) return fallo("el bot necesita ser administrador para borrar mensajes");

    // el mensaje citado: su id y quién lo mandó
    const ctx = contextoDe(msg);
    if (!ctx.stanzaId) return fallo("responde al mensaje que quieres borrar");

    try {
      await sock.sendMessage(chat, {
        delete: {
          remoteJid: chat,
          id: ctx.stanzaId,
          participant: ctx.participant,
          fromMe: soloNumero(ctx.participant || "") === soloNumero(sock.user?.id || ""),
        },
      });
    } catch (error) {
      console.error("Error al borrar mensaje:", error);
      return fallo("no se pudo borrar el mensaje");
    }

    return sock.sendMessage(chat, { text: decoracion3("DELETE", "MENSAJE ELIMINADO") });
  },
};
