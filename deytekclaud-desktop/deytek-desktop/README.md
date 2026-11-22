# DeyTek Claud (escritorio)

Launcher de juegos hecho con Electron. Al iniciar sesión muestra tus juegos (como el launcher de Riot): video, fotos, descripción, descarga con barra de progreso, actualizaciones y botón Jugar. Arriba hay un botón **Amigos** con todo el chat y las llamadas.

## Comandos

```
npm install        # solo la primera vez
npm start          # copia los archivos de public y abre la app
npm run dist       # genera el instalador de Windows en dist/
```

## Cómo funciona un juego, en resumen

1. Tu juego (el `.exe` y todos sus archivos) se comprime en **un `.zip`**.
2. Subes ese zip a internet y obtienes un **enlace directo de descarga**.
3. Agregas el juego a **`app/games.json`** con ese enlace, su descripción, el logo, el video y las fotos.
4. En el launcher, el jugador pulsa **Descargar**: la app baja el zip, lo descomprime en su PC y el botón pasa a **Jugar**.
5. Cuando subes una versión nueva, cambias `version` en `games.json` y a los jugadores les aparece **Actualizar**.

## Estructura de carpetas

```
deytek-desktop/
├─ main.js, preload.js, package.json
└─ app/
   ├─ games.json            <- la lista de juegos (aquí agregas los tuyos)
   ├─ launcher.js / launcher.css
   └─ media/                <- imágenes y videos de tus juegos (tú creas esta carpeta)
      └─ mi-juego/
         ├─ logo.png
         ├─ fondo.jpg
         ├─ trailer.mp4
         ├─ foto1.jpg
         ├─ foto2.jpg
         └─ foto3.jpg
```

Crea una carpeta dentro de `app/media/` por cada juego y usa el mismo nombre que el `id` del juego.

## Agregar un juego, paso a paso

### 1. Prepara el zip

Comprime el contenido del juego de modo que el `.exe` quede **en la raíz del zip** (al abrir el zip debes ver `MiJuego.exe` directamente, no una carpeta que lo contenga).

Si el zip trae una carpeta intermedia (por ejemplo `MiJuego/MiJuego.exe`), no hay problema, pero entonces en `games.json` pones `"exe": "MiJuego/MiJuego.exe"`.

### 2. Sube el zip y consigue el enlace directo

El enlace tiene que **empezar la descarga directamente**, no abrir una página web. Opciones:

- **GitHub Releases** (gratis, hasta 2 GB por archivo): crea un repositorio, ve a Releases, crea una versión y adjunta el zip. El enlace tiene esta forma: `https://github.com/TU_USUARIO/TU_REPO/releases/download/v1.0.0/mi-juego-1.0.0.zip`
- **Tu propio hosting o servidor**: sube el zip y usa su URL.
- **Cloudflare R2, Backblaze B2, Firebase Storage**: sirven igual, siempre que el enlace sea público y directo.
- **Google Drive / Dropbox**: no se recomiendan. Drive no da enlaces directos fiables para archivos grandes; en Dropbox hay que terminar el enlace en `?dl=1`.

### 3. Agrega el juego a `app/games.json`

```json
{
  "games": [
    {
      "id": "mi-juego",
      "name": "Mi Juego",
      "tagline": "Subtítulo corto",
      "description": "Texto largo que se muestra sobre el video.",
      "logo": "media/mi-juego/logo.png",
      "background": "media/mi-juego/fondo.jpg",
      "video": "media/mi-juego/trailer.mp4",
      "screenshots": [
        "media/mi-juego/foto1.jpg",
        "media/mi-juego/foto2.jpg",
        "media/mi-juego/foto3.jpg"
      ],
      "version": "1.0.0",
      "size": "350 MB",
      "downloadUrl": "https://github.com/TU_USUARIO/TU_REPO/releases/download/v1.0.0/mi-juego-1.0.0.zip",
      "sha256": "",
      "exe": "MiJuego.exe",
      "args": []
    }
  ]
}
```

Para tener varios juegos, agrega más objetos dentro de la lista `games`, separados por coma. Cada uno necesita un `id` distinto.

| Campo | Qué hace |
|---|---|
| `id` | Nombre interno único. Solo letras, números, `-` y `_`. No lo cambies después: la app lo usa para recordar qué está instalado. |
| `name` | Nombre del juego. Se muestra si no encuentra el logo. |
| `tagline` | Frase corta bajo el logo. Opcional. |
| `description` | Descripción del juego. |
| `logo` | Imagen del título, mejor PNG con fondo transparente. También sale como icono en la barra izquierda. |
| `background` | Imagen de portada. Se ve mientras carga el video y como miniatura del video. Si no hay video ni fotos, es lo único que se muestra. |
| `video` | Trailer. Se reproduce sin sonido; al terminar pasan las fotos. |
| `screenshots` | Lista de fotos. Cada una se muestra 5 segundos y luego vuelve al video. |
| `version` | Versión actual. Es lo que se compara para ofrecer **Actualizar**. |
| `size` | Texto libre que se muestra antes de descargar (ej. `"350 MB"`). No afecta la descarga. |
| `downloadUrl` | Enlace directo al zip. Sin este campo el botón dice "Próximamente". |
| `sha256` | Opcional. Huella del zip para comprobar que no se dañó la descarga (ver más abajo). |
| `exe` | Ruta del ejecutable **dentro del zip**. |
| `args` | Opcional. Argumentos al abrir el juego, por ejemplo `["-windowed"]`. |

Guarda el archivo y vuelve a abrir la app con `npm start`.

## Imágenes y video

Las rutas que empiezan por `media/...` son relativas a la carpeta `app/`. También puedes poner enlaces completos (`https://...`) si prefieres alojarlas en internet.

| Elemento | Recomendado |
|---|---|
| Logo | PNG transparente, unos 600 × 200 px. |
| Fondo (`background`) | JPG, 1920 × 1080. |
| Fotos (`screenshots`) | JPG, 1920 × 1080 (formato 16:9). |
| Video | MP4 con H.264, 1080p o 720p, **sin audio** o con él (siempre se reproduce silenciado). También funciona WebM. |

Tamaño del video: si las imágenes y videos están dentro de `app/media/`, **entran en el instalador** (`npm run dist`) y lo hacen pesado. Mantén el trailer por debajo de 20 a 30 MB (720p y bitrate bajo), o aloja los videos en internet y usa enlaces completos.

## Dónde se guarda el juego en el PC del jugador

El juego se descomprime en:

```
%APPDATA%\<nombre de la app>\games\<id del juego>\
```

- Con `npm start` (desarrollo), la carpeta se llama `deytek-desktop`.
- Con el instalador (`npm run dist`), se llama `DeyTek Claud`.

Para abrirla: pulsa `Win + R`, escribe `%APPDATA%` y entra a esa carpeta. La app también guarda un archivo `installed.json` ahí con la versión instalada de cada juego.

**Importante:** al actualizar o desinstalar se borra la carpeta completa del juego. Tu juego debe guardar las partidas en otra parte (por ejemplo `%APPDATA%` o Documentos), nunca junto al `.exe`.

## Publicar una actualización

1. Comprime la versión nueva en un zip (`mi-juego-1.1.0.zip`) y súbelo.
2. En `games.json` cambia `version` a `"1.1.0"` y `downloadUrl` al zip nuevo (y `sha256` si lo usas).
3. A los jugadores que ya lo tienen instalado les aparece el botón **Actualizar** y un punto blanco sobre el icono del juego. La app revisa la lista al abrir y cada 10 minutos.

Cualquier valor distinto de `version` cuenta como actualización, así que usa números que vayan creciendo (`1.0.0`, `1.0.1`, `1.1.0`).

### Para que no tengas que recompilar el instalador

Si `games.json` va dentro de la app, cada juego o versión nueva te obliga a ejecutar `npm run dist` y volver a repartir el instalador. Para evitarlo:

1. Sube `games.json` a internet (por ejemplo a tu hosting o a GitHub como archivo "raw").
2. En `main.js`, pon su URL en `MANIFEST_URL`, arriba del archivo: `const MANIFEST_URL = "https://tusitio.com/games.json";`
3. Dentro de ese `games.json` online, usa **enlaces completos (`https://...`) para el logo, el video y las fotos**, porque las rutas `media/...` solo existen dentro de la app.

Con esto, cuando edites el `games.json` online, todos los launchers instalados ven el cambio sin reinstalar. Si no hay internet, la app usa el `games.json` incluido como respaldo.

## Verificar la descarga con sha256 (opcional)

Sirve para que la app rechace un zip dañado. En PowerShell:

```
Get-FileHash .\mi-juego-1.0.0.zip -Algorithm SHA256
```

Copia el valor en el campo `sha256` (puede ir en mayúsculas o minúsculas). Si lo dejas en `""`, no se verifica.

## Probar sin subir nada a internet

1. Pon tu zip en una carpeta, por ejemplo `C:\pruebas\mi-juego-1.0.0.zip`.
2. En esa carpeta abre una terminal y ejecuta `python -m http.server 8000` (o `npx http-server -p 8000`).
3. En `games.json` usa `"downloadUrl": "http://localhost:8000/mi-juego-1.0.0.zip"`.
4. Abre el launcher y pulsa Descargar.

## Si algo falla

| Mensaje o síntoma | Causa probable |
|---|---|
| "El servidor respondió 404" | El enlace del zip está mal o el archivo no es público. |
| "El archivo descargado está dañado" | El `sha256` no coincide con el zip. Recalcúlalo o déjalo vacío. |
| "No encuentro el ejecutable del juego" | `exe` no coincide con la ruta real dentro del zip. Revisa si hay carpeta intermedia. |
| El botón dice "Próximamente" | Falta `downloadUrl`. |
| No aparece el logo, solo una letra | La ruta del `logo` está mal o falta el archivo. |
| El video no se ve | Usa MP4 con H.264. Revisa que la ruta exista. |
| Windows muestra una advertencia al abrir el juego | Es SmartScreen, normal con `.exe` sin firma digital. |
| Cambié `games.json` y no veo nada | Cierra la app del todo (icono de la bandeja → Salir) y ábrela de nuevo. |

Solo se admiten juegos de Windows distribuidos en `.zip`.

## Amigos, chat y llamadas

- **Mismo código que la web.** `scripts/sync.js` copia `auth.js`, `social.js`, `call.js`, `styles.css`, `mobile.css`, `firebase-config.js` y algunas imágenes desde la carpeta `public` del sitio hacia `app/`. Los archivos del launcher (`launcher.js`, `launcher.css`, `games.json`, `media/`) no se tocan.
- **Botón Amigos.** Abre y cierra el panel lateral con la lista de amigos, el chat y las llamadas. Si entra una llamada, el panel se abre solo.
- **Sonidos y avisos** (`app/desktop.js`): llamada entrante con sirena, ventana al frente y notificación; mensajes y solicitudes con "ding", notificación y contador `(n)` en el título. Puedes poner tus propios sonidos en `app/sounds/llamada.mp3` y `app/sounds/notificacion.mp3`.
- **Servidor local.** `main.js` sirve `app/` en `http://localhost:47321` porque Firebase Auth no funciona desde `file://`. El puerto es fijo para recordar la sesión.
- **Bandeja del sistema.** Al cerrar la ventana la app sigue abierta para recibir llamadas. Para salir: icono de la bandeja → Salir.

## Notas

- Entra con correo y contraseña. El botón de Google está oculto porque Google bloquea el login dentro de Electron. Quien se registró con Google puede crear una contraseña con "Olvidé mi contraseña".
- `localhost` debe estar en los dominios autorizados de Firebase Authentication (viene así por defecto).
- Si una llamada no conecta entre redes distintas, hace falta un servidor TURN en `call.js` de la web.
