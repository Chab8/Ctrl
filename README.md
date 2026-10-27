# Ctrl — Personal Life OS

Primera versión funcional de Ctrl: **Home** y **Finanzas**, con diseño responsive inspirado en la referencia visual incluida en el proyecto.

## Ejecutar en desarrollo

La app no necesita Node ni un proceso de compilación: es HTML, CSS y JavaScript.

1. Cloná el repositorio.
2. Abrí la carpeta en Antigravity o VS Code.
3. Para probarla, serví la carpeta con cualquier servidor estático local (por ejemplo, la extensión Live Server) y abrí la dirección local que te indique.
4. También se puede abrir `index.html` directamente, pero la instalación PWA y el modo offline necesitan HTTPS o localhost.

## Instalar como aplicación

- **Mac / Windows / Chrome:** abrí la web servida por HTTPS y usá la opción del navegador para instalar la página como aplicación.
- **iPhone:** abrí la web en Safari → Compartir → Añadir a pantalla de inicio.
- **Android:** abrí la web en Chrome → menú → Instalar aplicación / Añadir a pantalla de inicio.

## Funciones actuales

- Home con resumen financiero, actividad reciente, gráficos y tareas rápidas.
- Registro, edición, búsqueda, filtrado y eliminación de gastos, ingresos e inversiones.
- Presupuestos mensuales por categoría.
- Cartera de inversiones con valor y variación ingresados manualmente.
- Exportación de movimientos a CSV.
- Exportación e importación de respaldo JSON.
- Diseño adaptado a escritorio y celular, con navegación móvil.
- PWA con shell cacheado para abrir la interfaz sin conexión después de la primera carga.

## Importante: datos y sincronización

Ctrl usa Supabase Auth para el registro y el inicio de sesión. La sesión queda persistida en el navegador/dispositivo y se renueva automáticamente; para cerrar sesión se usa el control de cuenta de la esquina superior derecha. La contraseña la administra Supabase Auth y no se guarda en texto plano en una tabla de la app.

Los datos personales de Ctrl se guardan en Supabase por usuario y se cargan al iniciar sesión: finanzas (movimientos, presupuestos y cartera), tareas, proyectos, wishlist, notas, región seleccionada del clima, equipos/competiciones seguidos y recetas personales/favoritas. Al abrir Ctrl desde otro dispositivo con la misma cuenta, se carga la misma información; con la app abierta, se comprueba si hay cambios remotos al volver a la pestaña y periódicamente.

La primera cuenta que use este navegador puede importar los datos locales existentes. Para evitar mezclar cuentas, esos datos antiguos no se importan automáticamente a cuentas posteriores. Los datos de calendario y correo continúan gestionándose mediante la conexión de Google.

Si la confirmación de email está habilitada en Supabase, configurá la URL publicada de Ctrl en Authentication → URL Configuration → Redirect URLs.

Los movimientos financieros son manuales. No se consultan cotizaciones de mercado ni cuentas bancarias automáticamente en esta versión.
