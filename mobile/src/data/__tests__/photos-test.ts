import { pickPhoto } from '../photos';

const mockLaunch = jest.fn();
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: (...a: unknown[]) => mockLaunch(...a) }));
const mockSave = jest.fn();
const mockResize = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({ resize: (r: unknown) => (mockResize(r), { renderAsync: async () => ({ saveAsync: (o: unknown) => mockSave(o) }) }) }),
  },
}));

beforeEach(() => {
  mockLaunch.mockReset();
  mockSave.mockReset();
  mockResize.mockReset();
});

describe('pickPhoto', () => {
  it('cancelled: nothing', async () => {
    mockLaunch.mockResolvedValue({ canceled: true, assets: null });
    expect(await pickPhoto('post')).toBeNull();
  });

  it('re-encodes on the device as a downsized JPEG (pixels only, no EXIF requested)', async () => {
    mockLaunch.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///a.heic', width: 4032, height: 3024 }] });
    mockSave.mockResolvedValue({ base64: '/9j/4AAQ', width: 1280, height: 960 });
    const p = await pickPhoto('post');
    expect(p).toEqual({ dataUri: 'data:image/jpeg;base64,/9j/4AAQ', width: 1280, height: 960 });
    expect(mockLaunch).toHaveBeenCalledWith(expect.objectContaining({ exif: false, mediaTypes: ['images'] }));
    expect(mockResize).toHaveBeenCalledWith({ width: 1280 });
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({ format: 'jpeg', base64: true }));
  });

  it('tries lower quality, then refuses rather than sending something the server would reject', async () => {
    mockLaunch.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///a.jpg', width: 300, height: 300 }] });
    mockSave.mockResolvedValue({ base64: `/9j/${'A'.repeat(70_000)}`, width: 256, height: 256 });
    await expect(pickPhoto('avatar')).rejects.toThrow('PHOTO_TOO_LARGE');
    expect(mockSave).toHaveBeenCalledTimes(3);
  });
});
