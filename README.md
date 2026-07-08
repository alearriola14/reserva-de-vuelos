# Reserva de vuelos con caché

API NestJS que implementa la búsqueda de vuelos (`GET /flights`) y el mapa de asientos por vuelo (`GET/PATCH /flights/:id/seats`), ambos cacheados en Redis y respaldados por PostgreSQL.

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
- **pgadmin** (`http://localhost:5050`, login `admin@flights.com` / `admin`) — para inspeccionar la tabla `flights` visualmente.
- **redis** (`localhost:6379`) — caché de resultados de búsqueda y de mapas de asientos.

Al iniciar, TypeORM sincroniza las tablas `flights` y `seats`, y se siembran ~10 vuelos de ejemplo (rutas SAL–MIA, SAL–GUA, SAL–PTY, PTY–SAL, MIA–SAL, SAL–MEX, MEX–SAL) junto con ~12 asientos por vuelo (filas 1-4 económica, 5-6 negocio) si las tablas están vacías.

## Ejecutar

```bash
npm run start:dev
```

## Ejercicio 1 - Búsqueda de vuelos (`GET /flights`)

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

### Estrategia de llaves y TTL

- **Llave de caché**: `flights:search:{origin}:{destination}:{date}`. Cada filtro se normaliza (`origin`/`destination` a mayúsculas, `date` valida el formato `YYYY-MM-DD`) y se reemplaza por `"any"` cuando no se envía, para que cada combinación de filtros tenga una entrada de caché distinta y determinística. Ejemplos:
  - Sin filtros → `flights:search:any:any:any`
  - `?origin=SAL&destination=MIA` → `flights:search:SAL:MIA:any`
  - `?origin=SAL&destination=MIA&date=2026-07-10` → `flights:search:SAL:MIA:2026-07-10`
- **TTL**: 60 segundos, siguiendo la tabla de la Clase 21 — el precio y la disponibilidad de vuelos cambian con frecuencia, así que un TTL corto evita servir datos obsoletos por mucho tiempo sin sacrificar toda la ganancia de la caché.
- **Invalidación**: solo por expiración (no hay endpoints de escritura sobre vuelos en este ejercicio). Si más adelante se agregan reservas/cancelaciones a nivel de vuelo, esas operaciones deberían invalidar las llaves `flights:search:*` afectadas.
- El caché se implementa con `@nestjs/cache-manager` (`src/cache/redis-cache.module.ts`), inyectando `CACHE_MANAGER` en `FlightsService` en vez de depender del `CacheInterceptor` automático, para poder construir la llave manualmente a partir de los filtros.
- **Nota sobre el store de Redis**: la clase usa `cache-manager-ioredis-yet`, pero ese paquete solo es compatible con `cache-manager` v5 y este proyecto usa NestJS 11, cuyo `@nestjs/cache-manager` v3 requiere `cache-manager` v6+ (arquitectura basada en Keyv). Se usa `@keyv/redis` (`createKeyv`) en su lugar, que es el store de Redis oficial y mantenido para esa arquitectura — misma idea (Redis como backend de `cache-manager`), solo un paquete distinto por compatibilidad de versiones.

### Probar

```bash
# 1) Primera búsqueda: consulta Postgres, source: "database"
curl "http://localhost:3000/flights?origin=SAL&destination=MIA"

# 2) Misma búsqueda inmediatamente después: source: "redis" (cache hit)
curl "http://localhost:3000/flights?origin=SAL&destination=MIA"

# 3) Agregar el filtro de fecha genera una llave nueva (source: "database" otra vez)
curl "http://localhost:3000/flights?origin=SAL&destination=MIA&date=2026-07-10"

# 4) Esperar 60s y repetir el paso 1 -> vuelve a source: "database"
```

```bash
docker compose exec redis redis-cli KEYS "flights:search:*"
docker compose exec redis redis-cli TTL "flights:search:SAL:MIA:any"
docker compose exec redis redis-cli GET "flights:search:SAL:MIA:any"
```

## Ejercicio 2 - Mapa de asientos por vuelo (`GET/PATCH /flights/:id/seats`)

`GET /flights/:id/seats` retorna el mapa de asientos de un vuelo específico. `PATCH /flights/:id/seats/:seatId` cambia el estado de un asiento (`available`/`held`/`booked`) e invalida la caché de ese vuelo.

Respuesta de `GET /flights/1/seats`:

```json
{
  "source": "database",
  "seats": [
    { "id": 1, "flightId": 1, "seatNumber": "5A", "class": "business", "status": "available" },
    { "id": 2, "flightId": 1, "seatNumber": "5B", "class": "business", "status": "available" }
  ]
}
```

`PATCH /flights/1/seats/1` con body `{ "status": "held" }` devuelve el asiento actualizado y responde `400` si `status` no es uno de `available`/`held`/`booked`, o `404` si el vuelo o el asiento no existen.

### Estrategia de llaves y TTL

- **Llave de caché**: `flights:{id}:seats` (el id del vuelo, sin depender de ningún filtro adicional).
- **TTL**: 30 segundos, siguiendo la tabla de la Clase 21 — más corto que el de búsqueda porque la disponibilidad de asientos de un vuelo puntual cambia con más frecuencia relativa que el listado general de vuelos.
- **Invalidación**: activa, no solo por expiración. Cada `PATCH` que cambia el estado de un asiento borra la llave `flights:{id}:seats` de ese vuelo (`cacheManager.del`) inmediatamente después de que el cambio se guarda en Postgres, para que el siguiente `GET` refleje el nuevo estado sin esperar el TTL.
- Misma arquitectura que en Ejercicio 1: `SeatsService` (`src/flights/seats/seats.service.ts`) inyecta `CACHE_MANAGER` directamente y construye la llave a mano.

### ¿En qué momento debe invalidarse la caché si dos usuarios consultan el mismo vuelo y uno reserva un asiento inmediatamente después?

Debe invalidarse **justo después de que la escritura se confirma en la base de datos** (después del `save()` exitoso), nunca antes: si se invalidara antes de escribir y la reserva fallara (por ejemplo, el asiento ya estaba tomado), se habría borrado una caché válida sin necesidad. Tampoco puede depender solo del TTL —30s es una red de seguridad, no el mecanismo principal—, porque durante esos 30 segundos cualquier otro usuario vería un mapa de asientos desactualizado.

Esto deja una carrera irreducible del lado del cliente: el usuario que ya había recibido el mapa de asientos *antes* de la reserva del otro usuario se queda con una copia desactualizada en su propio cliente — invalidar la caché del servidor no puede arreglar eso retroactivamente. Por eso importa la política de que "la caché nunca es la fuente de verdad": la propia operación de reserva debe validar disponibilidad contra la base de datos (no contra lo que el cliente vio en un `GET` anterior). La invalidación de caché es una optimización para que el *siguiente* `GET` esté fresco, no una garantía de consistencia para decisiones de reserva.

### Probar

```bash
# 1) Primera consulta del mapa de asientos: source: "database"
curl "http://localhost:3000/flights/1/seats"

# 2) Misma consulta inmediatamente después: source: "redis" (cache hit)
curl "http://localhost:3000/flights/1/seats"

# 3) Reservar el asiento 1 -> invalida flights:1:seats
curl -X PATCH "http://localhost:3000/flights/1/seats/1" -H "Content-Type: application/json" -d '{"status":"held"}'

# 4) Repetir el paso 1 -> vuelve a source: "database" y el asiento 1 aparece como "held"
curl "http://localhost:3000/flights/1/seats"
```

```bash
docker compose exec redis redis-cli KEYS "flights:*:seats"
docker compose exec redis redis-cli TTL "flights:1:seats"
```

### Inspeccionar Postgres con pgAdmin

1. Abrir `http://localhost:5050` e iniciar sesión con `admin@flights.com` / `admin`.
2. Agregar un nuevo servidor apuntando a host `postgres` (nombre del servicio de Docker), puerto `5432`, usuario `postgres`, password `postgres`.
3. Revisar las tablas `flights` y `seats` dentro de la base `flights_db`.

## Colección de Postman

`postman/flights-api.postman_collection.json` incluye 12 requests organizados en dos carpetas — "Ejercicio 1 - Busqueda de vuelos" (6 requests: sin filtros, cache miss, cache hit, filtro por fecha, combinación distinta de filtros y fecha inválida) y "Ejercicio 2 - Mapa de asientos" (6 requests: primera consulta, cache hit, reserva de un asiento vía `PATCH`, consulta post-invalidación, vuelo inexistente y status inválido) — listos para importar y probar ambos flujos completos.
