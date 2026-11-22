import makeWASocket, {
  DisconnectReason,
  proto,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import qrcode from 'qrcode-terminal'
import P from 'pino'

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
    contexto.forwardingScore = 1
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
      console.log(`▏🍀 ╴ ║ Escanea El Codigo QR:`)
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'close') {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut
      // log para conexion cerrada
      console.log(`▏🪷 ╴ ╚════╕ Conexion Cerrada!💔.. ¿Esta Intentando Reconectar 🔥?? =`, shouldReconnect)

      if (shouldReconnect) connectToWhatsApp()
    } else if (connection === 'open') {
      // logs para conexion exitosa
      console.log(`▏🍀 ╴ ╔════╛`)
      console.log(`▏🍀 ╴ ║ CRYSYS CONECTADO EXITOSAMENTE 🥳`)
      console.log(`▏🍀 ╴ ╚══════╕╒═╕╒══╕`)
      // Mensaje de prueba a tu mismo número (bórralo cuando ya no lo necesites)
      const miNumero = sock.user!.id.split(':')[0] + '@s.whatsapp.net'
      enviarConInfo(sock, miNumero, `.ฺ 𓏲ּׄ᠂     🍺̶⃝͢             𝑪͢𝑹𖾔̷̸𝒀̸̷𖾔𝑺𖾔𝒀̷̸͢𖾔𝑺`)
    }
  })
}

connectToWhatsApp()
