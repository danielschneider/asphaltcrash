import { Container, Graphics } from "pixi.js";
import { gameConfig } from "../../config/gameConfig";
import type { BillValue, BillView } from "../../types/game";
import {
  BILL_COLORS,
  BILL_CORNER_RADIUS,
  BILL_STRIPE_COLOR,
  BILL_STRIPE_HEIGHT,
} from "./palette";

export interface BillSlot {
  readonly root: Container;
  value: BillValue | null;
}

export function createBillPool(layer: Container): BillSlot[] {
  const slots: BillSlot[] = [];
  for (let i = 0; i < gameConfig.maxBillsOnField; i += 1) {
    const root = new Container();
    root.visible = false;
    layer.addChild(root);
    slots.push({ root, value: null });
  }
  return slots;
}

export function updateBills(
  slots: readonly BillSlot[],
  bills: readonly BillView[],
): void {
  for (let i = 0; i < slots.length; i += 1) {
    const slot = slots[i];
    if (!slot) continue;
    const bill = bills[i];
    if (!bill) {
      slot.root.visible = false;
      continue;
    }
    if (slot.value !== bill.value) drawBill(slot, bill.value);
    slot.root.visible = true;
    slot.root.position.set(bill.x, bill.y);
  }
}

export function drawBill(slot: BillSlot, value: BillValue): void {
  slot.root.removeChildren().forEach((child) => child.destroy());
  const r = gameConfig.billRadius;
  const g = new Graphics();
  g.roundRect(-r, -r, r * 2, r * 2, BILL_CORNER_RADIUS).fill(
    BILL_COLORS[value],
  );
  g.rect(-r, -BILL_STRIPE_HEIGHT / 2, r * 2, BILL_STRIPE_HEIGHT).fill(
    BILL_STRIPE_COLOR,
  );
  slot.root.addChild(g);
  slot.value = value;
}
