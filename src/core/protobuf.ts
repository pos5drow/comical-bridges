/**
 * A schema-less protobuf reader: enough of the wire format to read a response by field number,
 * without generated code. Varints come back as numbers (safe up to 2^53, which covers ids and
 * timestamps); length-delimited fields as bytes, read on demand as a string or a nested message.
 * Fixed 32/64-bit fields are skipped (read as undefined), and groups (deprecated) are rejected.
 */

import { utf8Text } from "./bytes";

type Field = number | Uint8Array;


export class ProtoMessage {
  private readonly fields = new Map<number, Field[]>();

  constructor(bytes: Uint8Array) {
    let i = 0;
    const varint = (): number => {
      let result = 0;
      let mul = 1;
      for (;;) {
        if (i >= bytes.length) throw new Error("protobuf: truncated varint");
        const b = bytes[i++]!;
        result += (b & 0x7f) * mul;
        if (b < 0x80) return result;
        mul *= 128;
        if (mul > 2 ** 63) throw new Error("protobuf: varint too long");
      }
    };
    while (i < bytes.length) {
      const tag = varint();
      const field = Math.floor(tag / 8);
      const wire = tag & 7;
      let value: Field | undefined;
      if (wire === 0) value = varint();
      else if (wire === 2) {
        const len = varint();
        if (i + len > bytes.length) throw new Error("protobuf: truncated field");
        value = bytes.subarray(i, i + len);
        i += len;
      } else if (wire === 1) i += 8;
      else if (wire === 5) i += 4;
      else throw new Error(`protobuf: unsupported wire type ${wire}`);
      if (value === undefined) continue;
      const list = this.fields.get(field);
      if (list) list.push(value);
      else this.fields.set(field, [value]);
    }
  }

  has(n: number): boolean {
    return this.fields.has(n);
  }

  /** The last varint in field `n` (protobuf's last-one-wins), or `fallback`. */
  int(n: number, fallback = 0): number {
    const v = this.fields.get(n)?.at(-1);
    return typeof v === "number" ? v : fallback;
  }

  /** The last string in field `n`, or undefined. */
  str(n: number): string | undefined {
    const v = this.fields.get(n)?.at(-1);
    return v instanceof Uint8Array ? utf8Text(v) : undefined;
  }

  /** The nested message in field `n`, or undefined. */
  msg(n: number): ProtoMessage | undefined {
    const v = this.fields.get(n)?.at(-1);
    return v instanceof Uint8Array ? new ProtoMessage(v) : undefined;
  }

  /** Every nested message in repeated field `n`. */
  msgs(n: number): ProtoMessage[] {
    return (this.fields.get(n) ?? []).filter((v): v is Uint8Array => v instanceof Uint8Array).map((v) => new ProtoMessage(v));
  }
}
