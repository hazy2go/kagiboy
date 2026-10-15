import { RemoteChip, type LinkTransport } from "./link";

/**
 * A real kagiboy cartridge over Web Bluetooth (Chrome and Edge on desktop and Android; not Safari or iOS).
 * The cartridge's radio (ESP32-C3, firmware/esp32c3/wallet) has one service: the phone writes a whole message to RX
 * and the reply comes back as notifications on TX, in pieces that fit the connection (byte 0: 0x80 = more follow).
 */

export const SERVICE = "6b616769-626f-7900-0000-000000000001";
const RX = "6b616769-626f-7900-0000-000000000002";
const TX = "6b616769-626f-7900-0000-000000000003";
const REPLY_TIMEOUT_MS = 2500;

// the slice of the Web Bluetooth API used here (not in TypeScript's DOM library)
interface Characteristic extends EventTarget {
  value?: DataView;
  writeValueWithResponse(v: BufferSource): Promise<void>;
  startNotifications(): Promise<Characteristic>;
}
interface Device extends EventTarget {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{ getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<Characteristic> }> }>;
    disconnect(): void;
  };
}
interface Bluetooth {
  requestDevice(o: { filters: { services: string[] }[] }): Promise<Device>;
}

export function bluetoothAvailable() {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export interface Cartridge {
  chip: RemoteChip;
  name: string;
  disconnect(): void;
  /** called once when the link drops */
  onGone: (() => void) | null;
}

/** Asks the browser for a nearby cartridge (its own device picker), connects, and starts polling it. */
export async function connectCartridge(): Promise<Cartridge> {
  const bt = (navigator as Navigator & { bluetooth?: Bluetooth }).bluetooth;
  if (!bt) throw new Error("This browser has no Bluetooth. Use Chrome or Edge on a computer or an Android phone.");
  const device = await bt.requestDevice({ filters: [{ services: [SERVICE] }] });
  const server = await device.gatt!.connect();
  const svc = await server.getPrimaryService(SERVICE);
  const rx = await svc.getCharacteristic(RX);
  const tx = await svc.getCharacteristic(TX);

  // reassemble the reply's pieces; one request is in flight at a time (RemoteChip queues them)
  let parts: number[] = [];
  let waiting: { resolve: (b: Uint8Array) => void; reject: (e: Error) => void } | null = null;
  tx.addEventListener("characteristicvaluechanged", () => {
    const v = tx.value;
    if (!v || v.byteLength < 1) return;
    const b = new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    parts.push(...b.subarray(1));
    if (b[0] & 0x80) return;
    const msg = Uint8Array.from(parts);
    parts = [];
    waiting?.resolve(msg);
  });
  await tx.startNotifications();

  const link: LinkTransport = {
    async exchange(req) {
      if (!device.gatt?.connected) throw new Error("the cartridge is not connected");
      parts = [];
      const reply = new Promise<Uint8Array>((resolve, reject) => {
        waiting = { resolve, reject };
        setTimeout(() => reject(new Error("the cartridge didn't answer")), REPLY_TIMEOUT_MS);
      });
      try {
        await rx.writeValueWithResponse(req.slice().buffer);
        return await reply; // RemoteChip checks it answers this request (op and tag) and asks again if not
      } finally {
        waiting = null;
      }
    },
  };

  const chip = new RemoteChip(link);
  const cart: Cartridge = {
    chip,
    name: device.name ?? "KAGIBOY",
    disconnect: () => {
      chip.stop();
      device.gatt?.disconnect();
    },
    onGone: null,
  };
  device.addEventListener("gattserverdisconnected", () => {
    chip.stop();
    cart.onGone?.();
  });
  await chip.start();
  return cart;
}
