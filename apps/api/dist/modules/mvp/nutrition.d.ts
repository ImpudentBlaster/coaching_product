import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
export declare const nutrientsSchema: z.ZodObject<{
    calories: z.ZodNumber;
    protein: z.ZodNumber;
    carbs: z.ZodNumber;
    fat: z.ZodNumber;
}, z.core.$strip>;
type Nutrients = z.infer<typeof nutrientsSchema>;
export declare const nutritionInput: z.ZodDiscriminatedUnion<[z.ZodObject<{
    servingSize: z.ZodNumber;
    unit: z.ZodEnum<{
        g: "g";
        ml: "ml";
        piece: "piece";
    }>;
    nutrients: z.ZodObject<{
        calories: z.ZodNumber;
        protein: z.ZodNumber;
        carbs: z.ZodNumber;
        fat: z.ZodNumber;
    }, z.core.$strip>;
    name: z.ZodString;
    notes: z.ZodDefault<z.ZodString>;
    kind: z.ZodLiteral<"foods">;
}, z.core.$strip>, z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        quantity: z.ZodNumber;
    }, z.core.$strip>>;
    name: z.ZodString;
    notes: z.ZodDefault<z.ZodString>;
    kind: z.ZodLiteral<"meals">;
}, z.core.$strip>, z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
    }, z.core.$strip>>;
    name: z.ZodString;
    notes: z.ZodDefault<z.ZodString>;
    kind: z.ZodLiteral<"days">;
}, z.core.$strip>, z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
    }, z.core.$strip>>;
    name: z.ZodString;
    notes: z.ZodDefault<z.ZodString>;
    kind: z.ZodLiteral<"plans">;
}, z.core.$strip>], "kind">;
type Kind = z.infer<typeof nutritionInput>['kind'];
export type NutritionNode = {
    name: string;
    notes: string;
    kind: Kind;
    nutrients?: Nutrients;
    servingSize?: number;
    unit?: string;
    items?: Array<{
        id: string;
        label?: string;
        quantity?: number;
        node: NutritionNode;
        nutrients?: Nutrients;
    }>;
};
export declare function sumNutrients(values: Nutrients[]): Nutrients;
export declare function portion(nutrients: Nutrients, quantity: number, servingSize: number): Nutrients;
export declare function createNutritionCoachRouter(pool: Pool): Router;
export declare function createNutritionClientRouter(pool: Pool): Router;
export {};
