import { Container, Graphics, Text } from "pixi.js";
import { gameConfig } from "../../config/gameConfig";
import { CAR_FLAG, type CarView } from "../../types/game";
import {
  createCarDamageFilter,
  createCarDamageMarkLayer,
  setCarDamageMarkAlpha,
  type CarDamageFilter,
  type CarDamageMarkLayer,
} from "../Effects";
import { truncateCarName } from "../carLabel";
import { buildCarShapes, type CarShape } from "../carDesign";
import { damageFromHealth, smoothDamage } from "../shaders/carDamage";
import { handleCarEffects, type VisualContext } from "./particles";
import {
  CARGO_COLOR,
  CARGO_DOT_RADIUS,
  DESTROYED_ALPHA,
  NAME_LABEL_COLOR,
  NAME_LABEL_STROKE_COLOR,
  NAME_LABEL_STROKE_WIDTH,
  playerColor,
} from "./palette";

export interface CarSlot {
  readonly root: Container;
  readonly body: Graphics;
  readonly marks: CarDamageMarkLayer;
  readonly cargoDot: Graphics;
  readonly label: Text;
  readonly damageFilter: CarDamageFilter | null;
  pid: number;
  damage: number;
  name: string;
}

export function createCarPool(layer: Container): CarSlot[] {
  const slots: CarSlot[] = [];
  for (let i = 0; i < gameConfig.maxCars; i += 1) {
    const root = new Container();
    const body = new Graphics();
    const marks = createCarDamageMarkLayer(i);
    const cargoDot = new Graphics();
    cargoDot.circle(0, 0, CARGO_DOT_RADIUS).fill(CARGO_COLOR);
    cargoDot.visible = false;
    const damageFilter = gameConfig.carDamageShaderEnabled
      ? createCarDamageFilter()
      : null;
    if (damageFilter) body.filters = [damageFilter.filter];
    root.addChild(body, marks.container, cargoDot);
    const label = new Text({
      text: "",
      style: {
        fontFamily: "sans-serif",
        fontSize: gameConfig.carNameFontSize,
        fontWeight: "bold",
        fill: NAME_LABEL_COLOR,
        stroke: {
          color: NAME_LABEL_STROKE_COLOR,
          width: NAME_LABEL_STROKE_WIDTH,
          join: "round",
        },
      },
      anchor: { x: 0.5, y: 1 },
    });
    label.visible = false;
    root.visible = false;
    layer.addChild(root, label);
    slots.push({
      root,
      body,
      marks,
      cargoDot,
      label,
      damageFilter,
      pid: -1,
      damage: 0,
      name: "",
    });
  }
  return slots;
}

export function updateCars(
  slots: readonly CarSlot[],
  cars: readonly CarView[],
  wasDestroyed: Uint8Array,
  visuals: VisualContext,
  dt: number,
): void {
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    const car = cars[i];
    if (!slot) continue;
    if (!car) {
      slot.root.visible = false;
      slot.label.visible = false;
      continue;
    }
    if (slot.pid !== car.pid) drawCarBody(slot, car.pid);
    updateCarSlot(slot, car, dt);
    handleCarEffects(car, wasDestroyed, visuals);
  }
}

export function drawCarBody(slot: CarSlot, pid: number): void {
  slot.body.clear();
  for (const shape of buildCarShapes(playerColor(pid))) {
    drawCarShape(slot.body, shape);
  }
  slot.cargoDot.position.set(-gameConfig.carWidth / 4, 0);
  slot.pid = pid;
}

export function drawCarShape(target: Graphics, shape: CarShape): void {
  if (shape.kind === "circle") {
    target.circle(shape.x, shape.y, shape.radius).fill({
      color: shape.fill,
      alpha: shape.alpha,
    });
    return;
  }
  const rectPath =
    shape.radius > 0
      ? target.roundRect(
          shape.x,
          shape.y,
          shape.width,
          shape.height,
          shape.radius,
        )
      : target.rect(shape.x, shape.y, shape.width, shape.height);
  rectPath.fill({ color: shape.fill, alpha: shape.alpha });
}

export function updateCarSlot(slot: CarSlot, car: CarView, dt: number): void {
  const isDestroyed = (car.flags & CAR_FLAG.destroyed) !== 0;
  slot.root.visible = true;
  slot.root.position.set(car.x, car.y);
  slot.root.rotation = car.angle;
  slot.root.alpha = isDestroyed ? DESTROYED_ALPHA : 1;
  slot.cargoDot.visible = car.cargo > 0;
  slot.marks.container.visible = !isDestroyed;
  updateCarLabel(slot, car, isDestroyed);
  updateCarDamage(slot, car, dt);
}

export function updateCarLabel(
  slot: CarSlot,
  car: CarView,
  isDestroyed: boolean,
): void {
  const visible = !car.isLocal && !isDestroyed && car.name.length > 0;
  slot.label.visible = visible;
  if (!visible) return;
  if (slot.name !== car.name) {
    slot.name = car.name;
    slot.label.text = truncateCarName(car.name, gameConfig.carNameMaxChars);
  }
  slot.label.position.set(
    car.x,
    car.y - gameConfig.carHeight / 2 - gameConfig.carNameGap,
  );
}

export function updateCarDamage(slot: CarSlot, car: CarView, dt: number): void {
  const target = damageFromHealth(car.hp, gameConfig.maxHealth);
  slot.damage = smoothDamage(
    slot.damage,
    target,
    dt,
    gameConfig.carDamageSmoothingRate,
  );
  if (slot.damageFilter) slot.damageFilter.uniforms.uDamage = slot.damage;
  setCarDamageMarkAlpha(slot.marks.views, slot.damage);
}
