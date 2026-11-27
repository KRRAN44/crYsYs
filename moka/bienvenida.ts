import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ===== AYUDAS (cada archivo trae las suyas, así ninguno depende de otro) =====

// carpeta raíz del bot (la de crysys.ts), porque este archivo vive en moka/
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// aquí se guardan las bienvenidas de cada grupo: rcs/ArchiveJson/bienvenida.json
const ARCHIVO = path.join(RAIZ, "rcs", "ArchiveJson", "bienvenida.json");

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

// la decoración 2 de decoracion.md: el texto establecido va dentro del marco (sin @ visible)
function decoracion2(titulo: string, mensaje: string): string {
  return [
    '╭─̳̳̳̳̳̳̳̳̳̳̳̳̳̳̳̳̳̳̳̳̳┄͢╼┅͌͌╾╶ ꨴ🌴🌴̸̷꠹',
    `͢⸺꯭𐨸🐆͢ # _*${titulo}*_`,
    '',
    `> _${mensaje}_`,
    '',
    '*_╼ ꪜഽܢ͌͌͌͌͌͌͌🎎꙰ꫂ ͌͌͌͌͌͌͌͌͌͌͌͌͌͌͌╾_*',
  ].join('\n')
}

// leer y guardar el JSON (si la carpeta no existe, se crea)
const leerJson = (ruta: string): any => (fs.existsSync(ruta) ? JSON.parse(fs.readFileSync(ruta, "utf8")) : {});
function guardarJson(ruta: string, datos: any): void {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2));
}

// ===== COMANDO: @bienvenida =====
// uso: @bienvenida Bienvenido al grupo, lee las reglas
// plantilla de los errores: el texto corto del error va en ${errorBreve}
const plantillaError = (errorBreve: string): string => `> _*#𝄞ׄ᧠ᩕ🌺ׄᩛ̸̷ꫂ̶̸̅͢ᤦ ${errorBreve}*_`;

export default {
  name: "bienvenida",
  description: "Configura el texto de bienvenida de este grupo (solo admins)",

  async execute(sock: any, msg: any, args: string[], extra: { chat: string; texto: string }) {
    const chat = extra.chat;
    const quien = ejecutor(sock, msg);
    const fallo = (texto: string) => sock.sendMessage(chat, { text: plantillaError(texto) });

    if (!chat.endsWith("@g.us")) return fallo("este comando solo funciona en grupos");

    const participants = (await sock.groupMetadata(chat)).participants;
    if (!esAdmin(buscar(participants, quien))) return fallo("solo administradores pueden usar este comando");

    // el texto es todo lo que va después del comando
    const texto = extra.texto.replace(/^\S+\s*/, "").trim();
    if (!texto) return fallo("debes escribir el texto de la bienvenida después del comando");

    const datos = leerJson(ARCHIVO);
    datos.bienvenidas ??= {};
    datos.bienvenidas[chat] = { text: texto, enabled: true };
    guardarJson(ARCHIVO, datos);

    return sock.sendMessage(chat, { text: decoracion2("BIENVENIDA", texto) });
  },
};
