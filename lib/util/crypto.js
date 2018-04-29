'use strict'

/* npm modules */
const crypto = require('mz/crypto')

module.exports = class Crypto {

    /** 
     * @function blockId
     *
     * get 32 byte sha-256 hex id for data
     *
     * @param {Buffer} data
     *
     * @returns {string}
     */
    static blockId (data) {
        return Crypto.sha256(data, 'hex').substr(0, 32)
    }

    /**
     * @function sha256
     *
     * calculate SHA-256 digest. optionally encode as hex and/or cut to
     * specified length.
     *
     * @param {Buffer|array|string} data
     * @param {string} encoding
     * @param {integer} length
     *
     * @returns {Buffer|string}
     */
    static sha256 (data, encoding, length) {
        if (encoding) {
            assert(encoding === 'hex', 'invalid encoding')
        }

        const hash = crypto.createHash('sha256')

        if (Array.isArray(data)) {
            for (const d of data) {
                hash.update(d)
            }
        }
        else {
            hash.update(data)
        }

        if (length) {
            if (encoding === 'hex') {
                return hash.digest(encoding).substr(0, length)
            }
            else {
                return hash.digest().slice(0, length)
            }
        }
        else {
            if (encoding === 'hex') {
                return hash.digest(encoding)    
            }
            else {
                return hash.digest()
            }
        }
    }

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
    static xorBuffer (a, b) {
        var length = Math.max(a.length, b.length)
        var buffer = Buffer.allocUnsafe(length)

        for (var i = 0; i < length; i++) {
            buffer[i] = a[i] ^ b[i]
        }

        return buffer
    }

}