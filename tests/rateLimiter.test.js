"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
const redisService_1 = require("../src/services/redisService");
const capacity = 10;
const refillRate = 2;
function makeApp() {
    return (0, app_1.createApp)({
        rateLimiterOptions: {
            capacity,
            refillRate,
            clientIdExtractor: (req) => req.headers['x-client-id'] ?? req.ip
        }
    });
}
describe('RateLimiter Token Bucket', () => {
    const app = makeApp();
    beforeEach(async () => {
        await (0, redisService_1.resetClientBucket)('client-A');
        await (0, redisService_1.resetClientBucket)('client-B');
    });
    afterAll(async () => {
        await (0, redisService_1.shutdownRedis)();
    });
    test('allows requests under the limit', async () => {
        for (let i = 0; i < 5; i += 1) {
            const res = await (0, supertest_1.default)(app)
                .get('/api/hello')
                .set('x-client-id', 'client-A');
            expect(res.status).toBe(200);
        }
    });
    test('blocks requests over the limit', async () => {
        for (let i = 0; i < capacity; i += 1) {
            const res = await (0, supertest_1.default)(app)
                .get('/api/hello')
                .set('x-client-id', 'client-A');
            expect(res.status).toBe(200);
        }
        const rejected = await (0, supertest_1.default)(app)
            .get('/api/hello')
            .set('x-client-id', 'client-A');
        expect(rejected.status).toBe(429);
        expect(rejected.body).toEqual({
            error: 'Too Many Requests',
            retryAfter: Number(rejected.headers['retry-after'])
        });
    });
    test('includes correct rate limit headers', async () => {
        const res = await (0, supertest_1.default)(app)
            .get('/api/hello')
            .set('x-client-id', 'client-A');
        expect(res.status).toBe(200);
        expect(res.headers['x-ratelimit-limit']).toBe(capacity.toString());
        const remaining = Number(res.headers['x-ratelimit-remaining']);
        expect(remaining).toBeCloseTo(capacity - 1, 3);
        const resetMs = Number(res.headers['x-ratelimit-reset']);
        const now = Date.now();
        expect(resetMs).toBeGreaterThan(now);
        expect(resetMs).toBeLessThan(now + 20000);
    });
    test('uses independent buckets per clientId', async () => {
        for (let i = 0; i < capacity; i += 1) {
            const res = await (0, supertest_1.default)(app)
                .get('/api/hello')
                .set('x-client-id', 'client-A');
            expect(res.status).toBe(200);
        }
        const resB = await (0, supertest_1.default)(app)
            .get('/api/hello')
            .set('x-client-id', 'client-B');
        expect(resB.status).toBe(200);
    });
    test('refills tokens over time', async () => {
        for (let i = 0; i < capacity; i += 1) {
            const res = await (0, supertest_1.default)(app)
                .get('/api/hello')
                .set('x-client-id', 'client-A');
            expect(res.status).toBe(200);
        }
        await new Promise((resolve) => setTimeout(resolve, 1100));
        const res = await (0, supertest_1.default)(app)
            .get('/api/hello')
            .set('x-client-id', 'client-A');
        expect(res.status).toBe(200);
    });
});
