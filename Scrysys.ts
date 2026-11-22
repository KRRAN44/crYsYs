import makeWASocket, {
  DisconnectReason,
  type proto,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import qrcode from 'qrcode-terminal'
import P from 'pino'
import chalk from 'chalk'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.dirname(fileURLToPath(import.meta.url))
const COMMANDS_DIR = path.join(ROOT, 'moka')
const SESSION_DIR = path.join(ROOT, 'sessions', 'CrysysCreditsSessions')
const PREFIX = '@'

// Ajusta aquí las etiquetas que acompañan los mensajes enviados por el bot.
const INFO = {
  reenviado: true,
  canal: {
    activo: true,
    jid: '120363429934608878@newsletter',
    nombre: '.ฺ 𓏲ּׄ᠂     🍺̶⃝͢             𝑪͢𝑹𖾔̷̸𝒀̸̷𖾔𝑺𖾔𝒀̷̸͢𖾔𝑺',
  },
  enlace: {
    activo: false,
    titulo: 'Título del enlace',
    descripcion: 'Descripción corta',
    url: 'https://chat.whatsapp.com/D0EnTptx4OvG5oJLL5U5tW?s=cl&p=a&iam=2',
  },
}

type CommandContext = {
  sock: ReturnType<typeof makeWASocket>
  msg: proto.IWebMessageInfo
  chat: string
  args: string[]
  texto: string
  nombre: string
}

type BotCommand = {
  name: string
  aliases?: string[] | string
  description?: string
  execute: (context: CommandContext) => Promise<unknown> | unknown
}

const logger = P({ level: 'silent' })
const commands = new Map<string, BotCommand>()

function armarContexto(): proto.IContextInfo {
  const contexto: proto.IContextInfo = {}

  if (INFO.reenviado || INFO.canal.activo) {
    contexto.isForwarded = true
    contexto.forwardingScore = 40
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

async function enviarConInfo(
  sock: ReturnType<typeof makeWASocket>,
  chat: string,
  texto: string,
) {
  const contexto = armarContexto()
  await sock.sendMessage(chat, {
    text: texto,
    contextInfo: Object.keys(contexto).length ? contexto : undefined,
  })
}

async function cargarComandos() {
  if (!fs.existsSync(COMMANDS_DIR)) {
    fs.mkdirSync(COMMANDS_DIR, { recursive: true })
  }

  const files = fs.readdirSync(COMMANDS_DIR)
    .filter((file) => /\.(ts|js|mjs)$/.test(file) && !file.endsWith('.d.ts'))
    .sort()

  for (const file of files) {
    try {
      const modulePath = pathToFileURL(path.join(COMMANDS_DIR, file)).href
      const imported = await import(modulePath)
      const command = imported.default as BotCommand | undefined

      if (!command?.name || typeof command.execute !== 'function') {
        console.warn(chalk.yellow(`⚠️ ${file}: falta export default con name y execute().`))
        continue
      }

      const names = [command.name, ...(Array.isArray(command.aliases)
        ? command.aliases
        : command.aliases ? [command.aliases] : [])]

      for (const name of names) {
        const key = name.trim().toLowerCase()
        if (key) commands.set(key, command)
      }

      console.log(chalk.green(`✓ Comando cargado: ${command.name}`))
    } catch (error) {
      console.error(chalk.red(`✗ No se pudo cargar ${file}:`), error)
    }
  }

  console.log(chalk.bgGreen.black(` ${new Set(commands.values()).size} comandos cargados `))
}

function obtenerTexto(msg: proto.IWebMessageInfo): string {
  const message = msg.message
  if (!message) return ''

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    ''
  ).trim()
}

async function ejecutarComando(
  sock: ReturnType<typeof makeWASocket>,
  msg: proto.IWebMessageInfo,
) {
  if (!msg.message || msg.key.fromMe) return

  const chat = msg.key.remoteJid
  if (!chat || chat === 'status@broadcast') return

  const texto = obtenerTexto(msg)
  if (!texto.startsWith(PREFIX)) return

  const partes = texto.slice(PREFIX.length).trim().split(/\s+/)
  const nombre = partes.shift()?.toLowerCase()
  if (!nombre) return

  const comando = commands.get(nombre)
  if (!comando) return

  try {
    await comando.execute({ sock, msg, chat, args: partes, texto, nombre })
  } catch (error) {
    console.error(chalk.red(`Error en el comando ${nombre}:`), error)
    await sock.sendMessage(chat, { text: '❌ Ocurrió un error al ejecutar ese comando.' })
  }
}

let reconnecting = false

async function connectToWhatsApp(): Promise<void> {
  fs.mkdirSync(SESSION_DIR, { recursive: true })
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR)

  const sock = makeWASocket({ auth: state, logger })
  sock.ev.on('creds.update', saveCreds)

  // ESTE EVENTO ES EL QUE RECIBE LOS MENSAJES Y DISPARA LOS COMANDOS.
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return
    for (const msg of messages) await ejecutarComando(sock, msg)
  })

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log(chalk.bgGreen.black(' Escanea el código QR para vincular WhatsApp '))
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'open') {
      reconnecting = false
      console.log(chalk.bgGreen.black(' CRYSYS CONECTADO EXITOSAMENTE '))
    }

    if (connection === 'close' && !reconnecting) {
      const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      console.log(chalk.yellow(`Conexión cerrada. ¿Reconectar?: ${shouldReconnect}`))

      if (shouldReconnect) {
        reconnecting = true
        setTimeout(() => {
          connectToWhatsApp().catch((error) => {
            reconnecting = false
            console.error('Error al reconectar:', error)
          })
        }, 3000)
      } else {
        console.log(chalk.red('Sesión cerrada. Borra/vuelve a vincular la sesión solo si quieres iniciar de nuevo.'))
      }
    }
  })
}

async function main() {
  console.log(chalk.cyan('Iniciando CRYSYS...'))
  await cargarComandos()
  await connectToWhatsApp()
}

main().catch((error) => {
  console.error(chalk.red('No se pudo iniciar CRYSYS:'), error)
  process.exitCode = 1
})
