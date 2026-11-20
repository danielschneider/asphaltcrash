import { gameConfig } from "../../config/gameConfig";
import { createRng } from "../sim/Rng";
import { CAR_FLAG, type CarView } from "../../types/game";
import {
  accelGain,
  distanceGain,
  engineFrequencyHz,
  engineGain,
  speedFractionFromDelta,
  squealGain,
  throttleFromSpeedChange,
  turnRateRadPerSec,
} from "./audioMath";

type AudioCtor = new () => AudioContext;

interface AudioGlobal {
  AudioContext?: AudioCtor;
  webkitAudioContext?: AudioCtor;
}

interface ToneLayer {
  readonly osc: OscillatorNode;
  readonly filter: BiquadFilterNode;
  readonly gain: GainNode;
}

interface NoiseLayer {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
}

interface CarVoice {
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

const TIME_CONSTANT_SECONDS = 0.05;
const THROTTLE_SMOOTH_SECONDS = 0.08;
const NOISE_BUFFER_SECONDS = 1;
const ENGINE_FILTER_BASE_HZ = 300;
const ENGINE_FILTER_PER_HZ = 6;
const ENGINE_FILTER_Q = 1;
const ACCEL_FILTER_HZ = 900;
const ACCEL_FILTER_Q = 0.7;
const SQUEAL_FILTER_HZ = 2500;
const SQUEAL_FILTER_Q = 6;

function resolveAudioContextCtor(): AudioCtor | null {
  const scope = globalThis as unknown as AudioGlobal;
  return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.round(ctx.sampleRate * NOISE_BUFFER_SECONDS);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = createRng(gameConfig.visualSeed);
  for (let i = 0; i < length; i += 1) {
    data[i] = rng.next() * 2 - 1;
  }
  return buffer;
}

function createNoiseLayer(
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

function createToneLayer(ctx: AudioContext, master: AudioNode): ToneLayer {
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

function createVoice(
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

function stopVoice(voice: CarVoice): void {
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

function findCar(cars: readonly CarView[], pid: number): CarView | undefined {
  for (const car of cars) {
    if (car.pid === pid) return car;
  }
  return undefined;
}

export class CarAudio {
  private readonly voices = new Map<number, CarVoice>();
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private generation = 0;
  private muted = false;

  unlock(): void {
    if (!gameConfig.audioEnabled) return;
    if (this.context) {
      if (this.context.state !== "running") void this.context.resume();
      return;
    }
    const Ctor = resolveAudioContextCtor();
    if (!Ctor) return;
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = this.muted ? 0 : gameConfig.audioMasterVolume;
    master.connect(ctx.destination);
    this.noise = createNoiseBuffer(ctx);
    this.master = master;
    this.context = ctx;
    void ctx.resume();
  }

  setMuted(on: boolean): void {
    this.muted = on;
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(
      on ? 0 : gameConfig.audioMasterVolume,
      this.context.currentTime,
      TIME_CONSTANT_SECONDS,
    );
  }

  update(cars: readonly CarView[], localPid: number, dtSeconds: number): void {
    const { context, master, noise } = this;
    if (!gameConfig.audioEnabled || !context || !master || !noise) return;
    this.generation += 1;
    const localCar = findCar(cars, localPid);
    for (const car of cars) {
      this.updateCar(car, localCar, dtSeconds);
    }
    this.releaseStaleVoices();
  }

  dispose(): void {
    if (!this.context) return;
    for (const voice of this.voices.values()) stopVoice(voice);
    this.voices.clear();
    void this.context.close();
    this.context = null;
    this.master = null;
    this.noise = null;
  }

  private updateCar(
    car: CarView,
    localCar: CarView | undefined,
    dtSeconds: number,
  ): void {
    const voice = this.getOrCreateVoice(car.pid);
    if (!voice) return;
    voice.lastSeen = this.generation;
    const motionDt = voice.hasPrev && dtSeconds > 0 ? dtSeconds : 0;
    const speed = speedFractionFromDelta(
      car.x - voice.prevX,
      car.y - voice.prevY,
      motionDt,
      gameConfig.maxForwardSpeed,
    );
    const turnRate = turnRateRadPerSec(voice.prevAngle, car.angle, motionDt);
    voice.throttle = smoothThrottle(
      voice.throttle,
      estimateThrottle(car, voice, speed, motionDt),
      motionDt,
    );
    voice.prevX = car.x;
    voice.prevY = car.y;
    voice.prevAngle = car.angle;
    voice.speedFraction = speed;
    voice.hasPrev = true;
    const scale = spatialScale(car, localCar);
    this.applyVoice(voice, speed, turnRate, scale);
  }

  private getOrCreateVoice(pid: number): CarVoice | null {
    const existing = this.voices.get(pid);
    if (existing) return existing;
    const { context, master, noise } = this;
    if (!context || !master || !noise) return null;
    const voice = createVoice(context, noise, master, this.generation);
    this.voices.set(pid, voice);
    return voice;
  }

  private applyVoice(
    voice: CarVoice,
    speed: number,
    turnRate: number,
    scale: number,
  ): void {
    const { context } = this;
    if (!context) return;
    const now = context.currentTime;
    const hz = engineFrequencyHz(speed, voice.throttle, gameConfig);
    const tc = TIME_CONSTANT_SECONDS;
    voice.engine.osc.frequency.setTargetAtTime(hz, now, tc);
    voice.engine.filter.frequency.setTargetAtTime(
      ENGINE_FILTER_BASE_HZ + ENGINE_FILTER_PER_HZ * hz,
      now,
      tc,
    );
    voice.engine.gain.gain.setTargetAtTime(
      engineGain(speed, voice.throttle, gameConfig) * scale,
      now,
      tc,
    );
    voice.accel.gain.gain.setTargetAtTime(
      accelGain(voice.throttle, gameConfig) * scale,
      now,
      tc,
    );
    voice.squeal.gain.gain.setTargetAtTime(
      squealGain(turnRate, speed, gameConfig) * scale,
      now,
      tc,
    );
  }

  private releaseStaleVoices(): void {
    for (const [pid, voice] of this.voices) {
      if (voice.lastSeen === this.generation) continue;
      stopVoice(voice);
      this.voices.delete(pid);
    }
  }
}

function estimateThrottle(
  car: CarView,
  voice: CarVoice,
  speed: number,
  dtSeconds: number,
): number {
  if ((car.flags & CAR_FLAG.boosting) !== 0) return 1;
  return throttleFromSpeedChange(
    voice.speedFraction,
    speed,
    dtSeconds,
    gameConfig.maxForwardSpeed,
    gameConfig.acceleration,
  );
}

function smoothThrottle(current: number, target: number, dt: number): number {
  if (dt <= 0) return current;
  const alpha = 1 - Math.exp(-dt / THROTTLE_SMOOTH_SECONDS);
  return current + (target - current) * alpha;
}

function spatialScale(car: CarView, localCar: CarView | undefined): number {
  if ((car.flags & CAR_FLAG.destroyed) !== 0) return 0;
  if (car.isLocal) return gameConfig.audioOwnCarGain;
  if (!localCar) return 0;
  const distance = Math.hypot(car.x - localCar.x, car.y - localCar.y);
  return gameConfig.audioOtherCarGain * distanceGain(distance, gameConfig);
}
