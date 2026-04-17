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
describe('RateLimiter Lua atomicity under burst load', () => {
    const app = (0, app_1.createApp)({
        rateLimiterOptions: {
            capacity,
            refillRate,
            clientIdExtractor: (req) => req.headers['x-client-id'] ?? req.ip
        }
    });
    afterAll(async () => {
        await (0, redisService_1.shutdownRedis)();
    });
    test('20 concurrent requests yield exactly capacity allows', async () => {
        await (0, redisService_1.resetClientBucket)('burst-client');
        const clientId = 'burst-client';
        const reqCount = 20;
        const startedAt = Date.now();
        const results = await Promise.all(Array.from({ length: reqCount }, async (_, i) => {
            const resolvedAt = Date.now();
            const res = await (0, supertest_1.default)(app)
                .get('/api/hello')
                .set('x-client-id', clientId);
            return { i, status: res.status, resolvedAt, durationMs: Date.now() - startedAt };
        }));
        const ok = results.filter((r) => r.status === 200).length;
        const rejected = results.filter((r) => r.status === 429).length;
        // eslint-disable-next-line no-console
        console.log('Burst load results', results.map((r) => ({ i: r.i, status: r.status, durationMs: r.durationMs })));
        expect(ok).toBe(capacity);
        expect(rejected).toBe(reqCount - capacity);
    });
});
