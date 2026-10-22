# Ctrl — Deportes / PitchAPI

## Configuración segura de PitchAPI

La clave de PitchAPI no se guarda en el frontend ni en Git. El módulo `sports.js` consulta el proxy del servidor en `/api/pitchapi/*`, que agrega la clave de forma privada.

1. En Vercel, abrí el proyecto que despliega Ctrl.
2. Entrá en **Settings → Environment Variables**.
3. Creá `PITCHAPI_API_KEY` con la clave privada de PitchAPI.
4. Habilitala para los entornos que uses (Production y Preview, según corresponda).
5. Guardá y hacé un nuevo deployment.

No completes el valor real en `.env.example` ni lo subas al repositorio. El archivo `.env` está excluido por `.gitignore`.

**Importante:** este proxy requiere que Ctrl esté desplegado en Vercel (o en una plataforma compatible con funciones serverless Node). En un hosting puramente estático, la API no podrá usar una clave privada de forma segura.

## Integración

Ctrl es una aplicación HTML/CSS/JavaScript sin build step. `sports.js` se carga al final de `index.html`, después del script principal, y utiliza el estado persistido de Ctrl (`ctrl.personal.v1`) para guardar los equipos y ligas seguidos.
