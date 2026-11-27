import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ===== AYUDAS (cada archivo trae las suyas, así ninguno depende de otro) =====

// carpeta raíz del bot (la de crysys.ts), porque este archivo vive en moka/
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// aquí se guardan las despedidas de cada grupo: rcs/ArchiveJson/despedidas.json
const ARCHIVO = path.join(RAIZ, "rcs", "ArchiveJson", "despedidas.json");

// número limpio, sin @s.whatsapp.net ni :dispositivo -> "5215512345678"
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

const esAdmin = (p: any): boolean => p?.admin === "admin" || p?.admin === "superadmin";

// el mensaje de error, tal cual decoracion.md (decoración 1); quien ejecutó va mencionado
function respuesta(comando: string, quien: string, info: string): string {
  return `!🐙,, _*${comando}*_    ⿻⃝🩸\n> @${soloNumero(quien)} ⟵    _${info}_   ⟶   𓁼꯭ꪶ`;
}

// el mensaje del switch, tal cual decoracion.md (decoración 3)
const decoracion3 = (comando: string, estado: string): string =>
  `𝄡᜴🕯️꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙰꙲꙲꙲꙲꙲꙱  𒑡 _*${comando} 𝄞 ${estado}*_`;

// leer y guardar el JSON (si la carpeta no existe, se crea)
const leerJson = (ruta: string): any => (fs.existsSync(ruta) ? JSON.parse(fs.readFileSync(ruta, "utf8")) : {});
function guardarJson(ruta: string, datos: any): void {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2));
}

// ===== COMANDO: #despedida (activa / desactiva la despedida) =====
// plantilla de los errores: el texto corto del error va en ${errorBreve}
const plantillaError = (errorBreve: string): string => `> _*#𝄞ׄ᧠ᩕ🌺ׄᩛ̸̷ꫂ̶̸̅͢ᤦ ${errorBreve}*_`;

export default {
  name: "#despedida",
  description: "Activa o desactiva la despedida de este grupo (solo admins)",

  async execute(sock: any, msg: any, args: string[], extra: { chat: string }) {
    const chat = extra.chat;
    const quien = ejecutor(sock, msg);
    const decir = (info: string) =>
      sock.sendMessage(chat, { text: respuesta("DESPEDIDA", quien, info), mentions: [quien] });

    const fallo = (texto: string) => sock.sendMessage(chat, { text: plantillaError(texto) });

    if (!chat.endsWith("@g.us")) return fallo("este comando solo funciona en grupos");

    const participants = (await sock.groupMetadata(chat)).participants;
    if (!esAdmin(buscar(participants, quien))) return fallo("solo administradores pueden usar este comando");

    const datos = leerJson(ARCHIVO);
    const actual = datos.despedidas?.[chat];
    if (!actual) return fallo("no hay una despedida configurada para este grupo");

    actual.enabled = !actual.enabled;
    guardarJson(ARCHIVO, datos);

    const estado = actual.enabled ? "ACTIVADA" : "DESACTIVADA";
    return sock.sendMessage(chat, { text: decoracion3("DESPEDIDA", estado) });
  },
};
