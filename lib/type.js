'use strict'

/* app modules */
const Block = require('./block')
const ContentType = require('./content-type')

/* globlas */
const hex32RegExp = /^[0-9a-f]{32}$/

module.exports = class Type {

    static isValidBlockSize (blockSize) {
        return defined( Block.getBlockSizes()[blockSize] )
    }

    static isValidCollectionFile (file) {

    }

    static isValidContentType (contentType) {
        return defined( ContentType.getContentTypeNames()[contentType] )
    }

    static isValidHex32 (val) {
        return typeof val === 'string' && val.match(hex32RegExp)
    }

}