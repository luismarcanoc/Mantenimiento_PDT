# Sistema de mantenimiento e inventario PDT

Aplicación interna para registrar equipos, administrar inventario y gestionar reportes de mantenimiento mediante formularios web conectados con Google Sheets y Telegram.

El proyecto centraliza el seguimiento de incidencias y activos, reduce el registro manual y conserva trazabilidad sobre participantes, notificaciones y resolución de reportes.

## Funcionalidades principales

- Registro administrativo de equipos con codificación uniforme.
- Formularios web para crear y consultar reportes de mantenimiento.
- Inventario respaldado por Google Sheets.
- Validación y creación automática de la estructura de datos.
- Generación de materiales QR para acceder al formulario desde cada equipo.
- Notificaciones y seguimiento mediante un bot de Telegram.
- Registro de participantes, envíos y estados para facilitar auditorías.
- Pruebas automatizadas para los componentes principales.

## Tecnologías

- Google Apps Script
- JavaScript, HTML y CSS
- Google Sheets
- Telegram Bot API
- `clasp` para sincronización y despliegue
- Python para generar materiales QR

## Estructura del repositorio

```text
app/                Código principal de Google Apps Script
registro_equipos/   Aplicación administrativa para registrar equipos
docs/               Guías de acceso, operación y despliegue
scripts/            Utilidades reproducibles, incluido el material QR
tests/              Pruebas del sistema
```

Las copias locales de sistemas anteriores se mantienen fuera del control de versiones.

## Base de datos

La aplicación utiliza el Google Sheet configurado en `app/Config.js`. La función `configurarBaseDeDatos` crea y valida la estructura inicial sin borrar registros existentes.

Antes de desplegar en producción, utiliza una hoja de prueba y verifica que las columnas y los catálogos coincidan con la configuración del proyecto.

## Desarrollo local

Se necesita Node.js para ejecutar `clasp` y una cuenta de Google con acceso al proyecto de Apps Script. Desde `app/`:

```powershell
npx --yes @google/clasp pull
npx --yes @google/clasp push
```

Los despliegues deben realizarse únicamente después de probar la nueva versión.

## Registro de equipos

El módulo administrativo genera códigos con el formato `C-TTNN-EUUAA`, valida los catálogos de la plantilla y añade las 18 columnas requeridas en `EQUIPOS`. Se publica como un proyecto independiente para exigir autenticación con una cuenta de Google.

Consulta la [guía de acceso y operación](docs/REGISTRO_EQUIPOS.md) antes de habilitar usuarios.

## Formulario, instructivo y códigos QR

La URL estable del formulario termina en `/exec`. El instructivo se abre agregando `?vista=instructivo`.

La [guía de publicación y montaje](docs/DESPLIEGUE_Y_QR.md) explica cómo conservar la misma URL al publicar versiones nuevas y cómo preparar los códigos QR para impresión. El generador reproducible se encuentra en `scripts/generar_material_qr.py`.

## Integración con Telegram

La integración usa un bot exclusivo y consulta mensajes cada minuto. El token y el identificador del grupo se almacenan únicamente en las propiedades privadas de Apps Script:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

### Configuración

1. Crea el bot con BotFather, agrégalo al grupo de prueba y concédele permiso de administrador para eliminar mensajes.
2. Guarda el token como `TELEGRAM_BOT_TOKEN` en **Configuración del proyecto > Propiedades de la secuencia de comandos**. No lo incluyas en el código.
3. Envía `/activar` y ejecuta `detectarYGuardarGrupoTelegram` desde Apps Script.
4. Ejecuta `probarConfiguracionTelegram` para verificar la conexión.
5. Ejecuta una vez `instalarIntegracionTelegram` para crear el activador de un minuto.
6. Crea un reporte desde `/dev`, registra participantes y resuélvelo con el botón o respondiendo `Listo`.

Al cerrar un reporte, el sistema resume el mensaje original y elimina la respuesta `Listo`. Los participantes quedan almacenados en `REPORTE_PARTICIPANTES`; los envíos y sus estados, en `TELEGRAM_LOG`.

## Seguridad

- No publiques tokens, identificadores privados ni credenciales.
- Mantén los secretos en las propiedades de Apps Script.
- Usa datos de prueba durante el desarrollo.
- Revisa los permisos antes de habilitar nuevos usuarios.
- Conserva `.gitignore` actualizado para evitar archivos locales o sensibles.

## Estado del proyecto

Proyecto funcional en evolución, orientado a automatizar operaciones de mantenimiento e inventario y mejorar la trazabilidad de los reportes.
