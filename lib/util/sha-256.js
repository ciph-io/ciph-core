'use strict'

/* native modules */
const crypto = require('crypto')

/* exports */
module.exports = sha256

function sha256 (data, encoding) {
    const hash = crypto.createHash('sha256')
    hash.update(data)
    return hash.digest(encoding)
}