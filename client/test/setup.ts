import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverMock,
  });

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  Object.defineProperty(window, 'requestAnimationFrame', {
    writable: true,
    value: () => 0,
  });

  Object.defineProperty(window, 'cancelAnimationFrame', {
    writable: true,
    value: () => {},
  });

  if (typeof Element !== 'undefined' && !Element.prototype.scrollTo) {
    Object.defineProperty(Element.prototype, 'scrollTo', {
      writable: true,
      value: () => {},
    });
  }

  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    writable: true,
    value: () => Promise.resolve(),
  });

  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    writable: true,
    value: () => {},
  });

  if (!('PointerEvent' in window)) {
    Object.defineProperty(window, 'PointerEvent', {
      writable: true,
      value: MouseEvent,
    });
  }
}

if (typeof document !== 'undefined' && !document.elementFromPoint) {
  Object.defineProperty(document, 'elementFromPoint', {
    writable: true,
    value: () => null,
  });
}

class WorkerMock {
  onmessage: ((event: MessageEvent) => void) | null = null;

  postMessage() {}

  terminate() {}
}

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'Worker', {
    writable: true,
    value: WorkerMock,
  });
}
