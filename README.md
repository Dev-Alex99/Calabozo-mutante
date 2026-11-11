# 🏰 CALABOZO MUTANTE — DUNGEON DIRECTOR IA (EDICIÓN SUPREMA)

> Videojuego de acción *roguelite* multijugador cooperativo en tiempo real (Top-Down 2D) para navegadores, donde **MiniMax M3.1 Flash** actúa como el **Director de la Mazmorra** en vivo, mutando las físicas de las cámaras, negociando pactos malditos, desatando intervenciones en medio del combate y perfilando psicológicamente al escuadrón.

---

## 🎮 Nuevas Mecánicas y Características Principales

### 🧠 1. Inteligencia Artificial Brillante ("El Director Vivo")
- **Medidor de Ira e Intervenciones en Vivo:** Mientras los jugadores encadenan combos y masacran monstruos, la **Ira del Director IA** sube hasta el 100%, provocando intervenciones en pleno combate: lluvias de meteoros burocráticos y ascenso de enemigos a **Campeones Élite Mutantes** (`Vampírico`, `Explosivo`, `Tormenta`, `Blindado`).
- **Altar del Pacto & Armería:** Al purgar cada cámara, el Director ofrece un **Pacto Maldito generado por IA** (ej. *Pacto de Sangre por Rayos en Cadena*, *Emboscada de Campeón Élite por Doble Botín*, *Ruleta Rusa del Director*) además de forja de nivel de arma, escudos y curación con monedas de oro.
- **Jefe Final Multi-Patrón Adaptativo:** Diseñado según la telemetría del equipo, alternando entre *Espiral del Tribunal*, *Lluvia de Meteoros*, *Barrido Láser* y *Embestida Sísmica*.
- **Perfil Psicológico del Escuadrón:** Al finalizar la partida, la IA otorga títulos dinámicos según el desempeño real (*"Ángel Guardián del Gremio"*, *"Alquimista del Caos Elemental"*, *"Torbellino Intocable"*).
- **Compañeros Guardianes IA (Bots Co-op):** Permite añadir héroes aliados controlados por IA desde el lobby que combaten, esquivan, usan habilidades y priorizan revivir a los jugadores caídos.

### ⚔️ 2. Cuatro Clases con Habilidades Activas (`Clic Derecho` / `E`) y Sinergias
- 🛡️ **Caballero Descafeinado (Guerrero):**
  - *Ataque Básico:* Espadazo amplio con Zweihänder que destruye proyectiles enemigos frente a él.
  - *Habilidad Especial (`Baluarte Sísmico`):* Onda expansiva que aturde enemigos cercanos, otorga escudo y **refleja todos los proyectiles enemigos** con 250% de daño durante 2.2s.
- 🏹 **Cazador Desesperado:**
  - *Ataque Básico:* Virotes veloces con rebote en muros y pilares.
  - *Habilidad Especial (`Salva Perforante & Trampa`):* Dispara 5 flechas perforantes de hielo en abanico y planta una trampa explosiva en el suelo.
- 🔮 **Mago Piromaniaco:**
  - *Ataque Básico:* Orbes de fuego con explosión real en área (AoE) y estado de **Quemadura**.
  - *Habilidad Especial (`Singularidad Arcana`):* Invoca un agujero negro gravitatorio que succiona, congela y detona a los monstruos.
- 🗡️ **Asesino de las Sombras (Pícaro — ¡NUEVO!):**
  - *Ataque Básico:* Dagas dobles envenenadas de altísima cadencia y probabilidad crítica.
  - *Habilidad Especial (`Paso Sombrío & Señuelo`):* Deja un clon explosivo que atrae a los monstruos y se teletransporta en **invisibilidad**, garantizando un golpe crítico letal.

### ⚡ 3. Sinergias Elementales Cooperativas, Combos y Entorno Interactivo
- **Reacciones Elementales (`¡SINERGIA!`):** Combinar estados entre compañeros (**Fuego 🔥 + Veneno ☠️**, **Fuego 🔥 + Hielo ❄️**, **Rayo ⚡ + Hielo ❄️**) detona una explosión elemental arcana con +55% de daño masivo.
- **Racha de Combo & Modo Frenesí:** Encadenar impactos sin recibir daño aumenta la velocidad de movimiento, el oro obtenido y activa el aura de Frenesí.
- **Entorno Táctico:** Pilares góticos con colisión física real (cobertura y rebote de proyectiles), **Barriles Explosivos, Criogénicos y Tóxicos**, trampas de pinchos retráctiles, pozos de lava y vórtices gravitatorios.
- **Puertas Ramificadas & Modo Ascensión Infinita:** Al limpiar una sala se abren hasta 3 rutas (**Norte:** Cámara Estándar, **Este:** Cámara Élite con doble botín, **Oeste:** Santuario con curación y descuentos). Tras vencer al Jefe, el equipo puede descender al **Abismo Infinito (Cámara 7+)**.
- **Multijugador Optimizado a 60-144 FPS:** Interpolación de entidades en cliente libre de *jitter*, botín de cofre individual para cada jugador, **Resurrección Cooperativa en Vivo** parándose en el círculo del aliado caído y sistema de **Ping Táctico (`G`)**.

---

## 🕹️ Controles

| Acción | Teclado & Ratón (PC) | Táctil (Móvil / Tablet) |
| :--- | :--- | :--- |
| **Moverse** | `W`, `A`, `S`, `D` o Flechas | Joystick virtual izquierdo |
| **Apuntar** | Movimiento del Ratón (360°) | Automático / Dirección |
| **Ataque Básico** | `Clic Izquierdo` | Botón rojo de mira |
| **Habilidad Especial** | `Clic Derecho`, `E` o `Q` | Botón púrpura de destello |
| **Dash Evasivo** | `Espacio` o `Shift` | Botón dorado de rayo |
| **Ping Cooperativo** | Tecla `G` o `Clic Central` | — |

---

## 🚀 Instalación y Ejecución Local

```bash
# 1. Instalar dependencias en raíz, servidor y cliente
npm run install:all

# 2. Iniciar en modo desarrollo (Cliente en :5175, Servidor en :3003)
npm run dev
```
