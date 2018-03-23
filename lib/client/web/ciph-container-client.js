(function () {
/** being **/

'use strict'

/* exports */

// add to window if in browser
if (typeof window !== 'undefined') {
    window.CiphContainerClient = CiphContainerClient
}
// export in node
else if (typeof module !== 'undefined') {
    module.exports = CiphContainerClient
}

/* globals */

const KB = 1024
const MB = 1024*KB

const hash32RegExp = /^[0-9a-f]{32}$/
const hash64RegExp = /^[0-9a-f]{64}$/
const blockSizes = [ 4*KB, 16*KB, 64*KB, 256*KB, 1*MB, 4*MB, 16*MB ]
const contentTypes = ['collection', 'page', 'video', 'audio', 'image']

/**
 * @function CiphContainerClient
 *
 * create a new client instance. validate url and begin fetching data.
 */
function CiphContainerClient (url, options) {
    const link = this.getLinkFromUrl(url)
    // head block 
    this.head = {
        data: null,
        promise: this.loadHead(link),
    }
}

CiphContainerClient.prototype = {
    decryptBlock,
    getBlock,
    getBlockUrl,
    getLinkFromUrl,
    loadHead,
}


/**
 * @function decryptBlock
 *
 * decrypt block using raw key
 *
 * @param {Uint8Array} block
 * @param {Uint8Array} key
 *
 * @returns {Promise<Uint8Array>}
 */
function decryptBlock (block, key) {

}


/**
 * @function deriveKey
 *
 * derive key from password and salt
 *
 * @param {string} password
 * @param {string} salt
 *
 * @returns {Promise<Uint8Array>}
 */
function deriveKey (password, salt) {

}

/**
 * @function getBlock
 *
 * load two ciph blocks and return XOR
 *
 * @param {integer|string} blockSize
 * @param {string} blockId0
 * @param {string} blockId1
 *
 * @returns {Promise<Uint8Array>}
 */
async function getBlock (blockSize, blockId0, blockId1) {
    const [data0, data1] = await Promise.all([
        fetch(this.getBlockUrl(blockSize, blockId0)).then(rejectOnError),
        fetch(this.getBlockUrl(blockSize, blockId1)).then(rejectOnError),
    ])

    const data0 = new Uint8Array( await res0.arrayBuffer() )
    const data1 = new Uint8Array( await res1.arrayBuffer() )

    return u8aXor(data0, data1)
}

/**
 * @function getSubBlock
 *
 * load single ciph block. validate. TODO: retry on error.
 *
 * @param {integer|string} blockSize
 * @param {string} blockId
 * @param {integer|undefined} retry
 *
 * @returns {Promise<Uint8Array>}
 */
async function getSubBlock (blockSize, blockId, retry) {
    try {
        const url = this.getBlockUrl(blockSize, blockId, retry)
        const res = await fetch(url).then(rejectOnError)
        const data = await res.arrayBuffer()
    }
    catch (err) {
        console.error(err)
        // TODO: retry
        throw err
    }
}

/**
 * @function getBlockUrl
 *
 * get url for block
 *
 * @param {string} blockSize
 * @param {string} blockId
 *
 * @returns {string}
 */
function getBlockUrl (blockSize, blockId) {
    // get directory prefix for block id
    const prefix = blockId.substr(0, 2)
    // create url - need to figure out how to select host
    return `/download/${prefix}/${blockSize}/${blockId}.ciph`
}

/**
 * @function getLinkFromUrl
 *
 * validate url and extract link from it
 *
 * @param {string} url
 *
 * @returns {object}
 */
function getLinkFromUrl (url) {
    // remove any protocol from url
    url = url.replace(/^\w+:\/\/(.*?\/enter\?ciph=)?/, '')
    // split url into parts
    const [blockSize, contentType, blockId0, blockId1, salt, password] = url.split('-')
    // validate url
    assert(defined(blockSizes[blockSize]), 'invalid block size')
    assert(defined(contentTypes[contentType]), 'invalid content type')
    assert(blockId0.match(hash32RegExp), 'invalid block id 0')
    assert(blockId1.match(hash32RegExp), 'invalid block id 1')
    assert(salt.match(hash32RegExp), 'invalid salt')

    return { blockSize, contentType, blockId0, blockId1, salt, password }
}


/**
 * @function loadHead
 *
 * load head block
 * prompt for password if not in url
 *
 * @param {object} link
 *
 * @returns {Promise}
 */
function loadHead (link) {
    // create a promise that will be resolved when block is downloaded
    // **and** successfully decrypted - this requires a password prompt
    // if the password is not provided or if the password does not work
    // and the prompt must be retried if the password is wrong so it is
    // a bit convoluted
    return new Promise(async (resolve, reject) => {
        // download and xor blocks
        const block = await this.getBlock(link.blockSize, link.blockId0, link.blockId1)
        // if the password is provided in the link attempt to decrypt
        if (link.password) {
            try {
                this.head.data = decryptBlockPassword(block, link.password, link.salt)
            }
            catch (err) {
                console.error(err)
            }
        }
        // if there was no password provided or the provided password was
        // wrong then prompt for pasword

        new this.PasswordPrompt()
    })
}

/** PRIVATE FUNCTIONS **/

function assert (isTrue, msg) {
    if (!isTrue) throw new Error(msg)
}

function defined (val) {
    return val !== undefined
}

function rejectOnError (response) {
    return response.ok ? response : Promise.reject()
}

/**
 * @function u8aXor
 *
 * xor two Uint8Arrays and return result
 *
 * @param {Uint8Array} a
 * @param {Uint8Array} b
 *
 * @returns {Uint8Array}
 */
function u8aXor (a, b) {
    assert(a.length === b.length, 'Uint8Array lengths must match')
    const length = a.length
    const newU8a = new Uint8Array(length)

    for (var i = 0; i < length; i++) {
        newU8a[i] = a[i] ^ b[i]
    }

    return newU8a
}

/**
 * @function u8aXorFromHex
 *
 * return Uint8Array from the xor of two equal length hex strings
 *
 * @param {string} hex0
 * @param {string} hex1
 *
 * @returns {Uint8Array}
 */
function u8aXorFromHex (hex0, hex1) {
    assert(hex0.length === hex1.length, 'hex strings must have equal length')

    const arr = new Uint8Array(hex0.length / 2)

    for (let i = 0; i < hex0.length; i += 2) {
        const b0 = parseInt(str.substr(hex0, 2), 16)
        const b1 = parseInt(str.substr(hex1, 2), 16)
        arr[i / 2] = b0 ^ b1
    }
    
    return arr
}

/** end **/
})()