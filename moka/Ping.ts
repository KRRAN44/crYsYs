import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const ejecutar = promisify(execFile)

// 1) Linux (PC o laptop) y muchos Android: /sys/class/power_supply/<algo>/ con type = Battery
function bateriaDesdeSys(): number | null {
  const base = '/sys/class/power_supply'
  try {
    for (const carpeta of fs.readdirSync(base)) {
      const ruta = path.join(base, carpeta)
      try {
        if (fs.readFileSync(path.join(ruta, 'type'), 'utf8').trim() !== 'Battery') continue
        const n = parseInt(fs.readFileSync(path.join(ruta, 'capacity'), 'utf8'), 10)
        if (!Number.isNaN(n)) return n
      } catch {}
    }
  } catch {}
  return null
}

// 2) Teléfono con Termux (necesita la app Termux:API instalada)
async function bateriaDesdeTermux(): Promise<number | null> {
  try {
    const { stdout } = await ejecutar('termux-battery-status', [], { timeout: 3000 })
    const n = JSON.parse(String(stdout)).percentage
    return typeof n === 'number' ? n : null
  } catch {
    return null
  }
}

// 3) Windows (PowerShell) y 4) Mac (pmset)
async function bateriaDelSistema(): Promise<number | null> {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await ejecutar('powershell', ['-NoProfile', '-Command', '(Get-CimInstance Win32_Battery).EstimatedChargeRemaining'], { timeout: 5000 })
      const n = parseInt(String(stdout).trim(), 10)
      return Number.isNaN(n) ? null : n
    }
    if (process.platform === 'darwin') {
      const { stdout } = await ejecutar('pmset', ['-g', 'batt'], { timeout: 3000 })
      const m = String(stdout).match(/(\d+)%/)
      return m ? Number(m[1]) : null
    }
  } catch {}
  return null
}

// prueba las fuentes en orden; si ninguna sirve (un servidor sin batería), devuelve null
async function porcentajeBateria(): Promise<number | null> {
  return bateriaDesdeSys() ?? (await bateriaDesdeTermux()) ?? (await bateriaDelSistema())
}

export default {
  name: 'ping',
  aliases: ['p'],
  description: 'Comprueba si el bot está activo',

  async execute(sock: any, msg: any, args: string[], extra: { chat: string }) {
    const inicio = Date.now()
    const ping = Date.now() - inicio
    const bateria = await porcentajeBateria()
    const linea = bateria === null ? 'no disponible (sin batería)' : `${bateria}%`
    await sock.sendMessage(extra.chat, {
      text: `_*[🫟] ~ crysys conectado..*_
> *Ping en: ${ping}*
> *Batería: ${linea}*`
    })
  }
}
