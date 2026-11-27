import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ===== AYUDAS (cada archivo trae las suyas, así ninguno depende de otro) =====

// carpeta raíz del bot (la de crysys.ts), porque este archivo vive en moka/
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

const esAdmin = (p: any): boolean => p?.admin === "admin" || p?.admin === "superadmin";

function botEsAdmin(sock: any, participants: any[]): boolean {
  return esAdmin(buscar(participants, sock.user.id));
}

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

// ===== COMANDO: @promote (alias @daradmin) =====
// plantilla de los errores: el texto corto del error va en ${errorBreve}
const plantillaError = (errorBreve: string): string => `> _*#𝄞ׄ᧠ᩕ🌺ׄᩛ̸̷ꫂ̶̸̅͢ᤦ ${errorBreve}*_`;

export default {
  name: "promote",
  aliases: ["daradmin"],
  description: "Asciende a admin a uno o varios usuarios (menciónalos o responde a su mensaje)",

  async execute(sock: any, msg: any, args: string[], extra: { chat: string }) {
    const chat = extra.chat;
    const decir = (info: string, lineas: string[] = [], mencionados: string[] = []) => {
      const quien = ejecutor(sock, msg); // quien ejecutó: va mencionado en la línea 2
      return sock.sendMessage(chat, { text: respuesta("PROMOTE", quien, info, lineas), mentions: [...new Set([quien, ...mencionados])] });
    };

    const fallo = (texto: string) => sock.sendMessage(chat, { text: plantillaError(texto) });

    if (!chat.endsWith("@g.us")) return fallo("este comando solo funciona en grupos");

    const participants = (await sock.groupMetadata(chat)).participants;

    if (!esAdmin(buscar(participants, ejecutor(sock, msg)))) return fallo("solo administradores pueden usar este comando");
    if (!botEsAdmin(sock, participants)) return fallo("el bot no es administrador");

    const objs = objetivos(msg);
    if (objs.length === 0) return fallo("menciona a uno o varios usuarios, o responde a su mensaje");

    const fueraDelGrupo = objs.filter((j) => !buscar(participants, j)).length;
    const encontrados = unicos(objs.map((j) => buscar(participants, j)).filter(Boolean));
    const yaEran = encontrados.filter(esAdmin).length;
    const aPromover = encontrados.filter((p) => !esAdmin(p));

    if (aPromover.length === 0) return fallo("ninguno de los mencionados necesita ascenso, ya son admin");

    try {
      await sock.groupParticipantsUpdate(chat, aPromover.map((p) => p.id), "promote");
    } catch (error) {
      console.error("Error en promote:", error);
      return fallo("error al ascender a los usuarios");
    }

    let info = `se ascendió a admin a ${u(aPromover.length)}`;
    if (yaEran) info += `, ${yaEran} ya eran admin`;
    if (fueraDelGrupo) info += `, ${fueraDelGrupo} no están en el grupo`;

    return decir(info, aPromover.map((p) => linea(llave(p))), aPromover.map(llave));
  },
};
