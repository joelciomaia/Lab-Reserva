const DEFAULT_IMAGE_SIZE = 1200;
const DEFAULT_IMAGE_PADDING = 72;
const DEFAULT_JPEG_QUALITY = 0.94;

export interface SvgToJpegDependencies {
  createCanvas: () => HTMLCanvasElement;
  createImage: () => HTMLImageElement;
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  serializeSvg: (svg: SVGSVGElement) => string;
}

export interface SvgToJpegOptions {
  size?: number;
  padding?: number;
  quality?: number;
}

function getBrowserDependencies(): SvgToJpegDependencies {
  return {
    createCanvas: () => document.createElement('canvas'),
    createImage: () => new Image(),
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    serializeSvg: (svg) => new XMLSerializer().serializeToString(svg),
  };
}

function loadImage(image: HTMLImageElement, source: string): Promise<void> {
  return new Promise((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Não foi possível renderizar o QR Code.'));
    image.src = source;
  });
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error('O navegador não conseguiu gerar a imagem JPG.'));
      },
      'image/jpeg',
      quality,
    );
  });
}

export async function svgToJpegBlob(
  svg: SVGSVGElement,
  options: SvgToJpegOptions = {},
  dependencies: SvgToJpegDependencies = getBrowserDependencies(),
): Promise<Blob> {
  const size = options.size ?? DEFAULT_IMAGE_SIZE;
  const padding = options.padding ?? DEFAULT_IMAGE_PADDING;
  const quality = options.quality ?? DEFAULT_JPEG_QUALITY;

  if (size <= 0 || padding < 0 || padding * 2 >= size || quality <= 0 || quality > 1) {
    throw new Error('As dimensões configuradas para o QR Code são inválidas.');
  }

  const serializedSvg = dependencies.serializeSvg(svg);
  const svgBlob = new Blob([serializedSvg], { type: 'image/svg+xml;charset=utf-8' });
  const svgObjectUrl = dependencies.createObjectUrl(svgBlob);

  try {
    const image = dependencies.createImage();
    await loadImage(image, svgObjectUrl);

    const canvas = dependencies.createCanvas();
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('O navegador não oferece suporte para gerar a imagem do QR Code.');
    }

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, size, size);
    context.drawImage(image, padding, padding, size - padding * 2, size - padding * 2);

    return await canvasToJpegBlob(canvas, quality);
  } finally {
    dependencies.revokeObjectUrl(svgObjectUrl);
  }
}

export async function downloadQrCodeAsJpeg(svg: SVGSVGElement, fileName: string): Promise<void> {
  const jpegBlob = await svgToJpegBlob(svg);
  const jpegObjectUrl = URL.createObjectURL(jpegBlob);
  const downloadAnchor = document.createElement('a');

  try {
    downloadAnchor.href = jpegObjectUrl;
    downloadAnchor.download = fileName;
    downloadAnchor.hidden = true;
    document.body.append(downloadAnchor);
    downloadAnchor.click();

    // Keep the URL alive until the browser has consumed the synthetic click.
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  } finally {
    downloadAnchor.remove();
    URL.revokeObjectURL(jpegObjectUrl);
  }
}
