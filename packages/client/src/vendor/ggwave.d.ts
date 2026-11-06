export type GGWaveParameters = { sampleRateInp: number; sampleRateOut: number; [name: string]: unknown };
export type GGWaveInstance = number;
export interface GGWave {
 disableLog(): void;
 getDefaultParameters(): GGWaveParameters;
 init(parameters: GGWaveParameters): GGWaveInstance;
 encode(instance: GGWaveInstance, text: string, protocolId: number, volume: number): Int8Array;
 decode(instance: GGWaveInstance, data: Int8Array): Uint8Array | null;
 ProtocolId?: Record<string, number>;
 TxProtocolId?: Record<string, number>;
}
declare const ggwaveFactory: () => Promise<GGWave>;
export default ggwaveFactory;
