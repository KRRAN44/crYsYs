import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ===== AYUDAS (cada archivo trae las suyas, así ninguno depende de otro) =====

// carpeta raíz del bot (la de crysys.ts), porque este archivo vive en moka/
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// aquí se guardan los silenciados: rcs/ArchiveJson/mutes.json
const ARCHIVO = path.join(RAIZ, "rcs", "ArchiveJson", "mutes.json");

// número limpio, sin @s.whatsapp.net ni :dispositivo -> "5215512345678"
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

// a quién va dirigido: TODAS las menciones; si no mencionaste a nadie, a quien respondiste
function objetivos(msg: any): string[] {
  const ctx = contextoDe(msg);
  const menciones: string[] = ctx.mentionedJid ?? [];
  if (menciones.length > 0) return [...new Set(menciones)];
  return ctx.participant ? [ctx.participant] : [];
}

// busca un participante del grupo, sea que llegue como @lid o como número
function buscar(participants: any[], jid: string): any {
  const n = soloNumero(jid);
  return participants.find((p) => soloNumero(p.id) === n || (!!p.phoneNumber && soloNumero(p.phoneNumber) === n));
}

// quita participantes repetidos (si mencionas y respondes a la misma persona)
const unicos = (lista: any[]): any[] => [...new Map(lista.map((p) => [p.id, p])).values()];

// la forma con la que se menciona: el número si lo hay
const llave = (p: any): string => p.phoneNumber || p.id;

// todas las formas en que WhatsApp puede llamar a una persona (para guardar y buscar sin fallar)
const formas = (p: any): string[] => [p.id, p.phoneNumber].filter(Boolean);

const esAdmin = (p: any): boolean => p?.admin === "admin" || p?.admin === "superadmin";

// "1 usuario" o "2 usuarios"
const u = (n: number): string => `${n} usuario${n === 1 ? "" : "s"}`;

// una línea de mención, tal cual configuracion.md (extra es un texto opcional al final)
const linea = (jid: string, extra: string = ""): string =>
  ` • ᤻᠂ꪶ᪶🎟️ _*@${soloNumero(jid)}*_${extra ? " " + extra : ""}`;

// el mensaje completo, tal cual configuracion.md; quien ejecutó el comando va mencionado en la línea 2
function respuesta(comando: string, quien: string, info: string, lineas: string[] = []): string {
  const cabecera = `!🐙,, _*${comando}*_    ⿻⃝🩸\n> @${soloNumero(quien)} ⟵    _${info}_   ⟶   𓁼꯭ꪶ`;
  return lineas.length ? `${cabecera}\n\n${lineas.join("\n")}` : cabecera;
}

// leer y guardar el JSON (si la carpeta no existe, se crea)
const leerJson = (ruta: string): any => (fs.existsSync(ruta) ? JSON.parse(fs.readFileSync(ruta, "utf8")) : {});
function guardarJson(ruta: string, datos: any): void {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2));
}

// ===== COMANDO: @mute =====
// plantilla de los errores: el texto corto del error va en ${errorBreve}
const plantillaError = (errorBreve: string): string => `> _*#𝄞ׄ᧠ᩕ🌺ׄᩛ̸̷ꫂ̶̸̅͢ᤦ ${errorBreve}*_`;

export default {
  name: "mute",
  description: "Silencia a uno o varios usuarios (menciónalos o responde a su mensaje)",

  async execute(sock: any, msg: any, args: string[], extra: { chat: string }) {
    const chat = extra.chat;
    const decir = (info: string, lineas: string[] = [], mencionados: string[] = []) => {
      const quien = ejecutor(sock, msg); // quien ejecutó: va mencionado en la línea 2
      return sock.sendMessage(chat, { text: respuesta("MUTE", quien, info, lineas), mentions: [...new Set([quien, ...mencionados])] });
    };

    const fallo = (texto: string) => sock.sendMessage(chat, { text: plantillaError(texto) });

    if (!chat.endsWith("@g.us")) return fallo("este comando solo funciona en grupos");

    const participants = (await sock.groupMetadata(chat)).participants;

    if (!esAdmin(buscar(participants, ejecutor(sock, msg)))) return fallo("solo administradores pueden usar este comando");

    const objs = objetivos(msg);
    if (objs.length === 0) return fallo("menciona a uno o varios usuarios, o responde a su mensaje");

    const fueraDelGrupo = objs.filter((j) => !buscar(participants, j)).length;
    const encontrados = unicos(objs.map((j) => buscar(participants, j)).filter(Boolean));

    if (encontrados.length === 0) return fallo("ninguno de los mencionados está en el grupo");

    const datos = leerJson(ARCHIVO);
    datos.mutes ??= {};
    datos.mutes[chat] ??= {};

    // se guardan todas las formas de cada persona, así se reconoce sin importar cómo llegue el mensaje
    for (const p of encontrados) {
      for (const k of formas(p)) datos.mutes[chat][k] = true;
    }
    guardarJson(ARCHIVO, datos);

    let info = `se silenció a ${u(encontrados.length)}`;
    if (fueraDelGrupo) info += `, ${fueraDelGrupo} no están en el grupo`;

    return decir(info, encontrados.map((p) => linea(llave(p))), encontrados.map(llave));
  },
};
