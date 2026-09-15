import { z } from 'zod';
export declare const fieldSchema: z.ZodObject<{
    id: z.ZodString;
    label: z.ZodString;
    type: z.ZodEnum<{
        NUMBER: "NUMBER";
        RATING: "RATING";
        SHORT_TEXT: "SHORT_TEXT";
        LONG_TEXT: "LONG_TEXT";
    }>;
    required: z.ZodDefault<z.ZodBoolean>;
    min: z.ZodOptional<z.ZodNumber>;
    max: z.ZodOptional<z.ZodNumber>;
    unit: z.ZodDefault<z.ZodString>;
    metric: z.ZodDefault<z.ZodBoolean>;
    flag: z.ZodOptional<z.ZodObject<{
        operator: z.ZodEnum<{
            GT: "GT";
            LT: "LT";
        }>;
        value: z.ZodNumber;
    }, z.core.$strip>>;
}, z.core.$strict>;
export declare const definitionSchema: z.ZodObject<{
    name: z.ZodString;
    fields: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        type: z.ZodEnum<{
            NUMBER: "NUMBER";
            RATING: "RATING";
            SHORT_TEXT: "SHORT_TEXT";
            LONG_TEXT: "LONG_TEXT";
        }>;
        required: z.ZodDefault<z.ZodBoolean>;
        min: z.ZodOptional<z.ZodNumber>;
        max: z.ZodOptional<z.ZodNumber>;
        unit: z.ZodDefault<z.ZodString>;
        metric: z.ZodDefault<z.ZodBoolean>;
        flag: z.ZodOptional<z.ZodObject<{
            operator: z.ZodEnum<{
                GT: "GT";
                LT: "LT";
            }>;
            value: z.ZodNumber;
        }, z.core.$strip>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type Definition = z.infer<typeof definitionSchema>;
export type Answers = Record<string, string | number>;
export declare function validateAnswers(definition: Definition, input: unknown, complete: boolean): Answers;
export declare function flagsFor(definition: Definition, answers: Answers): {
    id: string;
    label: string;
    value: string | number | undefined;
}[];
export declare const dateSchema: z.ZodString;
export declare function dueDates(start: string, frequency: 'ONCE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY', count: number): string[];
