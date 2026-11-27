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

// carpeta de los JSON de moderación (mutes.json, warns.json)
const CARPETA_JSON = path.join(RAIZ, "rcs", "ArchiveJson");

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

// ===== SILENCIADOS =====
// ¿la persona que mandó el mensaje está silenciada en este grupo? (la guarda el comando @mute)
function estaSilenciado(chat: string, msg: any): boolean {
  if (!chat.endsWith("@g.us")) return false;

  const ruta = path.join(CARPETA_JSON, "mutes.json");
  if (!fs.existsSync(ruta)) return false;

  try {
    const silenciados = JSON.parse(fs.readFileSync(ruta, "utf8")).mutes?.[chat];
    if (!silenciados) return false;

    // el mensaje puede llegar con su número o con su @lid: se revisan las dos formas
    const k = msg.key;
    return [k.participant, k.participantAlt, k.remoteJidAlt].some((j) => j && silenciados[j]);
  } catch (error) {
    console.error("No se pudo leer mutes.json:", error);
    return false;
  }
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

    // === SILENCIADOS ===
    // si quien mandó el mensaje está silenciado en este grupo, el mensaje se borra y no se ejecuta nada
    if (!msg.key.fromMe && estaSilenciado(chat, msg)) {
      await sock.sendMessage(chat, { delete: msg.key })
        .catch((error) => console.error("No se pudo borrar el mensaje de un silenciado:", error));
      return;
    }

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

// ===== BIENVENIDAS Y DESPEDIDAS =====
// Textos guardados por @bienvenida, @bienvenida2 y @despedida (en rcs/ArchiveJson/)
const ARCHIVO_BIENVENIDA = path.join(CARPETA_JSON, "bienvenida.json")
const ARCHIVO_DESPEDIDA = path.join(CARPETA_JSON, "despedidas.json")

// número limpio, sin @s.whatsapp.net, @lid ni :dispositivo
const soloNumero = (jid: string): string => jid.split('@')[0].split(':')[0]

// todas las formas en que WhatsApp puede nombrar a la persona: su LID (id) y su número real
// (en grupos nuevos el id es @lid; el número llega en phoneNumber). Si llega como texto, va tal cual.
function formasDe(p: any): string[] {
  if (typeof p === 'string') return [p]
  return [p.id, p.phoneNumber, p.lid].filter((j): j is string => typeof j === 'string' && j.length > 0)
}

// si esa sección (bienvenidas, bienvenidas2 o despedidas) está activa para el grupo, manda SOLO el texto, sin decoración
async function mandarSiActiva(sock: Sock, grupo: string, ruta: string, seccion: string, jids: string[]) {
  if (!fs.existsSync(ruta)) return

  const actual = JSON.parse(fs.readFileSync(ruta, 'utf8'))[seccion]?.[grupo]
  if (!actual?.enabled || !actual?.text) return

  // la persona va en "mentions" y en contextInfo.mentionedJid (le llega la notificación), pero en el texto no sale ningún @
  await sock.sendMessage(grupo, {
    text: actual.text,
    mentions: jids,
    contextInfo: { mentionedJid: jids },
  })
}

// ===== AUTOBORRADO (los mensajes que el bot manda a un grupo se borran solos después de una hora) =====
// la lista de pendientes se guarda en rcs/ArchiveJson/autoborrado.json, así no se pierde si el bot se reinicia
const ARCHIVO_AUTOBORRADO = path.join(CARPETA_JSON, 'autoborrado.json')
// PRUEBA: 10 segundos y revisa cada 5. Para dejarlo en 1 hora: 60 * 60 * 1000 y revisa cada 30 * 1000
const TIEMPO_AUTOBORRADO = 30 * 30 * 1000
const CADA_CUANTO_REVISA = 30 * 1000

type PendienteBorrar = { jid: string; key: any; borrarEn: number }
let pendientesBorrar: PendienteBorrar[] = leerAutoborrado()
let sockActual: Sock | undefined // el socket con el que se borra (se actualiza al conectar)

function leerAutoborrado(): PendienteBorrar[] {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO_AUTOBORRADO, 'utf8'))
  } catch {
    return [] // si no existe o está dañado, se empieza sin pendientes
  }
}

function guardarAutoborrado() {
  try {
    fs.mkdirSync(CARPETA_JSON, { recursive: true })
    fs.writeFileSync(ARCHIVO_AUTOBORRADO, JSON.stringify(pendientesBorrar, null, 2))
  } catch (error) {
    console.error('No se pudo guardar el autoborrado:', error)
  }
}

// apunta un mensaje del bot para borrarlo dentro de una hora
function programarBorrado(jid: string, key: any) {
  pendientesBorrar.push({ jid, key, borrarEn: Date.now() + TIEMPO_AUTOBORRADO })
  guardarAutoborrado()
}

// cada 30 segundos: borra los mensajes que ya cumplieron su hora
async function revisarAutoborrado() {
  if (!sockActual || pendientesBorrar.length === 0) return

  const ahora = Date.now()
  const vencidos = pendientesBorrar.filter((p) => p.borrarEn <= ahora)
  if (vencidos.length === 0) return

  pendientesBorrar = pendientesBorrar.filter((p) => p.borrarEn > ahora)
  guardarAutoborrado()

  for (const p of vencidos) {
    await sockActual.sendMessage(p.jid, { delete: p.key })
      .catch((error) => console.error('No se pudo borrar un mensaje del bot:', error))
  }
}
// unref: este reloj no debe mantener vivo el proceso por sí solo
setInterval(revisarAutoborrado, CADA_CUANTO_REVISA).unref()

// ===== CONEXIÓN =====
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(CARPETA_SESION)

  const sock = makeWASocket({
    auth: state,
    logger,
  })
  sockActual = sock

  // === ETIQUETA EN TODOS LOS MENSAJES ===
  // Se "envuelve" sock.sendMessage: todo lo que mande el bot (desde aquí o desde cualquier
  // comando de moka/) pasa primero por conEtiqueta() y sale como reenviado + etiqueta del canal.
  const enviarOriginal = sock.sendMessage.bind(sock)
  sock.sendMessage = (async (jid: any, contenido: any, opciones?: any) => {
    const enviado = await enviarOriginal(jid, conEtiqueta(contenido), opciones)
    recordar(enviadosPorElBot, enviado?.key?.id)

    // autoborrado: un texto, foto, audio, etc. que el bot manda a un grupo se borra solo a la hora
    if (String(jid).endsWith('@g.us') && enviado?.key && TIPOS_CON_ETIQUETA.some((tipo) => tipo in contenido)) {
      programarBorrado(jid, enviado.key)
    }
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

  // === ALTAS Y SALIDAS DEL GRUPO ===
  // al entrar alguien: bienvenida (y la segunda); al salir: despedida
  sock.ev.on('group-participants.update', async ({ id: grupo, participants, action }) => {
    try {
      // el propio bot no cuenta (se compara su número y su LID)
      const yo = [sock.user?.id, (sock.user as any)?.lid].filter(Boolean).map((j: string) => soloNumero(j))
      const nuevos = (participants as any[]).filter((p) => !formasDe(p).some((j) => yo.includes(soloNumero(j))))

      // a cada persona se le menciona con todas sus formas (LID y número), sin repetir
      const jids: string[] = [...new Set(nuevos.flatMap(formasDe))]
      if (jids.length === 0) return

      if (action === 'add') {
        await mandarSiActiva(sock, grupo, ARCHIVO_BIENVENIDA, 'bienvenidas', jids)
        await mandarSiActiva(sock, grupo, ARCHIVO_BIENVENIDA, 'bienvenidas2', jids)
      } else if (action === 'remove') {
        await mandarSiActiva(sock, grupo, ARCHIVO_DESPEDIDA, 'despedidas', jids)
      }
    } catch (error) {
      console.error('No se pudo mandar la bienvenida o la despedida:', error)
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
