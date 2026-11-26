import type {
  BaseView,
  BillSnapshot,
  BillValue,
  SimEvent,
} from "../../types/game";
import type { CarBodyState } from "../Physics";
import { canDeliver, canPickUp } from "../Rules";
import { scoreDelivery } from "./Scoring";
import { bodyOf, carOf, allocBillId, type SimState } from "./simState";

export function registerBill(
  state: SimState,
  bill: BillSnapshot,
  events: SimEvent[],
): void {
  state.physics.addBill(bill.id, bill.x, bill.y);
  state.bills.set(bill.id, bill);
  events.push({
    k: "billNew",
    id: bill.id,
    x: bill.x,
    y: bill.y,
    value: bill.value,
  });
}

export function dropCargo(
  state: SimState,
  pid: number,
  values: readonly BillValue[],
  events: SimEvent[],
): void {
  if (values.length === 0) return;
  const { x, y } = bodyOf(state, pid);
  events.push({ k: "drop", pid, count: values.length });
  for (const value of values) {
    registerBill(state, { id: allocBillId(state), x, y, value }, events);
  }
}

export function pickUp(
  state: SimState,
  pid: number,
  billId: number,
  events: SimEvent[],
): void {
  const car = carOf(state, pid);
  const bill = state.bills.get(billId);
  if (car.destroyed || bill === undefined || !canPickUp(car.carried.length)) {
    return;
  }
  state.physics.removeBill(billId);
  state.bills.delete(billId);
  car.carried.push(bill.value);
  events.push({ k: "pick", pid, billId, value: bill.value });
}

export function deliver(
  state: SimState,
  pid: number,
  events: SimEvent[],
): void {
  const car = carOf(state, pid);
  const base = state.basesByPid.get(pid);
  if (car.destroyed || base === undefined) return;
  if (!isInsideBase(bodyOf(state, pid), base)) return;
  if (!canDeliver(pid, car.carried.length, pid)) return;
  const amount = car.carried.reduce((sum, value) => sum + value, 0);
  scoreDelivery(state.scores, pid, amount);
  car.carried = [];
  events.push({ k: "deliv", pid, amount });
}

export function spawnNewBill(
  state: SimState,
  tick: number,
  events: SimEvent[],
): void {
  const spawned = state.spawner.maybeSpawn(
    tick,
    state.bills.size,
    state.lastSpawnTick,
    () => allocBillId(state),
  );
  if (spawned === null) return;
  state.lastSpawnTick = tick;
  registerBill(state, spawned, events);
}

function isInsideBase(body: CarBodyState, base: BaseView): boolean {
  return (
    Math.abs(body.x - base.x) <= base.width / 2 &&
    Math.abs(body.y - base.y) <= base.height / 2
  );
}
