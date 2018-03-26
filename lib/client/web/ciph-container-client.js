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
    // encryption key for chat messages
    this.chatKeyBuffer = null
    // list of data blocks
    this.dataBlocks = []
    // data included in head block if any
    this.dataBuffer = null
    // head block 
    this.head = {
        data: null,
        promise: this.loadHead(link),
    }
    // 32 byte hex hash id of head block ids and derived key
    this.id = ''
    // meta data
    this.meta = null
    // list of meta blocks if any
    this.metaBlocks = []
}

CiphContainerClient.prototype = {
    decodeHead,
    decryptBlock,
    deriveKey,
    getBlock,
    getBlockUrl,
    getBlocksForFile,
    getFile,
    getLinkFromUrl,
    getSubBlock,
    findFile,
    loadHead,
    validate,
}

/**
 * @function decodeHead
 *
 * extract binary encoded head data
 *
 * @param {ArrayBuffer} data
 * @param {ArrayBuffer} block
 *
 * @returns {Promise<object>}
 */
async function decodeHead (data, block) {
    let offset = 0
    // create data view
    const dataView = new DataView(data)
    // chat key is first 32 bytes
    this.chatKeyBuffer = data.slice(offset, 32)
    offset += 32
    // meta data length uint32 (4 bytes)
    const metaLength = dataView.getUint32(offset)
    offset += 4
    // number of meta blocks uint16 (2 bytes)
    const numMetaBlocks = dataView.getUint16(offset)
    offset += 2
    // if there are no meta blocks then meta is included in head
    if (numMetaBlocks === 0) {
        // get meta data
        const metaData = data.slice(offset, offset+metaLength)
        offset += metaLength
        // decompress meta data
        const metaUnzipped = pako.ungzip(metaData, { to: 'string' })
        // parse data
        this.meta = JSON.parse(metaUnzipped)
    }
    else {
        throw new Error('meta blocks not yet supported')
    }
    // data length float64 (8 bytes)
    const dataLength = dataView.getFloat64(offset)
    offset += 8
    // number of data blocks uint32 (4 bytes)
    const numDataBlocks = dataView.getUint32(offset)
    offset += 4
    // if there are no data blocks then data is in head
    if (numDataBlocks === 0) {
        this.dataBuffer = data.slice(offset, offset+dataLength)
        offset += dataLength
    }
    // get info for each data block
    for (let i=0; i < numDataBlocks; i++) {
        // block size uint8 (1 byte)
        const blockSize = dataView.getInt8(offset)
        offset += 1
        // block id 0 raw (16 bytes)
        const blockId0 = data.slice(offset, offset+16)
        offset += 16
        // block id 1 raw (16 bytes)
        const blockId1 = data.slice(offset, offset+16)
        offset += 16
        // key
        const key = data.slice(offset, offset+32)
        offset += 32
        // add to list of blocks
        this.dataBlocks.push({
            ids: [ bufferToHex(blockId0), bufferToHex(blockId1) ],
            key: await crypto.subtle.importKey(
                'raw',
                key,
                {
                    length: 256,
                    name: 'AES-CTR',
                },
                true,
                ['encrypt', 'decrypt']
            ),
            size: blockSize,
        })
    }
    // SHA-256 digest of head data
    const headDigest = data.slice(offset, offset+32)
    // create view of block
    const blockView = new Uint8Array(block)
    // create array view of decrypted data
    const dataViewUint8 = new Uint8Array(data)
    // copy decrypted head data over encrypted block data so that
    // both can be hashed together to verify digest
    for (let i = 0; i < offset; i++) {
        blockView[i+2] = dataViewUint8[i]
    }
    // create view of block with only the plain prefix and unencrypted data
    const decryptedBlockView = new DataView(block, 0, offset+2)
    // calculate digest to verify
    const digest = await crypto.subtle.digest({ name: 'SHA-256' }, decryptedBlockView)

    assert(buffersEqual(headDigest, digest), 'head digest verification failed')

}

/**
 * @function decryptBlock
 *
 * decrypt block using raw key
 *
 * @param {ArrayBuffer} block
 * @param {CryptoKey} key
 *
 * @returns {Promise<ArrayBuffer>}
 */
async function decryptBlock (block, key) {
    // get raw key
    const rawKey = await crypto.subtle.exportKey('raw', key)
    // get hash of raw key to use as iv for decrypt
    const digest = await crypto.subtle.digest({ name: 'SHA-256' }, rawKey)
    // use first 16 bytes of digest for iv
    const counter = digest.slice(0, 16)
    // decrypt block
    const plain = await window.crypto.subtle.decrypt(
        {
            name: 'AES-CTR',
            counter: counter,
            length: 128,
        },
        key,
        block
    )

    return plain
}


/**
 * @function deriveKey
 *
 * derive key from password and salt
 *
 * @param {string} password
 * @param {string} salt
 *
 * @returns {Promise<ArrayBuffer>}
 */
async function deriveKey (password, salt) {
    // get key from password
    const key = await crypto.subtle.importKey(
        'raw',
        bufferFromHex(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    )
    // get derived key
    const derivedKey = await crypto.subtle.deriveKey(
        {
            hash: { name: 'SHA-256' },
            iterations: 100000,
            name: 'PBKDF2',
            salt: bufferFromHex(salt),
        },
        key,
        {
            length: 256,
            name: 'AES-CTR',
        },
        true,
        ['encrypt', 'decrypt']
    )

    return derivedKey
}

/**
 * @function findFile
 *
 * search for file by string name or regular expression
 *
 * @param {string|RegExp} match
 *
 * @returns {object}
 */
function findFile (match) {
    // if meta does not contain files array then not found
    if (!Array.isArray(this.meta.files)) {
        return null
    }

    var files = this.meta.files
    var length = files.length

    if (typeof match === 'string') {
        for (let i=0; i < length; i++) {
            if (files[i].name === match) return files[i]
        }
    }
    else {
        for (let i=0; i < length; i++) {
            if (files[i].name.match(match)) return files[i]
        }
    }

    return null
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
 * @returns {Promise<ArrayBuffer>}
 */
async function getBlock (blockSize, blockId0, blockId1) {
    const [data0, data1] = await Promise.all([
        this.getSubBlock(blockSize, blockId0),
        this.getSubBlock(blockSize, blockId1),
    ])

    return xorBuffer(data0, data1)
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
 * @function getBlocksForFile
 *
 * get list of block(s) that contain file.
 *
 * @param {object} file
 *
 * @returns {Array}
 */
function getBlocksForFile (file) {
    // list of blocks containing file
    const blocks = []
    // bytes needed for complete file
    let bytesRemaining = file.length
    // starting with first get all blocks needed for file
    for (let i=file.block; i < this.dataBlocks.length; i++) {
        // get block
        const block = this.dataBlocks[i]
        // if this is the first block then get offset from file
        const offset = blocks.length === 0 ? file.offset : 0
        // add current block to blocks
        blocks.push(block)
        // subtract bytes of file included in block
        bytesRemaining -= (blockSizes[block.size] - offset)
        // return blocks if no bytes left
        if (bytesRemaining <= 0) {
            return blocks
        }
    }

    throw new Error('invalid blocks')
}

/**
 * @function getFile
 *
 * find file by name. fetch and decode data blocks. return file.
 *
 * @param {string} fileName
 *
 * @returns {Promise<ArrayBuffer>}
 */
async function getFile (fileName) {
    // get file data
    const file = this.findFile(fileName)
    assert(file, 'file not found')
    // get block(s) that contain file
    const dataBlocks = this.getBlocksForFile(file)
    // promises to be resolved with retrieved blocks
    const blocks = await Promise.all(dataBlocks.map(async dataBlock => {
        // fetch and xor blocks
        const block = await this.getBlock(dataBlock.size, dataBlock.ids[0], dataBlock.ids[1])
        // decrypt block
        return this.decryptBlock(block, dataBlock.key)
    }))
    // create new buffer for file data
    const buffer = new ArrayBuffer(file.length)
    let bytesRemaining = file.length
    let dstOffset = 0
    // copy data to buffer
    for (let i=0; i < dataBlocks.length; i++) {
        const dataBlock = dataBlocks[i]
        const srcBuffer = blocks[i]
        const srcOffset = i === 0 ? file.offset : 0
        const copyBytes = bytesRemaining > blockSizes[dataBlock.size] - srcOffset
            ? blockSizes[dataBlock.size] - srcOffset
            : bytesRemaining
        bufferCopy(srcBuffer, buffer, copyBytes, srcOffset, dstOffset)
        bytesRemaining -= copyBytes
        dstOffset += copyBytes
    }
    // get digest of file to validate
    const digest = await crypto.subtle.digest({ name: 'SHA-256' }, buffer)
    assert(bufferToHex(digest) === file.digest, 'invalid file')

    return buffer
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

    return {
        blockSize: parseInt(blockSize),
        contentType: parseInt(contentType),
        blockId0,
        blockId1,
        salt,
        password,
    }
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
 * @returns {Promise<ArrayBuffer>}
 */
async function getSubBlock (blockSize, blockId, retry) {
    try {
        const url = this.getBlockUrl(blockSize, blockId, retry)
        const res = await fetch(url).then(rejectOnError)
        const data = await res.arrayBuffer()

        return data
    }
    catch (err) {
        console.error(err)
        // TODO: retry
        throw err
    }
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
async function loadHead (link) {
    // download and xor blocks
    const block = await this.getBlock(link.blockSize, link.blockId0, link.blockId1)
    // get data view for block
    const blockView = new DataView(block)
    // get version from block
    this.head.version = blockView.getInt8(0)
    assert(this.head.version === 1, 'invalid version')
    // get content type from block
    this.head.contentType = blockView.getInt8(1)
    assert(this.head.contentType === link.contentType, 'content type mismatch')
    // first two bytes are plain, rest of head block is encrypted
    const encryptedBlock = new DataView(block, 2)
    // retry decrypting head until password correct or canceled
    while (true) {
        if (typeof link.password !== 'string' || link.password.length === 0) {
            link.password = prompt('Please enter password')
            // if promp was canceled exit loop
            if (link.password === null) {
                return
            }
        }
        try {
            // derive key from password and salt
            const key = await this.deriveKey(link.password, link.salt)
            // decrypt head block
            const data = await this.decryptBlock(encryptedBlock, key)
            // extract binary encoded head data
            const head = await this.decodeHead(data, block)
            // exit retry when head loaded
            return
        }
        catch (err) {
            console.error(err)
            alert(err.message)
            link.password = ''
        }
    }
}

/**
 * @function validate
 *
 * fetch all files to validate
 *
 */
async function validate () {
    for (const file of this.meta.files) {
        await this.getFile(file.name)
    }
}

/** PRIVATE FUNCTIONS **/

function assert (isTrue, msg) {
    if (!isTrue) throw new Error(msg)
}

function bufferCopy (srcBuffer, dstBuffer, bytes=0, srcOffset=0, dstOffset=0) {
    const srcArr = new Uint8Array(srcBuffer)
    const dstArr = new Uint8Array(dstBuffer)

    for (let i=0; i<bytes; i++) {
        dstArr[dstOffset+i] = srcArr[srcOffset+i]
    }
}

function bufferFromHex (hex) {
    const length = hex.length
    assert(length % 2 === 0, 'invalid hex string')
    const buffer = new ArrayBuffer(length / 2)
    const arr = new Uint8Array(buffer)
    for (let i = 0; i < length; i += 2) {
        arr[i / 2] = parseInt(hex.substr(i, 2), 16)
    }
    return buffer
}

function bufferToHex (buffer) {
    const arr = new Uint8Array(buffer)
    let hex = ''
    for (let i = 0; i < arr.length; ++i) {
        let value = arr[i].toString(16)
        if (value.length === 1) value = '0' + value
        hex += value
    }
    return hex
}

function buffersEqual (bufA, bufB) {
    if (bufA.byteLength !== bufB.byteLength) return false
    const arrA = new Uint8Array(bufA)
    const arrB = new Uint8Array(bufB)
    const length = arrA.length

    for (let i=0; i < length; i++) {
        if (arrA[i] !== arrB[i]) return false
    }

    return true
}

function defined (val) {
    return val !== undefined
}

function rejectOnError (response) {
    return response.ok ? response : Promise.reject()
}

/**
 * @function xorBuffer
 *
 * xor two ArrayBuffers and return result
 *
 * @param {ArrayBuffer} a
 * @param {ArrayBuffer} b
 *
 * @returns {ArrayBuffer}
 */
function xorBuffer (a, b) {
    assert(a.byteLength === b.byteLength, 'ArrayBuffer lengths must match')
    const length = a.byteLength
    const xor = new ArrayBuffer(length)

    const aView = new Int32Array(a)
    const bView = new Int32Array(b)
    const xorView = new Int32Array(xor)

    const viewLength = length / 4

    for (let i=0; i < viewLength; i++) {
        xorView[i] = aView[i] ^ bView[i]
    }

    return xor
}

/** end **/
})();