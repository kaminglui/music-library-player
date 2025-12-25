declare module 'essentia.js/dist/essentia.js-core.es.js' {
  type EssentiaVector = unknown;

  type RhythmResult = {
    ticks?: ArrayLike<number>;
  };

  type KeyResult = {
    key?: string;
    scale?: string;
    firstToSecondRelativeStrength?: number;
    strength?: number;
  };

  class Essentia {
    constructor(wasm: unknown);
    arrayToVector(input: Float32Array | Float64Array | number[]): EssentiaVector;
    vectorToArray(input: unknown): ArrayLike<number>;
    RhythmExtractor2013(
      vector: EssentiaVector,
      bpmMax: number,
      method: string,
      bpmMin: number,
    ): RhythmResult;
    KeyExtractor(...args: unknown[]): KeyResult;
  }

  export default Essentia;
}

declare module 'essentia.js/dist/essentia-wasm.es.js' {
  export const EssentiaWASM: unknown;
}
