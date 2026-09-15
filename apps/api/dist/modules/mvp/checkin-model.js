import { z } from 'zod';
export const fieldSchema = z.object({
    id: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/),
    label: z.string().trim().min(1).max(200),
    type: z.enum(['NUMBER', 'RATING', 'SHORT_TEXT', 'LONG_TEXT']),
    required: z.boolean().default(false),
    min: z.number().finite().min(-1000000).max(1000000).optional(),
    max: z.number().finite().min(-1000000).max(1000000).optional(),
    unit: z.string().trim().max(20).default(''),
    metric: z.boolean().default(false),
    flag: z.object({ operator: z.enum(['GT', 'LT']), value: z.number().finite().min(-1000000).max(1000000) }).optional(),
}).strict().superRefine((field, ctx) => {
    const numeric = field.type === 'NUMBER' || field.type === 'RATING';
    if (!numeric && (field.metric || field.flag || field.min !== undefined || field.max !== undefined))
        ctx.addIssue({ code: 'custom', message: 'Only numeric fields support ranges, metrics and flags' });
    if (numeric && field.min !== undefined && field.max !== undefined && field.min > field.max)
        ctx.addIssue({ code: 'custom', message: 'Minimum cannot exceed maximum' });
    if (field.type === 'RATING' && (field.min === undefined || field.max === undefined || !Number.isInteger(field.min) || !Number.isInteger(field.max)))
        ctx.addIssue({ code: 'custom', message: 'Ratings need integer minimum and maximum' });
});
export const definitionSchema = z.object({ name: z.string().trim().min(2).max(150), fields: z.array(fieldSchema).min(1).max(50) }).strict().refine(value => new Set(value.fields.map(field => field.id)).size === value.fields.length, 'Question IDs must be unique');
export function validateAnswers(definition, input, complete) {
    const raw = z.record(z.string(), z.union([z.string(), z.number().finite()])).parse(input);
    const valid = new Set(definition.fields.map(field => field.id));
    if (Object.keys(raw).some(id => !valid.has(id)))
        throw new Error('Unknown question in answers');
    const result = {};
    for (const field of definition.fields) {
        const value = raw[field.id];
        if (value === undefined || (typeof value === 'string' && !value.trim())) {
            if (complete && field.required)
                throw new Error(`${field.label} is required`);
            continue;
        }
        if (field.type === 'NUMBER' || field.type === 'RATING') {
            if (typeof value !== 'number' || value < (field.min ?? -1000000) || value > (field.max ?? 1000000) || (field.type === 'RATING' && !Number.isInteger(value)))
                throw new Error(`Check the value for ${field.label}`);
        }
        else if (typeof value !== 'string' || value.length > (field.type === 'SHORT_TEXT' ? 500 : 4000))
            throw new Error(`Check the text for ${field.label}`);
        result[field.id] = value;
    }
    return result;
}
export function flagsFor(definition, answers) {
    return definition.fields.filter(field => field.flag && typeof answers[field.id] === 'number' && (field.flag.operator === 'GT' ? Number(answers[field.id]) > field.flag.value : Number(answers[field.id]) < field.flag.value)).map(field => ({ id: field.id, label: field.label, value: answers[field.id] }));
}
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const date = new Date(`${value}T00:00:00Z`); return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value; }, 'Invalid date');
export function dueDates(start, frequency, count) {
    const base = new Date(`${start}T00:00:00Z`);
    return Array.from({ length: frequency === 'ONCE' ? 1 : count }, (_, index) => {
        const day = new Date(base);
        if (frequency === 'MONTHLY') {
            day.setUTCDate(1);
            day.setUTCMonth(day.getUTCMonth() + index);
            const last = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
            day.setUTCDate(Math.min(base.getUTCDate(), last));
        }
        else
            day.setUTCDate(day.getUTCDate() + index * (frequency === 'DAILY' ? 1 : frequency === 'BIWEEKLY' ? 14 : 7));
        return day.toISOString().slice(0, 10);
    });
}
//# sourceMappingURL=checkin-model.js.map