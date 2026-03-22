export const SUPPORTED_SPAWN_CHAINS = ["base"];
export const SUPPORTED_SPAWN_ASSETS = ["usdc"];
export const SPAWN_SESSION_STATES = [
    "awaiting_payment",
    "payment_detected",
    "spawning",
    "broadcasting_release",
    "complete",
    "failed",
    "expired"
];
export const PAYMENT_STATUSES = [
    "unpaid",
    "partial",
    "paid",
    "refunded"
];
export const SESSION_AUDIT_ACTORS = [
    "system",
    "user",
    "admin"
];
export const MINIMUM_GROSS_PAYMENT_USD = 50;
export const VERSION_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const KECCAK_ROUND_CONSTANTS = [
    0x0000000000000001n,
    0x0000000000008082n,
    0x800000000000808an,
    0x8000000080008000n,
    0x000000000000808bn,
    0x0000000080000001n,
    0x8000000080008081n,
    0x8000000000008009n,
    0x000000000000008an,
    0x0000000000000088n,
    0x0000000080008009n,
    0x000000008000000an,
    0x000000008000808bn,
    0x800000000000008bn,
    0x8000000000008089n,
    0x8000000000008003n,
    0x8000000000008002n,
    0x8000000000000080n,
    0x000000000000800an,
    0x800000008000000an,
    0x8000000080008081n,
    0x8000000000008080n,
    0x0000000080000001n,
    0x8000000080008008n
];
const KECCAK_ROTATION_OFFSETS = [
    0, 1, 62, 28, 27,
    36, 44, 6, 55, 20,
    3, 10, 43, 25, 39,
    41, 45, 15, 21, 8,
    18, 2, 61, 56, 14
];
const KECCAK_RATE_BYTES = 136;
const KECCAK_MASK_64 = (1n << 64n) - 1n;
function rotateLeft64(value, shift) {
    if (shift === 0) {
        return value & KECCAK_MASK_64;
    }
    const offset = BigInt(shift);
    return (((value << offset) | (value >> (64n - offset))) & KECCAK_MASK_64);
}
function keccakF1600(state) {
    const lanes = new Array(25).fill(0n);
    const columnParity = new Array(5).fill(0n);
    const columnDelta = new Array(5).fill(0n);
    for (const roundConstant of KECCAK_ROUND_CONSTANTS) {
        for (let x = 0; x < 5; x += 1) {
            columnParity[x] =
                state[x] ^
                    state[x + 5] ^
                    state[x + 10] ^
                    state[x + 15] ^
                    state[x + 20];
        }
        for (let x = 0; x < 5; x += 1) {
            columnDelta[x] =
                columnParity[(x + 4) % 5] ^ rotateLeft64(columnParity[(x + 1) % 5], 1);
        }
        for (let x = 0; x < 5; x += 1) {
            for (let y = 0; y < 5; y += 1) {
                state[x + 5 * y] ^= columnDelta[x];
            }
        }
        for (let x = 0; x < 5; x += 1) {
            for (let y = 0; y < 5; y += 1) {
                const source = x + 5 * y;
                const destination = y + 5 * ((2 * x + 3 * y) % 5);
                lanes[destination] = rotateLeft64(state[source], KECCAK_ROTATION_OFFSETS[source]);
            }
        }
        for (let x = 0; x < 5; x += 1) {
            for (let y = 0; y < 5; y += 1) {
                const index = x + 5 * y;
                state[index] =
                    lanes[index] ^
                        ((~lanes[((x + 1) % 5) + 5 * y] & KECCAK_MASK_64) &
                            lanes[((x + 2) % 5) + 5 * y]);
            }
        }
        state[0] ^= roundConstant;
    }
}
function padKeccak(bytes) {
    const padded = [...bytes, 0x01];
    while ((padded.length % KECCAK_RATE_BYTES) !== KECCAK_RATE_BYTES - 1) {
        padded.push(0x00);
    }
    padded.push(0x80);
    return new Uint8Array(padded);
}
function readLane(bytes, offset) {
    let lane = 0n;
    for (let index = 0; index < 8; index += 1) {
        lane |= BigInt(bytes[offset + index] ?? 0) << (8n * BigInt(index));
    }
    return lane;
}
function keccak256(bytes) {
    const state = new Array(25).fill(0n);
    const padded = padKeccak(bytes);
    for (let offset = 0; offset < padded.length; offset += KECCAK_RATE_BYTES) {
        const block = padded.subarray(offset, offset + KECCAK_RATE_BYTES);
        for (let laneIndex = 0; laneIndex < KECCAK_RATE_BYTES / 8; laneIndex += 1) {
            state[laneIndex] ^= readLane(block, laneIndex * 8);
        }
        keccakF1600(state);
    }
    const output = new Uint8Array(32);
    for (let laneIndex = 0; laneIndex < 4; laneIndex += 1) {
        const lane = state[laneIndex];
        for (let byteIndex = 0; byteIndex < 8; byteIndex += 1) {
            output[laneIndex * 8 + byteIndex] = Number((lane >> (8n * BigInt(byteIndex))) & 0xffn);
        }
    }
    return `0x${Buffer.from(output).toString("hex")}`;
}
export function deriveClaimId(sessionId) {
    return keccak256(new TextEncoder().encode(sessionId));
}
//# sourceMappingURL=spawn.js.map