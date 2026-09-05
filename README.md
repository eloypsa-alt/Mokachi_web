# Bitácora de escuchas — guía para publicarla

## 1. Crear la base de datos (Firebase, gratis)

1. Entra a https://console.firebase.google.com con tu cuenta de Google.
2. "Crear proyecto" → ponle un nombre (ej. "bitacora-escuchas") → sigue los pasos por defecto.
3. Dentro del proyecto, ve a **Compilación → Firestore Database** → "Crear base de datos" → elige **modo de prueba** → cualquier ubicación.
4. Ve al ícono de engranaje (arriba a la izquierda) → **Configuración del proyecto** → baja hasta "Tus apps" → clic en el ícono `</>` (Web) → ponle un nombre y regístrala.
5. Firebase te muestra un bloque de código con `apiKey`, `authDomain`, etc. Copia esos valores dentro de `src/firebaseConfig.js`, reemplazando cada "PEGA_AQUI...".

## 2. Probarla en tu computador (opcional pero recomendado)

Necesitas tener [Node.js](https://nodejs.org) instalado. Luego, en esta carpeta:

```
npm install
npm run dev
```

Se abrirá en tu navegador en una dirección local (http://localhost:5173) para que pruebes que todo funciona antes de publicarla.

## 3. Publicarla con una URL propia (Vercel, gratis)

1. Sube esta carpeta a GitHub: entra a https://github.com/new, crea un repositorio, y arrastra todos estos archivos en la página de "upload files" (no necesitas saber usar git en la terminal).
2. Entra a https://vercel.com → "Sign up" con tu cuenta de GitHub.
3. "Add New… → Project" → elige el repositorio que acabas de subir.
4. Vercel detecta automáticamente que es un proyecto Vite. Dale a "Deploy".
5. En un minuto te entrega una URL propia, algo como `bitacora-escuchas.vercel.app` — esa es tu página, accesible desde cualquier dispositivo.

Cada vez que subas cambios al repositorio de GitHub, Vercel actualiza el sitio solo.

## Nota sobre privacidad

Esta configuración no tiene login: cualquiera que tenga tu URL de Firebase en el código fuente podría, en teoría, leer o escribir datos. Para uso personal está bien, pero si más adelante quieres cerrarla con una contraseña, se puede agregar autenticación de Firebase — avísame cuando quieras dar ese paso.
