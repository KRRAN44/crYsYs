export default {
    name: "ping",
    aliases: "p",
    description: "Comprueba si el bot está activo",

    async execute(sock: any, msg: any) {
        await sock.sendMessage(msg.key.remoteJid, {
            text: `> _[🫟] ~ cr*Y*s*Y*s conectado.._ `
        });
    }
};
