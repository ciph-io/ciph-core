'use strict'

/* globals */

// content type (int ids) indexed by name
const contentTypes = {
    collection: 0,
    page: 1,
    video: 2,
    audio: 3,
    image: 4,
}

// invert contentTypes
const contentTypeNames = Object.keys(contentTypes).reduce((obj, key) => {
    obj[ contentTypes[key] ] = key
    return obj
}, {})

// freeze constants
Object.freeze(contentTypes)
Object.freeze(contentTypeNames)

module.exports = class ContentType {

    static getContentType (contentTypeName) {
        assert(
            defined(contentTypes[contentTypeName]),
            `invalid content type name: ${contentTypeName}`
        )
        return contentTypes[contentTypeName]
    }

    static getContentTypes () {
        return contentTypes
    }

    static getContentTypeName (contentType) {
        assert(
            defined(contentTypeNames[contentType]),
            `invalid content type: ${contentType}`
        )
        return contentTypeNames[contentType]
    }

    static getContentTypeNames () {
        return contentTypeNames
    }

}