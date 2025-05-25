(function () {
    'use strict';

    /**
     * Get the type of a JSON value.
     * Distinguishes between array, null and object.
     */
    function typeofJsonValue(value) {
        let t = typeof value;
        if (t == "object") {
            if (Array.isArray(value))
                return "array";
            if (value === null)
                return "null";
        }
        return t;
    }
    /**
     * Is this a JSON object (instead of an array or null)?
     */
    function isJsonObject(value) {
        return value !== null && typeof value == "object" && !Array.isArray(value);
    }

    // lookup table from base64 character to byte
    let encTable = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'.split('');
    // lookup table from base64 character *code* to byte because lookup by number is fast
    let decTable = [];
    for (let i = 0; i < encTable.length; i++)
        decTable[encTable[i].charCodeAt(0)] = i;
    // support base64url variants
    decTable["-".charCodeAt(0)] = encTable.indexOf("+");
    decTable["_".charCodeAt(0)] = encTable.indexOf("/");
    /**
     * Decodes a base64 string to a byte array.
     *
     * - ignores white-space, including line breaks and tabs
     * - allows inner padding (can decode concatenated base64 strings)
     * - does not require padding
     * - understands base64url encoding:
     *   "-" instead of "+",
     *   "_" instead of "/",
     *   no padding
     */
    function base64decode(base64Str) {
        // estimate byte size, not accounting for inner padding and whitespace
        let es = base64Str.length * 3 / 4;
        // if (es % 3 !== 0)
        // throw new Error('invalid base64 string');
        if (base64Str[base64Str.length - 2] == '=')
            es -= 2;
        else if (base64Str[base64Str.length - 1] == '=')
            es -= 1;
        let bytes = new Uint8Array(es), bytePos = 0, // position in byte array
        groupPos = 0, // position in base64 group
        b, // current byte
        p = 0 // previous byte
        ;
        for (let i = 0; i < base64Str.length; i++) {
            b = decTable[base64Str.charCodeAt(i)];
            if (b === undefined) {
                // noinspection FallThroughInSwitchStatementJS
                switch (base64Str[i]) {
                    case '=':
                        groupPos = 0; // reset state when padding found
                    case '\n':
                    case '\r':
                    case '\t':
                    case ' ':
                        continue; // skip white-space, and padding
                    default:
                        throw Error(`invalid base64 string.`);
                }
            }
            switch (groupPos) {
                case 0:
                    p = b;
                    groupPos = 1;
                    break;
                case 1:
                    bytes[bytePos++] = p << 2 | (b & 48) >> 4;
                    p = b;
                    groupPos = 2;
                    break;
                case 2:
                    bytes[bytePos++] = (p & 15) << 4 | (b & 60) >> 2;
                    p = b;
                    groupPos = 3;
                    break;
                case 3:
                    bytes[bytePos++] = (p & 3) << 6 | b;
                    groupPos = 0;
                    break;
            }
        }
        if (groupPos == 1)
            throw Error(`invalid base64 string.`);
        return bytes.subarray(0, bytePos);
    }
    /**
     * Encodes a byte array to a base64 string.
     * Adds padding at the end.
     * Does not insert newlines.
     */
    function base64encode(bytes) {
        let base64 = '', groupPos = 0, // position in base64 group
        b, // current byte
        p = 0; // carry over from previous byte
        for (let i = 0; i < bytes.length; i++) {
            b = bytes[i];
            switch (groupPos) {
                case 0:
                    base64 += encTable[b >> 2];
                    p = (b & 3) << 4;
                    groupPos = 1;
                    break;
                case 1:
                    base64 += encTable[p | b >> 4];
                    p = (b & 15) << 2;
                    groupPos = 2;
                    break;
                case 2:
                    base64 += encTable[p | b >> 6];
                    base64 += encTable[b & 63];
                    groupPos = 0;
                    break;
            }
        }
        // padding required?
        if (groupPos) {
            base64 += encTable[p];
            base64 += '=';
            if (groupPos == 1)
                base64 += '=';
        }
        return base64;
    }

    /**
     * This handler implements the default behaviour for unknown fields.
     * When reading data, unknown fields are stored on the message, in a
     * symbol property.
     * When writing data, the symbol property is queried and unknown fields
     * are serialized into the output again.
     */
    var UnknownFieldHandler;
    (function (UnknownFieldHandler) {
        /**
         * The symbol used to store unknown fields for a message.
         * The property must conform to `UnknownFieldContainer`.
         */
        UnknownFieldHandler.symbol = Symbol.for("protobuf-ts/unknown");
        /**
         * Store an unknown field during binary read directly on the message.
         * This method is compatible with `BinaryReadOptions.readUnknownField`.
         */
        UnknownFieldHandler.onRead = (typeName, message, fieldNo, wireType, data) => {
            let container = is(message) ? message[UnknownFieldHandler.symbol] : message[UnknownFieldHandler.symbol] = [];
            container.push({ no: fieldNo, wireType, data });
        };
        /**
         * Write unknown fields stored for the message to the writer.
         * This method is compatible with `BinaryWriteOptions.writeUnknownFields`.
         */
        UnknownFieldHandler.onWrite = (typeName, message, writer) => {
            for (let { no, wireType, data } of UnknownFieldHandler.list(message))
                writer.tag(no, wireType).raw(data);
        };
        /**
         * List unknown fields stored for the message.
         * Note that there may be multiples fields with the same number.
         */
        UnknownFieldHandler.list = (message, fieldNo) => {
            if (is(message)) {
                let all = message[UnknownFieldHandler.symbol];
                return fieldNo ? all.filter(uf => uf.no == fieldNo) : all;
            }
            return [];
        };
        /**
         * Returns the last unknown field by field number.
         */
        UnknownFieldHandler.last = (message, fieldNo) => UnknownFieldHandler.list(message, fieldNo).slice(-1)[0];
        const is = (message) => message && Array.isArray(message[UnknownFieldHandler.symbol]);
    })(UnknownFieldHandler || (UnknownFieldHandler = {}));
    /**
     * Protobuf binary format wire types.
     *
     * A wire type provides just enough information to find the length of the
     * following value.
     *
     * See https://developers.google.com/protocol-buffers/docs/encoding#structure
     */
    var WireType;
    (function (WireType) {
        /**
         * Used for int32, int64, uint32, uint64, sint32, sint64, bool, enum
         */
        WireType[WireType["Varint"] = 0] = "Varint";
        /**
         * Used for fixed64, sfixed64, double.
         * Always 8 bytes with little-endian byte order.
         */
        WireType[WireType["Bit64"] = 1] = "Bit64";
        /**
         * Used for string, bytes, embedded messages, packed repeated fields
         *
         * Only repeated numeric types (types which use the varint, 32-bit,
         * or 64-bit wire types) can be packed. In proto3, such fields are
         * packed by default.
         */
        WireType[WireType["LengthDelimited"] = 2] = "LengthDelimited";
        /**
         * Used for groups
         * @deprecated
         */
        WireType[WireType["StartGroup"] = 3] = "StartGroup";
        /**
         * Used for groups
         * @deprecated
         */
        WireType[WireType["EndGroup"] = 4] = "EndGroup";
        /**
         * Used for fixed32, sfixed32, float.
         * Always 4 bytes with little-endian byte order.
         */
        WireType[WireType["Bit32"] = 5] = "Bit32";
    })(WireType || (WireType = {}));

    // Copyright 2008 Google Inc.  All rights reserved.
    //
    // Redistribution and use in source and binary forms, with or without
    // modification, are permitted provided that the following conditions are
    // met:
    //
    // * Redistributions of source code must retain the above copyright
    // notice, this list of conditions and the following disclaimer.
    // * Redistributions in binary form must reproduce the above
    // copyright notice, this list of conditions and the following disclaimer
    // in the documentation and/or other materials provided with the
    // distribution.
    // * Neither the name of Google Inc. nor the names of its
    // contributors may be used to endorse or promote products derived from
    // this software without specific prior written permission.
    //
    // THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
    // "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
    // LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
    // A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
    // OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
    // SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
    // LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
    // DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
    // THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
    // (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
    // OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
    //
    // Code generated by the Protocol Buffer compiler is owned by the owner
    // of the input file used when generating it.  This code is not
    // standalone and requires a support library to be linked with it.  This
    // support library is itself covered by the above license.
    /**
     * Read a 64 bit varint as two JS numbers.
     *
     * Returns tuple:
     * [0]: low bits
     * [0]: high bits
     *
     * Copyright 2008 Google Inc.  All rights reserved.
     *
     * See https://github.com/protocolbuffers/protobuf/blob/8a71927d74a4ce34efe2d8769fda198f52d20d12/js/experimental/runtime/kernel/buffer_decoder.js#L175
     */
    function varint64read() {
        let lowBits = 0;
        let highBits = 0;
        for (let shift = 0; shift < 28; shift += 7) {
            let b = this.buf[this.pos++];
            lowBits |= (b & 0x7F) << shift;
            if ((b & 0x80) == 0) {
                this.assertBounds();
                return [lowBits, highBits];
            }
        }
        let middleByte = this.buf[this.pos++];
        // last four bits of the first 32 bit number
        lowBits |= (middleByte & 0x0F) << 28;
        // 3 upper bits are part of the next 32 bit number
        highBits = (middleByte & 0x70) >> 4;
        if ((middleByte & 0x80) == 0) {
            this.assertBounds();
            return [lowBits, highBits];
        }
        for (let shift = 3; shift <= 31; shift += 7) {
            let b = this.buf[this.pos++];
            highBits |= (b & 0x7F) << shift;
            if ((b & 0x80) == 0) {
                this.assertBounds();
                return [lowBits, highBits];
            }
        }
        throw new Error('invalid varint');
    }
    /**
     * Write a 64 bit varint, given as two JS numbers, to the given bytes array.
     *
     * Copyright 2008 Google Inc.  All rights reserved.
     *
     * See https://github.com/protocolbuffers/protobuf/blob/8a71927d74a4ce34efe2d8769fda198f52d20d12/js/experimental/runtime/kernel/writer.js#L344
     */
    function varint64write(lo, hi, bytes) {
        for (let i = 0; i < 28; i = i + 7) {
            const shift = lo >>> i;
            const hasNext = !((shift >>> 7) == 0 && hi == 0);
            const byte = (hasNext ? shift | 0x80 : shift) & 0xFF;
            bytes.push(byte);
            if (!hasNext) {
                return;
            }
        }
        const splitBits = ((lo >>> 28) & 0x0F) | ((hi & 0x07) << 4);
        const hasMoreBits = !((hi >> 3) == 0);
        bytes.push((hasMoreBits ? splitBits | 0x80 : splitBits) & 0xFF);
        if (!hasMoreBits) {
            return;
        }
        for (let i = 3; i < 31; i = i + 7) {
            const shift = hi >>> i;
            const hasNext = !((shift >>> 7) == 0);
            const byte = (hasNext ? shift | 0x80 : shift) & 0xFF;
            bytes.push(byte);
            if (!hasNext) {
                return;
            }
        }
        bytes.push((hi >>> 31) & 0x01);
    }
    // constants for binary math
    const TWO_PWR_32_DBL$1 = (1 << 16) * (1 << 16);
    /**
     * Parse decimal string of 64 bit integer value as two JS numbers.
     *
     * Returns tuple:
     * [0]: minus sign?
     * [1]: low bits
     * [2]: high bits
     *
     * Copyright 2008 Google Inc.
     */
    function int64fromString(dec) {
        // Check for minus sign.
        let minus = dec[0] == '-';
        if (minus)
            dec = dec.slice(1);
        // Work 6 decimal digits at a time, acting like we're converting base 1e6
        // digits to binary. This is safe to do with floating point math because
        // Number.isSafeInteger(ALL_32_BITS * 1e6) == true.
        const base = 1e6;
        let lowBits = 0;
        let highBits = 0;
        function add1e6digit(begin, end) {
            // Note: Number('') is 0.
            const digit1e6 = Number(dec.slice(begin, end));
            highBits *= base;
            lowBits = lowBits * base + digit1e6;
            // Carry bits from lowBits to highBits
            if (lowBits >= TWO_PWR_32_DBL$1) {
                highBits = highBits + ((lowBits / TWO_PWR_32_DBL$1) | 0);
                lowBits = lowBits % TWO_PWR_32_DBL$1;
            }
        }
        add1e6digit(-24, -18);
        add1e6digit(-18, -12);
        add1e6digit(-12, -6);
        add1e6digit(-6);
        return [minus, lowBits, highBits];
    }
    /**
     * Format 64 bit integer value (as two JS numbers) to decimal string.
     *
     * Copyright 2008 Google Inc.
     */
    function int64toString(bitsLow, bitsHigh) {
        // Skip the expensive conversion if the number is small enough to use the
        // built-in conversions.
        if ((bitsHigh >>> 0) <= 0x1FFFFF) {
            return '' + (TWO_PWR_32_DBL$1 * bitsHigh + (bitsLow >>> 0));
        }
        // What this code is doing is essentially converting the input number from
        // base-2 to base-1e7, which allows us to represent the 64-bit range with
        // only 3 (very large) digits. Those digits are then trivial to convert to
        // a base-10 string.
        // The magic numbers used here are -
        // 2^24 = 16777216 = (1,6777216) in base-1e7.
        // 2^48 = 281474976710656 = (2,8147497,6710656) in base-1e7.
        // Split 32:32 representation into 16:24:24 representation so our
        // intermediate digits don't overflow.
        let low = bitsLow & 0xFFFFFF;
        let mid = (((bitsLow >>> 24) | (bitsHigh << 8)) >>> 0) & 0xFFFFFF;
        let high = (bitsHigh >> 16) & 0xFFFF;
        // Assemble our three base-1e7 digits, ignoring carries. The maximum
        // value in a digit at this step is representable as a 48-bit integer, which
        // can be stored in a 64-bit floating point number.
        let digitA = low + (mid * 6777216) + (high * 6710656);
        let digitB = mid + (high * 8147497);
        let digitC = (high * 2);
        // Apply carries from A to B and from B to C.
        let base = 10000000;
        if (digitA >= base) {
            digitB += Math.floor(digitA / base);
            digitA %= base;
        }
        if (digitB >= base) {
            digitC += Math.floor(digitB / base);
            digitB %= base;
        }
        // Convert base-1e7 digits to base-10, with optional leading zeroes.
        function decimalFrom1e7(digit1e7, needLeadingZeros) {
            let partial = digit1e7 ? String(digit1e7) : '';
            if (needLeadingZeros) {
                return '0000000'.slice(partial.length) + partial;
            }
            return partial;
        }
        return decimalFrom1e7(digitC, /*needLeadingZeros=*/ 0) +
            decimalFrom1e7(digitB, /*needLeadingZeros=*/ digitC) +
            // If the final 1e7 digit didn't need leading zeros, we would have
            // returned via the trivial code path at the top.
            decimalFrom1e7(digitA, /*needLeadingZeros=*/ 1);
    }
    /**
     * Write a 32 bit varint, signed or unsigned. Same as `varint64write(0, value, bytes)`
     *
     * Copyright 2008 Google Inc.  All rights reserved.
     *
     * See https://github.com/protocolbuffers/protobuf/blob/1b18833f4f2a2f681f4e4a25cdf3b0a43115ec26/js/binary/encoder.js#L144
     */
    function varint32write(value, bytes) {
        if (value >= 0) {
            // write value as varint 32
            while (value > 0x7f) {
                bytes.push((value & 0x7f) | 0x80);
                value = value >>> 7;
            }
            bytes.push(value);
        }
        else {
            for (let i = 0; i < 9; i++) {
                bytes.push(value & 127 | 128);
                value = value >> 7;
            }
            bytes.push(1);
        }
    }
    /**
     * Read an unsigned 32 bit varint.
     *
     * See https://github.com/protocolbuffers/protobuf/blob/8a71927d74a4ce34efe2d8769fda198f52d20d12/js/experimental/runtime/kernel/buffer_decoder.js#L220
     */
    function varint32read() {
        let b = this.buf[this.pos++];
        let result = b & 0x7F;
        if ((b & 0x80) == 0) {
            this.assertBounds();
            return result;
        }
        b = this.buf[this.pos++];
        result |= (b & 0x7F) << 7;
        if ((b & 0x80) == 0) {
            this.assertBounds();
            return result;
        }
        b = this.buf[this.pos++];
        result |= (b & 0x7F) << 14;
        if ((b & 0x80) == 0) {
            this.assertBounds();
            return result;
        }
        b = this.buf[this.pos++];
        result |= (b & 0x7F) << 21;
        if ((b & 0x80) == 0) {
            this.assertBounds();
            return result;
        }
        // Extract only last 4 bits
        b = this.buf[this.pos++];
        result |= (b & 0x0F) << 28;
        for (let readBytes = 5; ((b & 0x80) !== 0) && readBytes < 10; readBytes++)
            b = this.buf[this.pos++];
        if ((b & 0x80) != 0)
            throw new Error('invalid varint');
        this.assertBounds();
        // Result can have 32 bits, convert it to unsigned
        return result >>> 0;
    }

    let BI;
    function detectBi() {
        const dv = new DataView(new ArrayBuffer(8));
        const ok = globalThis.BigInt !== undefined
            && typeof dv.getBigInt64 === "function"
            && typeof dv.getBigUint64 === "function"
            && typeof dv.setBigInt64 === "function"
            && typeof dv.setBigUint64 === "function";
        BI = ok ? {
            MIN: BigInt("-9223372036854775808"),
            MAX: BigInt("9223372036854775807"),
            UMIN: BigInt("0"),
            UMAX: BigInt("18446744073709551615"),
            C: BigInt,
            V: dv,
        } : undefined;
    }
    detectBi();
    function assertBi(bi) {
        if (!bi)
            throw new Error("BigInt unavailable, see https://github.com/timostamm/protobuf-ts/blob/v1.0.8/MANUAL.md#bigint-support");
    }
    // used to validate from(string) input (when bigint is unavailable)
    const RE_DECIMAL_STR = /^-?[0-9]+$/;
    // constants for binary math
    const TWO_PWR_32_DBL = 0x100000000;
    const HALF_2_PWR_32 = 0x080000000;
    // base class for PbLong and PbULong provides shared code
    class SharedPbLong {
        /**
         * Create a new instance with the given bits.
         */
        constructor(lo, hi) {
            this.lo = lo | 0;
            this.hi = hi | 0;
        }
        /**
         * Is this instance equal to 0?
         */
        isZero() {
            return this.lo == 0 && this.hi == 0;
        }
        /**
         * Convert to a native number.
         */
        toNumber() {
            let result = this.hi * TWO_PWR_32_DBL + (this.lo >>> 0);
            if (!Number.isSafeInteger(result))
                throw new Error("cannot convert to safe number");
            return result;
        }
    }
    /**
     * 64-bit unsigned integer as two 32-bit values.
     * Converts between `string`, `number` and `bigint` representations.
     */
    class PbULong extends SharedPbLong {
        /**
         * Create instance from a `string`, `number` or `bigint`.
         */
        static from(value) {
            if (BI)
                // noinspection FallThroughInSwitchStatementJS
                switch (typeof value) {
                    case "string":
                        if (value == "0")
                            return this.ZERO;
                        if (value == "")
                            throw new Error('string is no integer');
                        value = BI.C(value);
                    case "number":
                        if (value === 0)
                            return this.ZERO;
                        value = BI.C(value);
                    case "bigint":
                        if (!value)
                            return this.ZERO;
                        if (value < BI.UMIN)
                            throw new Error('signed value for ulong');
                        if (value > BI.UMAX)
                            throw new Error('ulong too large');
                        BI.V.setBigUint64(0, value, true);
                        return new PbULong(BI.V.getInt32(0, true), BI.V.getInt32(4, true));
                }
            else
                switch (typeof value) {
                    case "string":
                        if (value == "0")
                            return this.ZERO;
                        value = value.trim();
                        if (!RE_DECIMAL_STR.test(value))
                            throw new Error('string is no integer');
                        let [minus, lo, hi] = int64fromString(value);
                        if (minus)
                            throw new Error('signed value for ulong');
                        return new PbULong(lo, hi);
                    case "number":
                        if (value == 0)
                            return this.ZERO;
                        if (!Number.isSafeInteger(value))
                            throw new Error('number is no integer');
                        if (value < 0)
                            throw new Error('signed value for ulong');
                        return new PbULong(value, value / TWO_PWR_32_DBL);
                }
            throw new Error('unknown value ' + typeof value);
        }
        /**
         * Convert to decimal string.
         */
        toString() {
            return BI ? this.toBigInt().toString() : int64toString(this.lo, this.hi);
        }
        /**
         * Convert to native bigint.
         */
        toBigInt() {
            assertBi(BI);
            BI.V.setInt32(0, this.lo, true);
            BI.V.setInt32(4, this.hi, true);
            return BI.V.getBigUint64(0, true);
        }
    }
    /**
     * ulong 0 singleton.
     */
    PbULong.ZERO = new PbULong(0, 0);
    /**
     * 64-bit signed integer as two 32-bit values.
     * Converts between `string`, `number` and `bigint` representations.
     */
    class PbLong extends SharedPbLong {
        /**
         * Create instance from a `string`, `number` or `bigint`.
         */
        static from(value) {
            if (BI)
                // noinspection FallThroughInSwitchStatementJS
                switch (typeof value) {
                    case "string":
                        if (value == "0")
                            return this.ZERO;
                        if (value == "")
                            throw new Error('string is no integer');
                        value = BI.C(value);
                    case "number":
                        if (value === 0)
                            return this.ZERO;
                        value = BI.C(value);
                    case "bigint":
                        if (!value)
                            return this.ZERO;
                        if (value < BI.MIN)
                            throw new Error('signed long too small');
                        if (value > BI.MAX)
                            throw new Error('signed long too large');
                        BI.V.setBigInt64(0, value, true);
                        return new PbLong(BI.V.getInt32(0, true), BI.V.getInt32(4, true));
                }
            else
                switch (typeof value) {
                    case "string":
                        if (value == "0")
                            return this.ZERO;
                        value = value.trim();
                        if (!RE_DECIMAL_STR.test(value))
                            throw new Error('string is no integer');
                        let [minus, lo, hi] = int64fromString(value);
                        if (minus) {
                            if (hi > HALF_2_PWR_32 || (hi == HALF_2_PWR_32 && lo != 0))
                                throw new Error('signed long too small');
                        }
                        else if (hi >= HALF_2_PWR_32)
                            throw new Error('signed long too large');
                        let pbl = new PbLong(lo, hi);
                        return minus ? pbl.negate() : pbl;
                    case "number":
                        if (value == 0)
                            return this.ZERO;
                        if (!Number.isSafeInteger(value))
                            throw new Error('number is no integer');
                        return value > 0
                            ? new PbLong(value, value / TWO_PWR_32_DBL)
                            : new PbLong(-value, -value / TWO_PWR_32_DBL).negate();
                }
            throw new Error('unknown value ' + typeof value);
        }
        /**
         * Do we have a minus sign?
         */
        isNegative() {
            return (this.hi & HALF_2_PWR_32) !== 0;
        }
        /**
         * Negate two's complement.
         * Invert all the bits and add one to the result.
         */
        negate() {
            let hi = ~this.hi, lo = this.lo;
            if (lo)
                lo = ~lo + 1;
            else
                hi += 1;
            return new PbLong(lo, hi);
        }
        /**
         * Convert to decimal string.
         */
        toString() {
            if (BI)
                return this.toBigInt().toString();
            if (this.isNegative()) {
                let n = this.negate();
                return '-' + int64toString(n.lo, n.hi);
            }
            return int64toString(this.lo, this.hi);
        }
        /**
         * Convert to native bigint.
         */
        toBigInt() {
            assertBi(BI);
            BI.V.setInt32(0, this.lo, true);
            BI.V.setInt32(4, this.hi, true);
            return BI.V.getBigInt64(0, true);
        }
    }
    /**
     * long 0 singleton.
     */
    PbLong.ZERO = new PbLong(0, 0);

    const defaultsRead$1 = {
        readUnknownField: true,
        readerFactory: bytes => new BinaryReader(bytes),
    };
    /**
     * Make options for reading binary data form partial options.
     */
    function binaryReadOptions(options) {
        return options ? Object.assign(Object.assign({}, defaultsRead$1), options) : defaultsRead$1;
    }
    class BinaryReader {
        constructor(buf, textDecoder) {
            this.varint64 = varint64read; // dirty cast for `this`
            /**
             * Read a `uint32` field, an unsigned 32 bit varint.
             */
            this.uint32 = varint32read; // dirty cast for `this` and access to protected `buf`
            this.buf = buf;
            this.len = buf.length;
            this.pos = 0;
            this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
            this.textDecoder = textDecoder !== null && textDecoder !== void 0 ? textDecoder : new TextDecoder("utf-8", {
                fatal: true,
                ignoreBOM: true,
            });
        }
        /**
         * Reads a tag - field number and wire type.
         */
        tag() {
            let tag = this.uint32(), fieldNo = tag >>> 3, wireType = tag & 7;
            if (fieldNo <= 0 || wireType < 0 || wireType > 5)
                throw new Error("illegal tag: field no " + fieldNo + " wire type " + wireType);
            return [fieldNo, wireType];
        }
        /**
         * Skip one element on the wire and return the skipped data.
         * Supports WireType.StartGroup since v2.0.0-alpha.23.
         */
        skip(wireType) {
            let start = this.pos;
            // noinspection FallThroughInSwitchStatementJS
            switch (wireType) {
                case WireType.Varint:
                    while (this.buf[this.pos++] & 0x80) {
                        // ignore
                    }
                    break;
                case WireType.Bit64:
                    this.pos += 4;
                case WireType.Bit32:
                    this.pos += 4;
                    break;
                case WireType.LengthDelimited:
                    let len = this.uint32();
                    this.pos += len;
                    break;
                case WireType.StartGroup:
                    // From descriptor.proto: Group type is deprecated, not supported in proto3.
                    // But we must still be able to parse and treat as unknown.
                    let t;
                    while ((t = this.tag()[1]) !== WireType.EndGroup) {
                        this.skip(t);
                    }
                    break;
                default:
                    throw new Error("cant skip wire type " + wireType);
            }
            this.assertBounds();
            return this.buf.subarray(start, this.pos);
        }
        /**
         * Throws error if position in byte array is out of range.
         */
        assertBounds() {
            if (this.pos > this.len)
                throw new RangeError("premature EOF");
        }
        /**
         * Read a `int32` field, a signed 32 bit varint.
         */
        int32() {
            return this.uint32() | 0;
        }
        /**
         * Read a `sint32` field, a signed, zigzag-encoded 32-bit varint.
         */
        sint32() {
            let zze = this.uint32();
            // decode zigzag
            return (zze >>> 1) ^ -(zze & 1);
        }
        /**
         * Read a `int64` field, a signed 64-bit varint.
         */
        int64() {
            return new PbLong(...this.varint64());
        }
        /**
         * Read a `uint64` field, an unsigned 64-bit varint.
         */
        uint64() {
            return new PbULong(...this.varint64());
        }
        /**
         * Read a `sint64` field, a signed, zig-zag-encoded 64-bit varint.
         */
        sint64() {
            let [lo, hi] = this.varint64();
            // decode zig zag
            let s = -(lo & 1);
            lo = ((lo >>> 1 | (hi & 1) << 31) ^ s);
            hi = (hi >>> 1 ^ s);
            return new PbLong(lo, hi);
        }
        /**
         * Read a `bool` field, a variant.
         */
        bool() {
            let [lo, hi] = this.varint64();
            return lo !== 0 || hi !== 0;
        }
        /**
         * Read a `fixed32` field, an unsigned, fixed-length 32-bit integer.
         */
        fixed32() {
            return this.view.getUint32((this.pos += 4) - 4, true);
        }
        /**
         * Read a `sfixed32` field, a signed, fixed-length 32-bit integer.
         */
        sfixed32() {
            return this.view.getInt32((this.pos += 4) - 4, true);
        }
        /**
         * Read a `fixed64` field, an unsigned, fixed-length 64 bit integer.
         */
        fixed64() {
            return new PbULong(this.sfixed32(), this.sfixed32());
        }
        /**
         * Read a `fixed64` field, a signed, fixed-length 64-bit integer.
         */
        sfixed64() {
            return new PbLong(this.sfixed32(), this.sfixed32());
        }
        /**
         * Read a `float` field, 32-bit floating point number.
         */
        float() {
            return this.view.getFloat32((this.pos += 4) - 4, true);
        }
        /**
         * Read a `double` field, a 64-bit floating point number.
         */
        double() {
            return this.view.getFloat64((this.pos += 8) - 8, true);
        }
        /**
         * Read a `bytes` field, length-delimited arbitrary data.
         */
        bytes() {
            let len = this.uint32();
            let start = this.pos;
            this.pos += len;
            this.assertBounds();
            return this.buf.subarray(start, start + len);
        }
        /**
         * Read a `string` field, length-delimited data converted to UTF-8 text.
         */
        string() {
            return this.textDecoder.decode(this.bytes());
        }
    }

    /**
     * assert that condition is true or throw error (with message)
     */
    function assert(condition, msg) {
        if (!condition) {
            throw new Error(msg);
        }
    }
    const FLOAT32_MAX = 3.4028234663852886e+38, FLOAT32_MIN = -34028234663852886e22, UINT32_MAX = 0xFFFFFFFF, INT32_MAX = 0X7FFFFFFF, INT32_MIN = -2147483648;
    function assertInt32(arg) {
        if (typeof arg !== "number")
            throw new Error('invalid int 32: ' + typeof arg);
        if (!Number.isInteger(arg) || arg > INT32_MAX || arg < INT32_MIN)
            throw new Error('invalid int 32: ' + arg);
    }
    function assertUInt32(arg) {
        if (typeof arg !== "number")
            throw new Error('invalid uint 32: ' + typeof arg);
        if (!Number.isInteger(arg) || arg > UINT32_MAX || arg < 0)
            throw new Error('invalid uint 32: ' + arg);
    }
    function assertFloat32(arg) {
        if (typeof arg !== "number")
            throw new Error('invalid float 32: ' + typeof arg);
        if (!Number.isFinite(arg))
            return;
        if (arg > FLOAT32_MAX || arg < FLOAT32_MIN)
            throw new Error('invalid float 32: ' + arg);
    }

    const defaultsWrite$1 = {
        writeUnknownFields: true,
        writerFactory: () => new BinaryWriter(),
    };
    /**
     * Make options for writing binary data form partial options.
     */
    function binaryWriteOptions(options) {
        return options ? Object.assign(Object.assign({}, defaultsWrite$1), options) : defaultsWrite$1;
    }
    class BinaryWriter {
        constructor(textEncoder) {
            /**
             * Previous fork states.
             */
            this.stack = [];
            this.textEncoder = textEncoder !== null && textEncoder !== void 0 ? textEncoder : new TextEncoder();
            this.chunks = [];
            this.buf = [];
        }
        /**
         * Return all bytes written and reset this writer.
         */
        finish() {
            this.chunks.push(new Uint8Array(this.buf)); // flush the buffer
            let len = 0;
            for (let i = 0; i < this.chunks.length; i++)
                len += this.chunks[i].length;
            let bytes = new Uint8Array(len);
            let offset = 0;
            for (let i = 0; i < this.chunks.length; i++) {
                bytes.set(this.chunks[i], offset);
                offset += this.chunks[i].length;
            }
            this.chunks = [];
            return bytes;
        }
        /**
         * Start a new fork for length-delimited data like a message
         * or a packed repeated field.
         *
         * Must be joined later with `join()`.
         */
        fork() {
            this.stack.push({ chunks: this.chunks, buf: this.buf });
            this.chunks = [];
            this.buf = [];
            return this;
        }
        /**
         * Join the last fork. Write its length and bytes, then
         * return to the previous state.
         */
        join() {
            // get chunk of fork
            let chunk = this.finish();
            // restore previous state
            let prev = this.stack.pop();
            if (!prev)
                throw new Error('invalid state, fork stack empty');
            this.chunks = prev.chunks;
            this.buf = prev.buf;
            // write length of chunk as varint
            this.uint32(chunk.byteLength);
            return this.raw(chunk);
        }
        /**
         * Writes a tag (field number and wire type).
         *
         * Equivalent to `uint32( (fieldNo << 3 | type) >>> 0 )`.
         *
         * Generated code should compute the tag ahead of time and call `uint32()`.
         */
        tag(fieldNo, type) {
            return this.uint32((fieldNo << 3 | type) >>> 0);
        }
        /**
         * Write a chunk of raw bytes.
         */
        raw(chunk) {
            if (this.buf.length) {
                this.chunks.push(new Uint8Array(this.buf));
                this.buf = [];
            }
            this.chunks.push(chunk);
            return this;
        }
        /**
         * Write a `uint32` value, an unsigned 32 bit varint.
         */
        uint32(value) {
            assertUInt32(value);
            // write value as varint 32, inlined for speed
            while (value > 0x7f) {
                this.buf.push((value & 0x7f) | 0x80);
                value = value >>> 7;
            }
            this.buf.push(value);
            return this;
        }
        /**
         * Write a `int32` value, a signed 32 bit varint.
         */
        int32(value) {
            assertInt32(value);
            varint32write(value, this.buf);
            return this;
        }
        /**
         * Write a `bool` value, a variant.
         */
        bool(value) {
            this.buf.push(value ? 1 : 0);
            return this;
        }
        /**
         * Write a `bytes` value, length-delimited arbitrary data.
         */
        bytes(value) {
            this.uint32(value.byteLength); // write length of chunk as varint
            return this.raw(value);
        }
        /**
         * Write a `string` value, length-delimited data converted to UTF-8 text.
         */
        string(value) {
            let chunk = this.textEncoder.encode(value);
            this.uint32(chunk.byteLength); // write length of chunk as varint
            return this.raw(chunk);
        }
        /**
         * Write a `float` value, 32-bit floating point number.
         */
        float(value) {
            assertFloat32(value);
            let chunk = new Uint8Array(4);
            new DataView(chunk.buffer).setFloat32(0, value, true);
            return this.raw(chunk);
        }
        /**
         * Write a `double` value, a 64-bit floating point number.
         */
        double(value) {
            let chunk = new Uint8Array(8);
            new DataView(chunk.buffer).setFloat64(0, value, true);
            return this.raw(chunk);
        }
        /**
         * Write a `fixed32` value, an unsigned, fixed-length 32-bit integer.
         */
        fixed32(value) {
            assertUInt32(value);
            let chunk = new Uint8Array(4);
            new DataView(chunk.buffer).setUint32(0, value, true);
            return this.raw(chunk);
        }
        /**
         * Write a `sfixed32` value, a signed, fixed-length 32-bit integer.
         */
        sfixed32(value) {
            assertInt32(value);
            let chunk = new Uint8Array(4);
            new DataView(chunk.buffer).setInt32(0, value, true);
            return this.raw(chunk);
        }
        /**
         * Write a `sint32` value, a signed, zigzag-encoded 32-bit varint.
         */
        sint32(value) {
            assertInt32(value);
            // zigzag encode
            value = ((value << 1) ^ (value >> 31)) >>> 0;
            varint32write(value, this.buf);
            return this;
        }
        /**
         * Write a `fixed64` value, a signed, fixed-length 64-bit integer.
         */
        sfixed64(value) {
            let chunk = new Uint8Array(8);
            let view = new DataView(chunk.buffer);
            let long = PbLong.from(value);
            view.setInt32(0, long.lo, true);
            view.setInt32(4, long.hi, true);
            return this.raw(chunk);
        }
        /**
         * Write a `fixed64` value, an unsigned, fixed-length 64 bit integer.
         */
        fixed64(value) {
            let chunk = new Uint8Array(8);
            let view = new DataView(chunk.buffer);
            let long = PbULong.from(value);
            view.setInt32(0, long.lo, true);
            view.setInt32(4, long.hi, true);
            return this.raw(chunk);
        }
        /**
         * Write a `int64` value, a signed 64-bit varint.
         */
        int64(value) {
            let long = PbLong.from(value);
            varint64write(long.lo, long.hi, this.buf);
            return this;
        }
        /**
         * Write a `sint64` value, a signed, zig-zag-encoded 64-bit varint.
         */
        sint64(value) {
            let long = PbLong.from(value), 
            // zigzag encode
            sign = long.hi >> 31, lo = (long.lo << 1) ^ sign, hi = ((long.hi << 1) | (long.lo >>> 31)) ^ sign;
            varint64write(lo, hi, this.buf);
            return this;
        }
        /**
         * Write a `uint64` value, an unsigned 64-bit varint.
         */
        uint64(value) {
            let long = PbULong.from(value);
            varint64write(long.lo, long.hi, this.buf);
            return this;
        }
    }

    const defaultsWrite = {
        emitDefaultValues: false,
        enumAsInteger: false,
        useProtoFieldName: false,
        prettySpaces: 0,
    }, defaultsRead = {
        ignoreUnknownFields: false,
    };
    /**
     * Make options for reading JSON data from partial options.
     */
    function jsonReadOptions(options) {
        return options ? Object.assign(Object.assign({}, defaultsRead), options) : defaultsRead;
    }
    /**
     * Make options for writing JSON data from partial options.
     */
    function jsonWriteOptions(options) {
        return options ? Object.assign(Object.assign({}, defaultsWrite), options) : defaultsWrite;
    }

    /**
     * The symbol used as a key on message objects to store the message type.
     *
     * Note that this is an experimental feature - it is here to stay, but
     * implementation details may change without notice.
     */
    const MESSAGE_TYPE = Symbol.for("protobuf-ts/message-type");

    /**
     * Converts snake_case to lowerCamelCase.
     *
     * Should behave like protoc:
     * https://github.com/protocolbuffers/protobuf/blob/e8ae137c96444ea313485ed1118c5e43b2099cf1/src/google/protobuf/compiler/java/java_helpers.cc#L118
     */
    function lowerCamelCase(snakeCase) {
        let capNext = false;
        const sb = [];
        for (let i = 0; i < snakeCase.length; i++) {
            let next = snakeCase.charAt(i);
            if (next == '_') {
                capNext = true;
            }
            else if (/\d/.test(next)) {
                sb.push(next);
                capNext = true;
            }
            else if (capNext) {
                sb.push(next.toUpperCase());
                capNext = false;
            }
            else if (i == 0) {
                sb.push(next.toLowerCase());
            }
            else {
                sb.push(next);
            }
        }
        return sb.join('');
    }

    /**
     * Scalar value types. This is a subset of field types declared by protobuf
     * enum google.protobuf.FieldDescriptorProto.Type The types GROUP and MESSAGE
     * are omitted, but the numerical values are identical.
     */
    var ScalarType;
    (function (ScalarType) {
        // 0 is reserved for errors.
        // Order is weird for historical reasons.
        ScalarType[ScalarType["DOUBLE"] = 1] = "DOUBLE";
        ScalarType[ScalarType["FLOAT"] = 2] = "FLOAT";
        // Not ZigZag encoded.  Negative numbers take 10 bytes.  Use TYPE_SINT64 if
        // negative values are likely.
        ScalarType[ScalarType["INT64"] = 3] = "INT64";
        ScalarType[ScalarType["UINT64"] = 4] = "UINT64";
        // Not ZigZag encoded.  Negative numbers take 10 bytes.  Use TYPE_SINT32 if
        // negative values are likely.
        ScalarType[ScalarType["INT32"] = 5] = "INT32";
        ScalarType[ScalarType["FIXED64"] = 6] = "FIXED64";
        ScalarType[ScalarType["FIXED32"] = 7] = "FIXED32";
        ScalarType[ScalarType["BOOL"] = 8] = "BOOL";
        ScalarType[ScalarType["STRING"] = 9] = "STRING";
        // Tag-delimited aggregate.
        // Group type is deprecated and not supported in proto3. However, Proto3
        // implementations should still be able to parse the group wire format and
        // treat group fields as unknown fields.
        // TYPE_GROUP = 10,
        // TYPE_MESSAGE = 11,  // Length-delimited aggregate.
        // New in version 2.
        ScalarType[ScalarType["BYTES"] = 12] = "BYTES";
        ScalarType[ScalarType["UINT32"] = 13] = "UINT32";
        // TYPE_ENUM = 14,
        ScalarType[ScalarType["SFIXED32"] = 15] = "SFIXED32";
        ScalarType[ScalarType["SFIXED64"] = 16] = "SFIXED64";
        ScalarType[ScalarType["SINT32"] = 17] = "SINT32";
        ScalarType[ScalarType["SINT64"] = 18] = "SINT64";
    })(ScalarType || (ScalarType = {}));
    /**
     * JavaScript representation of 64 bit integral types. Equivalent to the
     * field option "jstype".
     *
     * By default, protobuf-ts represents 64 bit types as `bigint`.
     *
     * You can change the default behaviour by enabling the plugin parameter
     * `long_type_string`, which will represent 64 bit types as `string`.
     *
     * Alternatively, you can change the behaviour for individual fields
     * with the field option "jstype":
     *
     * ```protobuf
     * uint64 my_field = 1 [jstype = JS_STRING];
     * uint64 other_field = 2 [jstype = JS_NUMBER];
     * ```
     */
    var LongType;
    (function (LongType) {
        /**
         * Use JavaScript `bigint`.
         *
         * Field option `[jstype = JS_NORMAL]`.
         */
        LongType[LongType["BIGINT"] = 0] = "BIGINT";
        /**
         * Use JavaScript `string`.
         *
         * Field option `[jstype = JS_STRING]`.
         */
        LongType[LongType["STRING"] = 1] = "STRING";
        /**
         * Use JavaScript `number`.
         *
         * Large values will loose precision.
         *
         * Field option `[jstype = JS_NUMBER]`.
         */
        LongType[LongType["NUMBER"] = 2] = "NUMBER";
    })(LongType || (LongType = {}));
    /**
     * Protobuf 2.1.0 introduced packed repeated fields.
     * Setting the field option `[packed = true]` enables packing.
     *
     * In proto3, all repeated fields are packed by default.
     * Setting the field option `[packed = false]` disables packing.
     *
     * Packed repeated fields are encoded with a single tag,
     * then a length-delimiter, then the element values.
     *
     * Unpacked repeated fields are encoded with a tag and
     * value for each element.
     *
     * `bytes` and `string` cannot be packed.
     */
    var RepeatType;
    (function (RepeatType) {
        /**
         * The field is not repeated.
         */
        RepeatType[RepeatType["NO"] = 0] = "NO";
        /**
         * The field is repeated and should be packed.
         * Invalid for `bytes` and `string`, they cannot be packed.
         */
        RepeatType[RepeatType["PACKED"] = 1] = "PACKED";
        /**
         * The field is repeated but should not be packed.
         * The only valid repeat type for repeated `bytes` and `string`.
         */
        RepeatType[RepeatType["UNPACKED"] = 2] = "UNPACKED";
    })(RepeatType || (RepeatType = {}));
    /**
     * Turns PartialFieldInfo into FieldInfo.
     */
    function normalizeFieldInfo(field) {
        var _a, _b, _c, _d;
        field.localName = (_a = field.localName) !== null && _a !== void 0 ? _a : lowerCamelCase(field.name);
        field.jsonName = (_b = field.jsonName) !== null && _b !== void 0 ? _b : lowerCamelCase(field.name);
        field.repeat = (_c = field.repeat) !== null && _c !== void 0 ? _c : RepeatType.NO;
        field.opt = (_d = field.opt) !== null && _d !== void 0 ? _d : (field.repeat ? false : field.oneof ? false : field.kind == "message");
        return field;
    }

    /**
     * Is the given value a valid oneof group?
     *
     * We represent protobuf `oneof` as algebraic data types (ADT) in generated
     * code. But when working with messages of unknown type, the ADT does not
     * help us.
     *
     * This type guard checks if the given object adheres to the ADT rules, which
     * are as follows:
     *
     * 1) Must be an object.
     *
     * 2) Must have a "oneofKind" discriminator property.
     *
     * 3) If "oneofKind" is `undefined`, no member field is selected. The object
     * must not have any other properties.
     *
     * 4) If "oneofKind" is a `string`, the member field with this name is
     * selected.
     *
     * 5) If a member field is selected, the object must have a second property
     * with this name. The property must not be `undefined`.
     *
     * 6) No extra properties are allowed. The object has either one property
     * (no selection) or two properties (selection).
     *
     */
    function isOneofGroup(any) {
        if (typeof any != 'object' || any === null || !any.hasOwnProperty('oneofKind')) {
            return false;
        }
        switch (typeof any.oneofKind) {
            case "string":
                if (any[any.oneofKind] === undefined)
                    return false;
                return Object.keys(any).length == 2;
            case "undefined":
                return Object.keys(any).length == 1;
            default:
                return false;
        }
    }

    // noinspection JSMethodCanBeStatic
    class ReflectionTypeCheck {
        constructor(info) {
            var _a;
            this.fields = (_a = info.fields) !== null && _a !== void 0 ? _a : [];
        }
        prepare() {
            if (this.data)
                return;
            const req = [], known = [], oneofs = [];
            for (let field of this.fields) {
                if (field.oneof) {
                    if (!oneofs.includes(field.oneof)) {
                        oneofs.push(field.oneof);
                        req.push(field.oneof);
                        known.push(field.oneof);
                    }
                }
                else {
                    known.push(field.localName);
                    switch (field.kind) {
                        case "scalar":
                        case "enum":
                            if (!field.opt || field.repeat)
                                req.push(field.localName);
                            break;
                        case "message":
                            if (field.repeat)
                                req.push(field.localName);
                            break;
                        case "map":
                            req.push(field.localName);
                            break;
                    }
                }
            }
            this.data = { req, known, oneofs: Object.values(oneofs) };
        }
        /**
         * Is the argument a valid message as specified by the
         * reflection information?
         *
         * Checks all field types recursively. The `depth`
         * specifies how deep into the structure the check will be.
         *
         * With a depth of 0, only the presence of fields
         * is checked.
         *
         * With a depth of 1 or more, the field types are checked.
         *
         * With a depth of 2 or more, the members of map, repeated
         * and message fields are checked.
         *
         * Message fields will be checked recursively with depth - 1.
         *
         * The number of map entries / repeated values being checked
         * is < depth.
         */
        is(message, depth, allowExcessProperties = false) {
            if (depth < 0)
                return true;
            if (message === null || message === undefined || typeof message != 'object')
                return false;
            this.prepare();
            let keys = Object.keys(message), data = this.data;
            // if a required field is missing in arg, this cannot be a T
            if (keys.length < data.req.length || data.req.some(n => !keys.includes(n)))
                return false;
            if (!allowExcessProperties) {
                // if the arg contains a key we dont know, this is not a literal T
                if (keys.some(k => !data.known.includes(k)))
                    return false;
            }
            // "With a depth of 0, only the presence and absence of fields is checked."
            // "With a depth of 1 or more, the field types are checked."
            if (depth < 1) {
                return true;
            }
            // check oneof group
            for (const name of data.oneofs) {
                const group = message[name];
                if (!isOneofGroup(group))
                    return false;
                if (group.oneofKind === undefined)
                    continue;
                const field = this.fields.find(f => f.localName === group.oneofKind);
                if (!field)
                    return false; // we found no field, but have a kind, something is wrong
                if (!this.field(group[group.oneofKind], field, allowExcessProperties, depth))
                    return false;
            }
            // check types
            for (const field of this.fields) {
                if (field.oneof !== undefined)
                    continue;
                if (!this.field(message[field.localName], field, allowExcessProperties, depth))
                    return false;
            }
            return true;
        }
        field(arg, field, allowExcessProperties, depth) {
            let repeated = field.repeat;
            switch (field.kind) {
                case "scalar":
                    if (arg === undefined)
                        return field.opt;
                    if (repeated)
                        return this.scalars(arg, field.T, depth, field.L);
                    return this.scalar(arg, field.T, field.L);
                case "enum":
                    if (arg === undefined)
                        return field.opt;
                    if (repeated)
                        return this.scalars(arg, ScalarType.INT32, depth);
                    return this.scalar(arg, ScalarType.INT32);
                case "message":
                    if (arg === undefined)
                        return true;
                    if (repeated)
                        return this.messages(arg, field.T(), allowExcessProperties, depth);
                    return this.message(arg, field.T(), allowExcessProperties, depth);
                case "map":
                    if (typeof arg != 'object' || arg === null)
                        return false;
                    if (depth < 2)
                        return true;
                    if (!this.mapKeys(arg, field.K, depth))
                        return false;
                    switch (field.V.kind) {
                        case "scalar":
                            return this.scalars(Object.values(arg), field.V.T, depth, field.V.L);
                        case "enum":
                            return this.scalars(Object.values(arg), ScalarType.INT32, depth);
                        case "message":
                            return this.messages(Object.values(arg), field.V.T(), allowExcessProperties, depth);
                    }
                    break;
            }
            return true;
        }
        message(arg, type, allowExcessProperties, depth) {
            if (allowExcessProperties) {
                return type.isAssignable(arg, depth);
            }
            return type.is(arg, depth);
        }
        messages(arg, type, allowExcessProperties, depth) {
            if (!Array.isArray(arg))
                return false;
            if (depth < 2)
                return true;
            if (allowExcessProperties) {
                for (let i = 0; i < arg.length && i < depth; i++)
                    if (!type.isAssignable(arg[i], depth - 1))
                        return false;
            }
            else {
                for (let i = 0; i < arg.length && i < depth; i++)
                    if (!type.is(arg[i], depth - 1))
                        return false;
            }
            return true;
        }
        scalar(arg, type, longType) {
            let argType = typeof arg;
            switch (type) {
                case ScalarType.UINT64:
                case ScalarType.FIXED64:
                case ScalarType.INT64:
                case ScalarType.SFIXED64:
                case ScalarType.SINT64:
                    switch (longType) {
                        case LongType.BIGINT:
                            return argType == "bigint";
                        case LongType.NUMBER:
                            return argType == "number" && !isNaN(arg);
                        default:
                            return argType == "string";
                    }
                case ScalarType.BOOL:
                    return argType == 'boolean';
                case ScalarType.STRING:
                    return argType == 'string';
                case ScalarType.BYTES:
                    return arg instanceof Uint8Array;
                case ScalarType.DOUBLE:
                case ScalarType.FLOAT:
                    return argType == 'number' && !isNaN(arg);
                default:
                    // case ScalarType.UINT32:
                    // case ScalarType.FIXED32:
                    // case ScalarType.INT32:
                    // case ScalarType.SINT32:
                    // case ScalarType.SFIXED32:
                    return argType == 'number' && Number.isInteger(arg);
            }
        }
        scalars(arg, type, depth, longType) {
            if (!Array.isArray(arg))
                return false;
            if (depth < 2)
                return true;
            if (Array.isArray(arg))
                for (let i = 0; i < arg.length && i < depth; i++)
                    if (!this.scalar(arg[i], type, longType))
                        return false;
            return true;
        }
        mapKeys(map, type, depth) {
            let keys = Object.keys(map);
            switch (type) {
                case ScalarType.INT32:
                case ScalarType.FIXED32:
                case ScalarType.SFIXED32:
                case ScalarType.SINT32:
                case ScalarType.UINT32:
                    return this.scalars(keys.slice(0, depth).map(k => parseInt(k)), type, depth);
                case ScalarType.BOOL:
                    return this.scalars(keys.slice(0, depth).map(k => k == 'true' ? true : k == 'false' ? false : k), type, depth);
                default:
                    return this.scalars(keys, type, depth, LongType.STRING);
            }
        }
    }

    /**
     * Utility method to convert a PbLong or PbUlong to a JavaScript
     * representation during runtime.
     *
     * Works with generated field information, `undefined` is equivalent
     * to `STRING`.
     */
    function reflectionLongConvert(long, type) {
        switch (type) {
            case LongType.BIGINT:
                return long.toBigInt();
            case LongType.NUMBER:
                return long.toNumber();
            default:
                // case undefined:
                // case LongType.STRING:
                return long.toString();
        }
    }

    /**
     * Reads proto3 messages in canonical JSON format using reflection information.
     *
     * https://developers.google.com/protocol-buffers/docs/proto3#json
     */
    class ReflectionJsonReader {
        constructor(info) {
            this.info = info;
        }
        prepare() {
            var _a;
            if (this.fMap === undefined) {
                this.fMap = {};
                const fieldsInput = (_a = this.info.fields) !== null && _a !== void 0 ? _a : [];
                for (const field of fieldsInput) {
                    this.fMap[field.name] = field;
                    this.fMap[field.jsonName] = field;
                    this.fMap[field.localName] = field;
                }
            }
        }
        // Cannot parse JSON <type of jsonValue> for <type name>#<fieldName>.
        assert(condition, fieldName, jsonValue) {
            if (!condition) {
                let what = typeofJsonValue(jsonValue);
                if (what == "number" || what == "boolean")
                    what = jsonValue.toString();
                throw new Error(`Cannot parse JSON ${what} for ${this.info.typeName}#${fieldName}`);
            }
        }
        /**
         * Reads a message from canonical JSON format into the target message.
         *
         * Repeated fields are appended. Map entries are added, overwriting
         * existing keys.
         *
         * If a message field is already present, it will be merged with the
         * new data.
         */
        read(input, message, options) {
            this.prepare();
            const oneofsHandled = [];
            for (const [jsonKey, jsonValue] of Object.entries(input)) {
                const field = this.fMap[jsonKey];
                if (!field) {
                    if (!options.ignoreUnknownFields)
                        throw new Error(`Found unknown field while reading ${this.info.typeName} from JSON format. JSON key: ${jsonKey}`);
                    continue;
                }
                const localName = field.localName;
                // handle oneof ADT
                let target; // this will be the target for the field value, whether it is member of a oneof or not
                if (field.oneof) {
                    if (jsonValue === null && (field.kind !== 'enum' || field.T()[0] !== 'google.protobuf.NullValue')) {
                        continue;
                    }
                    // since json objects are unordered by specification, it is not possible to take the last of multiple oneofs
                    if (oneofsHandled.includes(field.oneof))
                        throw new Error(`Multiple members of the oneof group "${field.oneof}" of ${this.info.typeName} are present in JSON.`);
                    oneofsHandled.push(field.oneof);
                    target = message[field.oneof] = {
                        oneofKind: localName
                    };
                }
                else {
                    target = message;
                }
                // we have handled oneof above. we just have read the value into `target`.
                if (field.kind == 'map') {
                    if (jsonValue === null) {
                        continue;
                    }
                    // check input
                    this.assert(isJsonObject(jsonValue), field.name, jsonValue);
                    // our target to put map entries into
                    const fieldObj = target[localName];
                    // read entries
                    for (const [jsonObjKey, jsonObjValue] of Object.entries(jsonValue)) {
                        this.assert(jsonObjValue !== null, field.name + " map value", null);
                        // read value
                        let val;
                        switch (field.V.kind) {
                            case "message":
                                val = field.V.T().internalJsonRead(jsonObjValue, options);
                                break;
                            case "enum":
                                val = this.enum(field.V.T(), jsonObjValue, field.name, options.ignoreUnknownFields);
                                if (val === false)
                                    continue;
                                break;
                            case "scalar":
                                val = this.scalar(jsonObjValue, field.V.T, field.V.L, field.name);
                                break;
                        }
                        this.assert(val !== undefined, field.name + " map value", jsonObjValue);
                        // read key
                        let key = jsonObjKey;
                        if (field.K == ScalarType.BOOL)
                            key = key == "true" ? true : key == "false" ? false : key;
                        key = this.scalar(key, field.K, LongType.STRING, field.name).toString();
                        fieldObj[key] = val;
                    }
                }
                else if (field.repeat) {
                    if (jsonValue === null)
                        continue;
                    // check input
                    this.assert(Array.isArray(jsonValue), field.name, jsonValue);
                    // our target to put array entries into
                    const fieldArr = target[localName];
                    // read array entries
                    for (const jsonItem of jsonValue) {
                        this.assert(jsonItem !== null, field.name, null);
                        let val;
                        switch (field.kind) {
                            case "message":
                                val = field.T().internalJsonRead(jsonItem, options);
                                break;
                            case "enum":
                                val = this.enum(field.T(), jsonItem, field.name, options.ignoreUnknownFields);
                                if (val === false)
                                    continue;
                                break;
                            case "scalar":
                                val = this.scalar(jsonItem, field.T, field.L, field.name);
                                break;
                        }
                        this.assert(val !== undefined, field.name, jsonValue);
                        fieldArr.push(val);
                    }
                }
                else {
                    switch (field.kind) {
                        case "message":
                            if (jsonValue === null && field.T().typeName != 'google.protobuf.Value') {
                                this.assert(field.oneof === undefined, field.name + " (oneof member)", null);
                                continue;
                            }
                            target[localName] = field.T().internalJsonRead(jsonValue, options, target[localName]);
                            break;
                        case "enum":
                            if (jsonValue === null)
                                continue;
                            let val = this.enum(field.T(), jsonValue, field.name, options.ignoreUnknownFields);
                            if (val === false)
                                continue;
                            target[localName] = val;
                            break;
                        case "scalar":
                            if (jsonValue === null)
                                continue;
                            target[localName] = this.scalar(jsonValue, field.T, field.L, field.name);
                            break;
                    }
                }
            }
        }
        /**
         * Returns `false` for unrecognized string representations.
         *
         * google.protobuf.NullValue accepts only JSON `null` (or the old `"NULL_VALUE"`).
         */
        enum(type, json, fieldName, ignoreUnknownFields) {
            if (type[0] == 'google.protobuf.NullValue')
                assert(json === null || json === "NULL_VALUE", `Unable to parse field ${this.info.typeName}#${fieldName}, enum ${type[0]} only accepts null.`);
            if (json === null)
                // we require 0 to be default value for all enums
                return 0;
            switch (typeof json) {
                case "number":
                    assert(Number.isInteger(json), `Unable to parse field ${this.info.typeName}#${fieldName}, enum can only be integral number, got ${json}.`);
                    return json;
                case "string":
                    let localEnumName = json;
                    if (type[2] && json.substring(0, type[2].length) === type[2])
                        // lookup without the shared prefix
                        localEnumName = json.substring(type[2].length);
                    let enumNumber = type[1][localEnumName];
                    if (typeof enumNumber === 'undefined' && ignoreUnknownFields) {
                        return false;
                    }
                    assert(typeof enumNumber == "number", `Unable to parse field ${this.info.typeName}#${fieldName}, enum ${type[0]} has no value for "${json}".`);
                    return enumNumber;
            }
            assert(false, `Unable to parse field ${this.info.typeName}#${fieldName}, cannot parse enum value from ${typeof json}".`);
        }
        scalar(json, type, longType, fieldName) {
            let e;
            try {
                switch (type) {
                    // float, double: JSON value will be a number or one of the special string values "NaN", "Infinity", and "-Infinity".
                    // Either numbers or strings are accepted. Exponent notation is also accepted.
                    case ScalarType.DOUBLE:
                    case ScalarType.FLOAT:
                        if (json === null)
                            return .0;
                        if (json === "NaN")
                            return Number.NaN;
                        if (json === "Infinity")
                            return Number.POSITIVE_INFINITY;
                        if (json === "-Infinity")
                            return Number.NEGATIVE_INFINITY;
                        if (json === "") {
                            e = "empty string";
                            break;
                        }
                        if (typeof json == "string" && json.trim().length !== json.length) {
                            e = "extra whitespace";
                            break;
                        }
                        if (typeof json != "string" && typeof json != "number") {
                            break;
                        }
                        let float = Number(json);
                        if (Number.isNaN(float)) {
                            e = "not a number";
                            break;
                        }
                        if (!Number.isFinite(float)) {
                            // infinity and -infinity are handled by string representation above, so this is an error
                            e = "too large or small";
                            break;
                        }
                        if (type == ScalarType.FLOAT)
                            assertFloat32(float);
                        return float;
                    // int32, fixed32, uint32: JSON value will be a decimal number. Either numbers or strings are accepted.
                    case ScalarType.INT32:
                    case ScalarType.FIXED32:
                    case ScalarType.SFIXED32:
                    case ScalarType.SINT32:
                    case ScalarType.UINT32:
                        if (json === null)
                            return 0;
                        let int32;
                        if (typeof json == "number")
                            int32 = json;
                        else if (json === "")
                            e = "empty string";
                        else if (typeof json == "string") {
                            if (json.trim().length !== json.length)
                                e = "extra whitespace";
                            else
                                int32 = Number(json);
                        }
                        if (int32 === undefined)
                            break;
                        if (type == ScalarType.UINT32)
                            assertUInt32(int32);
                        else
                            assertInt32(int32);
                        return int32;
                    // int64, fixed64, uint64: JSON value will be a decimal string. Either numbers or strings are accepted.
                    case ScalarType.INT64:
                    case ScalarType.SFIXED64:
                    case ScalarType.SINT64:
                        if (json === null)
                            return reflectionLongConvert(PbLong.ZERO, longType);
                        if (typeof json != "number" && typeof json != "string")
                            break;
                        return reflectionLongConvert(PbLong.from(json), longType);
                    case ScalarType.FIXED64:
                    case ScalarType.UINT64:
                        if (json === null)
                            return reflectionLongConvert(PbULong.ZERO, longType);
                        if (typeof json != "number" && typeof json != "string")
                            break;
                        return reflectionLongConvert(PbULong.from(json), longType);
                    // bool:
                    case ScalarType.BOOL:
                        if (json === null)
                            return false;
                        if (typeof json !== "boolean")
                            break;
                        return json;
                    // string:
                    case ScalarType.STRING:
                        if (json === null)
                            return "";
                        if (typeof json !== "string") {
                            e = "extra whitespace";
                            break;
                        }
                        try {
                            encodeURIComponent(json);
                        }
                        catch (e) {
                            e = "invalid UTF8";
                            break;
                        }
                        return json;
                    // bytes: JSON value will be the data encoded as a string using standard base64 encoding with paddings.
                    // Either standard or URL-safe base64 encoding with/without paddings are accepted.
                    case ScalarType.BYTES:
                        if (json === null || json === "")
                            return new Uint8Array(0);
                        if (typeof json !== 'string')
                            break;
                        return base64decode(json);
                }
            }
            catch (error) {
                e = error.message;
            }
            this.assert(false, fieldName + (e ? " - " + e : ""), json);
        }
    }

    /**
     * Writes proto3 messages in canonical JSON format using reflection
     * information.
     *
     * https://developers.google.com/protocol-buffers/docs/proto3#json
     */
    class ReflectionJsonWriter {
        constructor(info) {
            var _a;
            this.fields = (_a = info.fields) !== null && _a !== void 0 ? _a : [];
        }
        /**
         * Converts the message to a JSON object, based on the field descriptors.
         */
        write(message, options) {
            const json = {}, source = message;
            for (const field of this.fields) {
                // field is not part of a oneof, simply write as is
                if (!field.oneof) {
                    let jsonValue = this.field(field, source[field.localName], options);
                    if (jsonValue !== undefined)
                        json[options.useProtoFieldName ? field.name : field.jsonName] = jsonValue;
                    continue;
                }
                // field is part of a oneof
                const group = source[field.oneof];
                if (group.oneofKind !== field.localName)
                    continue; // not selected, skip
                const opt = field.kind == 'scalar' || field.kind == 'enum'
                    ? Object.assign(Object.assign({}, options), { emitDefaultValues: true }) : options;
                let jsonValue = this.field(field, group[field.localName], opt);
                assert(jsonValue !== undefined);
                json[options.useProtoFieldName ? field.name : field.jsonName] = jsonValue;
            }
            return json;
        }
        field(field, value, options) {
            let jsonValue = undefined;
            if (field.kind == 'map') {
                assert(typeof value == "object" && value !== null);
                const jsonObj = {};
                switch (field.V.kind) {
                    case "scalar":
                        for (const [entryKey, entryValue] of Object.entries(value)) {
                            const val = this.scalar(field.V.T, entryValue, field.name, false, true);
                            assert(val !== undefined);
                            jsonObj[entryKey.toString()] = val; // JSON standard allows only (double quoted) string as property key
                        }
                        break;
                    case "message":
                        const messageType = field.V.T();
                        for (const [entryKey, entryValue] of Object.entries(value)) {
                            const val = this.message(messageType, entryValue, field.name, options);
                            assert(val !== undefined);
                            jsonObj[entryKey.toString()] = val; // JSON standard allows only (double quoted) string as property key
                        }
                        break;
                    case "enum":
                        const enumInfo = field.V.T();
                        for (const [entryKey, entryValue] of Object.entries(value)) {
                            assert(entryValue === undefined || typeof entryValue == 'number');
                            const val = this.enum(enumInfo, entryValue, field.name, false, true, options.enumAsInteger);
                            assert(val !== undefined);
                            jsonObj[entryKey.toString()] = val; // JSON standard allows only (double quoted) string as property key
                        }
                        break;
                }
                if (options.emitDefaultValues || Object.keys(jsonObj).length > 0)
                    jsonValue = jsonObj;
            }
            else if (field.repeat) {
                assert(Array.isArray(value));
                const jsonArr = [];
                switch (field.kind) {
                    case "scalar":
                        for (let i = 0; i < value.length; i++) {
                            const val = this.scalar(field.T, value[i], field.name, field.opt, true);
                            assert(val !== undefined);
                            jsonArr.push(val);
                        }
                        break;
                    case "enum":
                        const enumInfo = field.T();
                        for (let i = 0; i < value.length; i++) {
                            assert(value[i] === undefined || typeof value[i] == 'number');
                            const val = this.enum(enumInfo, value[i], field.name, field.opt, true, options.enumAsInteger);
                            assert(val !== undefined);
                            jsonArr.push(val);
                        }
                        break;
                    case "message":
                        const messageType = field.T();
                        for (let i = 0; i < value.length; i++) {
                            const val = this.message(messageType, value[i], field.name, options);
                            assert(val !== undefined);
                            jsonArr.push(val);
                        }
                        break;
                }
                // add converted array to json output
                if (options.emitDefaultValues || jsonArr.length > 0 || options.emitDefaultValues)
                    jsonValue = jsonArr;
            }
            else {
                switch (field.kind) {
                    case "scalar":
                        jsonValue = this.scalar(field.T, value, field.name, field.opt, options.emitDefaultValues);
                        break;
                    case "enum":
                        jsonValue = this.enum(field.T(), value, field.name, field.opt, options.emitDefaultValues, options.enumAsInteger);
                        break;
                    case "message":
                        jsonValue = this.message(field.T(), value, field.name, options);
                        break;
                }
            }
            return jsonValue;
        }
        /**
         * Returns `null` as the default for google.protobuf.NullValue.
         */
        enum(type, value, fieldName, optional, emitDefaultValues, enumAsInteger) {
            if (type[0] == 'google.protobuf.NullValue')
                return !emitDefaultValues && !optional ? undefined : null;
            if (value === undefined) {
                assert(optional);
                return undefined;
            }
            if (value === 0 && !emitDefaultValues && !optional)
                // we require 0 to be default value for all enums
                return undefined;
            assert(typeof value == 'number');
            assert(Number.isInteger(value));
            if (enumAsInteger || !type[1].hasOwnProperty(value))
                // if we don't now the enum value, just return the number
                return value;
            if (type[2])
                // restore the dropped prefix
                return type[2] + type[1][value];
            return type[1][value];
        }
        message(type, value, fieldName, options) {
            if (value === undefined)
                return options.emitDefaultValues ? null : undefined;
            return type.internalJsonWrite(value, options);
        }
        scalar(type, value, fieldName, optional, emitDefaultValues) {
            if (value === undefined) {
                assert(optional);
                return undefined;
            }
            const ed = emitDefaultValues || optional;
            // noinspection FallThroughInSwitchStatementJS
            switch (type) {
                // int32, fixed32, uint32: JSON value will be a decimal number. Either numbers or strings are accepted.
                case ScalarType.INT32:
                case ScalarType.SFIXED32:
                case ScalarType.SINT32:
                    if (value === 0)
                        return ed ? 0 : undefined;
                    assertInt32(value);
                    return value;
                case ScalarType.FIXED32:
                case ScalarType.UINT32:
                    if (value === 0)
                        return ed ? 0 : undefined;
                    assertUInt32(value);
                    return value;
                // float, double: JSON value will be a number or one of the special string values "NaN", "Infinity", and "-Infinity".
                // Either numbers or strings are accepted. Exponent notation is also accepted.
                case ScalarType.FLOAT:
                    assertFloat32(value);
                case ScalarType.DOUBLE:
                    if (value === 0)
                        return ed ? 0 : undefined;
                    assert(typeof value == 'number');
                    if (Number.isNaN(value))
                        return 'NaN';
                    if (value === Number.POSITIVE_INFINITY)
                        return 'Infinity';
                    if (value === Number.NEGATIVE_INFINITY)
                        return '-Infinity';
                    return value;
                // string:
                case ScalarType.STRING:
                    if (value === "")
                        return ed ? '' : undefined;
                    assert(typeof value == 'string');
                    return value;
                // bool:
                case ScalarType.BOOL:
                    if (value === false)
                        return ed ? false : undefined;
                    assert(typeof value == 'boolean');
                    return value;
                // JSON value will be a decimal string. Either numbers or strings are accepted.
                case ScalarType.UINT64:
                case ScalarType.FIXED64:
                    assert(typeof value == 'number' || typeof value == 'string' || typeof value == 'bigint');
                    let ulong = PbULong.from(value);
                    if (ulong.isZero() && !ed)
                        return undefined;
                    return ulong.toString();
                // JSON value will be a decimal string. Either numbers or strings are accepted.
                case ScalarType.INT64:
                case ScalarType.SFIXED64:
                case ScalarType.SINT64:
                    assert(typeof value == 'number' || typeof value == 'string' || typeof value == 'bigint');
                    let long = PbLong.from(value);
                    if (long.isZero() && !ed)
                        return undefined;
                    return long.toString();
                // bytes: JSON value will be the data encoded as a string using standard base64 encoding with paddings.
                // Either standard or URL-safe base64 encoding with/without paddings are accepted.
                case ScalarType.BYTES:
                    assert(value instanceof Uint8Array);
                    if (!value.byteLength)
                        return ed ? "" : undefined;
                    return base64encode(value);
            }
        }
    }

    /**
     * Creates the default value for a scalar type.
     */
    function reflectionScalarDefault(type, longType = LongType.STRING) {
        switch (type) {
            case ScalarType.BOOL:
                return false;
            case ScalarType.UINT64:
            case ScalarType.FIXED64:
                return reflectionLongConvert(PbULong.ZERO, longType);
            case ScalarType.INT64:
            case ScalarType.SFIXED64:
            case ScalarType.SINT64:
                return reflectionLongConvert(PbLong.ZERO, longType);
            case ScalarType.DOUBLE:
            case ScalarType.FLOAT:
                return 0.0;
            case ScalarType.BYTES:
                return new Uint8Array(0);
            case ScalarType.STRING:
                return "";
            default:
                // case ScalarType.INT32:
                // case ScalarType.UINT32:
                // case ScalarType.SINT32:
                // case ScalarType.FIXED32:
                // case ScalarType.SFIXED32:
                return 0;
        }
    }

    /**
     * Reads proto3 messages in binary format using reflection information.
     *
     * https://developers.google.com/protocol-buffers/docs/encoding
     */
    class ReflectionBinaryReader {
        constructor(info) {
            this.info = info;
        }
        prepare() {
            var _a;
            if (!this.fieldNoToField) {
                const fieldsInput = (_a = this.info.fields) !== null && _a !== void 0 ? _a : [];
                this.fieldNoToField = new Map(fieldsInput.map(field => [field.no, field]));
            }
        }
        /**
         * Reads a message from binary format into the target message.
         *
         * Repeated fields are appended. Map entries are added, overwriting
         * existing keys.
         *
         * If a message field is already present, it will be merged with the
         * new data.
         */
        read(reader, message, options, length) {
            this.prepare();
            const end = length === undefined ? reader.len : reader.pos + length;
            while (reader.pos < end) {
                // read the tag and find the field
                const [fieldNo, wireType] = reader.tag(), field = this.fieldNoToField.get(fieldNo);
                if (!field) {
                    let u = options.readUnknownField;
                    if (u == "throw")
                        throw new Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.info.typeName}`);
                    let d = reader.skip(wireType);
                    if (u !== false)
                        (u === true ? UnknownFieldHandler.onRead : u)(this.info.typeName, message, fieldNo, wireType, d);
                    continue;
                }
                // target object for the field we are reading
                let target = message, repeated = field.repeat, localName = field.localName;
                // if field is member of oneof ADT, use ADT as target
                if (field.oneof) {
                    target = target[field.oneof];
                    // if other oneof member selected, set new ADT
                    if (target.oneofKind !== localName)
                        target = message[field.oneof] = {
                            oneofKind: localName
                        };
                }
                // we have handled oneof above, we just have read the value into `target[localName]`
                switch (field.kind) {
                    case "scalar":
                    case "enum":
                        let T = field.kind == "enum" ? ScalarType.INT32 : field.T;
                        let L = field.kind == "scalar" ? field.L : undefined;
                        if (repeated) {
                            let arr = target[localName]; // safe to assume presence of array, oneof cannot contain repeated values
                            if (wireType == WireType.LengthDelimited && T != ScalarType.STRING && T != ScalarType.BYTES) {
                                let e = reader.uint32() + reader.pos;
                                while (reader.pos < e)
                                    arr.push(this.scalar(reader, T, L));
                            }
                            else
                                arr.push(this.scalar(reader, T, L));
                        }
                        else
                            target[localName] = this.scalar(reader, T, L);
                        break;
                    case "message":
                        if (repeated) {
                            let arr = target[localName]; // safe to assume presence of array, oneof cannot contain repeated values
                            let msg = field.T().internalBinaryRead(reader, reader.uint32(), options);
                            arr.push(msg);
                        }
                        else
                            target[localName] = field.T().internalBinaryRead(reader, reader.uint32(), options, target[localName]);
                        break;
                    case "map":
                        let [mapKey, mapVal] = this.mapEntry(field, reader, options);
                        // safe to assume presence of map object, oneof cannot contain repeated values
                        target[localName][mapKey] = mapVal;
                        break;
                }
            }
        }
        /**
         * Read a map field, expecting key field = 1, value field = 2
         */
        mapEntry(field, reader, options) {
            let length = reader.uint32();
            let end = reader.pos + length;
            let key = undefined; // javascript only allows number or string for object properties
            let val = undefined;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case 1:
                        if (field.K == ScalarType.BOOL)
                            key = reader.bool().toString();
                        else
                            // long types are read as string, number types are okay as number
                            key = this.scalar(reader, field.K, LongType.STRING);
                        break;
                    case 2:
                        switch (field.V.kind) {
                            case "scalar":
                                val = this.scalar(reader, field.V.T, field.V.L);
                                break;
                            case "enum":
                                val = reader.int32();
                                break;
                            case "message":
                                val = field.V.T().internalBinaryRead(reader, reader.uint32(), options);
                                break;
                        }
                        break;
                    default:
                        throw new Error(`Unknown field ${fieldNo} (wire type ${wireType}) in map entry for ${this.info.typeName}#${field.name}`);
                }
            }
            if (key === undefined) {
                let keyRaw = reflectionScalarDefault(field.K);
                key = field.K == ScalarType.BOOL ? keyRaw.toString() : keyRaw;
            }
            if (val === undefined)
                switch (field.V.kind) {
                    case "scalar":
                        val = reflectionScalarDefault(field.V.T, field.V.L);
                        break;
                    case "enum":
                        val = 0;
                        break;
                    case "message":
                        val = field.V.T().create();
                        break;
                }
            return [key, val];
        }
        scalar(reader, type, longType) {
            switch (type) {
                case ScalarType.INT32:
                    return reader.int32();
                case ScalarType.STRING:
                    return reader.string();
                case ScalarType.BOOL:
                    return reader.bool();
                case ScalarType.DOUBLE:
                    return reader.double();
                case ScalarType.FLOAT:
                    return reader.float();
                case ScalarType.INT64:
                    return reflectionLongConvert(reader.int64(), longType);
                case ScalarType.UINT64:
                    return reflectionLongConvert(reader.uint64(), longType);
                case ScalarType.FIXED64:
                    return reflectionLongConvert(reader.fixed64(), longType);
                case ScalarType.FIXED32:
                    return reader.fixed32();
                case ScalarType.BYTES:
                    return reader.bytes();
                case ScalarType.UINT32:
                    return reader.uint32();
                case ScalarType.SFIXED32:
                    return reader.sfixed32();
                case ScalarType.SFIXED64:
                    return reflectionLongConvert(reader.sfixed64(), longType);
                case ScalarType.SINT32:
                    return reader.sint32();
                case ScalarType.SINT64:
                    return reflectionLongConvert(reader.sint64(), longType);
            }
        }
    }

    /**
     * Writes proto3 messages in binary format using reflection information.
     *
     * https://developers.google.com/protocol-buffers/docs/encoding
     */
    class ReflectionBinaryWriter {
        constructor(info) {
            this.info = info;
        }
        prepare() {
            if (!this.fields) {
                const fieldsInput = this.info.fields ? this.info.fields.concat() : [];
                this.fields = fieldsInput.sort((a, b) => a.no - b.no);
            }
        }
        /**
         * Writes the message to binary format.
         */
        write(message, writer, options) {
            this.prepare();
            for (const field of this.fields) {
                let value, // this will be our field value, whether it is member of a oneof or not
                emitDefault, // whether we emit the default value (only true for oneof members)
                repeated = field.repeat, localName = field.localName;
                // handle oneof ADT
                if (field.oneof) {
                    const group = message[field.oneof];
                    if (group.oneofKind !== localName)
                        continue; // if field is not selected, skip
                    value = group[localName];
                    emitDefault = true;
                }
                else {
                    value = message[localName];
                    emitDefault = false;
                }
                // we have handled oneof above. we just have to honor `emitDefault`.
                switch (field.kind) {
                    case "scalar":
                    case "enum":
                        let T = field.kind == "enum" ? ScalarType.INT32 : field.T;
                        if (repeated) {
                            assert(Array.isArray(value));
                            if (repeated == RepeatType.PACKED)
                                this.packed(writer, T, field.no, value);
                            else
                                for (const item of value)
                                    this.scalar(writer, T, field.no, item, true);
                        }
                        else if (value === undefined)
                            assert(field.opt);
                        else
                            this.scalar(writer, T, field.no, value, emitDefault || field.opt);
                        break;
                    case "message":
                        if (repeated) {
                            assert(Array.isArray(value));
                            for (const item of value)
                                this.message(writer, options, field.T(), field.no, item);
                        }
                        else {
                            this.message(writer, options, field.T(), field.no, value);
                        }
                        break;
                    case "map":
                        assert(typeof value == 'object' && value !== null);
                        for (const [key, val] of Object.entries(value))
                            this.mapEntry(writer, options, field, key, val);
                        break;
                }
            }
            let u = options.writeUnknownFields;
            if (u !== false)
                (u === true ? UnknownFieldHandler.onWrite : u)(this.info.typeName, message, writer);
        }
        mapEntry(writer, options, field, key, value) {
            writer.tag(field.no, WireType.LengthDelimited);
            writer.fork();
            // javascript only allows number or string for object properties
            // we convert from our representation to the protobuf type
            let keyValue = key;
            switch (field.K) {
                case ScalarType.INT32:
                case ScalarType.FIXED32:
                case ScalarType.UINT32:
                case ScalarType.SFIXED32:
                case ScalarType.SINT32:
                    keyValue = Number.parseInt(key);
                    break;
                case ScalarType.BOOL:
                    assert(key == 'true' || key == 'false');
                    keyValue = key == 'true';
                    break;
            }
            // write key, expecting key field number = 1
            this.scalar(writer, field.K, 1, keyValue, true);
            // write value, expecting value field number = 2
            switch (field.V.kind) {
                case 'scalar':
                    this.scalar(writer, field.V.T, 2, value, true);
                    break;
                case 'enum':
                    this.scalar(writer, ScalarType.INT32, 2, value, true);
                    break;
                case 'message':
                    this.message(writer, options, field.V.T(), 2, value);
                    break;
            }
            writer.join();
        }
        message(writer, options, handler, fieldNo, value) {
            if (value === undefined)
                return;
            handler.internalBinaryWrite(value, writer.tag(fieldNo, WireType.LengthDelimited).fork(), options);
            writer.join();
        }
        /**
         * Write a single scalar value.
         */
        scalar(writer, type, fieldNo, value, emitDefault) {
            let [wireType, method, isDefault] = this.scalarInfo(type, value);
            if (!isDefault || emitDefault) {
                writer.tag(fieldNo, wireType);
                writer[method](value);
            }
        }
        /**
         * Write an array of scalar values in packed format.
         */
        packed(writer, type, fieldNo, value) {
            if (!value.length)
                return;
            assert(type !== ScalarType.BYTES && type !== ScalarType.STRING);
            // write tag
            writer.tag(fieldNo, WireType.LengthDelimited);
            // begin length-delimited
            writer.fork();
            // write values without tags
            let [, method,] = this.scalarInfo(type);
            for (let i = 0; i < value.length; i++)
                writer[method](value[i]);
            // end length delimited
            writer.join();
        }
        /**
         * Get information for writing a scalar value.
         *
         * Returns tuple:
         * [0]: appropriate WireType
         * [1]: name of the appropriate method of IBinaryWriter
         * [2]: whether the given value is a default value
         *
         * If argument `value` is omitted, [2] is always false.
         */
        scalarInfo(type, value) {
            let t = WireType.Varint;
            let m;
            let i = value === undefined;
            let d = value === 0;
            switch (type) {
                case ScalarType.INT32:
                    m = "int32";
                    break;
                case ScalarType.STRING:
                    d = i || !value.length;
                    t = WireType.LengthDelimited;
                    m = "string";
                    break;
                case ScalarType.BOOL:
                    d = value === false;
                    m = "bool";
                    break;
                case ScalarType.UINT32:
                    m = "uint32";
                    break;
                case ScalarType.DOUBLE:
                    t = WireType.Bit64;
                    m = "double";
                    break;
                case ScalarType.FLOAT:
                    t = WireType.Bit32;
                    m = "float";
                    break;
                case ScalarType.INT64:
                    d = i || PbLong.from(value).isZero();
                    m = "int64";
                    break;
                case ScalarType.UINT64:
                    d = i || PbULong.from(value).isZero();
                    m = "uint64";
                    break;
                case ScalarType.FIXED64:
                    d = i || PbULong.from(value).isZero();
                    t = WireType.Bit64;
                    m = "fixed64";
                    break;
                case ScalarType.BYTES:
                    d = i || !value.byteLength;
                    t = WireType.LengthDelimited;
                    m = "bytes";
                    break;
                case ScalarType.FIXED32:
                    t = WireType.Bit32;
                    m = "fixed32";
                    break;
                case ScalarType.SFIXED32:
                    t = WireType.Bit32;
                    m = "sfixed32";
                    break;
                case ScalarType.SFIXED64:
                    d = i || PbLong.from(value).isZero();
                    t = WireType.Bit64;
                    m = "sfixed64";
                    break;
                case ScalarType.SINT32:
                    m = "sint32";
                    break;
                case ScalarType.SINT64:
                    d = i || PbLong.from(value).isZero();
                    m = "sint64";
                    break;
            }
            return [t, m, i || d];
        }
    }

    /**
     * Creates an instance of the generic message, using the field
     * information.
     */
    function reflectionCreate(type) {
        /**
         * This ternary can be removed in the next major version.
         * The `Object.create()` code path utilizes a new `messagePrototype`
         * property on the `IMessageType` which has this same `MESSAGE_TYPE`
         * non-enumerable property on it. Doing it this way means that we only
         * pay the cost of `Object.defineProperty()` once per `IMessageType`
         * class of once per "instance". The falsy code path is only provided
         * for backwards compatibility in cases where the runtime library is
         * updated without also updating the generated code.
         */
        const msg = type.messagePrototype
            ? Object.create(type.messagePrototype)
            : Object.defineProperty({}, MESSAGE_TYPE, { value: type });
        for (let field of type.fields) {
            let name = field.localName;
            if (field.opt)
                continue;
            if (field.oneof)
                msg[field.oneof] = { oneofKind: undefined };
            else if (field.repeat)
                msg[name] = [];
            else
                switch (field.kind) {
                    case "scalar":
                        msg[name] = reflectionScalarDefault(field.T, field.L);
                        break;
                    case "enum":
                        // we require 0 to be default value for all enums
                        msg[name] = 0;
                        break;
                    case "map":
                        msg[name] = {};
                        break;
                }
        }
        return msg;
    }

    /**
     * Copy partial data into the target message.
     *
     * If a singular scalar or enum field is present in the source, it
     * replaces the field in the target.
     *
     * If a singular message field is present in the source, it is merged
     * with the target field by calling mergePartial() of the responsible
     * message type.
     *
     * If a repeated field is present in the source, its values replace
     * all values in the target array, removing extraneous values.
     * Repeated message fields are copied, not merged.
     *
     * If a map field is present in the source, entries are added to the
     * target map, replacing entries with the same key. Entries that only
     * exist in the target remain. Entries with message values are copied,
     * not merged.
     *
     * Note that this function differs from protobuf merge semantics,
     * which appends repeated fields.
     */
    function reflectionMergePartial(info, target, source) {
        let fieldValue, // the field value we are working with
        input = source, output; // where we want our field value to go
        for (let field of info.fields) {
            let name = field.localName;
            if (field.oneof) {
                const group = input[field.oneof]; // this is the oneof`s group in the source
                if ((group === null || group === void 0 ? void 0 : group.oneofKind) == undefined) { // the user is free to omit
                    continue; // we skip this field, and all other members too
                }
                fieldValue = group[name]; // our value comes from the the oneof group of the source
                output = target[field.oneof]; // and our output is the oneof group of the target
                output.oneofKind = group.oneofKind; // always update discriminator
                if (fieldValue == undefined) {
                    delete output[name]; // remove any existing value
                    continue; // skip further work on field
                }
            }
            else {
                fieldValue = input[name]; // we are using the source directly
                output = target; // we want our field value to go directly into the target
                if (fieldValue == undefined) {
                    continue; // skip further work on field, existing value is used as is
                }
            }
            if (field.repeat)
                output[name].length = fieldValue.length; // resize target array to match source array
            // now we just work with `fieldValue` and `output` to merge the value
            switch (field.kind) {
                case "scalar":
                case "enum":
                    if (field.repeat)
                        for (let i = 0; i < fieldValue.length; i++)
                            output[name][i] = fieldValue[i]; // not a reference type
                    else
                        output[name] = fieldValue; // not a reference type
                    break;
                case "message":
                    let T = field.T();
                    if (field.repeat)
                        for (let i = 0; i < fieldValue.length; i++)
                            output[name][i] = T.create(fieldValue[i]);
                    else if (output[name] === undefined)
                        output[name] = T.create(fieldValue); // nothing to merge with
                    else
                        T.mergePartial(output[name], fieldValue);
                    break;
                case "map":
                    // Map and repeated fields are simply overwritten, not appended or merged
                    switch (field.V.kind) {
                        case "scalar":
                        case "enum":
                            Object.assign(output[name], fieldValue); // elements are not reference types
                            break;
                        case "message":
                            let T = field.V.T();
                            for (let k of Object.keys(fieldValue))
                                output[name][k] = T.create(fieldValue[k]);
                            break;
                    }
                    break;
            }
        }
    }

    /**
     * Determines whether two message of the same type have the same field values.
     * Checks for deep equality, traversing repeated fields, oneof groups, maps
     * and messages recursively.
     * Will also return true if both messages are `undefined`.
     */
    function reflectionEquals(info, a, b) {
        if (a === b)
            return true;
        if (!a || !b)
            return false;
        for (let field of info.fields) {
            let localName = field.localName;
            let val_a = field.oneof ? a[field.oneof][localName] : a[localName];
            let val_b = field.oneof ? b[field.oneof][localName] : b[localName];
            switch (field.kind) {
                case "enum":
                case "scalar":
                    let t = field.kind == "enum" ? ScalarType.INT32 : field.T;
                    if (!(field.repeat
                        ? repeatedPrimitiveEq(t, val_a, val_b)
                        : primitiveEq(t, val_a, val_b)))
                        return false;
                    break;
                case "map":
                    if (!(field.V.kind == "message"
                        ? repeatedMsgEq(field.V.T(), objectValues(val_a), objectValues(val_b))
                        : repeatedPrimitiveEq(field.V.kind == "enum" ? ScalarType.INT32 : field.V.T, objectValues(val_a), objectValues(val_b))))
                        return false;
                    break;
                case "message":
                    let T = field.T();
                    if (!(field.repeat
                        ? repeatedMsgEq(T, val_a, val_b)
                        : T.equals(val_a, val_b)))
                        return false;
                    break;
            }
        }
        return true;
    }
    const objectValues = Object.values;
    function primitiveEq(type, a, b) {
        if (a === b)
            return true;
        if (type !== ScalarType.BYTES)
            return false;
        let ba = a;
        let bb = b;
        if (ba.length !== bb.length)
            return false;
        for (let i = 0; i < ba.length; i++)
            if (ba[i] != bb[i])
                return false;
        return true;
    }
    function repeatedPrimitiveEq(type, a, b) {
        if (a.length !== b.length)
            return false;
        for (let i = 0; i < a.length; i++)
            if (!primitiveEq(type, a[i], b[i]))
                return false;
        return true;
    }
    function repeatedMsgEq(type, a, b) {
        if (a.length !== b.length)
            return false;
        for (let i = 0; i < a.length; i++)
            if (!type.equals(a[i], b[i]))
                return false;
        return true;
    }

    const baseDescriptors = Object.getOwnPropertyDescriptors(Object.getPrototypeOf({}));
    /**
     * This standard message type provides reflection-based
     * operations to work with a message.
     */
    class MessageType {
        constructor(name, fields, options) {
            this.defaultCheckDepth = 16;
            this.typeName = name;
            this.fields = fields.map(normalizeFieldInfo);
            this.options = options !== null && options !== void 0 ? options : {};
            this.messagePrototype = Object.create(null, Object.assign(Object.assign({}, baseDescriptors), { [MESSAGE_TYPE]: { value: this } }));
            this.refTypeCheck = new ReflectionTypeCheck(this);
            this.refJsonReader = new ReflectionJsonReader(this);
            this.refJsonWriter = new ReflectionJsonWriter(this);
            this.refBinReader = new ReflectionBinaryReader(this);
            this.refBinWriter = new ReflectionBinaryWriter(this);
        }
        create(value) {
            let message = reflectionCreate(this);
            if (value !== undefined) {
                reflectionMergePartial(this, message, value);
            }
            return message;
        }
        /**
         * Clone the message.
         *
         * Unknown fields are discarded.
         */
        clone(message) {
            let copy = this.create();
            reflectionMergePartial(this, copy, message);
            return copy;
        }
        /**
         * Determines whether two message of the same type have the same field values.
         * Checks for deep equality, traversing repeated fields, oneof groups, maps
         * and messages recursively.
         * Will also return true if both messages are `undefined`.
         */
        equals(a, b) {
            return reflectionEquals(this, a, b);
        }
        /**
         * Is the given value assignable to our message type
         * and contains no [excess properties](https://www.typescriptlang.org/docs/handbook/interfaces.html#excess-property-checks)?
         */
        is(arg, depth = this.defaultCheckDepth) {
            return this.refTypeCheck.is(arg, depth, false);
        }
        /**
         * Is the given value assignable to our message type,
         * regardless of [excess properties](https://www.typescriptlang.org/docs/handbook/interfaces.html#excess-property-checks)?
         */
        isAssignable(arg, depth = this.defaultCheckDepth) {
            return this.refTypeCheck.is(arg, depth, true);
        }
        /**
         * Copy partial data into the target message.
         */
        mergePartial(target, source) {
            reflectionMergePartial(this, target, source);
        }
        /**
         * Create a new message from binary format.
         */
        fromBinary(data, options) {
            let opt = binaryReadOptions(options);
            return this.internalBinaryRead(opt.readerFactory(data), data.byteLength, opt);
        }
        /**
         * Read a new message from a JSON value.
         */
        fromJson(json, options) {
            return this.internalJsonRead(json, jsonReadOptions(options));
        }
        /**
         * Read a new message from a JSON string.
         * This is equivalent to `T.fromJson(JSON.parse(json))`.
         */
        fromJsonString(json, options) {
            let value = JSON.parse(json);
            return this.fromJson(value, options);
        }
        /**
         * Write the message to canonical JSON value.
         */
        toJson(message, options) {
            return this.internalJsonWrite(message, jsonWriteOptions(options));
        }
        /**
         * Convert the message to canonical JSON string.
         * This is equivalent to `JSON.stringify(T.toJson(t))`
         */
        toJsonString(message, options) {
            var _a;
            let value = this.toJson(message, options);
            return JSON.stringify(value, null, (_a = options === null || options === void 0 ? void 0 : options.prettySpaces) !== null && _a !== void 0 ? _a : 0);
        }
        /**
         * Write the message to binary format.
         */
        toBinary(message, options) {
            let opt = binaryWriteOptions(options);
            return this.internalBinaryWrite(message, opt.writerFactory(), opt).finish();
        }
        /**
         * This is an internal method. If you just want to read a message from
         * JSON, use `fromJson()` or `fromJsonString()`.
         *
         * Reads JSON value and merges the fields into the target
         * according to protobuf rules. If the target is omitted,
         * a new instance is created first.
         */
        internalJsonRead(json, options, target) {
            if (json !== null && typeof json == "object" && !Array.isArray(json)) {
                let message = target !== null && target !== void 0 ? target : this.create();
                this.refJsonReader.read(json, message, options);
                return message;
            }
            throw new Error(`Unable to parse message ${this.typeName} from JSON ${typeofJsonValue(json)}.`);
        }
        /**
         * This is an internal method. If you just want to write a message
         * to JSON, use `toJson()` or `toJsonString().
         *
         * Writes JSON value and returns it.
         */
        internalJsonWrite(message, options) {
            return this.refJsonWriter.write(message, options);
        }
        /**
         * This is an internal method. If you just want to write a message
         * in binary format, use `toBinary()`.
         *
         * Serializes the message in binary format and appends it to the given
         * writer. Returns passed writer.
         */
        internalBinaryWrite(message, writer, options) {
            this.refBinWriter.write(message, writer, options);
            return writer;
        }
        /**
         * This is an internal method. If you just want to read a message from
         * binary data, use `fromBinary()`.
         *
         * Reads data from binary format and merges the fields into
         * the target according to protobuf rules. If the target is
         * omitted, a new instance is created first.
         */
        internalBinaryRead(reader, length, options, target) {
            let message = target !== null && target !== void 0 ? target : this.create();
            this.refBinReader.read(reader, message, options, length);
            return message;
        }
    }

    /**
     * @generated from protobuf enum bilibili.playershared.ConfType
     */
    var ConfType;
    (function (ConfType) {
        /**
         * @generated from protobuf enum value: NO_TYPE = 0;
         */
        ConfType[ConfType["NO_TYPE"] = 0] = "NO_TYPE";
        /**
         * @generated from protobuf enum value: BACKGROUNDPLAY = 9;
         */
        ConfType[ConfType["BACKGROUNDPLAY"] = 9] = "BACKGROUNDPLAY";
        /**
         * @generated from protobuf enum value: SMALLWINDOW = 23;
         */
        ConfType[ConfType["SMALLWINDOW"] = 23] = "SMALLWINDOW";
        /**
         * @generated from protobuf enum value: FREYAENTER = 31;
         */
        ConfType[ConfType["FREYAENTER"] = 31] = "FREYAENTER";
        /**
         * @generated from protobuf enum value: FREYAFULLENTER = 32;
         */
        ConfType[ConfType["FREYAFULLENTER"] = 32] = "FREYAFULLENTER";
        /**
         * @generated from protobuf enum value: SKIPOPED = 33;
         */
        ConfType[ConfType["SKIPOPED"] = 33] = "SKIPOPED";
    })(ConfType || (ConfType = {}));
    /**
     * @generated from protobuf enum bilibili.playershared.BizType
     */
    var BizType;
    (function (BizType) {
        /**
         * @generated from protobuf enum value: BIZ_TYPE_UNKNOWN = 0;
         */
        BizType[BizType["UNKNOWN"] = 0] = "UNKNOWN";
        /**
         * @generated from protobuf enum value: BIZ_TYPE_UGC = 1;
         */
        BizType[BizType["UGC"] = 1] = "UGC";
        /**
         * @generated from protobuf enum value: BIZ_TYPE_PGC = 2;
         */
        BizType[BizType["PGC"] = 2] = "PGC";
        /**
         * @generated from protobuf enum value: BIZ_TYPE_PUGV = 3;
         */
        BizType[BizType["PUGV"] = 3] = "PUGV";
    })(BizType || (BizType = {}));
    // @generated message type with reflection information, may provide speed optimized methods
    class VideoVod$Type extends MessageType {
        constructor() {
            super("bilibili.playershared.VideoVod", [
                { no: 1, name: "aid", kind: "scalar", T: 3 /*ScalarType.INT64*/ },
                { no: 2, name: "cid", kind: "scalar", T: 3 /*ScalarType.INT64*/ }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.aid = "0";
            message.cid = "0";
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* int64 aid */ 1:
                        message.aid = reader.int64().toString();
                        break;
                    case /* int64 cid */ 2:
                        message.cid = reader.int64().toString();
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* int64 aid = 1; */
            if (message.aid !== "0")
                writer.tag(1, WireType.Varint).int64(message.aid);
            /* int64 cid = 2; */
            if (message.cid !== "0")
                writer.tag(2, WireType.Varint).int64(message.cid);
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.playershared.VideoVod
     */
    const VideoVod = new VideoVod$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class VodInfo$Type extends MessageType {
        constructor() {
            super("bilibili.playershared.VodInfo", [
                { no: 5, name: "stream_list", kind: "message", repeat: 2 /*RepeatType.UNPACKED*/, T: () => Stream }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.streamList = [];
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* repeated bilibili.playershared.Stream stream_list */ 5:
                        message.streamList.push(Stream.internalBinaryRead(reader, reader.uint32(), options));
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* repeated bilibili.playershared.Stream stream_list = 5; */
            for (let i = 0; i < message.streamList.length; i++)
                Stream.internalBinaryWrite(message.streamList[i], writer.tag(5, WireType.LengthDelimited).fork(), options).join();
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.playershared.VodInfo
     */
    const VodInfo = new VodInfo$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class Stream$Type extends MessageType {
        constructor() {
            super("bilibili.playershared.Stream", [
                { no: 1, name: "stream_info", kind: "message", T: () => StreamInfo }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* bilibili.playershared.StreamInfo stream_info */ 1:
                        message.streamInfo = StreamInfo.internalBinaryRead(reader, reader.uint32(), options, message.streamInfo);
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* bilibili.playershared.StreamInfo stream_info = 1; */
            if (message.streamInfo)
                StreamInfo.internalBinaryWrite(message.streamInfo, writer.tag(1, WireType.LengthDelimited).fork(), options).join();
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.playershared.Stream
     */
    const Stream = new Stream$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class StreamInfo$Type extends MessageType {
        constructor() {
            super("bilibili.playershared.StreamInfo", [
                { no: 6, name: "need_vip", kind: "scalar", opt: true, T: 8 /*ScalarType.BOOL*/ }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* optional bool need_vip */ 6:
                        message.needVip = reader.bool();
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* optional bool need_vip = 6; */
            if (message.needVip !== undefined)
                writer.tag(6, WireType.Varint).bool(message.needVip);
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.playershared.StreamInfo
     */
    const StreamInfo = new StreamInfo$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class PlayArcConf$Type extends MessageType {
        constructor() {
            super("bilibili.playershared.PlayArcConf", [
                { no: 1, name: "arc_confs", kind: "map", K: 5 /*ScalarType.INT32*/, V: { kind: "message", T: () => ArcConf } }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.arcConfs = {};
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* map<int32, bilibili.playershared.ArcConf> arc_confs */ 1:
                        this.binaryReadMap1(message.arcConfs, reader, options);
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        binaryReadMap1(map, reader, options) {
            let len = reader.uint32(), end = reader.pos + len, key, val;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case 1:
                        key = reader.int32();
                        break;
                    case 2:
                        val = ArcConf.internalBinaryRead(reader, reader.uint32(), options);
                        break;
                    default: throw new globalThis.Error("unknown map entry field for field bilibili.playershared.PlayArcConf.arc_confs");
                }
            }
            map[key ?? 0] = val ?? ArcConf.create();
        }
        internalBinaryWrite(message, writer, options) {
            /* map<int32, bilibili.playershared.ArcConf> arc_confs = 1; */
            for (let k of globalThis.Object.keys(message.arcConfs)) {
                writer.tag(1, WireType.LengthDelimited).fork().tag(1, WireType.Varint).int32(parseInt(k));
                writer.tag(2, WireType.LengthDelimited).fork();
                ArcConf.internalBinaryWrite(message.arcConfs[k], writer, options);
                writer.join().join();
            }
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.playershared.PlayArcConf
     */
    const PlayArcConf = new PlayArcConf$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class ArcConf$Type extends MessageType {
        constructor() {
            super("bilibili.playershared.ArcConf", [
                { no: 1, name: "is_support", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
                { no: 2, name: "disabled", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
                { no: 3, name: "extra_content", kind: "message", T: () => ExtraContent },
                { no: 4, name: "unsupport_scene", kind: "scalar", repeat: 1 /*RepeatType.PACKED*/, T: 5 /*ScalarType.INT32*/ }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.isSupport = false;
            message.disabled = false;
            message.unsupportScene = [];
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* bool is_support */ 1:
                        message.isSupport = reader.bool();
                        break;
                    case /* bool disabled */ 2:
                        message.disabled = reader.bool();
                        break;
                    case /* bilibili.playershared.ExtraContent extra_content */ 3:
                        message.extraContent = ExtraContent.internalBinaryRead(reader, reader.uint32(), options, message.extraContent);
                        break;
                    case /* repeated int32 unsupport_scene */ 4:
                        if (wireType === WireType.LengthDelimited)
                            for (let e = reader.int32() + reader.pos; reader.pos < e;)
                                message.unsupportScene.push(reader.int32());
                        else
                            message.unsupportScene.push(reader.int32());
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* bool is_support = 1; */
            if (message.isSupport !== false)
                writer.tag(1, WireType.Varint).bool(message.isSupport);
            /* bool disabled = 2; */
            if (message.disabled !== false)
                writer.tag(2, WireType.Varint).bool(message.disabled);
            /* bilibili.playershared.ExtraContent extra_content = 3; */
            if (message.extraContent)
                ExtraContent.internalBinaryWrite(message.extraContent, writer.tag(3, WireType.LengthDelimited).fork(), options).join();
            /* repeated int32 unsupport_scene = 4; */
            if (message.unsupportScene.length) {
                writer.tag(4, WireType.LengthDelimited).fork();
                for (let i = 0; i < message.unsupportScene.length; i++)
                    writer.int32(message.unsupportScene[i]);
                writer.join();
            }
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.playershared.ArcConf
     */
    const ArcConf = new ArcConf$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class ExtraContent$Type extends MessageType {
        constructor() {
            super("bilibili.playershared.ExtraContent", [
                { no: 1, name: "disable_reason", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
                { no: 2, name: "disable_code", kind: "scalar", T: 3 /*ScalarType.INT64*/ }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.disableReason = "";
            message.disableCode = "0";
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* string disable_reason */ 1:
                        message.disableReason = reader.string();
                        break;
                    case /* int64 disable_code */ 2:
                        message.disableCode = reader.int64().toString();
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* string disable_reason = 1; */
            if (message.disableReason !== "")
                writer.tag(1, WireType.LengthDelimited).string(message.disableReason);
            /* int64 disable_code = 2; */
            if (message.disableCode !== "0")
                writer.tag(2, WireType.Varint).int64(message.disableCode);
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.playershared.ExtraContent
     */
    const ExtraContent = new ExtraContent$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class PlayArc$Type extends MessageType {
        constructor() {
            super("bilibili.playershared.PlayArc", [
                { no: 1, name: "video_type", kind: "enum", T: () => ["bilibili.playershared.BizType", BizType, "BIZ_TYPE_"] }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.videoType = 0;
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* bilibili.playershared.BizType video_type */ 1:
                        message.videoType = reader.int32();
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* bilibili.playershared.BizType video_type = 1; */
            if (message.videoType !== 0)
                writer.tag(1, WireType.Varint).int32(message.videoType);
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.playershared.PlayArc
     */
    const PlayArc = new PlayArc$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    let ViewInfo$Type$1 = class ViewInfo$Type extends MessageType {
        constructor() {
            super("bilibili.playershared.ViewInfo", [
                { no: 2, name: "prompt_bar", kind: "scalar", T: 12 /*ScalarType.BYTES*/ }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.promptBar = new Uint8Array(0);
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* bytes prompt_bar */ 2:
                        message.promptBar = reader.bytes();
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* bytes prompt_bar = 2; */
            if (message.promptBar.length)
                writer.tag(2, WireType.LengthDelimited).bytes(message.promptBar);
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    };
    /**
     * @generated MessageType for protobuf message bilibili.playershared.ViewInfo
     */
    const ViewInfo$1 = new ViewInfo$Type$1();

    // @generated message type with reflection information, may provide speed optimized methods
    class Any$Type extends MessageType {
        constructor() {
            super("google.protobuf.Any", [
                { no: 1, name: "type_url", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
                { no: 2, name: "value", kind: "scalar", T: 12 /*ScalarType.BYTES*/ }
            ]);
        }
        /**
         * Pack the message into a new `Any`.
         *
         * Uses 'type.googleapis.com/full.type.name' as the type URL.
         */
        pack(message, type) {
            return {
                typeUrl: this.typeNameToUrl(type.typeName), value: type.toBinary(message),
            };
        }
        /**
         * Unpack the message from the `Any`.
         */
        unpack(any, type, options) {
            if (!this.contains(any, type))
                throw new Error("Cannot unpack google.protobuf.Any with typeUrl '" + any.typeUrl + "' as " + type.typeName + ".");
            return type.fromBinary(any.value, options);
        }
        /**
         * Does the given `Any` contain a packed message of the given type?
         */
        contains(any, type) {
            if (!any.typeUrl.length)
                return false;
            let wants = typeof type == "string" ? type : type.typeName;
            let has = this.typeUrlToName(any.typeUrl);
            return wants === has;
        }
        /**
         * Convert the message to canonical JSON value.
         *
         * You have to provide the `typeRegistry` option so that the
         * packed message can be converted to JSON.
         *
         * The `typeRegistry` option is also required to read
         * `google.protobuf.Any` from JSON format.
         */
        internalJsonWrite(any, options) {
            if (any.typeUrl === "")
                return {};
            let typeName = this.typeUrlToName(any.typeUrl);
            let opt = jsonWriteOptions(options);
            let type = opt.typeRegistry?.find(t => t.typeName === typeName);
            if (!type)
                throw new globalThis.Error("Unable to convert google.protobuf.Any with typeUrl '" + any.typeUrl + "' to JSON. The specified type " + typeName + " is not available in the type registry.");
            let value = type.fromBinary(any.value, { readUnknownField: false });
            let json = type.internalJsonWrite(value, opt);
            if (typeName.startsWith("google.protobuf.") || !isJsonObject(json))
                json = { value: json };
            json["@type"] = any.typeUrl;
            return json;
        }
        internalJsonRead(json, options, target) {
            if (!isJsonObject(json))
                throw new globalThis.Error("Unable to parse google.protobuf.Any from JSON " + typeofJsonValue(json) + ".");
            if (typeof json["@type"] != "string" || json["@type"] == "")
                return this.create();
            let typeName = this.typeUrlToName(json["@type"]);
            let type = options?.typeRegistry?.find(t => t.typeName == typeName);
            if (!type)
                throw new globalThis.Error("Unable to parse google.protobuf.Any from JSON. The specified type " + typeName + " is not available in the type registry.");
            let value;
            if (typeName.startsWith("google.protobuf.") && json.hasOwnProperty("value"))
                value = type.fromJson(json["value"], options);
            else {
                let copy = Object.assign({}, json);
                delete copy["@type"];
                value = type.fromJson(copy, options);
            }
            if (target === undefined)
                target = this.create();
            target.typeUrl = json["@type"];
            target.value = type.toBinary(value);
            return target;
        }
        typeNameToUrl(name) {
            if (!name.length)
                throw new Error("invalid type name: " + name);
            return "type.googleapis.com/" + name;
        }
        typeUrlToName(url) {
            if (!url.length)
                throw new Error("invalid type url: " + url);
            let slash = url.lastIndexOf("/");
            let name = slash > 0 ? url.substring(slash + 1) : url;
            if (!name.length)
                throw new Error("invalid type url: " + url);
            return name;
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.typeUrl = "";
            message.value = new Uint8Array(0);
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* string type_url */ 1:
                        message.typeUrl = reader.string();
                        break;
                    case /* bytes value */ 2:
                        message.value = reader.bytes();
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* string type_url = 1; */
            if (message.typeUrl !== "")
                writer.tag(1, WireType.LengthDelimited).string(message.typeUrl);
            /* bytes value = 2; */
            if (message.value.length)
                writer.tag(2, WireType.LengthDelimited).bytes(message.value);
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message google.protobuf.Any
     */
    const Any = new Any$Type();

    // @generated message type with reflection information, may provide speed optimized methods
    class PlayViewUniteReq$Type extends MessageType {
        constructor() {
            super("bilibili.app.playerunite.v1.PlayViewUniteReq", [
                { no: 1, name: "vod", kind: "message", T: () => VideoVod },
                { no: 5, name: "bvid", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.bvid = "";
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* bilibili.playershared.VideoVod vod */ 1:
                        message.vod = VideoVod.internalBinaryRead(reader, reader.uint32(), options, message.vod);
                        break;
                    case /* string bvid */ 5:
                        message.bvid = reader.string();
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* bilibili.playershared.VideoVod vod = 1; */
            if (message.vod)
                VideoVod.internalBinaryWrite(message.vod, writer.tag(1, WireType.LengthDelimited).fork(), options).join();
            /* string bvid = 5; */
            if (message.bvid !== "")
                writer.tag(5, WireType.LengthDelimited).string(message.bvid);
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.app.playerunite.v1.PlayViewUniteReq
     */
    const PlayViewUniteReq = new PlayViewUniteReq$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class PlayViewUniteReply$Type extends MessageType {
        constructor() {
            super("bilibili.app.playerunite.v1.PlayViewUniteReply", [
                { no: 1, name: "vod_info", kind: "message", T: () => VodInfo },
                { no: 2, name: "play_arc_conf", kind: "message", T: () => PlayArcConf },
                { no: 5, name: "supplement", kind: "message", T: () => Any },
                { no: 6, name: "play_arc", kind: "message", T: () => PlayArc },
                { no: 9, name: "view_info", kind: "message", T: () => ViewInfo$1 }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* bilibili.playershared.VodInfo vod_info */ 1:
                        message.vodInfo = VodInfo.internalBinaryRead(reader, reader.uint32(), options, message.vodInfo);
                        break;
                    case /* bilibili.playershared.PlayArcConf play_arc_conf */ 2:
                        message.playArcConf = PlayArcConf.internalBinaryRead(reader, reader.uint32(), options, message.playArcConf);
                        break;
                    case /* google.protobuf.Any supplement */ 5:
                        message.supplement = Any.internalBinaryRead(reader, reader.uint32(), options, message.supplement);
                        break;
                    case /* bilibili.playershared.PlayArc play_arc */ 6:
                        message.playArc = PlayArc.internalBinaryRead(reader, reader.uint32(), options, message.playArc);
                        break;
                    case /* bilibili.playershared.ViewInfo view_info */ 9:
                        message.viewInfo = ViewInfo$1.internalBinaryRead(reader, reader.uint32(), options, message.viewInfo);
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* bilibili.playershared.VodInfo vod_info = 1; */
            if (message.vodInfo)
                VodInfo.internalBinaryWrite(message.vodInfo, writer.tag(1, WireType.LengthDelimited).fork(), options).join();
            /* bilibili.playershared.PlayArcConf play_arc_conf = 2; */
            if (message.playArcConf)
                PlayArcConf.internalBinaryWrite(message.playArcConf, writer.tag(2, WireType.LengthDelimited).fork(), options).join();
            /* google.protobuf.Any supplement = 5; */
            if (message.supplement)
                Any.internalBinaryWrite(message.supplement, writer.tag(5, WireType.LengthDelimited).fork(), options).join();
            /* bilibili.playershared.PlayArc play_arc = 6; */
            if (message.playArc)
                PlayArc.internalBinaryWrite(message.playArc, writer.tag(6, WireType.LengthDelimited).fork(), options).join();
            /* bilibili.playershared.ViewInfo view_info = 9; */
            if (message.viewInfo)
                ViewInfo$1.internalBinaryWrite(message.viewInfo, writer.tag(9, WireType.LengthDelimited).fork(), options).join();
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.app.playerunite.v1.PlayViewUniteReply
     */
    const PlayViewUniteReply = new PlayViewUniteReply$Type();

    /**
     * @generated from protobuf enum bilibili.pgc.gateway.player.v2.ClipType
     */
    var ClipType;
    (function (ClipType) {
        /**
         * @generated from protobuf enum value: NT_UNKNOWN = 0;
         */
        ClipType[ClipType["NT_UNKNOWN"] = 0] = "NT_UNKNOWN";
        /**
         * @generated from protobuf enum value: CLIP_TYPE_OP = 1;
         */
        ClipType[ClipType["CLIP_TYPE_OP"] = 1] = "CLIP_TYPE_OP";
        /**
         * @generated from protobuf enum value: CLIP_TYPE_ED = 2;
         */
        ClipType[ClipType["CLIP_TYPE_ED"] = 2] = "CLIP_TYPE_ED";
    })(ClipType || (ClipType = {}));
    // @generated message type with reflection information, may provide speed optimized methods
    class PlayViewReply$Type extends MessageType {
        constructor() {
            super("bilibili.pgc.gateway.player.v2.PlayViewReply", [
                { no: 5, name: "view_info", kind: "message", T: () => ViewInfo },
                { no: 6, name: "play_ext_conf", kind: "message", T: () => PlayAbilityExtConf }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* bilibili.pgc.gateway.player.v2.ViewInfo view_info */ 5:
                        message.viewInfo = ViewInfo.internalBinaryRead(reader, reader.uint32(), options, message.viewInfo);
                        break;
                    case /* bilibili.pgc.gateway.player.v2.PlayAbilityExtConf play_ext_conf */ 6:
                        message.playExtConf = PlayAbilityExtConf.internalBinaryRead(reader, reader.uint32(), options, message.playExtConf);
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* bilibili.pgc.gateway.player.v2.ViewInfo view_info = 5; */
            if (message.viewInfo)
                ViewInfo.internalBinaryWrite(message.viewInfo, writer.tag(5, WireType.LengthDelimited).fork(), options).join();
            /* bilibili.pgc.gateway.player.v2.PlayAbilityExtConf play_ext_conf = 6; */
            if (message.playExtConf)
                PlayAbilityExtConf.internalBinaryWrite(message.playExtConf, writer.tag(6, WireType.LengthDelimited).fork(), options).join();
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.pgc.gateway.player.v2.PlayViewReply
     */
    new PlayViewReply$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class ViewInfo$Type extends MessageType {
        constructor() {
            super("bilibili.pgc.gateway.player.v2.ViewInfo", [
                { no: 8, name: "try_watch_prompt_bar", kind: "scalar", T: 12 /*ScalarType.BYTES*/ }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.tryWatchPromptBar = new Uint8Array(0);
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* bytes try_watch_prompt_bar */ 8:
                        message.tryWatchPromptBar = reader.bytes();
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* bytes try_watch_prompt_bar = 8; */
            if (message.tryWatchPromptBar.length)
                writer.tag(8, WireType.LengthDelimited).bytes(message.tryWatchPromptBar);
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.pgc.gateway.player.v2.ViewInfo
     */
    const ViewInfo = new ViewInfo$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class PlayAbilityExtConf$Type extends MessageType {
        constructor() {
            super("bilibili.pgc.gateway.player.v2.PlayAbilityExtConf", [
                { no: 1, name: "allow_close_subtitle", kind: "scalar", T: 8 /*ScalarType.BOOL*/ },
                { no: 3, name: "cast_tips", kind: "message", T: () => CastTips }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.allowCloseSubtitle = false;
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* bool allow_close_subtitle */ 1:
                        message.allowCloseSubtitle = reader.bool();
                        break;
                    case /* bilibili.pgc.gateway.player.v2.CastTips cast_tips */ 3:
                        message.castTips = CastTips.internalBinaryRead(reader, reader.uint32(), options, message.castTips);
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* bool allow_close_subtitle = 1; */
            if (message.allowCloseSubtitle !== false)
                writer.tag(1, WireType.Varint).bool(message.allowCloseSubtitle);
            /* bilibili.pgc.gateway.player.v2.CastTips cast_tips = 3; */
            if (message.castTips)
                CastTips.internalBinaryWrite(message.castTips, writer.tag(3, WireType.LengthDelimited).fork(), options).join();
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.pgc.gateway.player.v2.PlayAbilityExtConf
     */
    const PlayAbilityExtConf = new PlayAbilityExtConf$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class CastTips$Type extends MessageType {
        constructor() {
            super("bilibili.pgc.gateway.player.v2.CastTips", [
                { no: 1, name: "code", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 2, name: "message", kind: "scalar", T: 9 /*ScalarType.STRING*/ }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.code = 0;
            message.message = "";
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* int32 code */ 1:
                        message.code = reader.int32();
                        break;
                    case /* string message */ 2:
                        message.message = reader.string();
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* int32 code = 1; */
            if (message.code !== 0)
                writer.tag(1, WireType.Varint).int32(message.code);
            /* string message = 2; */
            if (message.message !== "")
                writer.tag(2, WireType.LengthDelimited).string(message.message);
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.pgc.gateway.player.v2.CastTips
     */
    const CastTips = new CastTips$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class PlayViewBusinessInfo$Type extends MessageType {
        constructor() {
            super("bilibili.pgc.gateway.player.v2.PlayViewBusinessInfo", [
                { no: 6, name: "clip_info", kind: "message", repeat: 2 /*RepeatType.UNPACKED*/, T: () => ClipInfo },
                { no: 16, name: "vip_status", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 18, name: "episode_info", kind: "message", T: () => EpisodeInfo },
                { no: 20, name: "user_status", kind: "message", T: () => UserStatus }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.clipInfo = [];
            message.vipStatus = 0;
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* repeated bilibili.pgc.gateway.player.v2.ClipInfo clip_info */ 6:
                        message.clipInfo.push(ClipInfo.internalBinaryRead(reader, reader.uint32(), options));
                        break;
                    case /* int32 vip_status */ 16:
                        message.vipStatus = reader.int32();
                        break;
                    case /* bilibili.pgc.gateway.player.v2.EpisodeInfo episode_info */ 18:
                        message.episodeInfo = EpisodeInfo.internalBinaryRead(reader, reader.uint32(), options, message.episodeInfo);
                        break;
                    case /* bilibili.pgc.gateway.player.v2.UserStatus user_status */ 20:
                        message.userStatus = UserStatus.internalBinaryRead(reader, reader.uint32(), options, message.userStatus);
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* repeated bilibili.pgc.gateway.player.v2.ClipInfo clip_info = 6; */
            for (let i = 0; i < message.clipInfo.length; i++)
                ClipInfo.internalBinaryWrite(message.clipInfo[i], writer.tag(6, WireType.LengthDelimited).fork(), options).join();
            /* int32 vip_status = 16; */
            if (message.vipStatus !== 0)
                writer.tag(16, WireType.Varint).int32(message.vipStatus);
            /* bilibili.pgc.gateway.player.v2.EpisodeInfo episode_info = 18; */
            if (message.episodeInfo)
                EpisodeInfo.internalBinaryWrite(message.episodeInfo, writer.tag(18, WireType.LengthDelimited).fork(), options).join();
            /* bilibili.pgc.gateway.player.v2.UserStatus user_status = 20; */
            if (message.userStatus)
                UserStatus.internalBinaryWrite(message.userStatus, writer.tag(20, WireType.LengthDelimited).fork(), options).join();
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.pgc.gateway.player.v2.PlayViewBusinessInfo
     */
    const PlayViewBusinessInfo = new PlayViewBusinessInfo$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class ClipInfo$Type extends MessageType {
        constructor() {
            super("bilibili.pgc.gateway.player.v2.ClipInfo", [
                { no: 2, name: "start", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 3, name: "end", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 4, name: "clip_type", kind: "enum", T: () => ["bilibili.pgc.gateway.player.v2.ClipType", ClipType] }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.start = 0;
            message.end = 0;
            message.clipType = 0;
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* int32 start */ 2:
                        message.start = reader.int32();
                        break;
                    case /* int32 end */ 3:
                        message.end = reader.int32();
                        break;
                    case /* bilibili.pgc.gateway.player.v2.ClipType clip_type */ 4:
                        message.clipType = reader.int32();
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* int32 start = 2; */
            if (message.start !== 0)
                writer.tag(2, WireType.Varint).int32(message.start);
            /* int32 end = 3; */
            if (message.end !== 0)
                writer.tag(3, WireType.Varint).int32(message.end);
            /* bilibili.pgc.gateway.player.v2.ClipType clip_type = 4; */
            if (message.clipType !== 0)
                writer.tag(4, WireType.Varint).int32(message.clipType);
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.pgc.gateway.player.v2.ClipInfo
     */
    const ClipInfo = new ClipInfo$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class EpisodeInfo$Type extends MessageType {
        constructor() {
            super("bilibili.pgc.gateway.player.v2.EpisodeInfo", [
                { no: 1, name: "ep_id", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 2, name: "cid", kind: "scalar", T: 3 /*ScalarType.INT64*/ },
                { no: 3, name: "aid", kind: "scalar", T: 3 /*ScalarType.INT64*/ },
                { no: 4, name: "ep_status", kind: "scalar", T: 3 /*ScalarType.INT64*/ },
                { no: 5, name: "season_info", kind: "message", T: () => SeasonInfo }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.epId = 0;
            message.cid = "0";
            message.aid = "0";
            message.epStatus = "0";
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* int32 ep_id */ 1:
                        message.epId = reader.int32();
                        break;
                    case /* int64 cid */ 2:
                        message.cid = reader.int64().toString();
                        break;
                    case /* int64 aid */ 3:
                        message.aid = reader.int64().toString();
                        break;
                    case /* int64 ep_status */ 4:
                        message.epStatus = reader.int64().toString();
                        break;
                    case /* bilibili.pgc.gateway.player.v2.SeasonInfo season_info */ 5:
                        message.seasonInfo = SeasonInfo.internalBinaryRead(reader, reader.uint32(), options, message.seasonInfo);
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* int32 ep_id = 1; */
            if (message.epId !== 0)
                writer.tag(1, WireType.Varint).int32(message.epId);
            /* int64 cid = 2; */
            if (message.cid !== "0")
                writer.tag(2, WireType.Varint).int64(message.cid);
            /* int64 aid = 3; */
            if (message.aid !== "0")
                writer.tag(3, WireType.Varint).int64(message.aid);
            /* int64 ep_status = 4; */
            if (message.epStatus !== "0")
                writer.tag(4, WireType.Varint).int64(message.epStatus);
            /* bilibili.pgc.gateway.player.v2.SeasonInfo season_info = 5; */
            if (message.seasonInfo)
                SeasonInfo.internalBinaryWrite(message.seasonInfo, writer.tag(5, WireType.LengthDelimited).fork(), options).join();
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.pgc.gateway.player.v2.EpisodeInfo
     */
    const EpisodeInfo = new EpisodeInfo$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class SeasonInfo$Type extends MessageType {
        constructor() {
            super("bilibili.pgc.gateway.player.v2.SeasonInfo", [
                { no: 1, name: "season_id", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 2, name: "season_type", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 3, name: "season_status", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 7, name: "mode", kind: "scalar", T: 5 /*ScalarType.INT32*/ }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.seasonId = 0;
            message.seasonType = 0;
            message.seasonStatus = 0;
            message.mode = 0;
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* int32 season_id */ 1:
                        message.seasonId = reader.int32();
                        break;
                    case /* int32 season_type */ 2:
                        message.seasonType = reader.int32();
                        break;
                    case /* int32 season_status */ 3:
                        message.seasonStatus = reader.int32();
                        break;
                    case /* int32 mode */ 7:
                        message.mode = reader.int32();
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* int32 season_id = 1; */
            if (message.seasonId !== 0)
                writer.tag(1, WireType.Varint).int32(message.seasonId);
            /* int32 season_type = 2; */
            if (message.seasonType !== 0)
                writer.tag(2, WireType.Varint).int32(message.seasonType);
            /* int32 season_status = 3; */
            if (message.seasonStatus !== 0)
                writer.tag(3, WireType.Varint).int32(message.seasonStatus);
            /* int32 mode = 7; */
            if (message.mode !== 0)
                writer.tag(7, WireType.Varint).int32(message.mode);
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.pgc.gateway.player.v2.SeasonInfo
     */
    const SeasonInfo = new SeasonInfo$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class UserStatus$Type extends MessageType {
        constructor() {
            super("bilibili.pgc.gateway.player.v2.UserStatus", [
                { no: 3, name: "watch_progress", kind: "message", T: () => WatchProgress }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* bilibili.pgc.gateway.player.v2.WatchProgress watch_progress */ 3:
                        message.watchProgress = WatchProgress.internalBinaryRead(reader, reader.uint32(), options, message.watchProgress);
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* bilibili.pgc.gateway.player.v2.WatchProgress watch_progress = 3; */
            if (message.watchProgress)
                WatchProgress.internalBinaryWrite(message.watchProgress, writer.tag(3, WireType.LengthDelimited).fork(), options).join();
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.pgc.gateway.player.v2.UserStatus
     */
    const UserStatus = new UserStatus$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class WatchProgress$Type extends MessageType {
        constructor() {
            super("bilibili.pgc.gateway.player.v2.WatchProgress", [
                { no: 1, name: "last_ep_id", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 2, name: "last_ep_index", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
                { no: 3, name: "progress", kind: "scalar", T: 3 /*ScalarType.INT64*/ },
                { no: 4, name: "last_play_cid", kind: "scalar", T: 3 /*ScalarType.INT64*/ },
                { no: 7, name: "last_play_aid", kind: "scalar", T: 3 /*ScalarType.INT64*/ }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.lastEpId = 0;
            message.lastEpIndex = "";
            message.progress = "0";
            message.lastPlayCid = "0";
            message.lastPlayAid = "0";
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* int32 last_ep_id */ 1:
                        message.lastEpId = reader.int32();
                        break;
                    case /* string last_ep_index */ 2:
                        message.lastEpIndex = reader.string();
                        break;
                    case /* int64 progress */ 3:
                        message.progress = reader.int64().toString();
                        break;
                    case /* int64 last_play_cid */ 4:
                        message.lastPlayCid = reader.int64().toString();
                        break;
                    case /* int64 last_play_aid */ 7:
                        message.lastPlayAid = reader.int64().toString();
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* int32 last_ep_id = 1; */
            if (message.lastEpId !== 0)
                writer.tag(1, WireType.Varint).int32(message.lastEpId);
            /* string last_ep_index = 2; */
            if (message.lastEpIndex !== "")
                writer.tag(2, WireType.LengthDelimited).string(message.lastEpIndex);
            /* int64 progress = 3; */
            if (message.progress !== "0")
                writer.tag(3, WireType.Varint).int64(message.progress);
            /* int64 last_play_cid = 4; */
            if (message.lastPlayCid !== "0")
                writer.tag(4, WireType.Varint).int64(message.lastPlayCid);
            /* int64 last_play_aid = 7; */
            if (message.lastPlayAid !== "0")
                writer.tag(7, WireType.Varint).int64(message.lastPlayAid);
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.pgc.gateway.player.v2.WatchProgress
     */
    const WatchProgress = new WatchProgress$Type();

    // @generated message type with reflection information, may provide speed optimized methods
    class PGCAnyModel$Type extends MessageType {
        constructor() {
            super("bilibili.app.playerunite.pgcanymodel.PGCAnyModel", [
                { no: 3, name: "business", kind: "message", T: () => PlayViewBusinessInfo },
                { no: 6, name: "play_ext_conf", kind: "message", T: () => PlayAbilityExtConf }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* bilibili.pgc.gateway.player.v2.PlayViewBusinessInfo business */ 3:
                        message.business = PlayViewBusinessInfo.internalBinaryRead(reader, reader.uint32(), options, message.business);
                        break;
                    case /* bilibili.pgc.gateway.player.v2.PlayAbilityExtConf play_ext_conf */ 6:
                        message.playExtConf = PlayAbilityExtConf.internalBinaryRead(reader, reader.uint32(), options, message.playExtConf);
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* bilibili.pgc.gateway.player.v2.PlayViewBusinessInfo business = 3; */
            if (message.business)
                PlayViewBusinessInfo.internalBinaryWrite(message.business, writer.tag(3, WireType.LengthDelimited).fork(), options).join();
            /* bilibili.pgc.gateway.player.v2.PlayAbilityExtConf play_ext_conf = 6; */
            if (message.playExtConf)
                PlayAbilityExtConf.internalBinaryWrite(message.playExtConf, writer.tag(6, WireType.LengthDelimited).fork(), options).join();
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.app.playerunite.pgcanymodel.PGCAnyModel
     */
    const PGCAnyModel = new PGCAnyModel$Type();

    /**
     * @generated from protobuf enum bilibili.community.service.dm.v1.DmColorfulType
     */
    var DmColorfulType;
    (function (DmColorfulType) {
        /**
         * @generated from protobuf enum value: NONE_TYPE = 0;
         */
        DmColorfulType[DmColorfulType["NONE_TYPE"] = 0] = "NONE_TYPE";
        /**
         * @generated from protobuf enum value: VIP_GRADUAL_COLOR = 60001;
         */
        DmColorfulType[DmColorfulType["VIP_GRADUAL_COLOR"] = 60001] = "VIP_GRADUAL_COLOR";
    })(DmColorfulType || (DmColorfulType = {}));
    // @generated message type with reflection information, may provide speed optimized methods
    class DmViewReply$Type extends MessageType {
        constructor() {
            super("bilibili.community.service.dm.v1.DmViewReply", [
                { no: 18, name: "activity_meta", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 9 /*ScalarType.STRING*/ },
                { no: 22, name: "command", kind: "message", T: () => Command }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.activityMeta = [];
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* repeated string activity_meta */ 18:
                        message.activityMeta.push(reader.string());
                        break;
                    case /* bilibili.community.service.dm.v1.Command command */ 22:
                        message.command = Command.internalBinaryRead(reader, reader.uint32(), options, message.command);
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* repeated string activity_meta = 18; */
            for (let i = 0; i < message.activityMeta.length; i++)
                writer.tag(18, WireType.LengthDelimited).string(message.activityMeta[i]);
            /* bilibili.community.service.dm.v1.Command command = 22; */
            if (message.command)
                Command.internalBinaryWrite(message.command, writer.tag(22, WireType.LengthDelimited).fork(), options).join();
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.community.service.dm.v1.DmViewReply
     */
    new DmViewReply$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class Command$Type extends MessageType {
        constructor() {
            super("bilibili.community.service.dm.v1.Command", [
                { no: 1, name: "command_dms", kind: "scalar", repeat: 2 /*RepeatType.UNPACKED*/, T: 12 /*ScalarType.BYTES*/ }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.commandDms = [];
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* repeated bytes command_dms */ 1:
                        message.commandDms.push(reader.bytes());
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* repeated bytes command_dms = 1; */
            for (let i = 0; i < message.commandDms.length; i++)
                writer.tag(1, WireType.LengthDelimited).bytes(message.commandDms[i]);
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.community.service.dm.v1.Command
     */
    const Command = new Command$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class DmSegMobileReq$Type extends MessageType {
        constructor() {
            super("bilibili.community.service.dm.v1.DmSegMobileReq", [
                { no: 1, name: "pid", kind: "scalar", T: 3 /*ScalarType.INT64*/ },
                { no: 2, name: "oid", kind: "scalar", T: 3 /*ScalarType.INT64*/ }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.pid = "0";
            message.oid = "0";
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* int64 pid */ 1:
                        message.pid = reader.int64().toString();
                        break;
                    case /* int64 oid */ 2:
                        message.oid = reader.int64().toString();
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* int64 pid = 1; */
            if (message.pid !== "0")
                writer.tag(1, WireType.Varint).int64(message.pid);
            /* int64 oid = 2; */
            if (message.oid !== "0")
                writer.tag(2, WireType.Varint).int64(message.oid);
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.community.service.dm.v1.DmSegMobileReq
     */
    const DmSegMobileReq = new DmSegMobileReq$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class DmSegMobileReply$Type extends MessageType {
        constructor() {
            super("bilibili.community.service.dm.v1.DmSegMobileReply", [
                { no: 1, name: "elems", kind: "message", repeat: 2 /*RepeatType.UNPACKED*/, T: () => DanmakuElem }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.elems = [];
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* repeated bilibili.community.service.dm.v1.DanmakuElem elems */ 1:
                        message.elems.push(DanmakuElem.internalBinaryRead(reader, reader.uint32(), options));
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* repeated bilibili.community.service.dm.v1.DanmakuElem elems = 1; */
            for (let i = 0; i < message.elems.length; i++)
                DanmakuElem.internalBinaryWrite(message.elems[i], writer.tag(1, WireType.LengthDelimited).fork(), options).join();
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.community.service.dm.v1.DmSegMobileReply
     */
    const DmSegMobileReply = new DmSegMobileReply$Type();
    // @generated message type with reflection information, may provide speed optimized methods
    class DanmakuElem$Type extends MessageType {
        constructor() {
            super("bilibili.community.service.dm.v1.DanmakuElem", [
                { no: 1, name: "id", kind: "scalar", T: 3 /*ScalarType.INT64*/ },
                { no: 2, name: "progress", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 3, name: "mode", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 4, name: "fontsize", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 5, name: "color", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 6, name: "mid_hash", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
                { no: 7, name: "content", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
                { no: 8, name: "ctime", kind: "scalar", T: 3 /*ScalarType.INT64*/ },
                { no: 9, name: "weight", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 10, name: "action", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
                { no: 11, name: "pool", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 12, name: "id_str", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
                { no: 13, name: "attr", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 22, name: "animation", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
                { no: 23, name: "extra", kind: "scalar", T: 9 /*ScalarType.STRING*/ },
                { no: 24, name: "colorful", kind: "enum", T: () => ["bilibili.community.service.dm.v1.DmColorfulType", DmColorfulType] },
                { no: 25, name: "type", kind: "scalar", T: 5 /*ScalarType.INT32*/ },
                { no: 26, name: "oid", kind: "scalar", T: 3 /*ScalarType.INT64*/ },
                { no: 27, name: "dm_from", kind: "scalar", T: 5 /*ScalarType.INT32*/ }
            ]);
        }
        create(value) {
            const message = globalThis.Object.create((this.messagePrototype));
            message.id = "0";
            message.progress = 0;
            message.mode = 0;
            message.fontsize = 0;
            message.color = 0;
            message.midHash = "";
            message.content = "";
            message.ctime = "0";
            message.weight = 0;
            message.action = "";
            message.pool = 0;
            message.idStr = "";
            message.attr = 0;
            message.animation = "";
            message.extra = "";
            message.colorful = 0;
            message.type = 0;
            message.oid = "0";
            message.dmFrom = 0;
            if (value !== undefined)
                reflectionMergePartial(this, message, value);
            return message;
        }
        internalBinaryRead(reader, length, options, target) {
            let message = target ?? this.create(), end = reader.pos + length;
            while (reader.pos < end) {
                let [fieldNo, wireType] = reader.tag();
                switch (fieldNo) {
                    case /* int64 id */ 1:
                        message.id = reader.int64().toString();
                        break;
                    case /* int32 progress */ 2:
                        message.progress = reader.int32();
                        break;
                    case /* int32 mode */ 3:
                        message.mode = reader.int32();
                        break;
                    case /* int32 fontsize */ 4:
                        message.fontsize = reader.int32();
                        break;
                    case /* int32 color */ 5:
                        message.color = reader.int32();
                        break;
                    case /* string mid_hash */ 6:
                        message.midHash = reader.string();
                        break;
                    case /* string content */ 7:
                        message.content = reader.string();
                        break;
                    case /* int64 ctime */ 8:
                        message.ctime = reader.int64().toString();
                        break;
                    case /* int32 weight */ 9:
                        message.weight = reader.int32();
                        break;
                    case /* string action */ 10:
                        message.action = reader.string();
                        break;
                    case /* int32 pool */ 11:
                        message.pool = reader.int32();
                        break;
                    case /* string id_str */ 12:
                        message.idStr = reader.string();
                        break;
                    case /* int32 attr */ 13:
                        message.attr = reader.int32();
                        break;
                    case /* string animation */ 22:
                        message.animation = reader.string();
                        break;
                    case /* string extra */ 23:
                        message.extra = reader.string();
                        break;
                    case /* bilibili.community.service.dm.v1.DmColorfulType colorful */ 24:
                        message.colorful = reader.int32();
                        break;
                    case /* int32 type */ 25:
                        message.type = reader.int32();
                        break;
                    case /* int64 oid */ 26:
                        message.oid = reader.int64().toString();
                        break;
                    case /* int32 dm_from */ 27:
                        message.dmFrom = reader.int32();
                        break;
                    default:
                        let u = options.readUnknownField;
                        if (u === "throw")
                            throw new globalThis.Error(`Unknown field ${fieldNo} (wire type ${wireType}) for ${this.typeName}`);
                        let d = reader.skip(wireType);
                        if (u !== false)
                            (u === true ? UnknownFieldHandler.onRead : u)(this.typeName, message, fieldNo, wireType, d);
                }
            }
            return message;
        }
        internalBinaryWrite(message, writer, options) {
            /* int64 id = 1; */
            if (message.id !== "0")
                writer.tag(1, WireType.Varint).int64(message.id);
            /* int32 progress = 2; */
            if (message.progress !== 0)
                writer.tag(2, WireType.Varint).int32(message.progress);
            /* int32 mode = 3; */
            if (message.mode !== 0)
                writer.tag(3, WireType.Varint).int32(message.mode);
            /* int32 fontsize = 4; */
            if (message.fontsize !== 0)
                writer.tag(4, WireType.Varint).int32(message.fontsize);
            /* int32 color = 5; */
            if (message.color !== 0)
                writer.tag(5, WireType.Varint).int32(message.color);
            /* string mid_hash = 6; */
            if (message.midHash !== "")
                writer.tag(6, WireType.LengthDelimited).string(message.midHash);
            /* string content = 7; */
            if (message.content !== "")
                writer.tag(7, WireType.LengthDelimited).string(message.content);
            /* int64 ctime = 8; */
            if (message.ctime !== "0")
                writer.tag(8, WireType.Varint).int64(message.ctime);
            /* int32 weight = 9; */
            if (message.weight !== 0)
                writer.tag(9, WireType.Varint).int32(message.weight);
            /* string action = 10; */
            if (message.action !== "")
                writer.tag(10, WireType.LengthDelimited).string(message.action);
            /* int32 pool = 11; */
            if (message.pool !== 0)
                writer.tag(11, WireType.Varint).int32(message.pool);
            /* string id_str = 12; */
            if (message.idStr !== "")
                writer.tag(12, WireType.LengthDelimited).string(message.idStr);
            /* int32 attr = 13; */
            if (message.attr !== 0)
                writer.tag(13, WireType.Varint).int32(message.attr);
            /* string animation = 22; */
            if (message.animation !== "")
                writer.tag(22, WireType.LengthDelimited).string(message.animation);
            /* string extra = 23; */
            if (message.extra !== "")
                writer.tag(23, WireType.LengthDelimited).string(message.extra);
            /* bilibili.community.service.dm.v1.DmColorfulType colorful = 24; */
            if (message.colorful !== 0)
                writer.tag(24, WireType.Varint).int32(message.colorful);
            /* int32 type = 25; */
            if (message.type !== 0)
                writer.tag(25, WireType.Varint).int32(message.type);
            /* int64 oid = 26; */
            if (message.oid !== "0")
                writer.tag(26, WireType.Varint).int64(message.oid);
            /* int32 dm_from = 27; */
            if (message.dmFrom !== 0)
                writer.tag(27, WireType.Varint).int32(message.dmFrom);
            let u = options.writeUnknownFields;
            if (u !== false)
                (u == true ? UnknownFieldHandler.onWrite : u)(this.typeName, message, writer);
            return writer;
        }
    }
    /**
     * @generated MessageType for protobuf message bilibili.community.service.dm.v1.DanmakuElem
     */
    const DanmakuElem = new DanmakuElem$Type();

    const url = $request.url;
    const device = globalThis.$environment?.['device-model'] || globalThis.$loon;
    //const isIpad = device?.includes('iPad');
    if (url.endsWith('/PlayViewUnite')) {
        handlePlayViewUniteReq($request);
    }
    else if (url.endsWith('/DmSegMobile')/* && isIpad */) {
        handleDmSegMobileReq($request);
    }
    else {
        $done({});
    }
    function handlePlayViewUniteReq({ url, headers, body }) {
        const binaryBody = getBinaryBody(body);
        const message = PlayViewUniteReq.fromBinary(binaryBody);
        const { vod, bvid } = message;
        const { aid, cid } = vod || {};
        Promise.all([fetchOriginalRequest(url, headers, body), fetchBilijumpData(cid !== '0' ? cid : '')])
            .then(([{ headers, body }, segments]) => {
            $done({ response: { headers, body: newRawBody(handlePlayViewUniteReply(body, segments, cid)) } });
        })
            .catch(err => {
            console.log(err?.toString());
            $done({});
        });
    }
    function handleDmSegMobileReq({ url, headers, body }) {
        const binaryBody = getBinaryBody(body);
        const message = DmSegMobileReq.fromBinary(binaryBody);
        const { pid, oid } = message;
        Promise.all([fetchOriginalRequest(url, headers, body), fetchBilijumpData(oid !== '0' ? oid : '')])
            .then(([{ headers, body }, segments]) => {
            if (segments.length) {
                console.log(`${oid}: ${JSON.stringify(segments)}`);
                $done({ response: { headers, body: newRawBody(handleDmSegMobileReply(body, segments)) } });
            }
            else {
                $done({ response: { headers, body } });
            }
        })
            .catch(err => {
            console.log(err?.toString());
            $done({});
        });
    }
    function fetchOriginalRequest(url, headers, body) {
        const params = {
            url,
            headers,
            body,
            'binary-mode': true,
        };
        return new Promise((resolve, reject) => {
            $httpClient.post(params, (error, response, data) => {
                if (response?.status !== 200) {
                    reject('Fetch Original Request Failed');
                }
                else {
                    resolve({
                        headers: response.headers,
                        body: data,
                    });
                }
            });
        });
    }
    function fetchBilijumpData(cid) {
        const params = {
            url: `https://api.cloudflare.com/client/v4/accounts/34c49ed8e1d2bd41c330fb65de4c5890/d1/database/c1ad567a-2375-49b4-83e2-d1de52a0902f/query`,
            headers: {
                "Authorization": `Bearer Dmlpe9TkvsvBCE0N-FkqeRkN5ANCyHTnUSnAtGCH`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ sql: "SELECT data,model FROM bilijump WHERE cid = ? LIMIT 1;", params: [cid] }),
        };
        return new Promise(resolve => {
            $httpClient.post(params, (error, response, data) => {
                if (response?.status !== 200) {
                    resolve([]);
                }
                else {
                    const responseData = JSON.parse(data);
                    const innerData = JSON.parse(responseData?.result?.[0]?.results?.[0]?.data || '{}');
                    const segments = innerData?.ads?.reduce((result, ad) => {
                        const startTime = parseFloat(ad.start_time);
                        const endTime = parseFloat(ad.end_time);
                        if (!isNaN(startTime) && !isNaN(endTime)) {
                            result.push([startTime, endTime]);
                        }
                        return result;
                    }, []);
                    resolve(segments);
                }
            });
        });
    }
    function handlePlayViewUniteReply(body, segments, cid) {
        const emptyBytes = new Uint8Array(0);
        const binaryBody = getBinaryBody(body);
        const message = PlayViewUniteReply.fromBinary(binaryBody);
        if (message.viewInfo) {
            message.viewInfo.promptBar = emptyBytes;
        }
        if (!segments.length && message.playArcConf?.arcConfs) {
            Object.values(message.playArcConf.arcConfs).forEach(item => {
                if (item.isSupport && item.disabled) {
                    item.disabled = false;
                    item.extraContent = undefined;
                    item.unsupportScene.length = 0;
                }
            });
        }
        if (segments.length) {
            console.log(`${cid}: ${JSON.stringify(segments)}`);
            const arcConfs = message.playArcConf?.arcConfs || {};
            [ConfType.SKIPOPED].forEach(i => {
                arcConfs[i] = {
                    isSupport: true,
                    disabled: false,
                    unsupportScene: [],
                };
            });
            [ConfType.FREYAENTER, ConfType.FREYAFULLENTER].forEach(i => {
                arcConfs[i] = {
                    isSupport: false,
                    disabled: true,
                    unsupportScene: [],
                };
            });
            if (message.vodInfo) {
                message.vodInfo.streamList.forEach(item => {
                    delete item.streamInfo?.needVip;
                });
            }
            if (message.playArc) {
                message.playArc.videoType = BizType.PGC;
            }
            message.supplement = {
                typeUrl: 'type.googleapis.com/bilibili.app.playerunite.pgcanymodel.PGCAnyModel',
                value: PGCAnyModel.toBinary(getPGCAnyModel(segments)),
            };
        }
        return PlayViewUniteReply.toBinary(message);
    }
    function getPGCAnyModel(segments) {
        return {
            business: {
                clipInfo: getClipInfo(segments),
                vipStatus: 1,
                episodeInfo: {
                    epId: 1231523,
                    cid: '27730904912',
                    aid: '113740078909891',
                    epStatus: '2',
                    seasonInfo: {
                        seasonId: 73081,
                        seasonType: 1,
                        seasonStatus: 13,
                        mode: 2,
                    },
                },
                userStatus: {
                    watchProgress: {
                        lastEpId: 1231523,
                        lastEpIndex: 'OP',
                        progress: '1',
                        lastPlayAid: '113740078909891',
                        lastPlayCid: '27730904912',
                    },
                },
            },
            playExtConf: {
                allowCloseSubtitle: true,
            },
        };
    }
    function getClipInfo(segments) {
        return segments.map(([start, end]) => ({
            start: Math.floor(start),
            end: Math.ceil(end),
            clipType: ClipType.CLIP_TYPE_OP,
        }));
    }
    function handleDmSegMobileReply(body, segments) {
        const binaryBody = getBinaryBody(body);
        const message = DmSegMobileReply.fromBinary(binaryBody);
        message.elems.unshift(...getAirBorneDms(segments));
        return DmSegMobileReply.toBinary(message);
    }
    function getAirBorneDms(segments) {
        return segments.map((segment, index) => {
            const id = (index + 1).toString();
            const start = Math.max(Math.floor(segment[0] * 1000 - 2000), 1);
            const end = Math.floor(segment[1] * 1000);
            return {
                id,
                progress: start,
                mode: 5,
                fontsize: 50,
                color: 16777215,
                midHash: '1948dd5d',
                content: '点击跳过广告',
                ctime: '1735660800',
                weight: 11,
                action: `airborne:${end}`,
                pool: 0,
                idStr: id,
                attr: 1310724,
                animation: '',
                extra: '',
                colorful: DmColorfulType.NONE_TYPE,
                type: 1,
                oid: '212364987',
                dmFrom: 1,
            };
        });
    }
    function getBinaryBody(body) {
        const header = body.slice(0, 5);
        let binaryBody = body.slice(5);
        if (header[0]) {
            binaryBody = $utils.ungzip(binaryBody);
        }
        return binaryBody;
    }
    function newRawBody(body) {
        const checksum = Checksum(body.length);
        const rawBody = new Uint8Array(5 + body.length);
        rawBody[0] = 0; // 直接置protobuf 为未压缩状态
        rawBody.set(checksum, 1); // 1-4位： 校验值(4位)
        rawBody.set(body, 5); // 5-end位：protobuf数据
        return rawBody;
    }
    function Checksum(num) {
        const arr = new ArrayBuffer(4); // an Int32 takes 4 bytes
        const view = new DataView(arr);
        view.setUint32(0, num, false); // byteOffset = 0; litteEndian = false
        return new Uint8Array(arr);
    }

})();
