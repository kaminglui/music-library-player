export const TARGET_SAMPLE_RATE = 44100;

export interface DecodedAudio {
  samples: Float32Array;
  sampleRate: number;
  duration: number;
}

export async function decodeAudioToMono(buffer: ArrayBuffer): Promise<DecodedAudio | null> {
  if (typeof AudioContext === 'undefined') {
    return null;
  }

  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(buffer.slice(0));
    if (typeof OfflineAudioContext !== 'undefined') {
      const targetLength = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
      const offlineContext = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);
      const source = offlineContext.createBufferSource();
      source.buffer = decoded;
      source.connect(offlineContext.destination);
      source.start(0);
      const rendered = await offlineContext.startRendering();
      return {
        samples: rendered.getChannelData(0),
        sampleRate: TARGET_SAMPLE_RATE,
        duration: decoded.duration,
      };
    }
    const mono = mixToMono(decoded);
    const resampled = resampleLinear(mono, decoded.sampleRate, TARGET_SAMPLE_RATE);
    return {
      samples: resampled,
      sampleRate: TARGET_SAMPLE_RATE,
      duration: decoded.duration,
    };
  } catch {
    return null;
  } finally {
    context.close().catch(() => null);
  }
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const { numberOfChannels, length } = buffer;
  if (numberOfChannels === 1) {
    return buffer.getChannelData(0).slice();
  }
  const mono = new Float32Array(length);
  for (let channel = 0; channel < numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      mono[i] += data[i];
    }
  }
  const scale = 1 / numberOfChannels;
  for (let i = 0; i < length; i += 1) {
    mono[i] *= scale;
  }
  return mono;
}

function resampleLinear(
  input: Float32Array,
  sourceRate: number,
  targetRate: number,
): Float32Array {
  if (sourceRate === targetRate) {
    return input;
  }
  const ratio = sourceRate / targetRate;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(newLength);
  for (let i = 0; i < newLength; i += 1) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const weight = position - left;
    output[i] = input[left] + (input[right] - input[left]) * weight;
  }
  return output;
}
