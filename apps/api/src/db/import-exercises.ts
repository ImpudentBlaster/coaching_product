import 'dotenv/config';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';
import { z } from 'zod';
import { repositoryRoot, exerciseImagesDirectory } from '../modules/mvp/exercise-assets.js';

const exerciseSchema=z.object({id:z.string().regex(/^[0-9A-Za-z_-]+$/),name:z.string().min(1),bodyPart:z.string().min(1),equipment:z.string().min(1),target:z.string().min(1),secondaryMuscles:z.array(z.string()),instructions:z.array(z.string())});
const databaseUrl=process.env.DATABASE_URL;if(!databaseUrl)throw new Error('DATABASE_URL is required');
const sourcePath=resolve(repositoryRoot,'exercises_1.json');const imageDirectory=exerciseImagesDirectory();
const exercises=z.array(exerciseSchema).parse(JSON.parse(await readFile(sourcePath,'utf8')) as unknown);const imageFiles=(await readdir(imageDirectory)).filter((file)=>file.toLowerCase().endsWith('.gif'));const imageSet=new Set(imageFiles);
const validImages=new Set<string>();for(const file of imageFiles){if(!/^[0-9A-Za-z_-]+\.gif$/i.test(file))continue;const bytes=await readFile(resolve(imageDirectory,file));const signature=bytes.subarray(0,6).toString('ascii');if(signature==='GIF87a'||signature==='GIF89a')validImages.add(file);}
const pool=new pg.Pool({connectionString:databaseUrl});let imported=0;
try{const client=await pool.connect();try{await client.query('BEGIN');for(const exercise of exercises){const gifAvailable=validImages.has(`${exercise.id}.gif`);await client.query(`INSERT INTO exercises(external_id,name,body_part,equipment,target,secondary_muscles,instructions,gif_available) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(external_id) DO UPDATE SET name=excluded.name,body_part=excluded.body_part,equipment=excluded.equipment,target=excluded.target,secondary_muscles=excluded.secondary_muscles,instructions=excluded.instructions,gif_available=excluded.gif_available,updated_at=now() WHERE exercises.owner_coach_id IS NULL`,[exercise.id,exercise.name,exercise.bodyPart,exercise.equipment,exercise.target,JSON.stringify(exercise.secondaryMuscles),JSON.stringify(exercise.instructions),gifAvailable]);imported++;}await client.query('COMMIT');}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}finally{await pool.end();}
const expected=new Set(exercises.map((exercise)=>`${exercise.id}.gif`));const missing=[...expected].filter((file)=>!validImages.has(file)).sort();const extra=[...imageSet].filter((file)=>!expected.has(file)).sort();console.info(JSON.stringify({imported,validGifFiles:validImages.size,missingGifCount:missing.length,missingGifFiles:missing,extraGifCount:extra.length,extraGifFiles:extra},null,2));
