# Deytek Software — sitio web
Abre `index.html` en tu navegador.
- `script.js`: juegos (imagen y enlaces de descarga), vacantes, equipo y JOIN_ENDPOINT del formulario.
- `img/`: imágenes de los juegos.
- El formulario "Únete" necesita un servidor para recibir la hoja de vida: pon su URL en JOIN_ENDPOINT.

## Cuentas (Firebase)
1. Crea un proyecto en https://console.firebase.google.com
2. Authentication > Método de acceso: activa **Google** y **Correo/contraseña**.
3. Configuración del proyecto > Tus apps > Web: copia la configuración en `firebase-config.js`.
4. Firestore Database > crear base de datos y en Reglas pega todo el contenido de `firestore.rules` (cuentas, comentarios y límite de 1 minuto).
5. Abre el sitio desde un servidor (no con doble clic en index.html): `npx serve` o la extensión Live Server de VS Code.
   Al publicarlo, agrega tu dominio en Authentication > Configuración > Dominios autorizados.

## Fichas, personajes y sonido
- `script.js`: cada juego tiene `img`, `shots` (más fotos), `video` (YouTube embed o .mp4), `info` y `links`. Los personajes destacados de cada juego van dentro del juego, en `characters`.
- Sonidos y música se generan en el navegador (`fx.js`). Para usar tu propia música pon `MUSIC_FILE = "audio/musica.mp3"`.
- El formulario Únete solo se activa con sesión iniciada. Los videos de YouTube necesitan abrir el sitio desde un servidor.

## Épicas historias de usuario
- Los usuarios con sesión publican con tema y calificación (1-5), y todos pueden dar me gusta / no me gusta y responder.
- Los temas se editan en `TOPICS` al inicio de `comunidad.js`. El límite de 1 comentario por minuto lo valida `firestore.rules`.
- Para borrar comentarios ajenos (moderación) usa la consola de Firebase > Firestore.
