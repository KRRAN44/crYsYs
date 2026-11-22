type PingContext = {
  sock: any
  chat: string
}

export default {
  name: 'ping',
  aliases: ['p'],
  description: 'Comprueba si el bot está activo',

  async execute({ sock, chat }: PingContext) {
    await sock.sendMessage(chat, {
      text: '> _[🫟] ~ cr*Y*s*Y*s conectado.._'
    })
  }
}
