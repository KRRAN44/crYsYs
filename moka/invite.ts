// ===== AYUDAS (cada archivo trae las suyas, así ninguno depende de otro) =====

// número limpio, sin @s.whatsapp.net, @lid ni :dispositivo -> "5215512345678"
const soloNumero = (jid: string = ""): string => jid.split("@")[0].split(":")[0];

// quién mandó el comando (si lo mandó el propio bot, es su número)
function ejecutor(sock: any, msg: any): string {
  if (msg.key.fromMe) return sock.user.id.split(":")[0] + "@s.whatsapp.net";
  const k = msg.key;
  return k.participantAlt || k.participant || k.remoteJidAlt || k.remoteJid;
}

// busca un participante del grupo, sea que llegue como @lid o como número
function buscar(participants: any[], jid: string): any {
  const n = soloNumero(jid);
  return participants.find((p) => soloNumero(p.id) === n || (!!p.phoneNumber && soloNumero(p.phoneNumber) === n));
}

// la decoración 3 de decoracion.md (la de los switches): comando + estado
const decoracion3 = (comando: string, estado: string): string =>
  `𝄡᜴🕯️꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙲꙲꙲꙲꙲꙱  𒑡 _*${comando} 𝄞 ${estado}*_`;

// plantilla de los errores: el texto corto del error va en ${errorBreve}
const plantillaError = (errorBreve: string): string => `> _*#𝄞ׄ᧠ᩕ🌺ׄᩛ̸̷ꫂ̶̸̅͢ᤦ ${errorBreve}*_`;

// ===== COMANDO: @invite <número con código de país> =====
// uso: @invite 523311114444  (manda el enlace del grupo por privado a ese número)
export default {
  name: "invite",
  description: "Manda el enlace del grupo por privado al número que escribas (cualquier miembro)",

  async execute(sock: any, msg: any, args: string[], extra: { chat: string }) {
    const chat = extra.chat;
    const fallo = (texto: string) => sock.sendMessage(chat, { text: plantillaError(texto) });

    if (!chat.endsWith("@g.us")) return fallo("este comando solo funciona en grupos");

    // se quitan espacios, guiones y el +: solo deben quedar los dígitos
    const numero = args.join("").replace(/\D/g, "");
    if (!/^\d{8,15}$/.test(numero)) return fallo("escribe un número con código de país, por ejemplo: @invite 523311114444");

    try {
      const metadata = await sock.groupMetadata(chat);
      const participants = metadata.participants || [];

      // cualquier miembro del grupo puede usarlo; aquí solo sacamos su número real para decir "de parte de ..."
      const quien = ejecutor(sock, msg);
      const deParte = soloNumero(buscar(participants, quien)?.phoneNumber || quien);

      // WhatsApp dice si ese número tiene cuenta; si no, no mandamos nada
      const contactos = await sock.onWhatsApp(numero);
      const contacto = contactos?.find((c: any) => c.exists);
      if (!contacto?.jid) return fallo(`no encontré una cuenta de WhatsApp para el número ${numero}`);

      const codigo = await sock.groupInviteCode(chat).catch((error: any) => {
        console.error("No se pudo obtener el enlace del grupo:", error);
        return null;
      });
      if (!codigo) return fallo("no pude obtener el enlace del grupo, revisa que el bot sea administrador");

      const enlace = `https://chat.whatsapp.com/${codigo}`;

      // la invitación va por privado a esa persona (no es una respuesta del bot, así que va con su texto original)
      await sock.sendMessage(contacto.jid, {
        text: `𝄡᜴🕯️꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙲꙲꙲꙲꙲꙱  𒑡 _*${metadata.subject || "en whatsapp"}*_\n> *wa.me/${deParte} ..te invito al grupo..${metadata.subject || "en whatsapp"}*\n\n> ${enlace}`,
        
      });

      // confirmación en el grupo con la decoración 3
      return sock.sendMessage(chat, { text: decoracion3("INVITE", `ENVIADO A +${numero}`) });
    } catch (error) {
      console.error("Error en invite:", error);
      return fallo("no pude enviar la invitación");
    }
  },
};
