# 🎵 NoteFall Trainer

**Entrenador de Voz e Instrumentos por Micrófono**  
*Kabert Studio – LMKE*

---

## Descripción

NoteFall Trainer es una aplicación web educativa y musical que funciona como entrenador interactivo para canto e interpretación instrumental. Carga un archivo MIDI, canta o toca las notas con tu voz o instrumento, y el sistema evaluará tu afinación en tiempo real.

**Funciona 100% en el navegador. Sin servidores. Sin datos enviados a internet.**

---

## Características

- 🎹 **Motor visual estilo Synthesia** — notas cayendo en tiempo real a 60 FPS
- 🎤 **Detección de pitch en tiempo real** — algoritmo YIN + MPM via Web Audio API
- 🎼 **Soporte MIDI completo** — carga archivos .mid y .midi locales
- 🏆 **Sistema de puntuación** — Perfect / Great / Good / Miss con multiplicadores de combo
- 📊 **Estadísticas persistentes** — historial de sesiones en localStorage
- ⚙️ **Configuración flexible** — sensibilidad, tolerancia, velocidad, temas visuales
- 📱 **Totalmente responsive** — escritorio y móvil

### Instrumentos compatibles
Voz · Silbido · Flauta dulce · Flauta traversa · Violín · Trompeta · Saxofón · Guitarra melódica · Cualquier instrumento monofónico

---

## Estructura del proyecto

```
notefall-trainer/
├── index.html              # Punto de entrada
├── css/
│   └── style.css           # Estilos globales, temas, animaciones
├── js/
│   ├── main.js             # Controlador principal de la aplicación
│   └── modules/
│       ├── midi.js         # Parser MIDI + conversiones musicales
│       ├── pitch.js        # Detector de pitch (YIN + MPM) + AudioWorklet
│       ├── renderer.js     # Motor gráfico Canvas 2D (notas + piano + partículas)
│       ├── game.js         # Lógica de juego, puntuación, temporización
│       └── stats.js        # Estadísticas y configuración en localStorage
└── README.md
```

---

## Instalación local

1. Clona o descarga el repositorio:
   ```bash
   git clone https://github.com/TU_USUARIO/notefall-trainer.git
   cd notefall-trainer
   ```

2. Sirve los archivos con un servidor HTTP local (necesario para ES modules y AudioWorklet):
   ```bash
   # Con Python
   python3 -m http.server 8080

   # Con Node.js (npx)
   npx serve .

   # Con VS Code Live Server
   # Clic derecho en index.html → "Open with Live Server"
   ```

3. Abre `http://localhost:8080` en tu navegador.

> ⚠️ **Importante:** No abras `index.html` directamente como archivo local (`file://`).  
> Los módulos ES y AudioWorklet requieren un servidor HTTP.

---

## Despliegue en GitHub Pages

1. Crea un repositorio en GitHub y sube todos los archivos:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/notefall-trainer.git
   git push -u origin main
   ```

2. Ve a **Settings → Pages** en tu repositorio de GitHub.

3. En **Source**, selecciona:
   - Branch: `main`
   - Folder: `/ (root)`

4. Haz clic en **Save**.

5. Tu aplicación estará disponible en:
   `https://TU_USUARIO.github.io/notefall-trainer/`

> GitHub Pages sirve los archivos con HTTPS, lo que permite el acceso al micrófono (getUserMedia requiere contexto seguro).

---

## Uso

1. **Carga un archivo MIDI** — Haz clic en "Cargar Archivo MIDI" y selecciona un archivo `.mid` o `.midi`.
2. **Verifica la información** — Se mostrará el BPM, duración, pistas y total de notas.
3. **Inicia el entrenamiento** — Haz clic en "Iniciar Entrenamiento".
4. **Permite el micrófono** — El navegador solicitará permiso; acéptalo.
5. **¡Canta o toca!** — Las notas caerán desde arriba. Ejecuta cada nota cuando llegue a la línea brillante.

### Controles de teclado
- **Esc** — Pausar / Reanudar

---

## Tecnologías utilizadas

| Módulo | Tecnología |
|--------|-----------|
| Parser MIDI | `@tonejs/midi` v2.0.28 (CDN) |
| Detección de pitch | Web Audio API + AudioWorklet (YIN / MPM, implementación propia) |
| Motor gráfico | Canvas 2D API |
| Tipografía | Orbitron, Inter, JetBrains Mono (Google Fonts) |
| Persistencia | localStorage |
| Arquitectura | ES Modules nativos |

---

## Requisitos del navegador

- Chrome 80+ / Edge 80+ / Firefox 76+ / Safari 14.1+
- Micrófono disponible
- Conexión a internet (solo para cargar fuentes y librería MIDI desde CDN)

---

## Licencia

© 2024 Kabert Studio – LMKE. Todos los derechos reservados.
