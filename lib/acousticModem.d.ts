export function initModem(): Promise<unknown>;
export function playChallengeTone(nonce:string, ultrasound?:boolean): Promise<void>;
export function stopChallengeTone(): void;
export function startAcousticListener(onDecoded:(value:string)=>void,onAudioLevel?:(level:number)=>void): Promise<boolean>;
export function stopAcousticListener(): void;
