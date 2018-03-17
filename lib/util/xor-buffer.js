'use strict'

module.exports = xorBuffer

/**
 * @function xorBuffer
 *
 * xor two buffers and return result
 *
 * @param {Buffer} a
 * @param {Buffer} b
 *
 * @returns {Buffer}
 */
function xorBuffer (a, b) {
    var length = Math.max(a.length, b.length)
    var buffer = Buffer.allocUnsafe(length)

    for (var i = 0; i < length; i++) {
        buffer[i] = a[i] ^ b[i]
    }

    return buffer
}