# Publicación estable y hoja QR

## Qué enlace imprimir

Usa la URL de una implementación con versión, terminada en `/exec`.
El enlace `/dev` es de pruebas y requiere permisos de edición del proyecto.
La dirección `/exec` se conserva al cambiar la versión de la MISMA implementación.
No caduca por publicar cambios de código, pero su funcionamiento depende de la
cuenta propietaria, los permisos, las cuotas y la disponibilidad de Google.

## Primera publicación

1. Entra con la cuenta propietaria en el editor de Mantenimiento PDT.
2. Verifica que aparecen `Telegram.gs` e `Instructivo.html`. Guarda los cambios.
3. Prueba primero el formulario mediante Implementar > Implementaciones de
   prueba (Deploy > Test deployments). La dirección termina en `/dev`.
4. Si ya tienes una implementación `/exec` elegida para uso definitivo, reutilízala
   mediante Administrar implementaciones; no necesitas crear otra.
5. Si aún no tienes una, usa Implementar > Nueva implementación (Deploy > New
   deployment), selecciona Aplicación web (Web app) y escribe la descripción
   «Producción - Mantenimiento PDT».
6. En Ejecutar como, selecciona tu cuenta propietaria. Para que una persona pueda
   escanear sin iniciar sesión en Google, el acceso debe ser Cualquier usuario,
   incluida la opción sin sesión si Google la muestra (Anyone / acceso anónimo).
   Esta elección hace accesible el formulario a quien tenga el enlace; no convierte
   el Sheet ni la carpeta de evidencias en archivos públicos.
7. Pulsa Implementar y completa la autorización de tu cuenta si Google la solicita.
8. Copia la URL de la aplicación web terminada en `/exec` y guarda también el ID
   de implementación. No confundas ese ID con el ID del proyecto Apps Script.
9. Abre el enlace en una ventana privada o en un teléfono sin sesión de propietario.
   Debe cargar la lista de ubicaciones y permitir el uso previsto sin pedir acceso.
10. Crea un reporte identificado como PRUEBA, conserva su número y comprueba que
    aparece en REPORTES, HISTORIAL_REPORTES y Telegram. Verifica Participar y Listo.
11. Abre esa misma URL añadiendo `?vista=instructivo`. Debe mostrar «Cómo realizar
    un reporte». El botón Abrir formulario debe regresar al formulario.

La prueba usa la base real configurada: no es un entorno aislado de datos.
Las evidencias conservan sus permisos de Drive; comprueba su acceso con las
personas que deban verlas, sin publicar toda la carpeta.

## Actualizaciones sin cambiar el QR

1. Guarda y verifica el código local, haz commit y ejecuta `clasp push` desde `app/`.
2. Comprueba `/dev`: muestra el código guardado más reciente. El `/exec` sigue en
   la versión publicada hasta que lo actualices explícitamente.
3. En Google, abre Implementar > Administrar implementaciones (Manage deployments).
4. Selecciona exactamente la implementación cuya URL imprimiste.
5. Pulsa el lápiz de edición. En Versión selecciona Nueva versión (New version),
   escribe una descripción breve y pulsa Implementar.
6. Comprueba que la URL y el ID de implementación siguen siendo los mismos.
7. Prueba de nuevo los dos QR, el envío de un reporte y las acciones de Telegram.
8. Si la nueva versión falla, edita esa misma implementación y selecciona la
   versión anterior. Esto revierte código, no cambios ya realizados en el Sheet.

No uses Nueva implementación para cada actualización: crea otra dirección.
No archives la implementación impresa. No hace falta reinstalar Telegram ni
cambiar el token por cada actualización normal del formulario.

Los activadores de Telegram ejecutan el código actual guardado del proyecto,
no quedan fijados a la versión web `/exec`. Prueba los cambios del bot teniendo
esto en cuenta. `clasp pull` descarga código remoto y puede sobrescribir archivos
locales: hazlo con el trabajo guardado y revisa Git; no publica cambios.

## Composición de la hoja

- Hoja Carta vertical (216 × 279 mm); el generador también admite A4.
- Logo original de Pan de Tata centrado en el encabezado.
- Un QR principal de 112 × 112 mm, negro sobre blanco, que abre el formulario.
- QR del instructivo de 38 × 38 mm en la esquina superior izquierda.
- Margen exterior de 15 mm y borde blanco libre alrededor de cada código.
- No se incluye el antiguo QR de inventario: el equipo se selecciona en el formulario.

El segundo QR es únicamente de ayuda. Se genera con la misma URL `/exec` y el
parámetro `?vista=instructivo`, por lo que permanece ligado a la misma publicación.

## Agregar el QR pequeño en Word, PowerPoint o Canva

1. Configura el documento en tamaño Carta vertical o A4 según el lugar de impresión.
2. Inserta `qr_instructivo.png` desde Archivo/Imagen. No uses una captura del QR.
3. Activa Mantener proporción y define ancho y alto de 3,8 cm, incluyendo el borde
   blanco. No lo recortes ni estires; la URL de Google es larga y necesita espacio.
4. En Word usa Ajustar texto > Delante del texto y fija su posición en la página.
   En PowerPoint o Canva colócalo como imagen sobre la hoja.
5. Ubícalo a 1,5 cm del borde izquierdo y 1,5 cm del borde superior.
6. Debajo escribe INSTRUCTIVO en negro, a 9-10 puntos. Conserva separación entre
   el texto y el código. El QR pequeño nunca debe cubrir el logo.
7. Inserta `qr_formulario.png` centrado, a 11,2 cm de ancho; conserva su borde blanco.
8. Inserta el logo original, sin deformar, y añade el título y las indicaciones.
9. Exporta a PDF con calidad de impresión. Imprime al 100 % o Tamaño real.
10. Escanea ambos QR en la impresión física con dos teléfonos. Comprueba los
    destinos y el funcionamiento antes de hacer copias o plastificar.
11. Coloca la hoja a una altura cómoda, con buena luz y sin reflejos. Evita chinches
    o adhesivos sobre los códigos. Si plastificas, comprueba otra vez el escaneo.

## Regenerar los archivos

El script `scripts/generar_material_qr.py` recibe la URL definitiva y el logo.
Requiere Python con `reportlab`, `qrcode`, `Pillow` y `zxing-cpp` para verificar.

```powershell
python scripts/generar_material_qr.py --url "URL_DEFINITIVA_TERMINADA_EN_EXEC" --logo "RUTA_AL_LOGO.png"
```

Rechaza enlaces `/dev`, IDs de proyecto y parámetros de equipo. Genera el afiche,
el instructivo del usuario, la guía de publicación y los PNG de ambos QR dentro
de `output/pdf/`. Decodifica los PNG y comprueba que coincidan con los destinos.

## Referencias oficiales

- https://developers.google.com/apps-script/concepts/deployments
- https://developers.google.com/apps-script/guides/web
- https://developers.google.com/apps-script/manifest/web-app-api-executable
