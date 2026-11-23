import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// carpeta de crysys.ts (las rutas relativas salen de aquí)
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ===== RUTAS (tú las llenas) =====
// Carpeta donde está el menú: ruta completa (/data/data/com.termux/files/home/crYsYs/menu)
// o relativa a crysys.ts (./menu)
const CARPETA_MENU = "./Menu";

// Nombre del archivo de texto que está dentro de esa carpeta
const ARCHIVO_TEXTO = "../rcs/txt/MenuPrincipalTxt.txt";

// Número de quien ejecutó el comando (en forma de JID, ej. 5215512345678@s.whatsapp.net).
// Si lo mandó el propio bot, es el número del bot.
function quienEjecuto(sock: any, msg: any): string {
  if (msg.key.fromMe) return sock.user.id.split(":")[0] + "@s.whatsapp.net";
  const k = msg.key;
  // participantAlt / remoteJidAlt traen el número real cuando WhatsApp lo manda como @lid
  return k.participantAlt || k.participant || k.remoteJidAlt || k.remoteJid;
}

export default {
  name: "menu",
  description: "Manda el menú: imagen, saludo al que ejecutó y el texto",

  async execute(sock: any, msg: any) {
    const chat = msg.key.remoteJid;
    const ejecutor = quienEjecuto(sock, msg);
    const numero = ejecutor.split("@")[0];

    // se leen cada vez, así puedes editar el texto sin reiniciar el bot
    const texto = fs.readFileSync(path.resolve(RAIZ, CARPETA_MENU, ARCHIVO_TEXTO), "utf-8");
    
    const carpeta = path.resolve(RAIZ, "./rcs/img");
const fotos = fs.readdirSync(carpeta)
  .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));

if (fotos.length === 0) {
  throw new Error("No hay imágenes en la carpeta.");
}

const imagenAleatoria = fotos[Math.floor(Math.random() * fotos.length)];
const imagen = fs.readFileSync(path.join(carpeta, imagenAleatoria));

    // saludo arriba (con mención) y el texto abajo, todo en el pie de la imagen
    const saludo = [
      `      ────────────`,
      ` ׄ  .     𝘾𝘙𝙔𝙎𝘠𝙎      𝄟     𝖡𝖮𝗧`,
      `     𝙷╌꯭ׄ𝙴𝙻𝙻᪶𝙾ׄ @${numero} 🥂`,
    ].join("\n");

    await sock.sendMessage(chat, {
      image: imagen,
      caption: `${saludo}\n${texto}`,
      mentions: [ejecutor],
    });
  },
};