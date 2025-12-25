import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeAudioToMono, TARGET_SAMPLE_RATE } from '../src/utils/audioAnalysis';

class FakeAudioBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  private channels: Float32Array[];

  constructor(channels: Float32Array[], sampleRate: number) {
    this.channels = channels;
    this.numberOfChannels = channels.length;
    this.length = channels[0]?.length ?? 0;
    this.sampleRate = sampleRate;
    this.duration = this.length / sampleRate;
  }

  getChannelData(index: number) {
    return this.channels[index];
  }
}

class FakeBufferSource {
  buffer: FakeAudioBuffer | null = null;
  connect() {}
  start() {}
}

let lastOfflineArgs: { channels: number; length: number; sampleRate: number } | null = null;
let renderFill = 0.5;

class FakeOfflineAudioContext {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  destination = {};

  constructor(channels: number, length: number, sampleRate: number) {
    this.numberOfChannels = channels;
    this.length = length;
    this.sampleRate = sampleRate;
    lastOfflineArgs = { channels, length, sampleRate };
  }

  createBufferSource() {
    return new FakeBufferSource();
  }

  startRendering() {
    const data = new Float32Array(this.length).fill(renderFill);
    return Promise.resolve(new FakeAudioBuffer([data], this.sampleRate));
  }
}

const originalAudioContext = globalThis.AudioContext;
const originalOfflineAudioContext = globalThis.OfflineAudioContext;

afterEach(() => {
  if (originalAudioContext) {
    globalThis.AudioContext = originalAudioContext;
  } else {
    Reflect.deleteProperty(globalThis as object, 'AudioContext');
  }
  if (originalOfflineAudioContext) {
    globalThis.OfflineAudioContext = originalOfflineAudioContext;
  } else {
    Reflect.deleteProperty(globalThis as object, 'OfflineAudioContext');
  }
  lastOfflineArgs = null;
  renderFill = 0.5;
});

describe('decodeAudioToMono', () => {
  it('returns null when AudioContext is unavailable', async () => {
    Reflect.deleteProperty(globalThis as object, 'AudioContext');
    Reflect.deleteProperty(globalThis as object, 'OfflineAudioContext');
    const result = await decodeAudioToMono(new ArrayBuffer(8));
    expect(result).toBeNull();
  });

  it('uses OfflineAudioContext to mix and resample', async () => {
    const left = new Float32Array([1, 0, -1, 0, 1, 0, -1, 0]);
    const right = new Float32Array([0, 1, 0, -1, 0, 1, 0, -1]);
    const buffer = new FakeAudioBuffer([left, right], 48000);
    const close = vi.fn().mockResolvedValue(undefined);

    class FakeAudioContext {
      private buf = buffer;
      decodeAudioData() {
        return Promise.resolve(this.buf);
      }
      close() {
        return close();
      }
    }

    globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
    globalThis.OfflineAudioContext =
      FakeOfflineAudioContext as unknown as typeof OfflineAudioContext;

    const result = await decodeAudioToMono(new ArrayBuffer(8));
    const expectedLength = Math.max(1, Math.ceil(buffer.duration * TARGET_SAMPLE_RATE));

    expect(result).not.toBeNull();
    expect(result?.sampleRate).toBe(TARGET_SAMPLE_RATE);
    expect(result?.duration).toBeCloseTo(buffer.duration, 6);
    expect(result?.samples.length).toBe(expectedLength);
    expect(result?.samples[0]).toBeCloseTo(renderFill, 6);
    expect(lastOfflineArgs).toEqual({
      channels: 1,
      length: expectedLength,
      sampleRate: TARGET_SAMPLE_RATE,
    });
    expect(close).toHaveBeenCalled();
  });

  it('returns rendered mono data when input is already mono', async () => {
    const mono = new Float32Array([0.25, -0.25, 0.5]);
    const buffer = new FakeAudioBuffer([mono], TARGET_SAMPLE_RATE);
    const close = vi.fn().mockResolvedValue(undefined);

    class MonoAudioContext {
      private buf = buffer;
      decodeAudioData() {
        return Promise.resolve(this.buf);
      }
      close() {
        return close();
      }
    }

    renderFill = 0.25;
    globalThis.AudioContext = MonoAudioContext as unknown as typeof AudioContext;
    globalThis.OfflineAudioContext =
      FakeOfflineAudioContext as unknown as typeof OfflineAudioContext;

    const result = await decodeAudioToMono(new ArrayBuffer(4));
    const expectedLength = Math.max(1, Math.ceil(buffer.duration * TARGET_SAMPLE_RATE));

    expect(result?.samples).not.toBe(mono);
    expect(result?.samples.length).toBe(expectedLength);
    expect(result?.samples[0]).toBeCloseTo(renderFill, 6);
    expect(result?.sampleRate).toBe(TARGET_SAMPLE_RATE);
    expect(close).toHaveBeenCalled();
  });

  it('returns null on decode errors and still closes the context', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    class ErrorAudioContext {
      decodeAudioData() {
        return Promise.reject(new Error('fail'));
      }
      close() {
        return close();
      }
    }
    globalThis.AudioContext = ErrorAudioContext as unknown as typeof AudioContext;
    globalThis.OfflineAudioContext =
      FakeOfflineAudioContext as unknown as typeof OfflineAudioContext;

    const result = await decodeAudioToMono(new ArrayBuffer(4));
    expect(result).toBeNull();
    expect(close).toHaveBeenCalled();
  });
});
