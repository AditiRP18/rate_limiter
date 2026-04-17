# rate-limiter-service

A production-style Node.js + TypeScript HTTP microservice implementing a Redis-backed
Token Bucket rate limiter, with an Express middleware-compatible REST API and
containerized deployment.

## Why this project

This service is designed to demonstrate backend engineering skills: clean code
structure, real-world patterns (middleware, atomic state with Redis Lua),
and system design thinking around concurrency and rate limiting.

## Architecture

```text
Client
  |
  v
Express API
  |
  v
rateLimiter middleware (Token Bucket)
  |
  v
Redis (hash per client)
  |
  +--> Lua script: fetch -> compute -> save atomically
  |
  v
Allow/Reject (HTTP 200 vs 429)
```

## Token Bucket (Redis)

Each client gets a bucket identified by:
`rate_limit:{clientId}`

Bucket state is stored in a Redis hash:
- `tokens` (float): current token count
- `lastRefill` (ms since epoch): timestamp of last refill update

Per request:
1. Fetch `{tokens, lastRefill}` atomically via Lua
2. Compute `elapsedMs = now - lastRefill`
3. Refill: `tokensToAdd = (elapsedMs / 1000) * refillRate`
4. Cap: `newTokens = min(capacity, storedTokens + tokensToAdd)`
5. If `newTokens >= 1` deduct 1 token and allow
6. If `newTokens < 1` reject with `HTTP 429` (no deduction)

## Why a Lua script (atomicity)

Without atomicity, concurrent requests can race:
1. Request A and B both read the same token count.
2. Both compute that a token is available.
3. Both deduct and write back.
4. Result: the bucket allows more requests than its configured capacity.

This service uses `redis.defineCommand()` to register a Lua script that performs
fetch/compute/save as a single Redis operation, preventing the race condition
under bursty traffic.

## API

### Protected (rate limited)

| Method | Path        | Description                 | Rate limited |
|--------|--------------|-----------------------------|--------------|
| GET    | `/api/hello` | Dummy protected endpoint   | Yes          |
| GET    | `/api/data`  | Returns mock data array    | Yes          |
| POST   | `/api/submit` | Accepts body, echoes status | Yes       |

### Admin (no rate limit)

| Method | Path                      | Description |
|--------|---------------------------|-------------|
| GET    | `/admin/stats/:clientId` | Show bucket state + config for a client |
| GET    | `/admin/stats`          | List all active bucket keys using `SCAN` |
| DELETE | `/admin/reset/:clientId` | Delete a client bucket from Redis |

## Response headers (rate limiting)

Allowed and rejected responses include:
- `X-RateLimit-Limit`: bucket capacity
- `X-RateLimit-Remaining`: tokens remaining after this request (or current tokens on rejection)
- `X-RateLimit-Reset`: Unix timestamp in milliseconds when the bucket will be full again

Rejected responses also include:
- `Retry-After`: seconds until you should retry

Rejected body:
```json
{ "error": "Too Many Requests", "retryAfter": 2 }
```

Client identity:
- By default, `clientId` is `req.ip` (the value returned in `/api/hello`).

## Environment variables

Create `.env` from `.env.example`.

| Variable | Example | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP port |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | `""` | Redis password (optional) |
| `RATE_LIMIT_CAPACITY` | `10` | Max tokens per client |
| `RATE_LIMIT_REFILL_RATE` | `2` | Tokens added per second |
| `NODE_ENV` | `development` | Affects logging format |

## Setup

### Local (Redis running on your machine)

1. Start Redis locally (example: `brew services start redis`).
2. From this repo:
   - `npm install`
   - `cp .env.example .env`
3. Build + run:
   - `npm run build`
   - `npm start`
4. Call endpoints at `http://localhost:3000`.

### Docker (app + Redis)

1. `cp .env.example .env`
2. `docker compose up --build`
3. Service runs at `http://localhost:3000`.

## cURL examples

### `GET /api/hello` (rate limited)

```bash
curl -i http://localhost:3000/api/hello
```

The response includes `clientId`. Use it in admin calls below.

### `GET /api/data` (rate limited)

```bash
curl -i http://localhost:3000/api/data
```

### `POST /api/submit` (rate limited)

```bash
curl -i -X POST http://localhost:3000/api/submit \
  -H "Content-Type: application/json" \
  -d '{"foo":"bar"}'
```

### `GET /admin/stats/:clientId`

Replace `<clientId>` with the value from `/api/hello`.

```bash
curl -i http://localhost:3000/admin/stats/<clientId>
```

### `GET /admin/stats`

```bash
curl -i http://localhost:3000/admin/stats
```

### `DELETE /admin/reset/:clientId`

Replace `<clientId>` with the value from `/api/hello`.

```bash
curl -i -X DELETE http://localhost:3000/admin/reset/<clientId>
```

## Tests

The test suite requires Redis to be reachable at `REDIS_HOST` / `REDIS_PORT`.

1. Ensure Redis is running (locally or via Docker).
2. `cp .env.example .env` (if needed)
3. Run:
   - `npm test`
   - `npm run test:load`

## Potential improvements

1. Add sliding-window / leaky-bucket variants.
2. Per-route rate limit configuration (different capacity/refill per endpoint).
3. Rate limit by API key or user ID instead of `req.ip`.
4. Add Prometheus metrics (request counts, 429 rates, latency).

