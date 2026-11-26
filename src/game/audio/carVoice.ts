import { gameConfig } from "../../config/gameConfig";
import { createRng } from "../sim/Rng";

export interface ToneLayer {
  readonly osc: OscillatorNode;
  readonly filter: BiquadFilterNode;
  readonly gain: GainNode;
}

export interface NoiseLayer {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

export interface CarVoice {
  readonly engine: ToneLayer;
  readonly accel: NoiseLayer;
  readonly squeal: NoiseLayer;
  hasPrev: boolean;
  prevX: number;
  prevY: number;
  prevAngle: number;
  speedFraction: number;
  throttle: number;
  lastSeen: number;
}

const ENGINE_FILTER_Q = 1;
const NOISE_BUFFER_SECONDS = 1;
const ACCEL_FILTER_HZ = 900;
const ACCEL_FILTER_Q = 0.7;
const SQUEAL_FILTER_HZ = 2500;
const SQUEAL_FILTER_Q = 6;

export function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.round(ctx.sampleRate * NOISE_BUFFER_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = createRng(gameConfig.visualSeed);
  for (let i = 0; i < length; i += 1) {
    data[i] = rng.next() * 2 - 1;
  }
  return buffer;
}

export function createNoiseLayer(
  ctx: AudioContext,
  noise: AudioBuffer,
  master: AudioNode,
  filterHz: number,
  filterQ: number,
): NoiseLayer {
  const source = ctx.createBufferSource();
  source.buffer = noise;
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = filterHz;
  filter.Q.value = filterQ;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(master);
  source.start();
  return { source, gain };
}

export function createToneLayer(
  ctx: AudioContext,
  master: AudioNode,
): ToneLayer {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = ENGINE_FILTER_Q;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  osc.connect(filter).connect(gain).connect(master);
  osc.start();
  return { osc, filter, gain };
}

export function createVoice(
  ctx: AudioContext,
  noise: AudioBuffer,
  master: AudioNode,
  lastSeen: number,
): CarVoice {
  return {
    engine: createToneLayer(ctx, master),
    accel: createNoiseLayer(
      ctx,
      noise,
      master,
      ACCEL_FILTER_HZ,
      ACCEL_FILTER_Q,
    ),
    squeal: createNoiseLayer(
      ctx,
      noise,
      master,
      SQUEAL_FILTER_HZ,
      SQUEAL_FILTER_Q,
    ),
    hasPrev: false,
    prevX: 0,
    prevY: 0,
    prevAngle: 0,
    speedFraction: 0,
    throttle: 0,
    lastSeen,
  };
}

export function stopVoice(voice: CarVoice): void {
  voice.engine.osc.stop();
  voice.accel.source.stop();
  voice.squeal.source.stop();
  voice.engine.osc.disconnect();
  voice.engine.filter.disconnect();
  voice.engine.gain.disconnect();
  voice.accel.source.disconnect();
  voice.accel.gain.disconnect();
  voice.squeal.source.disconnect();
  voice.squeal.gain.disconnect();
}
