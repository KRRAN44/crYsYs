import makeWASocket, {
  DisconnectReason,
  proto,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import qrcode from 'qrcode-terminal'
import P from 'pino'
import chalk from "chalk"
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Sock = ReturnType<typeof makeWASocket>

// ===== RUTAS =====
// Se calculan a partir de ESTE archivo, así funciona aunque abras la terminal en otra carpeta
const RAIZ = path.dirname(fileURLToPath(import.meta.url));

// carpeta de comandos
const dir = path.join(RAIZ, "moka");

// carpeta donde se guarda la sesión de WhatsApp
const CARPETA_SESION = path.join(RAIZ, "sessions", "CrysysCreditsSessions");

// ===== PREFIJO DE LOS COMANDOS =====
// Un mensaje es un comando si empieza con esto. Ejemplo: @ping
const PREFIX = "@";

const infoOriginal = console.info
console.info = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('Closing session')) return
  infoOriginal(...args)
}

const logger = P({ level: 'silent' })
// ===== CONFIGURA AQUÍ LA ETIQUETA DE LOS MENSAJES =====
const INFO = {
  // Etiqueta "Reenviado"
  reenviado: true,

  // Etiqueta "Reenviado de [canal]"
  canal: {
    activo: true,
    jid: '120363429934608878@newsletter', // ID del canal (termina en @newsletter)
    nombre: `.ฺ 𓏲ּׄ᠂     🍺̶⃝͢             𝑪͢𝑹𖾔̷̸𝒀̸̷𖾔𝑺𖾔𝒀̷̸͢𖾔𝑺`,
  },

  // Vista previa de link (tarjeta con título y descripción)
  enlace: {
    activo: false,
    titulo: 'Título del enlace',
    descripcion: 'Descripción corta',
    url: 'https://chat.whatsapp.com/D0EnTptx4OvG5oJLL5U5tW?s=cl&p=a&iam=2',
  },
}

// Arma la etiqueta según lo que activaste arriba
function armarContexto(): proto.IContextInfo {
  const contexto: proto.IContextInfo = {}

  if (INFO.reenviado || INFO.canal.activo) {
    contexto.isForwarded = true
    contexto.forwardingScore = 67
  }

  if (INFO.canal.activo) {
    contexto.forwardedNewsletterMessageInfo = {
      newsletterJid: INFO.canal.jid,
      newsletterName: INFO.canal.nombre,
      serverMessageId: 1,
    }
  }

  if (INFO.enlace.activo) {
    contexto.externalAdReply = {
      title: INFO.enlace.titulo,
      body: INFO.enlace.descripcion,
      sourceUrl: INFO.enlace.url,
      mediaType: 1,
      renderLargerThumbnail: false,
    }
  }

  return contexto
}

// ===== ETIQUETA EN *TODOS* LOS MENSAJES =====
// Tipos de mensaje que aceptan la etiqueta (texto, fotos, videos, audios, documentos, stickers...)
const TIPOS_CON_ETIQUETA = ["text", "image", "video", "audio", "document", "sticker", "contacts", "location", "poll"]

// Recibe lo que se va a mandar y le agrega la etiqueta (reenviado + canal + enlace, según INFO)
function conEtiqueta(contenido: any): any {
  if (!contenido || typeof contenido !== "object") return contenido

  // reacciones, borrados, ediciones y reenvíos nativos se mandan tal cual
  if ("react" in contenido || "delete" in contenido || "edit" in contenido || "forward" in contenido) return contenido
  if (!TIPOS_CON_ETIQUETA.some((tipo) => tipo in contenido)) return contenido

  const etiqueta = armarContexto()
  if (Object.keys(etiqueta).length === 0) return contenido // todo está apagado en INFO

  // si el comando ya trae su propio contextInfo se respeta y solo se le suma la etiqueta
  return { ...contenido, contextInfo: { ...etiqueta, ...(contenido.contextInfo ?? {}) } }
}

// ===== MEMORIA CORTITA =====
const enviadosPorElBot = new Set<string>() // ids de lo que manda el propio bot
const yaEjecutados = new Set<string>()     // ids de los comandos que ya se ejecutaron

function recordar(lista: Set<string>, id?: string | null) {
  if (!id) return
  lista.add(id)
  // máximo 500 ids guardados: si se pasa, se borra el más viejo
  if (lista.size > 500) lista.delete(lista.values().next().value as string)
}

// Manda un texto del bot. La etiqueta se la pone sock.sendMessage solito (mira connectToWhatsApp)
async function enviarConInfo(sock: Sock, chat: string, texto: string) {
  await sock.sendMessage(chat, { text: texto })
}

// ===== COMANDOS =====
// Cada archivo de la carpeta moka/ exporta un comando así (igual que Ping.ts):
//
//   export default {
//     name: "ping",                // se usa escribiendo @ping
//     aliases: ["p"],              // opcional: otros nombres (puede ser un texto o una lista)
//     async execute(sock: any, msg: any, args: string[], extra: any) {
//       // args  = palabras que van después del comando
//       // extra = { chat, texto, nombre }
//       await sock.sendMessage(msg.key.remoteJid, { text: "hola" }) // sale con la etiqueta solito
//     }
//   }
export const commands = new Map<string, any>();

async function cargarComandos() {
  if (!fs.existsSync(dir)) {
    console.log(chalk.bgGreen.white(`▏🍀 ╴ ║ No existe la carpeta de comandos: ${dir}`));
    return
  }

  for (const file of fs.readdirSync(dir).filter(f => /\.(ts|js)$/.test(f) && !f.endsWith(".d.ts"))) {
    try {
      const cmd = (await import(pathToFileURL(path.join(dir, file)).href)).default;
      if (!cmd?.name) continue;

      commands.set(String(cmd.name).toLowerCase(), cmd);

      // aliases puede ser un texto ("p") o una lista (["p", "pong"])
      const aliases = Array.isArray(cmd.aliases) ? cmd.aliases : cmd.aliases ? [cmd.aliases] : [];
      for (const alias of aliases) commands.set(String(alias).toLowerCase(), cmd);
    } catch (error) {
      // un comando roto no tumba al bot: se avisa y se sigue con los demás
      console.error(`No se pudo cargar el comando ${file}:`, error);
    }
  }

  // se cuentan los comandos, no sus alias
  console.log(chalk.green(`▏🍀 ╴ ║ Comandos Disponibles: ${new Set(commands.values()).size}`));
}

// ===== RECIBIR MENSAJES Y EJECUTAR COMANDOS =====

// Los chats con mensajes temporales o de "ver una vez" meten el mensaje dentro de otro.
// Esto lo saca de su envoltura para poder leer el texto.
function desenvolver(message: any): any {
  let actual = message
  for (let i = 0; i < 5; i++) {
    const interior =
      actual?.ephemeralMessage?.message ||
      actual?.viewOnceMessage?.message ||
      actual?.viewOnceMessageV2?.message ||
      actual?.viewOnceMessageV2Extension?.message ||
      actual?.documentWithCaptionMessage?.message
    if (!interior) break
    actual = interior
  }
  return actual
}

function obtenerTexto(msg: any): string {
  const message = desenvolver(msg.message);

  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    message?.documentMessage?.caption ||
    ""
  ).trim();
}

async function ejecutarComando(sock: Sock, msg: any) {
  try {
    if (!msg.message) return;

    const chat = msg.key.remoteJid;
    if (!chat || chat === "status@broadcast") return;

    // Ya NO se descartan los mensajes fromMe: así el bot obedece los comandos que escribes
    // desde su mismo número. Lo único que se ignora es lo que mandó el propio código del bot
    // (así nunca se contesta a sí mismo en bucle).
    if (msg.key.id && enviadosPorElBot.has(msg.key.id)) return;

    const texto = obtenerTexto(msg);

    if (!texto.startsWith(PREFIX)) return;

    const argumentos = texto.slice(PREFIX.length).trim().split(/\s+/);

    const nombre = argumentos.shift()?.toLowerCase();

    if (!nombre) return;

    const args = argumentos;
    const comando = commands.get(nombre);

    if (!comando) return;

    // si el mismo mensaje llega dos veces, solo se ejecuta una
    if (msg.key.id) {
      if (yaEjecutados.has(msg.key.id)) return;
      recordar(yaEjecutados, msg.key.id);
    }

    console.log(chalk.white(`▏🍀 ╴ ║ Ejecutando ${PREFIX}${nombre}${msg.key.fromMe ? " (desde el número del bot)" : ""}`));

    // Igual que en moka/Ping.ts: execute(sock, msg, args, extra)
    await comando.execute(sock, msg, args, { chat, texto, nombre });

  } catch (error) {
    console.error("Error ejecutando comando:", error);
  }
}

// ===== CONEXIÓN =====
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(CARPETA_SESION)

  const sock = makeWASocket({
    auth: state,
    logger,
  })

  // === ETIQUETA EN TODOS LOS MENSAJES ===
  // Se "envuelve" sock.sendMessage: todo lo que mande el bot (desde aquí o desde cualquier
  // comando de moka/) pasa primero por conEtiqueta() y sale como reenviado + etiqueta del canal.
  const enviarOriginal = sock.sendMessage.bind(sock)
  sock.sendMessage = (async (jid: any, contenido: any, opciones?: any) => {
    const enviado = await enviarOriginal(jid, conEtiqueta(contenido), opciones)
    recordar(enviadosPorElBot, enviado?.key?.id)
    return enviado
  }) as typeof sock.sendMessage

  sock.ev.on('creds.update', saveCreds)

  // === RECIBIR MENSAJES ===
  sock.ev.on('messages.upsert', ({ messages, type }) => {
    // 'notify'  = mensajes nuevos en vivo (incluye los que escribes desde el teléfono del bot)
    // 'append'  = historial y el "eco" de lo que manda el propio código del bot -> se ignoran
    if (type !== 'notify') return

    for (const msg of messages) {
      ejecutarComando(sock, msg) // sin await: un comando lento no frena a los demás
    }
  })

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log(chalk.green(`▏🍀 ╴ ║ Escanea El Codigo QR:`))
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      // log para conexion cerrada
      console.log(chalk.green(`▏🍀 ╴ ╚════╕ Conexion Cerrada!💔.. ¿Esta Intentando Reconectar 🔥?? =`, shouldReconnect))

      // espera 3 segundos antes de reconectar (así no se satura si falla varias veces seguidas)
      if (shouldReconnect) setTimeout(connectToWhatsApp, 3000)
    } else if (connection === 'open') {
      // logs para conexion exitosa
      console.log(chalk.green(`▏🍀 ╴ ╔════╛`))
      console.log(chalk.green(`▏🍀 ╴ ║ CRYSYS CONECTADO EXITOSAMENTE 🥳`))
      console.log(chalk.green(`▏🍀 ╴ ╚══════╕╒═╕╒══╕`))
      // Mensaje de prueba a tu mismo número (bórralo cuando ya no lo necesites)
      const miNumero = sock.user!.id.split(':')[0] + '@s.whatsapp.net'
      enviarConInfo(sock, miNumero, INFO.canal.nombre)
        .catch((error) => console.error('No se pudo mandar el mensaje de prueba:', error))
    }
  })
}

// ===== ARRANQUE =====
await cargarComandos()
connectToWhatsApp()
