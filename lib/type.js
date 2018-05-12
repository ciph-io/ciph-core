'use strict'

/* native modules */
const path = require('path')

/* app modules */
const Block = require('./block')
const ContentType = require('./content-type')

/* globals */
const hex32RegExp = /^[0-9a-f]{32}$/
const validImageFileExtensions = ['gif', 'jpeg', 'jpg', 'png']

module.exports = class Type {

    static isValidBlockSize (blockSize) {
        return defined( Block.getBlockSizes()[blockSize] )
    }

    static isValidContentType (contentType) {
        return defined( ContentType.getContentTypeNames()[contentType] )
    }

    static isValidHex32 (val) {
        return typeof val === 'string' && val.match(hex32RegExp)
    }

    static isValidImageFile (file) {
        if (typeof file !== 'string') {
            return false
        }

        const matches = file.match(/\.(\w+)$/)
        if (!matches) {
            return false
        }

        const ext = matches[1].toLowerCase()

        return validImageFileExtensions.includes(ext)
    }

    static isValidIndexFile (file) {
        if (typeof file !== 'string') {
            return false
        }
        return path.basename(file) === 'index.md'
    }

    static isValidPageFile (file) {
        return typeof file === 'string' && file.match(/\.md$/)
    }

}