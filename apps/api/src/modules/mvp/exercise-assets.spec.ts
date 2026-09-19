import {describe,expect,it,vi} from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import {exerciseGifFilename,isGifSignature,exerciseImagesDirectory,repositoryRoot,normalizeExerciseGif} from './exercise-assets.js';

describe('exercise GIF assets',()=>{
  it('preserves leading zeroes when deriving the GIF filename',()=>expect(exerciseGifFilename('0001')).toBe('0001.gif'));
  it('rejects unsafe path construction',()=>expect(()=>exerciseGifFilename('../0001')).toThrow('UNSAFE_EXERCISE_ID'));
  it('accepts GIF signatures and rejects other content',()=>{expect(isGifSignature(Buffer.from('GIF89a'))).toBe(true);expect(isGifSignature(Buffer.from('notgif'))).toBe(false);});
  it('resolves media independently of the process working directory',()=>{
    const original=exerciseImagesDirectory();const cwd=vi.spyOn(process,'cwd').mockReturnValue(resolve(repositoryRoot,'tmp'));
    try{expect(exerciseImagesDirectory()).toBe(original);}finally{cwd.mockRestore();}
  });
  it('preserves animation frames when validating an uploaded GIF',async()=>{
    const bytes=await readFile(resolve(exerciseImagesDirectory(),'0001.gif'));
    const original=await sharp(bytes,{animated:true}).metadata();
    const normalized=await sharp(await normalizeExerciseGif(bytes),{animated:true}).metadata();
    expect(original.pages).toBeGreaterThan(1);expect(normalized.pages).toBe(original.pages);
  });
});
