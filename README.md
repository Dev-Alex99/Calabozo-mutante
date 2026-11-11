# 🏰 CALABOZO MUTANTE — DUNGEON DIRECTOR IA

> Videojuego de acción *roguelite* multijugador cooperativo en tiempo real (Top-Down 2D) para navegadores, donde **MiniMax M3.1 Flash** actúa como el **Director de la Mazmorra** en vivo, mutando las físicas de las salas, los proyectiles, las trampas y diseñando un jefe final personalizado.

---

## 🎮 Características Principales

- **Director de Mazmorra con IA (MiniMax M3.1 Flash Fast Mode):**
  - **Mutaciones Ambientales en Vivo:** Modifica la fricción del suelo (pistas de hielo, barro), los rebotes de proyectiles, la velocidad de los enemigos y la niebla de guerra.
  - **Reliquias Cómicas Cursadas:** Al derrotar cada sala, un cofre ofrece 3 artefactos generados procedimentalmente con buffs y desventajas reales.
  - **Jefe Final Adaptativo:** En la Sala 6, el Director diseña un combate de jefe con mecánicas y frases adaptadas al estilo de combate de los jugadores.
  - **Cero Espera (Background Pre-fetching):** La IA pre-genera las salas contiguas en segundo plano mientras los jugadores combaten, permitiendo transiciones instantáneas sin tiempos de carga (0 ms).
  - **Comentarios Sarcásticos:** El Director se burla de los jugadores con voz sintetizada (`speechSynthesis`).

- **3 Clases de Héroe Únicas:**
  - 🛡️ **Caballero Descafeinado:** Gran resistencia física (160 HP), espadazo amplio en arco y daño devastador cuerpo a cuerpo.
  - 🏹 **Cazador Desesperado:** Ágil (100 HP), disparo veloz de ballesta a distancia y proyectiles con rebote natural.
  - 🔮 **Mago Piromaniaco:** Cañón de cristal (80 HP), lanza orbes de fuego que explotan en área con daño masivo.

- **Físicas y Combate a 60 FPS:**
  - Motor Canvas 2D nativo ultra ligero y reactivo.
  - Dash evasivo con frames de invulnerabilidad (*i-frames*).
  - Efectos visuales (*juice*): sacudida de pantalla (*screen shake*), estelas de fantasma, salpicaduras de partículas y números de daño flotantes.
  - Efectos de sonido retro sintetizados mediante la **Web Audio API** nativa (sin descargas de archivos de audio externos).
  - Controles táctiles (*dual-stick*) automáticos para móviles y tablets.

---

## 🕹️ Controles

| Acción | Teclado & Ratón (PC) | Táctil (Móvil / Tablet) |
| :--- | :--- | :--- |
| **Moverse** | `W`, `A`, `S`, `D` o Flechas | Joystick virtual izquierdo |
| **Apuntar** | Movimiento del Ratón (360°) | Joystick virtual derecho |
| **Atacar** | Clic Izquierdo | Botón rojo de mira |
| **Dash Evasivo** | `Espacio` o `Shift` | Botón azul de rayo |

---

## 🚀 Instalación y Ejecución Local

### Prerrequisitos
- Node.js 18 o superior.
- Clave de API de MiniMax (opcional; si se omite, se activa el modo simulador con mutaciones y reliquias precargadas).

```bash
# 1. Clonar e ingresar a la carpeta
cd calabozo-mutante

# 2. Instalar dependencias en raíz, servidor y cliente
npm run install:all

# 3. Configurar variables de entorno
cp .env.example .env
# Edita .env y coloca tu MINIMAX_API_KEY si deseas IA en vivo

# 4. Iniciar en modo desarrollo (Cliente en :5175, Servidor en :3003)
npm run dev
```

Abre en tu navegador: [http://localhost:5175](http://localhost:5175)

---

## 🌐 Despliegue en Producción (Render.com)

El proyecto está diseñado como un servicio único monolítico donde Express sirve el cliente de React estático y gestiona los WebSockets en el mismo puerto:

1. Crea un **New Web Service** en [Render.com](https://render.com).
2. Conecta tu repositorio de GitHub.
3. Configuración:
   - **Environment:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
4. Variables de Entorno en Render:
   - `MINIMAX_API_KEY`: Tu clave de MiniMax (ej: `sk-cp-...`)
   - `MINIMAX_BASE_URL`: `https://api.minimax.io/v1`
   - `MINIMAX_MODEL`: `MiniMax-M3.1-Flash`
5. ¡Listo! Render desplegará el juego en su propia URL pública.
