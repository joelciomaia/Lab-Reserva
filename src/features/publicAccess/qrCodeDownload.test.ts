import { describe, expect, it, vi } from 'vitest';
import type { SvgToJpegDependencies } from './qrCodeDownload';
import { svgToJpegBlob } from './qrCodeDownload';

function createSvg(): SVGSVGElement {
  return document.createElementNS('http://www.w3.org/2000/svg', 'svg');
}

function createImageThatDispatches(eventName: 'load' | 'error'): HTMLImageElement {
  const image = document.createElement('img');
  Object.defineProperty(image, 'src', {
    configurable: true,
    set: () => image.dispatchEvent(new Event(eventName)),
  });
  return image;
}

function createDependencies({
  canvas,
  image = createImageThatDispatches('load'),
}: {
  canvas: HTMLCanvasElement;
  image?: HTMLImageElement;
}) {
  const createObjectUrl = vi.fn(() => 'blob:qr-svg');
  const revokeObjectUrl = vi.fn();
  const dependencies: SvgToJpegDependencies = {
    createCanvas: () => canvas,
    createImage: () => image,
    createObjectUrl,
    revokeObjectUrl,
    serializeSvg: () => '<svg xmlns="http://www.w3.org/2000/svg" />',
  };

  return { createObjectUrl, dependencies, revokeObjectUrl };
}

describe('svgToJpegBlob', () => {
  it('gera um JPG com fundo branco e margem sem depender de canvas real', async () => {
    const jpegBlob = new Blob(['jpeg'], { type: 'image/jpeg' });
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    const context = {
      drawImage,
      fillRect,
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      height: 0,
      width: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback: BlobCallback) => callback(jpegBlob)),
    } as unknown as HTMLCanvasElement;
    const { dependencies, revokeObjectUrl } = createDependencies({ canvas });

    await expect(
      svgToJpegBlob(createSvg(), { padding: 50, size: 1000 }, dependencies),
    ).resolves.toBe(jpegBlob);

    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(1000);
    expect(context.fillStyle).toBe('#ffffff');
    expect(fillRect).toHaveBeenCalledWith(0, 0, 1000, 1000);
    expect(drawImage).toHaveBeenCalledWith(expect.any(HTMLImageElement), 50, 50, 900, 900);
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:qr-svg');
  });

  it('revoga a URL temporária quando a imagem SVG falha', async () => {
    const canvas = {} as HTMLCanvasElement;
    const { dependencies, revokeObjectUrl } = createDependencies({
      canvas,
      image: createImageThatDispatches('error'),
    });

    await expect(svgToJpegBlob(createSvg(), {}, dependencies)).rejects.toThrow(
      'renderizar o QR Code',
    );
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:qr-svg');
  });

  it('informa quando o navegador não fornece um contexto 2D', async () => {
    const canvas = {
      getContext: vi.fn(() => null),
    } as unknown as HTMLCanvasElement;
    const { dependencies, revokeObjectUrl } = createDependencies({ canvas });

    await expect(svgToJpegBlob(createSvg(), {}, dependencies)).rejects.toThrow(
      'não oferece suporte',
    );
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:qr-svg');
  });
});
