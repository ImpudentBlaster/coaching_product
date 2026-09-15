import '@testing-library/jest-dom/vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {apiBlob,apiRequest} from '../../lib/api';
import {CheckinPhotos} from './checkin-photos';
vi.mock('../../lib/api',()=>({apiRequest:vi.fn(),apiBlob:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();vi.unstubAllGlobals();});
it('uploads binary photo data and reloads the private gallery',async()=>{
  vi.mocked(apiRequest).mockResolvedValue({photos:[]});
  render(<CheckinPhotos id="checkin"/>);
  await screen.findByText('No photos uploaded yet.');
  const file=new File(['photo'],'photo.png',{type:'image/png'});
  fireEvent.change(screen.getByLabelText('Add a photo'),{target:{files:[file]}});
  await waitFor(()=>expect(apiRequest).toHaveBeenCalledWith('/client/checkins/checkin/photos',{method:'POST',headers:{'content-type':'application/octet-stream'},body:file}));
  await waitFor(()=>expect(screen.getByLabelText('Add a photo')).not.toBeDisabled());
});
it('fetches photos with authorization and releases blob URLs on unmount',async()=>{
  const createObjectURL=vi.fn(()=> 'blob:private-photo'),revokeObjectURL=vi.fn();
  vi.stubGlobal('URL',{createObjectURL,revokeObjectURL});
  vi.mocked(apiRequest).mockResolvedValue({photos:[{id:'photo',createdAt:'2026-09-15'}]});
  vi.mocked(apiBlob).mockResolvedValue(new Blob(['image'],{type:'image/jpeg'}));
  const rendered=render(<CheckinPhotos id="checkin" coach locked/>);
  await screen.findByRole('img',{name:'Private check-in photo'});
  expect(apiBlob).toHaveBeenCalledWith('/coach/checkins/checkin/photos/photo');
  expect(screen.queryByLabelText('Add a photo')).not.toBeInTheDocument();
  rendered.unmount();expect(revokeObjectURL).toHaveBeenCalledWith('blob:private-photo');
});
