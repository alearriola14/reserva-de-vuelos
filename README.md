# Ejercicio 1 - Búsqueda de vuelos con caché

API NestJS que implementa `GET /flights`, búsqueda de vuelos por `origin`, `destination` y `date`, cacheada en Redis y respaldada por PostgreSQL.

## Requisitos

- Node.js 20 o superior.
- Docker (para Postgres, pgAdmin y Redis).

## Configuración

```bash
npm install
cp .env.example .env
docker compose up -d
```

Esto levanta tres servicios:

- **postgres** (`localhost:5432`) — base de datos `flights_db`.
- **pgadmin** (`http://localhost:5050`, login `admin@flights.local` / `admin`) — para inspeccionar la tabla `flights` visualmente.
- **redis** (`localhost:6379`) — caché de resultados de búsqueda.

Al iniciar, TypeORM sincroniza la tabla `flights` y se siembran ~10 vuelos de ejemplo (rutas SAL–MIA, SAL–GUA, SAL–PTY, PTY–SAL, MIA–SAL, SAL–MEX, MEX–SAL) si la tabla está vacía.

## Ejecutar

```bash
npm run start:dev
```

## Endpoint

`GET /flights` — query params opcionales:

| Param         | Formato      | Ejemplo      |
|---------------|--------------|--------------|
| `origin`      | código IATA  | `SAL`        |
| `destination` | código IATA  | `MIA`        |
| `date`        | `YYYY-MM-DD` | `2026-07-10` |

Respuesta:

```json
{
  "source": "database",
  "flights": [
    {
      "id": 1,
      "origin": "SAL",
      "destination": "MIA",
      "departureTime": "2026-07-10T08:00:00.000Z",
      "arrivalTime": "2026-07-10T11:30:00.000Z",
      "price": "289.99",
      "status": "available"
    }
  ]
}
```

`source` indica de dónde vino la respuesta: `"database"` (primera consulta o caché expirada) o `"redis"` (cache hit).

## Estrategia de llaves y TTL

- **Llave de caché**: `flights:search:{origin}:{destination}:{date}`. Cada filtro se normaliza (`origin`/`destination` a mayúsculas, `date` valida el formato `YYYY-MM-DD`) y se reemplaza por `"any"` cuando no se envía, para que cada combinación de filtros tenga una entrada de caché distinta y determinística. Ejemplos:
  - Sin filtros → `flights:search:any:any:any`
  - `?origin=SAL&destination=MIA` → `flights:search:SAL:MIA:any`
  - `?origin=SAL&destination=MIA&date=2026-07-10` → `flights:search:SAL:MIA:2026-07-10`
- **TTL**: 60 segundos, siguiendo la tabla de la Clase 21 — el precio y la disponibilidad de vuelos cambian con frecuencia, así que un TTL corto evita servir datos obsoletos por mucho tiempo sin sacrificar toda la ganancia de la caché.
- **Invalidación**: solo por expiración (no hay endpoints de escritura en este ejercicio). Si más adelante se agregan reservas/cancelaciones, esas operaciones deberían invalidar las llaves `flights:search:*` afectadas.
- El caché se implementa con `@nestjs/cache-manager` (`src/cache/redis-cache.module.ts`), inyectando `CACHE_MANAGER` en `FlightsService` en vez de depender del `CacheInterceptor` automático, para poder construir la llave manualmente a partir de los filtros.
- **Nota sobre el store de Redis**: la clase usa `cache-manager-ioredis-yet`, pero ese paquete solo es compatible con `cache-manager` v5 y este proyecto usa NestJS 11, cuyo `@nestjs/cache-manager` v3 requiere `cache-manager` v6+ (arquitectura basada en Keyv). Se usa `@keyv/redis` (`createKeyv`) en su lugar, que es el store de Redis oficial y mantenido para esa arquitectura — misma idea (Redis como backend de `cache-manager`), solo un paquete distinto por compatibilidad de versiones.

## Probar

```bash
# 1) Primera búsqueda: consulta Postgres, source: "database"
curl "http://localhost:3000/flights?origin=SAL&destination=MIA"

# 2) Misma búsqueda inmediatamente después: source: "redis" (cache hit)
curl "http://localhost:3000/flights?origin=SAL&destination=MIA"

# 3) Agregar el filtro de fecha genera una llave nueva (source: "database" otra vez)
curl "http://localhost:3000/flights?origin=SAL&destination=MIA&date=2026-07-10"

# 4) Esperar 60s y repetir el paso 1 -> vuelve a source: "database"
```

### Inspeccionar Redis con redis-cli

```bash
docker compose exec redis redis-cli KEYS "flights:search:*"
docker compose exec redis redis-cli TTL "flights:search:SAL:MIA:any"
docker compose exec redis redis-cli GET "flights:search:SAL:MIA:any"
```

### Inspeccionar Postgres con pgAdmin

1. Abrir `http://localhost:5050` e iniciar sesión con `admin@flights.local` / `admin`.
2. Agregar un nuevo servidor apuntando a host `postgres` (nombre del servicio de Docker), puerto `5432`, usuario `postgres`, password `postgres`.
3. Revisar la tabla `flights` dentro de la base `flights_db`.

## Colección de Postman

`postman/flights-api.postman_collection.json` incluye 5 requests listos para importar y probar el flujo completo (búsqueda sin filtros, cache miss, cache hit, filtro por fecha y combinación distinta de filtros).
