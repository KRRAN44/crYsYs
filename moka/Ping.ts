export default {
  name: 'ping',
  aliases: ['p'],
  description: 'Comprueba si el bot está activo',

  async execute(sock: any, msg: any, args: string[], extra: { chat: string }) {
    const inicio = Date.now()
    const ping = Date.now() - inicio
    await sock.sendMessage(extra.chat, {
      text: `_*[🫟] ~ crysys conectado..*_
> *Ping en: ${ping}*`
      
    })
  }
}
