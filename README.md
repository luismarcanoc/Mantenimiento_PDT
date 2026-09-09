# Mantenimiento PDT

Nuevo sistema de reportes, inventario y mantenimiento de Pan de Tata.

## Estructura local

- `app/`: codigo del Apps Script nuevo.
- `referencias/`: copias locales de los sistemas anteriores. No se versionan.

## Base de datos

El Apps Script nuevo trabaja con el Google Sheet configurado en
`app/Config.js`. La funcion `configurarBaseDeDatos` crea y valida la
estructura inicial sin borrar registros existentes.

## Desarrollo

Desde `app/`:

```powershell
npx --yes @google/clasp pull
npx --yes @google/clasp push
```

Los despliegues se realizan solo despues de probar la version nueva.

## Telegram

La integracion usa un bot exclusivo y polling cada minuto. El token y el ID del
grupo se guardan unicamente en las propiedades privadas del Apps Script:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

Preparacion y prueba:

1. Crear el bot con BotFather, agregarlo al grupo de reportes o a un grupo de
   prueba y darle permiso de administrador para eliminar mensajes.
2. Guardar el token como `TELEGRAM_BOT_TOKEN` en **Configuracion del proyecto >
   Propiedades de la secuencia de comandos**. No escribirlo en el codigo.
3. Enviar `/activar` dentro del grupo y ejecutar una vez
   `detectarYGuardarGrupoTelegram` desde el editor de Apps Script. El bot
   confirmara la conexion en ese grupo, sin depender del nombre que tenga.
4. Ejecutar `probarConfiguracionTelegram`. El resultado solo muestra el nombre
   del bot y el nombre del grupo.
5. Ejecutar una vez `instalarIntegracionTelegram` para crear el activador de un
   minuto.
6. Crear un reporte desde el despliegue de prueba `/dev`, pulsar `Participar`
   desde dos cuentas y resolverlo con el boton o respondiendo `Listo`.

Al cerrar un reporte, el mensaje original se edita a una sola linea y la
respuesta `Listo` se elimina del grupo. Los participantes quedan registrados en
`REPORTE_PARTICIPANTES`; los envios y su estado, en `TELEGRAM_LOG`.

