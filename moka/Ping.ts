export default {
  name: 'ping',
  aliases: ['p'],
  description: 'Comprueba si el bot está activo',

  async execute(sock: any, msg: any, args: string[], extra: { chat: string }) {
    await sock.sendMessage(extra.chat, {
      text: '> _*[🫟] ~ crysys conectado..*_'
    })
  }
}
