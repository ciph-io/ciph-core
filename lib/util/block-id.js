'use strict'

/* app modules */
const sha256 = require('./sha-256')

/* exports */
module.exports = blockId

/** 
 * @function blockId
 *
 * get 32 byte sha-256 hex id for data
 *
 * @param {Buffer} data
 *
 * @returns {string}
 */
function blockId (data) {
    return sha256(data, 'hex').substr(0, 32)
}