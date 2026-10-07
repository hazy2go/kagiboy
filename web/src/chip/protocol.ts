// Mirrors docs/protocol.md and the defines at the top of rom/src/main.c.

export const MAILBOX = 0xd800;

export const MB = {
  REQ_SEQ: 0x00,
  CMD: 0x01,
  REQ_LEN: 0x02,
  ARG: 0x03,
  REQ: 0x04,
  RESP_SEQ: 0x40,
  STATUS: 0x41,
  RESP_LEN: 0x42,
  RESP: 0x44,
  MAGIC: 0xf0,
  ACCEL_X: 0xf1,
  ACCEL_Y: 0xf2,
  PENDING: 0xf3,
} as const;

export const CHIP_MAGIC = 0xc7;
export const RESP_MAX = 171;

export const CMD = {
  PING: 0x01,
  ENTROPY: 0x02,
  CREATE: 0x03,
  SET_PIN: 0x04,
  UNLOCK: 0x05,
  ACCOUNT: 0x06,
  PENDING: 0x07,
  SIGN: 0x08,
  WIPE: 0x09,
  TXSTATUS: 0x0a,
  LOCK: 0x0b,
} as const;

export const CMD_NAME: Record<number, string> = Object.fromEntries(
  Object.entries(CMD).map(([name, code]) => [code, name]),
);

export type Chain = "sol" | "evm";
export const CHAIN_CODE: Record<Chain, number> = { sol: 0, evm: 1 };

/** The Game Boy's view of memory. Real hardware: the cartridge bus at 0xA000. */
export interface Bus {
  read(addr: number): number;
  write(addr: number, value: number): void;
}
