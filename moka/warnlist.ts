import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ===== AYUDAS (cada archivo trae las suyas, así ninguno depende de otro) =====

// carpeta raíz del bot (la de crysys.ts), porque este archivo vive en moka/
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// aquí se guardan las advertencias y sus motivos: rcs/ArchiveJson/warns.json
const ARCHIVO = path.join(RAIZ, "rcs", "ArchiveJson", "warns.json");

// límite de advertencias (se usa para mostrar "2/4")
const MAX_WARNS = 4;

// número limpio, sin @s.whatsapp.net ni :dispositivo -> "5215512345678"
const soloNumero = (jid: string = ""): string => jid.split("@")[0].split(":")[0];

// quién mandó el comando (si lo mandó el propio bot, es su número)
function ejecutor(sock: any, msg: any): string {
  if (msg.key.fromMe) return sock.user.id.split(":")[0] + "@s.whatsapp.net";
  const k = msg.key;
  return k.participantAlt || k.participant || k.remoteJidAlt || k.remoteJid;
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

// leer el JSON (si no existe, se trata como vacío)
const leerJson = (ruta: string): any => (fs.existsSync(ruta) ? JSON.parse(fs.readFileSync(ruta, "utf8")) : {});

// cada advertencia es un texto (su motivo). Si el dato viene del formato viejo (solo un número),
// se convierte en advertencias sin motivo
const listaWarns = (valor: any): string[] =>
  Array.isArray(valor) ? valor : Array.from({ length: Number(valor) || 0 }, () => "");

// ===== COMANDO: @warnlist =====
// plantilla de los errores: el texto corto del error va en ${errorBreve}
const plantillaError = (errorBreve: string): string => `> _*#𝄞ׄ᧠ᩕ🌺ׄᩛ̸̷ꫂ̶̸̅͢ᤦ ${errorBreve}*_`;

export default {
  name: "warnlist",
  description: "Muestra quién tiene advertencias en este grupo, cuántas lleva y el motivo de cada una",

  async execute(sock: any, msg: any, args: string[], extra: { chat: string }) {
    const chat = extra.chat;
    const decir = (info: string, lineas: string[] = [], mencionados: string[] = []) => {
      const quien = ejecutor(sock, msg); // quien ejecutó: va mencionado en la línea 2
      return sock.sendMessage(chat, { text: respuesta("WARNLIST", quien, info, lineas), mentions: [...new Set([quien, ...mencionados])] });
    };

    const fallo = (texto: string) => sock.sendMessage(chat, { text: plantillaError(texto) });

    if (!chat.endsWith("@g.us")) return fallo("este comando solo funciona en grupos");

    const datos = leerJson(ARCHIVO);
    const warns = datos.warns?.[chat] ?? {};
    const claves: string[] = Object.keys(warns).filter((k) => listaWarns(warns[k]).length > 0);

    if (claves.length === 0) return decir("no hay usuarios con advertencias");

    // cada persona en una línea con cuántas lleva, y debajo la lista de sus motivos
    const lineas = claves.flatMap((k) => {
      const lista = listaWarns(warns[k]);
      return [
        linea(k, `_(${lista.length}/${MAX_WARNS})_`),
        ...lista.map((motivo) => `     ↳ ${motivo || "sin motivo"}`),
      ];
    });

    return decir(`hay ${u(claves.length)} con advertencias`, lineas, claves);
  },
};
