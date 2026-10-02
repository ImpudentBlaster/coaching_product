import { expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { notify } from './notify';
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn(),warning:vi.fn(),info:vi.fn(),dismiss:vi.fn()}}));
it('uses longer durations for errors and supports explicit persistent messages',()=>{
  notify.success('Saved.');notify.info('Processing.');notify.warning('Review needed.');notify.error('Try again.');
  expect(toast.success).toHaveBeenCalledWith('Saved.',{duration:3500});
  expect(toast.info).toHaveBeenCalledWith('Processing.',{duration:4000});
  expect(toast.warning).toHaveBeenCalledWith('Review needed.',{duration:5000});
  expect(toast.error).toHaveBeenCalledWith('Try again.',{duration:6500});
  notify.error('Reconnect to continue.',{duration:Infinity,id:'connection'});
  expect(toast.error).toHaveBeenLastCalledWith('Reconnect to continue.',{duration:Infinity,id:'connection'});
});
