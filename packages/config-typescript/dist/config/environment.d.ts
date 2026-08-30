import { z } from 'zod';
declare const environmentSchema: z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<{
        development: "development";
        test: "test";
        production: "production";
    }>>;
    API_HOST: z.ZodDefault<z.ZodString>;
    API_PORT: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    WEB_ORIGIN: z.ZodDefault<z.ZodString>;
    DATABASE_URL: z.ZodString;
}, z.core.$strip>;
export type Environment = z.infer<typeof environmentSchema>;
export declare function validateEnvironment(input: Record<string, unknown>): Environment;
export {};
