"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEnvironment = validateEnvironment;
const zod_1 = require("zod");
const environmentSchema = zod_1.z.object({
    NODE_ENV: zod_1.z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: zod_1.z.string().min(1).default('127.0.0.1'),
    API_PORT: zod_1.z.coerce.number().int().min(1).max(65535).default(3000),
    WEB_ORIGIN: zod_1.z.string().url().default('http://localhost:5173'),
    DATABASE_URL: zod_1.z.string().min(1),
});
function validateEnvironment(input) {
    const result = environmentSchema.safeParse(input);
    if (!result.success) {
        throw new Error(`Invalid environment configuration: ${zod_1.z.prettifyError(result.error)}`);
    }
    return result.data;
}
//# sourceMappingURL=environment.js.map