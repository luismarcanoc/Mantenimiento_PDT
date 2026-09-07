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

