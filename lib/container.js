'use strict'

/* native modules */
const path = require('path')

/* npm modules */
const crypto = require('mz/crypto')
const defined = require('if-defined')
const randomInt = require('random-int')
const requestPromise = require('request-promise')
const zlib = require('mz/zlib')

/* app modules */
const assert = require('./util/assert')
const blockId = require('./util/block-id')
const sha256 = require('./util/sha-256')
const xorBuffer = require('./util/xor-buffer')

/* globals */

const KB = 1024
const MB = 1024*KB

const blockSizes = [ 4*KB, 16*KB, 64*KB, 256*KB, 1*MB, 4*MB, 16*MB ]

const contentTypesByName = {
    collection: 0,
    page: 1,
    video: 2,
    audio: 3,
    image: 4,
}

// maximum block size
const maxBockSize = blockSizes[blockSizes.length-1]
// maximum number of data blocks
const maxDataBlocks = 2**32

 /* exports */
module.exports = class Container {

    /**
     * @class Container
     *
     * @param {object} args
     * @param {string} args.key
     * @param {object} args.meta
     * @param {string} args.meta.type
     */
    constructor (args = {}) {
        // set api host
        this.api = args.api || 'https://ciph.io'
        // key used to encrypt/decrypt chat for container
        this.chatKeyBuffer = null
        // content type integer
        this.contentType = this.setContentType(args.meta.type)
        // list of data blocks if data exceeds a single block
        this.dataBlocks = []
        // queue of data buffers to include in container
        this.dataBuffers = []
        // buffer with data to include in head block if any
        this.dataBuffer = null
        // length in bytes of data
        this.dataLength = 0
        // derived key created with PBKDF
        this.derivedKeyBuffer = null
        // set to true when all data/meta added
        this.done = false
        // encryption key
        this.key = args.key || ''
        // object meta data
        this.meta = {}
        // buffer with serialized and compressed meta data
        this.metaBuffer = null
        // list of meta blocks if meta exceeds a single block
        this.metaBlocks = []
        // length in bytes of meta
        this.metaLength = 0
        // salt for PBKDF / AES-CTR IV
        this.salt = ''
        // version
        this.version = 1
        // set meta data from args
        this.setMeta(args.meta)
    }

    /**
     * @function addData
     *
     * add data buffer to cipher object. if buffer length, including any
     * other buffers, exceeds the max block size then a new block will be
     * published before continuing.
     *
     * @param {Buffer} buffer
     */
    async addData (buffer) {
        assert(!this.done, 'cannot addData when done')
        // add data buffer to queue
        this.dataBuffers.push(buffer)
        // and length of data to total data length
        this.dataLength += buffer.length
        // if length of queued buffers exceeds max size then publish
        if (this.getBuffersLength() > maxBockSize) {
            await this.publishData()
        }
    }

    /**
     * @function ciph
     *
     * complete publishing of ciph object and access info
     *
     * @returns Promise<object>
     */
    async ciph () {
        // data and meta cannot be modified after this
        this.done = true
        // create key (if not specified), salt, and pbkdf derived key
        await this.initKey()
        // create chat key
        await this.initChatKey()
        // serialize and compress meta data
        await this.prepareMeta()
        // finalize data
        await this.prepareData()
        // build, encrypt, and publish head block
        await this.publishHead()
    }

    /**
     * @function flip
     *
     * randomly return true/false
     *
     * @returns {boolean}
     */
    async flip () {
        const random = await crypto.randomBytes(1)
        const int = random.readUInt8(0)
        return int % 2 === 0
    }

    /**
     * @function getBlockSize
     *
     * get smallest block size that will accomodate data length
     *
     * @param {integer} length
     *
     * @returns {object}
     */
    getBlockSize (length) {
        // find smalles block size that fits length
        for (const blockSize in blockSizes) {
            const blockLength = blockSizes[blockSize]
            // if length does not exceed block size use
            if (length <= blockLength) {
                return {
                    length: blockLength,
                    pad: blockLength - length,
                    size: blockSize,
                }
            }
        }
        // throw error if not block size found
        throw new Error('invalid block length')
    }

    /**
     * @function getBuffersLength
     *
     * get the sum length (bytes) of data buffers
     *
     * @returns {integer}
     */
    getBuffersLength () {
        let buffersLength = 0

        for (const dataBuffer of this.dataBuffers) {
            buffersLength += dataBuffer.length
        }

        return buffersLength
    }

    /**
     * @function getHeadLength
     *
     * get the current size of the head block. this value changes based
     * on whether or not the meta and data are included in the head block
     * or in additional blocks and how many additional blocks they use.
     *
     * when head is finalized it is padded with random data to reach the
     * target block size but this is not included in head length.
     *
     * @returns {integer}
     */
    getHeadLength () {
        // head length in bytes
        let headLength = 0
        // chat key (32 bytes)
        headLength += 32
        // meta length (uint32)
        headLength += 4
        // number of meta blocks (uint16)
        headLength += 2
        // if there are meta data blocks then add space for block ids
        if (this.metaBlocks > 0) {
            // each block id is a uint8 size + 2 128bit ids + 256bit key
            headLength += 65 * this.metaBlocks
        }
        // if meta data is included in head then add
        else if (this.metaBuffer) {
            headLength += this.metaBuffer.length
        }
        // data length
        headLength += 8
        // number of data blocks
        headLength += 4
        // if there are data blocks then add space for block ids
        if (this.dataBlocks > 0) {
            // each block id is a uint8 size + 2 128bit ids + 256bit key
            headLength += 65 * this.metaBlocks
        }
        // if data is included in head then add to length
        else if (this.dataBuffer) {
            headLength += this.dataBuffer.length
        }

        return headLength
    }

    async initChatKey () {
        // skip if chat key already initialized
        if (this.chatKeyBuffer) return
        // get random data
        const data = await crypto.randomBytes(64)
        // hash data to create token/secret
        this.chatKeyBuffer = sha256(data)
    }

    async initKey () {
        // skip if key already initialized
        if (this.derivedKeyBuffer) return
        // create new key if not set
        if (!this.key.length) {
            this.key = await this.newKey()
        }
        // require valid key
        assert(typeof this.key === 'string' && this.key.length, 'key required')
        // create salt
        this.salt = await this.newSalt()
        // created derived key
        this.derivedKeyBuffer = await crypto.pbkdf2(this.key, this.salt, 100000, 32, 'sha256')
    }

    /**
     * @function newKey
     *
     * create new random key
     *
     * @returns {string}
     */
    async newKey () {
        // get random data
        const data = await crypto.randomBytes(64)
        // hash data to create token/secret
        return sha256(data, 'hex')
    }

    /**
     * @function newSalt
     *
     * create new random salt
     *
     * @returns {string}
     */
    async newSalt () {
        // get random data
        const data = await crypto.randomBytes(64)
        // hash data to create salt
        return sha256(data, 'hex').substr(32)
    }

    /**
     * @function prepareData
     *
     * finalize data before publishing head block
     *
     */
    async prepareData () {
        return this.shouldIncludeData()
            ? this.prepareDataHead()
            : this.prepareDataBlocks()
    }

    /**
     * @function prepareDataBlocks
     *
     * finalize data before publishing head block
     *
     */
    async prepareDataBlocks () {

    }

    /**
     * @function prepareDataHead
     *
     * finalize data before publishing head block
     *
     */
    async prepareDataHead () {
        // require data
        assert(this.dataBuffers.length, 'data required')
        // get single data buffer to include in head
        this.dataBuffer = this.dataBuffers.length > 1
            ? Buffer.concat(this.dataBuffers)
            : this.dataBuffers[0]
        // clear data buffers queue
        this.dataBuffers.length = 0
    }

    /**
     * @function prepareMeta
     *
     * serialize and compress meta data
     *
     */
    async prepareMeta () {
        // get buffer of compressed meta
        this.metaBuffer = await zlib.gzip(JSON.stringify(this.meta), {level: 9})
        // TODO: split meta into blocks if too large for head block
    }

    /**
     * @function publishBlock
     *
     * publish a block of data to ciph plaform:
     *
     * 1) download random block of same size
     * 2) XOR random block and data
     * 2) make request to /publish/start with block size/id to get upload url
     * 3) upload block
     * 4) make request to /publish/finish to complete
     *
     * @param {Buffer} block
     *
     * @returns {Object}
     */
    async publishBlock (block) {
        // get block size from length
        const size = blockSizes.indexOf(block.length)
        assert(size >= 0, 'invalid block size')
        // get download links for random block
        const random = await requestPromise({
            json: true,
            qs: { size },
            uri: `${this.api}/random`,
        })
        // pick random block/url to download
        const randomBlockInfo = random[ randomInt(0, random.length-1) ]
        const blockUrl = randomBlockInfo.urls[ randomInt(0, randomBlockInfo.urls.length-1) ]
        // download block
        const randomBlock = await requestPromise({
             encoding: null,
             uri: blockUrl,
        })
        // check that id matches
        assert(blockId(randomBlock, 'hex') === randomBlockInfo.blockId, 'block validation failed')
        // check that length matches
        assert(block.length === randomBlock.length, 'invalid block length')
        // new block is XOR of rnadom block and data block
        const newBlock = xorBuffer(block, randomBlock)
        const newBlockId = blockId(newBlock)
        // start publish
        const start = await requestPromise({
            body: { blockId: newBlockId, size: size },
            json: true,
            method: 'POST',
            uri: `${this.api}/publish/start`,
        })
        // upload file
        const upload = await requestPromise({
            formData: {
                blockId: newBlockId,
                block: {
                    value: newBlock,
                    options: {
                        filename: `${newBlockId}.ciph`,
                        contentType: 'application/octet-stream',
                    },
                },
                signature: start.signature,
                size: size,
                time: start.time,
            },
            json: true,
            method: 'POST',
            uri: start.url,
        })
        // finish publish
        const finish = await requestPromise({
            body: {
                blockId: newBlockId,
                serverId: upload.serverId,
                signature: upload.signature,
                size: size,
            },
            json: true,
            method: 'POST',
            uri: `${this.api}/publish/finish`,
        })
        assert(finish.published, 'publish failed')
        // randomize order of blocks
        const blocks = await this.flip()
            ? [ newBlockId, randomBlockInfo.blockId ]
            : [ randomBlockInfo.blockId, newBlockId ]

        return { blocks, size }
    }

    /**
     * @function publishData
     *
     * publish a data block from buffers
     *
     */
    async publishData () {

    }

    /**
     * @function publishHead
     *
     * publish head
     *
     */
    async publishHead () {
        // create buffer for version and content type
        const metaBuffer = Buffer.alloc(2)
        metaBuffer.writeUInt8(this.version, 0)
        metaBuffer.writeUInt8(this.contentType, 1)
        // create buffer of head data that will be encrypted - this includes
        // everything except version and content type bytes
        const plainBuffer = Buffer.alloc(this.getHeadLength() - 2)
        // keep track of offset
        let offset = 0
        // chat key
        this.chatKeyBuffer.copy(plainBuffer, offset)
        offset += this.chatKeyBuffer.length
        // meta length
        plainBuffer.writeUInt32BE(this.metaBuffer.length, offset)
        offset += 4
        // meta blocks - always zero for now
        plainBuffer.writeUInt16BE(0, offset)
        offset += 2
        // meta
        this.metaBuffer.copy(plainBuffer, offset)
        offset += this.metaBuffer.length
        // data length
        plainBuffer.writeDoubleBE(this.dataLength, offset)
        offset += 8
        // number of data blocks
        plainBuffer.writeUInt32BE(this.dataBlocks.length, offset)
        offset += 4
        // if there are data blocks then add block links
        if (this.dataBlocks.length) {

        }
        // otherwise add data
        else {
            this.dataBuffer.copy(plainBuffer, offset)
            offset += this.dataBuffer.length
        }
        // get block size that accomodates header length
        const blockSize = this.getBlockSize(this.getHeadLength())
        // get rand bytes to pad tail of block with
        const tailPadBuffer = await crypto.randomBytes(blockSize.pad)
        // use salt for initialization vector
        const initializationVector = Buffer.from(this.salt, 'hex')
        // create new aes cipher
        const cipher = crypto.createCipheriv('AES-256-CTR', this.derivedKeyBuffer, initializationVector)
        // encrypt
        const headBuffer = Buffer.concat([
            metaBuffer,
            cipher.update(plainBuffer),
            cipher.update(tailPadBuffer),
            cipher.final()
        ])

        console.log( await this.publishBlock(headBuffer) )
    }

    /**
     * @function setContentType
     *
     * set integer content type from name. must be one of:
     *     collection, page, video, audio, image
     *
     * @param {string} contentType
     */
    setContentType (contentType) {
        assert(contentTypesByName[contentType], 'invalid content type')

        this.contentType = contentTypesByName[contentType]
    }

    /**
     * @param {object} meta
     */
    setMeta (meta) {
        assert(!this.done, 'cannot setMeta when done')

        Object.assign(this.meta, meta)
    }

    /**
     * @function shouldIncludeData
     *
     * returns true if data should be included in head block
     *
     * @returns {boolean}
     */
    shouldIncludeData () {
        // if there are already external data blocks then all data external
        if (this.dataBlocks.length > 0) return false
        // if heads length including data exceeds max block size then data
        // should be split out  - this calculation should be enhanced to
        // minimize wasted block space (e.g. 5MB data in 15MB block)
        if (this.getHeadLength() > maxBockSize) return false

        return true
    }
}