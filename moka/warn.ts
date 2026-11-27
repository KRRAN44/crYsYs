import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ===== AYUDAS (cada archivo trae las suyas, así ninguno depende de otro) =====

// carpeta raíz del bot (la de crysys.ts), porque este archivo vive en moka/
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// aquí se guardan las advertencias y sus motivos: rcs/ArchiveJson/warns.json
const ARCHIVO = path.join(RAIZ, "rcs", "ArchiveJson", "warns.json");

// al llegar a este número de advertencias, la persona sale del grupo
const MAX_WARNS = 4;

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

// la forma con la que se guarda y se menciona: el número si lo hay
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

// leer y guardar el JSON (si la carpeta no existe, se crea)
const leerJson = (ruta: string): any => (fs.existsSync(ruta) ? JSON.parse(fs.readFileSync(ruta, "utf8")) : {});
function guardarJson(ruta: string, datos: any): void {
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, JSON.stringify(datos, null, 2));
}

// cada advertencia es un texto (su motivo; "" si no tiene). Si el dato viene del formato viejo
// (solo un número), se convierte en advertencias sin motivo
const listaWarns = (valor: any): string[] =>
  Array.isArray(valor) ? valor : Array.from({ length: Number(valor) || 0 }, () => "");

// ===== COMANDO: @warn (alias @w) =====
// uso: @warn @pepe por insultar   (el motivo es todo lo que no es una mención)
// plantilla de los errores: el texto corto del error va en ${errorBreve}
const plantillaError = (errorBreve: string): string => `> _*#𝄞ׄ᧠ᩕ🌺ׄᩛ̸̷ꫂ̶̸̅͢ᤦ ${errorBreve}*_`;

export default {
  name: "warn",
  aliases: ["w"],
  description: `Agrega una advertencia con motivo a uno o varios usuarios; al llegar a ${MAX_WARNS} salen del grupo`,

  async execute(sock: any, msg: any, args: string[], extra: { chat: string }) {
    const chat = extra.chat;
    const decir = (info: string, lineas: string[] = [], mencionados: string[] = []) => {
      const quien = ejecutor(sock, msg); // quien ejecutó: va mencionado en la línea 2
      return sock.sendMessage(chat, { text: respuesta("WARN", quien, info, lineas), mentions: [...new Set([quien, ...mencionados])] });
    };

    const fallo = (texto: string) => sock.sendMessage(chat, { text: plantillaError(texto) });

    if (!chat.endsWith("@g.us")) return fallo("este comando solo funciona en grupos");

    const participants = (await sock.groupMetadata(chat)).participants;

    if (!esAdmin(buscar(participants, ejecutor(sock, msg)))) return fallo("solo administradores pueden usar este comando");

    const objs = objetivos(msg);
    if (objs.length === 0) return fallo("menciona a uno o varios usuarios, o responde a su mensaje");

    // el motivo: las palabras que no son menciones (@...); sin * _ ~ ` para no romper el formato del texto
    const motivo = args.filter((a) => !a.startsWith("@")).join(" ").replace(/[_*~`]/g, "").trim();

    const fueraDelGrupo = objs.filter((j) => !buscar(participants, j)).length;
    const encontrados = unicos(objs.map((j) => buscar(participants, j)).filter(Boolean));

    if (encontrados.length === 0) return fallo("ninguno de los mencionados está en el grupo");

    const datos = leerJson(ARCHIVO);
    datos.warns ??= {};
    datos.warns[chat] ??= {};
    const warns = datos.warns[chat];

    // a cada persona se le agrega una advertencia nueva con el motivo; "nuevo" es cuántas lleva
    const filas = encontrados.map((p) => {
      const lista = [...listaWarns(warns[llave(p)]), motivo];
      return { p, k: llave(p), lista, nuevo: lista.length };
    });

    // a los que no llegan al límite se les guarda ya
    for (const f of filas) {
      if (f.nuevo < MAX_WARNS) warns[f.k] = f.lista;
    }

    const alLimite = filas.filter((f) => f.nuevo >= MAX_WARNS);
    const sacados = new Set<string>();
    let noSePudo = 0;

    if (alLimite.length > 0) {
      if (!botEsAdmin(sock, participants)) {
        // sin ser admin no se puede expulsar: se queda en el límite hasta que el bot tenga permisos
        noSePudo = alLimite.length;
        for (const f of alLimite) warns[f.k] = f.lista.slice(0, MAX_WARNS);
      } else {
        try {
          await sock.groupParticipantsUpdate(chat, alLimite.map((f) => f.p.id), "remove");
          // ya salió del grupo: se borra su historial de advertencias y sus motivos
          for (const f of alLimite) {
            delete warns[f.k];
            sacados.add(f.k);
          }
        } catch (error) {
          console.error("Error al expulsar por warns:", error);
          noSePudo = alLimite.length;
          for (const f of alLimite) warns[f.k] = f.lista.slice(0, MAX_WARNS);
        }
      }
    }

    guardarJson(ARCHIVO, datos);

    // cada mención dice cuántas lleva (o si ya salió)
    const lineas = filas.map((f) =>
      sacados.has(f.k)
        ? linea(f.k, "_(expulsado)_")
        : linea(f.k, `_(${Math.min(f.nuevo, MAX_WARNS)}/${MAX_WARNS})_`)
    );

    let info = `se agregó 1 advertencia a ${u(filas.length)}`;
    if (motivo) info += ` (motivo: ${motivo})`;
    if (sacados.size) info += `, se expulsó a ${sacados.size} por llegar al límite de ${MAX_WARNS}`;
    if (noSePudo) info += `, no pude expulsar a ${noSePudo} (necesito ser admin)`;
    if (fueraDelGrupo) info += `, ${fueraDelGrupo} no están en el grupo`;

    return decir(info, lineas, filas.map((f) => f.k));
  },
};
