import '@testing-library/jest-dom/vitest';

Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  value: () => undefined,
});

Object.defineProperty(window, 'requestAnimationFrame', {
  configurable: true,
  value: (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 0),
});

Object.defineProperty(window, 'cancelAnimationFrame', {
  configurable: true,
  value: (id: number) => window.clearTimeout(id),
});
