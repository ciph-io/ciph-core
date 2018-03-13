'use strict'

module.exports = function (assert, message) {
    if (!assert) {
        throw new Error(message)
    }
}