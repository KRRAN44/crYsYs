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
import { pathToFileURL } from "node:url";

// carpeta de comandos 
const dir = "./moka";

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

// Manda un mensaje del bot con la etiqueta configurada
async function enviarConInfo(
  sock: ReturnType<typeof makeWASocket>,
  chat: string,
  texto: string
) {
  const contexto = armarContexto()
  const tieneEtiqueta = Object.keys(contexto).length > 0

  await sock.sendMessage(chat, {
    text: texto,
    contextInfo: tieneEtiqueta ? contexto : undefined,
  })
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('sessions/CrysysCreditsSessions')

  const sock = makeWASocket({
    auth: state,
    logger,
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log(chalk.bgGreen.white(`▏🍀 ╴ ║ Escanea El Codigo QR:`))
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      // log para conexion cerrada
      console.log(chalk.bgGreen.white(`▏🍀 ╴ ╚════╕ Conexion Cerrada!💔.. ¿Esta Intentando Reconectar 🔥?? =`, shouldReconnect))

      if (shouldReconnect) connectToWhatsApp()
    } else if (connection === 'open') {
      // logs para conexion exitosa
      console.log(chalk.bgGreen.white(`▏🍀 ╴ ╔════╛`))
      console.log(chalk.bgGreen.white(`▏🍀 ╴ ║ CRYSYS CONECTADO EXITOSAMENTE 🥳`))
      console.log(chalk.bgGreen.white(`▏🍀 ╴ ╚══════╕╒═╕╒══╕`))
      // Mensaje de prueba a tu mismo número (bórralo cuando ya no lo necesites)
      const miNumero = sock.user!.id.split(':')[0] + '@s.whatsapp.net'
      enviarConInfo(sock, miNumero, `.ฺ 𓏲ּׄ᠂     🍺̶⃝͢             𝑪͢𝑹𖾔̷̸𝒀̸̷𖾔𝑺𖾔𝒀̷̸͢𖾔𝑺`)
    }
  })
}
  export const commands = new Map();
  for (const file of fs.readdirSync(dir).filter(f => /\.(ts|js)$/.test(f))) {
    const cmd = (await import(pathToFileURL(path.resolve(dir, file)).href)).default;
    if (cmd?.name) commands.set(cmd.name, cmd);
    }
  console.log(chalk.bgGreen.white(`▏🍀 ╴ ║ Comandos Disponibles: ${commands.size}`));


const PREFIX = "@";

function obtenerTexto(msg: any): string {
  const message = msg.message;

  return (
    message?.conversation ||
    message?.extendedTextMessage?.text ||
    message?.imageMessage?.caption ||
    message?.videoMessage?.caption ||
    message?.documentMessage?.caption ||
    ""
  ).trim();
}

async function ejecutarComando(
  sock: ReturnType<typeof makeWASocket>,
  msg: any
) {
  try {
    if (!msg.message || msg.key.fromMe) return;

    const chat = msg.key.remoteJid;
    if (!chat) return;

    const texto = obtenerTexto(msg);

    if (!texto.startsWith(PREFIX)) return;

    const argumentos = texto.slice(PREFIX.length).trim().split(/\s+/);

    const nombre = argumentos.shift()?.toLowerCase();

    if (!nombre) return;

    const args = argumentos;
    const comando = commands.get(nombre);

    if (!comando) return;

    await comando.execute({
      sock,
      msg,
      chat,
      args,
      texto,
      nombre
    });

  } catch (error) {
    console.error("Error ejecutando comando:", error);
  }
}

connectToWhatsApp()
