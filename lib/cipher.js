'use strict'

/* npm modules */
const crypto = require('mz/crypto')
const defined = require('if-defined')
const randomInt = require('random-int')
const zlib = require('mz/zlib')

/* app modules */
const assert = require('./util/assert')

/* globals */

// small block is 256KB
const SMALL_BLOCK_LENGTH = 256 * 1024
// medium block is 1MB
const MEDIUM_BLOCK_LENGTH = 1024 * 1024 
// large block is 4MB
const LARGE_BLOCK_LENGTH = 1024 * 1024 * 4

 /* exports */
module.exports = class Cipher {

    /**
     * @class Cipher
     *
     * @param {object} args
     * @param {Buffer} args.data
     * @param {string} args.key (optional)
     * @param {object} args.meta
     */
    constructor (args = {}) {
        // queue of data buffers to ciph
        this.buffers = []
        // list of data blocks if data exceeds a single block
        this.dataBlocks = []
        // buffer with data to include in head block if any
        this.dataBuffer = null
        // length in bytes of data
        this.dataLength = 0
        // derived key created with PBKDF
        this.derivedKey = ''
        // set to true when ciph complete
        this.done = false
        // encryption key
        this.key = args.key
        // object meta data
        this.meta = {}
        // buffer with serialized and compressed meta data
        this.metaBuffer = null
        // list of meta blocks if meta exceeds a single block
        this.metaBlocks = []
        // length in bytes of meta
        this.metaLength = 0
        // create salt for PBKDF
        this.salt = ''
        // random data to pad initial block with
        this.pad = null
        // length of random pad
        this.padLength = 0
        // version
        this.version = 0

        // set meta data from args if passed
        if (args.meta) this.setMeta(args.meta)
        // add data from args if passed
        if (args.data) this.addData(args.data)
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
        this.buffers.push(buffer)
        // if length of queued buffers exceeds max size then publish
        if (this.getBuffersLength() > LARGE_BLOCK_LENGTH) {
            await this.publishDataBlock()
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
        // crate random data padding
        await this.initPad()
        // serialize and compress meta data
        await this.prepareMeta()
        // finalize data
        await this.prepareData()
        
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

        this.buffers.forEach(buffer => buffersLength += buffer.length)

        return buffersLength
    }

    /**
     * @function getHeaderLength
     *
     * get the current size of the header block. this value changes based
     * on whether or not the meta and data are included in the header block
     * or in additional blocks and how many additional blocks they use.
     *
     * when header is finalized it is padded with random data to reach the
     * target block size but this is not included in header length.
     *
     * @returns {integer}
     */
    getHeaderLength () {
        // header length in bytes
        const headerLength = 0
        // version number (uint8)
        headerLength += 1
        // content type (uint8)
        headerLength += 1
        // pad length (uint16)
        headerLength += 2
        // if pad has been created then add
        if (this.pad) {
            headerLength += this.pad.length
        }
        // meta length (uint32)
        headerLength += 4
        // number of meta blocks
        headerLength += 4
        // if there are meta data blocks then add space for block ids
        if (this.metaBlocks > 0) {
            // each block id is a uint8 size and 2 128bit ids
            headerLength += 33 * this.metaBlocks
        }
        // if meta data is included in header then add
        else if (this.metaBuffer) {
            headerLength += this.metaBuffer.length
        }
        // data length in gigabytes
        headerLength += 4
        // data length in bytes
        headerLength += 4
        // number of data blocks
        headerLength += 4
        // if there are data blocks then add space for block ids
        if (this.dataBlocks > 0) {
            // each block id is a uint8 size and 2 128bit ids
            headerLength += 33 * this.metaBlocks
        }
        // if data is included in header then add to length
        else if (this.dataBuffer) {
            headerLength += this.dataBuffer.length
        }

        return headerLength
    }

    async initKey () {
        // skip if key already initialized
        if (this.derivedKey.length) return
        // create new key if not set
        if (!defined(this.key)) {
            this.key = await this.newKey()
        }
        // require valid key
        assert(typeof this.key === 'string' && this.key.length, 'key required')
        // create salt
        this.salt = await this.newSalt()
        // created derived key
        const derivedKey = await crypto.pbkdf2(this.key, this.salt, 100000, 32, 'sha256')

        this.derivedKey = derivedKey.toString('hex')
    }

    async initPad () {
        // skip if pad already initalized
        if (this.pad) return
        // set pad length as multiple of block size (32 bytes) with random
        // length between 128 and 256 blocks - this could be adjusted down
        // to fit a particular block size based on other data but fixed now
        this.padLength = randomInt(128, 256) * 32
        // get random bytes of specified length
        this.pad = await crypto.randomBytes(this.padLength)
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
        const hash = crypto.createHash('sha256')
        hash.update(data)
        
        return hash.digest('hex')
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
        // hash data to create token/secret
        const hash = crypto.createHash('sha256')
        hash.update(data)
        
        return hash.digest('hex').substr(0, 16)
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
     * @function publishDataBlock
     *
     * publish a data block from buffers
     *
     */
    async publishDataBlock () {

    }

    /**
     * @param {object} meta
     */
    setMeta (meta) {
        assert(!this.done, 'cannot setMeta when done')

        Object.assign(this.meta, meta)
    }

}