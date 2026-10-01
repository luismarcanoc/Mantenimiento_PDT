# Registro de equipos y control de acceso

El registrador es una aplicación separada del formulario público de reportes. Se
ejecuta como la persona que lo abre y exige una cuenta de Google. El enlace por sí
solo no autoriza a registrar equipos.

## Regla de codificación

El formato es `C-TTNN-EUUAA`:

- `C`: categoría general.
- `TT`: tipo de equipo.
- `NN`: consecutivo global de dos dígitos para ese tipo de equipo, sin importar la sede.
- `E`: empresa.
- `UU`: ubicación.
- `AA`: área.

Por ejemplo, `M-AA22-PCBOF` representa Maquinaria, Aire acondicionado global 22,
de la empresa P, Bello Campo y Oficina Producción. Además, `NUMERO_LOCAL_SEDE`
guarda su posición dentro de esa sede; podría mostrarse como `Aire acondicionado
#3`. Al guardar, el servidor vuelve a calcular ambos consecutivos dentro de un
bloqueo para evitar colisiones.

## Reemplazo de equipos

El modo **Reemplazar equipo** solo ofrece equipos inhabilitados del mismo tipo,
ubicación y área que aún no hayan sido reemplazados. El nuevo equipo recibe un ID
y código global nuevos, pero conserva el número local del equipo anterior. La fila
vieja no se elimina: queda con estado `REEMPLAZADO`, `ACTIVO = false` y una
referencia al nuevo ID. El nuevo registro guarda el ID y código anteriores. Así los
reportes históricos siguen asociados al equipo correcto.

Antes de usar esta versión por primera vez se ejecuta una vez
`prepararNumeracionesEquipos`, que agrega las columnas nuevas y completa la
numeración de los registros existentes sin modificar sus códigos.

## Dar acceso a una persona

Se requieren dos permisos para el mismo correo:

1. En el proyecto **Registro de Equipos PDT**, abre **Configuración del proyecto >
   Propiedades de la secuencia de comandos**. Crea o edita
   `EQUIPMENT_ADMIN_EMAILS` y escribe los correos autorizados separados por comas.
2. Comparte la base de datos de Mantenimiento PDT con esa cuenta como **Editor**.
3. Envía a la persona el enlace de la aplicación web del registrador.
4. En su primer ingreso debe iniciar sesión y aceptar los permisos solicitados por
   Google para identificar su correo y editar la hoja.

Si falta el primer permiso, el módulo muestra que la cuenta no está autorizada. Si
falta el segundo, la persona puede iniciar sesión pero Google no le permite escribir
en `EQUIPOS`.

Para retirar el acceso, elimina el correo de `EQUIPMENT_ADMIN_EMAILS` y también
retira su acceso de Editor en el archivo de Google Sheets. Hacer solo una de las dos
acciones deja un permiso innecesario.

La primera configuración también puede hacerse abriendo el editor de Apps Script y
ejecutando una vez `configurarAdministradorInicial`; la función guarda como primer
administrador la cuenta que la ejecuta únicamente cuando la propiedad todavía está
vacía.

## Datos registrados

La persona selecciona categoría, tipo, empresa, ubicación y área, y escribe nombre,
marca, modelo, información y un enlace de imagen opcional. El módulo completa ID,
código, estado activo y fechas. Devuelve además el enlace prellenado del formulario
de reportes para probar el equipo nuevo.

Las categorías y abreviaturas provienen de `Codificación de equipos .docx`. Cuando
aparezca una empresa, ubicación, área o tipo nuevo, primero debe incorporarse a esa
plantilla y después al catálogo de `registro_equipos/Config.js`.
