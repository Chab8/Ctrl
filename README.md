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

Ctrl ahora incluye registro e inicio de sesión con Supabase Auth. La sesión queda persistida en el almacenamiento local del navegador/dispositivo y se renueva automáticamente; para cerrar sesión se usa el control de cuenta de la esquina superior derecha. Las credenciales se gestionan en Supabase Auth: la contraseña no se guarda en una tabla propia ni en texto plano.

**Los datos funcionales de la app (por ejemplo, movimientos y presupuestos) todavía se guardan localmente y no se sincronizan automáticamente entre dispositivos.** La autenticación está conectada, pero sincronizar esos módulos requiere migrar su almacenamiento a tablas de Supabase con políticas RLS. Mientras tanto, podés mover esos datos usando Exportar mis datos e Importar respaldo. Si la confirmación de email está habilitada en Supabase, configurá la URL publicada de Ctrl en Authentication → URL Configuration → Redirect URLs.

Los movimientos financieros son manuales. No se consultan cotizaciones de mercado ni cuentas bancarias automáticamente en esta versión.
