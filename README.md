# Passbox

Gestor de secretos local y de conocimiento cero para Windows, macOS y Linux. Almacena contraseñas, tokens de API y secretos de desarrollo en una bóveda local cifrada con AES-256-GCM y los sincroniza como **filas cifradas en el cliente** en tu propia base de datos Supabase Postgres. Se conecta con tu **URL de proyecto + cadena de conexión del session pooler** (ambas siguen siendo tuyas: BYO); la cadena de conexión se guarda cifrada en reposo y los valores secretos nunca salen del dispositivo en texto plano. Dos dispositivos con la misma contraseña maestra comparten una sal y pueden leer las filas del otro.

## Descarga

Descarga el instalador para Windows desde la [página de versiones de Passbox](https://github.com/jlozanoDev/passBox/releases) (`Setup.exe`).

## Características

- **Bóveda** — búsqueda por título/usuario/categoría, chips de filtro por categoría, favoritas, panel de detalle con el secreto enmascarado, acciones de copia con confirmación visual, edición en línea y eliminación tras un diálogo que nombra la credencial.
- **Generador de contraseñas** — `crypto.getRandomValues` con muestreo por rechazo (sin sesgo de módulo), longitud de 8 a 64, conmutadores por clase de caracteres que siempre mantienen al menos una clase activa, estimación de fuerza en vivo. Los valores generados nunca se almacenan.
- **Centro de seguridad** — auditoría local de secretos débiles, reutilizados y antiguos (más de 180 días). Devuelve solo identificadores y recuentos, nunca renderiza ni registra texto secreto; la fuerza se presenta siempre como una estimación, jamás como una garantía.
- **Apariencia** — tema claro / oscuro / sistema, persistido en `localStorage` bajo la clave `passbox.theme` (la única que escribe el renderer).
- **Sincronización en la nube (opcional)** — filas cifradas en tu propio proyecto Supabase; la cadena de conexión se cifra con la clave de la bóveda antes de guardarse.
- **Seguridad del portapapeles** — las copias sensibles se borran a los 30 s y solo mientras el portapapeles siga conteniendo el mismo valor, comparado por huella SHA-256 (el temporizador no conserva texto plano).

## Interfaz

- **Idioma:** toda la copia de la interfaz está en **español** neutro y profesional (`<html lang="es">`); los identificadores y comentarios del código siguen en inglés.
- **Sistema de diseño:** una única capa de tokens en `src/renderer/index.css` — tema claro hueso/tinta, tema oscuro carbón cálido, un único acento petróleo-turquesa reservado a estados interactivos/seleccionados/enfoque/marca, colores semánticos sin cambios y sin gradientes. Los componentes consumen tokens, nunca valores sueltos.
- **Tipografía:** IBM Plex Sans (interfaz) y IBM Plex Mono (secretos, usuarios, marcas de tiempo, recuentos) empaquetados localmente con Fontsource, sin llamadas de red en tiempo de ejecución.
- **Distribución:** índice tipográfico lateral desde 1024 px, riel de iconos de 64 px desde 640 px y navegación inferior por debajo de 640 px; objetivos táctiles de 44 px en móvil; secciones abiertas separadas por filetes en lugar de rejillas de tarjetas; el detalle de credencial se lee como un dossier con la fila del secreto como ancla visual.
- **Marca:** marca original de dos corchetes (`src/renderer/components/ui/BrandMark.vue`) más un icono de aplicación reproducible (ver más abajo).

## Stack

- Electron + Vite + Electron Forge
- Vue 3 + Tailwind CSS v4 (tokens de diseño en `src/renderer/index.css`)
- IBM Plex Sans / IBM Plex Mono vía Fontsource (empaquetados en tiempo de build)
- Node.js `crypto` (PBKDF2 + AES-256-GCM)
- `postgres` (session pooler de Supabase; `CREATE TABLE IF NOT EXISTS` idempotente al conectar)
- `vitest` (pruebas unitarias de crypto/bóveda/sincronización más pruebas de contrato del renderer) · `oxlint` + `oxfmt`

## Configuración de Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. **Settings → API Keys** → copia la **Project URL** (`https://xxxx.supabase.co`).
3. **Settings → Database → Connection string → Session pooler** → copia la URI `postgresql://…` (restablece la contraseña de la base de datos allí si hace falta).
4. En Passbox: **Sincronización en la nube → Conectar** con esos dos valores. Las tablas se crean automáticamente en la primera conexión.

## Desarrollo

```bash
npm install
npm start        # ejecuta la aplicación en modo desarrollo
npm test         # vitest: pruebas unitarias + de contrato del renderer
npm run lint     # oxlint + oxfmt
npm run icons    # regenera assets/icons desde assets/icon.svg
npm run package  # empaqueta la aplicación
npm run make     # genera los instaladores → out/make/
```

### Icono de la aplicación

`assets/icon.svg` es la única fuente de verdad. `npm run icons` lo renderiza con `@resvg/resvg-js` hacia `assets/icons/` (PNG de 16 a 1024, `icon.ico` para Windows e `icon.icns` para macOS) y los archivos generados se mantienen en el repositorio, de modo que el empaquetado nunca depende de ejecutar el script. Electron Forge los recoge a través de `packagerConfig.icon` en `forge.config.mjs`, por lo que **las compilaciones empaquetadas llevan el icono nuevo**; `npm start` sigue mostrando el icono propio de Electron porque ejecuta su binario de desarrollo.

### Especificación de diseño y funcionalidades

`odd/tasks/passbox-ui-redesign.md` recoge las especificaciones (S1–S15), la lista de tareas y el registro de verificación del rediseño UI/UX, incluidos los resultados de las verificaciones independientes.

## Licencia

MIT
