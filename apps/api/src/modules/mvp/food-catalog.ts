import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { z } from 'zod';

const amount=z.number().finite().nonnegative();
const catalogSchema=z.object({version:z.literal(1),foods:z.array(z.object({
  id:z.string().regex(/^usda-\d+$/),category:z.string().min(1),
  source:z.object({name:z.string(),fdcId:z.number().int().positive(),description:z.string(),url:z.url()}),
  data:z.object({kind:z.literal('foods'),name:z.string().min(2).max(150),notes:z.string().max(2000),servingSize:z.literal(100),unit:z.literal('g'),nutrients:z.object({calories:amount,protein:amount,carbs:amount,fat:amount})}),
})).min(1)});

// Both src/modules/mvp and dist/modules/mvp resolve to the repository root.
export const foodCatalog=catalogSchema.parse(JSON.parse(readFileSync(new URL('../../../../../foods_1.json',import.meta.url),'utf8')) as unknown).foods;
if(new Set(foodCatalog.map(food=>food.id)).size!==foodCatalog.length)throw new Error('Duplicate starter food IDs');

// UUID v5 with a fixed application namespace makes repeated/concurrent adds
// idempotent per coach while keeping each coach's editable copy independent.
export function foodCopyId(coachId:string,foodId:string):string {
  const namespace=Buffer.from('9dcbbd4564b94d2c84e8fe3dc902bb04','hex');
  const bytes=createHash('sha1').update(namespace).update(`${coachId}/${foodId}`).digest().subarray(0,16);
  bytes[6]=(bytes[6]!&0x0f)|0x50;bytes[8]=(bytes[8]!&0x3f)|0x80;
  const hex=bytes.toString('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
