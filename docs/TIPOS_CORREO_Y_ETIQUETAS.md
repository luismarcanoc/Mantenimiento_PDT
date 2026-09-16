# Ajustes del formulario y compatibilidad de etiquetas

Los nuevos reportes ofrecen MECANICO (Mantenimiento mecánico), SERVICIOS_GENERALES
(paredes, pintura e instalaciones) e IT. Se guardan en TIPO_REPORTE y se muestran
con su nombre legible en Telegram. MANTENIMIENTO sigue aceptándose para versiones
anteriores del formulario; no se reclasificaron reportes migrados porque su categoría
mezclaba mecánico y servicios generales. Los catálogos nuevos se agregan al ejecutar
configurarBaseDeDatos; el formulario no depende de esa ejecución para ofrecerlos.

Ubicación y Área filtran equipos activos. Todas las áreas permite encontrar equipos
sin área registrada. La ficha muestra MARCA e INFORMACION; la información también
aparece en los resultados y sirve como texto de búsqueda. La caché dura hasta cinco
minutos después de cambios directos en EQUIPOS.

## Correo

Se consulta Session.getActiveUser().getEmail() y se autocompleta si está disponible.
Nunca se usa getEffectiveUser() para identificar al reportante: en el despliegue
actual sería la cuenta que ejecuta el script. El campo sigue editable y opcional;
por tanto, no debe considerarse una identidad verificada ni utilizarse para permisos.
No se almacena el correo en la caché compartida ni se registra en la consola.

En una aplicación pública ejecutada como propietario, Google normalmente devuelve
vacío, salvo excepciones de propietario/mismo dominio Workspace. Obtener siempre
un correo verificado requiere un flujo de inicio de sesión y validación de identidad
adicional. No se cambiaron los permisos de acceso del formulario.

Referencia: https://developers.google.com/apps-script/reference/base/session

## Etiquetas nuevas

El enlace base definitivo es:
https://script.google.com/macros/s/AKfycbyloFTlhmSDMk5zlMUyC95zBX68RIQxqLaoNI6f99flq5l-fuuYcpPyHctTEAeadnCgiw/exec

Para preseleccionar un equipo se agrega ?equipo=CODIGO_EQUIPO. Ejemplo de la foto:
https://script.google.com/macros/s/AKfycbyloFTlhmSDMk5zlMUyC95zBX68RIQxqLaoNI6f99flq5l-fuuYcpPyHctTEAeadnCgiw/exec?equipo=M-AA10-PCBOF

El equipo debe existir y estar activo en EQUIPOS. También se aceptan los parámetros
codigo y entry.88648657 en la URL de la aplicación nueva. Actualizar la misma
implementación mantiene estos enlaces.

## Etiquetas ya impresas

Se decodificó la foto del aire acondicionado y su contenido es:
https://docs.google.com/forms/d/e/1FAIpQLSeQIjapvPzRB9FnTT0L5Sr4QKfJ4puKHIWWAr-PUD2y8vh5dw/viewform?usp=pp_url&entry.88648657=M-AA10-PCBOF

Abre directamente Google Forms, no un redireccionador que controlemos. Cambiar el
nuevo Apps Script no modifica ese destino. Para conservar físicamente las etiquetas,
la opción es mantener ese Form y conectar sus envíos a la base nueva mediante un
activador de envío, con mapeo de campos e idempotencia por respuesta. El usuario
seguiría viendo el formulario viejo al escanear.

La conexión aún no está implementada ni activada. Antes se debe inspeccionar el
formulario con acceso de editor, sus campos y activadores actuales, y preparar una
prueba sin duplicar reportes ni notificaciones del sistema anterior. No se modificó
el Form viejo, sus destinos ni sus activadores. Para abrir directamente la interfaz
nueva, las etiquetas deben reemplazarse por QR con el enlace nuevo.

Referencia: https://developers.google.com/apps-script/guides/triggers/events
