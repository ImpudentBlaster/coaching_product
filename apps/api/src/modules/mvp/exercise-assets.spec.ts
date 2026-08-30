import {describe,expect,it} from 'vitest';
import {exerciseGifFilename,isGifSignature} from './exercise-assets.js';

describe('exercise GIF assets',()=>{
  it('preserves leading zeroes when deriving the GIF filename',()=>expect(exerciseGifFilename('0001')).toBe('0001.gif'));
  it('rejects unsafe path construction',()=>expect(()=>exerciseGifFilename('../0001')).toThrow('UNSAFE_EXERCISE_ID'));
  it('accepts GIF signatures and rejects other content',()=>{expect(isGifSignature(Buffer.from('GIF89a'))).toBe(true);expect(isGifSignature(Buffer.from('notgif'))).toBe(false);});
});
