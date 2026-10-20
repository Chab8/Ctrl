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

En esta primera versión, los datos se guardan en el almacenamiento local del navegador/dispositivo. **No se sincronizan automáticamente entre la computadora y el celular todavía.** Para compartir la misma información entre dispositivos hay que conectar una base de datos remota y autenticación (por ejemplo, Supabase); no se deben poner claves secretas en el frontend. Hasta entonces, podés mover los datos entre dispositivos usando Exportar mis datos e Importar respaldo.

Los movimientos financieros son manuales. No se consultan cotizaciones de mercado ni cuentas bancarias automáticamente en esta versión.
