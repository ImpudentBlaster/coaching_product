import sharp from 'sharp';
import {expect,it} from 'vitest';
import {normalizeCheckinPhoto} from './checkin-photo-storage.js';

it('decodes photos, corrects orientation and strips metadata',async()=>{
  const input=await sharp({create:{width:8,height:4,channels:3,background:'#445566'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  expect((await sharp(input).metadata()).exif).toBeDefined();
  const output=await normalizeCheckinPhoto(input);
  const metadata=await sharp(output).metadata();
  expect(metadata.format).toBe('jpeg');expect(metadata.width).toBe(4);expect(metadata.height).toBe(8);
  expect(metadata.exif).toBeUndefined();expect(metadata.orientation).toBeUndefined();
});
it('rejects non-photos, unsupported formats and oversized input',async()=>{
  await expect(normalizeCheckinPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).rejects.toThrow();
  await expect(normalizeCheckinPhoto(Buffer.alloc(8*1024*1024+1))).rejects.toThrow('8 MB');
  const gif=await sharp({create:{width:2,height:2,channels:3,background:'#445566'}}).gif().toBuffer();
  await expect(normalizeCheckinPhoto(gif)).rejects.toThrow();
});
