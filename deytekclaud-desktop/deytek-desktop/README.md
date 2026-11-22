# DeyTek Claud (escritorio)

App de escritorio hecha con Electron. Muestra solo el inicio de sesión y el sistema social de DeyTek: amigos, chat y llamadas.

## Cómo funciona

- **Mismo código que la web.** `scripts/sync.js` copia `auth.js`, `social.js`, `call.js`, los CSS, `firebase-config.js` y unas imágenes desde la carpeta `public` del sitio hacia `app/`. Así el chat y las llamadas son idénticos a los de la web, y no hay que mantener dos versiones.
- **Servidor local.** `main.js` sirve la carpeta `app/` en `http://localhost:47321`, porque Firebase Auth no funciona bien desde `file://`. El puerto es fijo para que la sesión se recuerde entre aperturas.
- **Interfaz.** `app/index.html` solo tiene el login y la pantalla de amigos/chat. `app/desktop.css` hace que esa pantalla ocupe toda la ventana.
- **Sonidos y avisos** (`app/desktop.js`):
  - Llamada entrante: sirena en bucle, la ventana pasa al frente, parpadea en la barra de tareas y sale una notificación del sistema. La sirena siempre suena.
  - Mensaje nuevo o solicitud de amistad: "ding", notificación y contador `(n)` en el título. Se puede silenciar con el botón "Sonido".
  - `sync.js` parchea la copia de `call.js` para que use esta sirena en lugar del pitido original.
- **Bandeja del sistema.** Al cerrar la ventana la app sigue abierta para recibir llamadas. Para salir del todo: icono de la bandeja > Salir. Requiere `public/img/favicon.png`.

## Comandos

Desde la carpeta `deytek-desktop`:

```
npm install        # solo la primera vez
npm start          # copia los archivos de public y abre la app
npm run dist       # genera el instalador de Windows en dist/
```

Si `public` está en otro lugar:

```
node scripts/sync.js "C:\ruta\a\public"
npx electron .
```

## Notas

- Entra con correo y contraseña. El botón de Google está oculto porque Google bloquea el login dentro de Electron. Quien se registró con Google puede crear una contraseña con "Olvidé mi contraseña".
- `localhost` debe estar en los dominios autorizados de Firebase Authentication (viene así por defecto).
- Si una llamada no conecta entre redes distintas, hace falta un servidor TURN en `call.js` de la web.
