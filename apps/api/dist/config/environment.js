import { z } from 'zod';
const environmentSchema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().min(1).default('127.0.0.1'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    WEB_ORIGIN: z.string().url().default('http://localhost:5173'),
    DATABASE_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    DEMO_MODE: z.stringbool().default(false),
    DEMO_ADMIN_EMAIL: z.string().email().optional(),
    DEMO_ADMIN_PASSWORD: z.string().min(12).optional(),
    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD: z.string().min(12).optional(),
}).superRefine((value, context) => {
    if (value.DEMO_MODE && (!value.DEMO_ADMIN_EMAIL || !value.DEMO_ADMIN_PASSWORD)) {
        context.addIssue({ code: 'custom', message: 'Demo admin credentials are required when DEMO_MODE=true' });
    }
});
export function validateEnvironment(input) {
    const result = environmentSchema.safeParse(input);
    if (!result.success) {
        throw new Error(`Invalid environment configuration: ${z.prettifyError(result.error)}`);
    }
    return result.data;
}
//# sourceMappingURL=environment.js.map