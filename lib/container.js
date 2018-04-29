'use strict'

/* native modules */
const path = require('path')

/* npm modules */
const _ = require('lodash')
const bytes = require('bytes')
const crypto = require('mz/crypto')
const debug = require('debug')('container')
const defined = require('if-defined')
const randomInt = require('random-int')
const fs = require('mz/fs')
const request = require('request-promise')
const zlib = require('mz/zlib')

/* app modules */
const Block = require('./util/block')
const Crypto = require('./util/crypto')

/* globals */

const contentTypesByName = {
    collection: 0,
    page: 1,
    video: 2,
    audio: 3,
    image: 4,
}

// maximum number of data blocks
const maxDataBlocks = 2**32

 /* exports */
module.exports = class Container {

    /**
     * @class Container
     *
     * @param {object} args
     * @param {Client} args.client
     * @param {string} args.key
     * @param {object} args.meta
     * @param {string} args.meta.type
     * @param {User} args.user
     */
    constructor (args = {}) {
        assert(args.client, 'client required')
        assert(args.user, 'user required')
        // key used to encrypt/decrypt chat for container
        this.chatKeyBuffer = null
        // client used to make api requests
        this.client = args.client
        // list of data blocks if data exceeds a single block
        this.dataBlocks = []
        // queue of data buffers to include in container
        this.dataBuffers = []
        // buffer with data to include in head block if any
        this.dataBuffer = null
        // length in bytes of data
        this.dataLength = 0
        // set to true when all data/meta added
        this.done = false
        // list of files included in container
        this.files = []
        // head publish result
        this.head = null
        // encryption key
        this.key = args.key || ''
        // derived key created with PBKDF
        this.keyBuffer = null
        // object meta data
        this.meta = {}
        // buffer with serialized and compressed meta data
        this.metaBuffer = null
        // list of meta blocks if meta exceeds a single block
        this.metaBlocks = []
        // length in bytes of meta
        this.metaLength = 0
        // 32 byte hex hash id of head block ids and derived key
        this.privateId = ''
        // 32 byte hex hash id of head block ids
        this.publicId = ''
        // salt for PBKDF / AES-CTR IV
        this.saltBuffer = null
        // user object for making upload/downlaod requests
        this.user = args.user
        // version
        this.version = 1
        // set content type
        this.setContentType(args.meta.type)
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
     * @param {integer} size
     */
    async addData (buffer, size) {
        assert(!this.done, 'cannot addData when done')
        debug('addData', buffer, size)
        // add data buffer to queue
        this.dataBuffers.push(buffer)
        // and length of data to total data length
        this.dataLength += buffer.length
        // if a target size is specified then check if buffered data exceeds
        if (defined(size)) {
            // get validated block size in bytes
            const bytes = Block.getBytes(size)
            // if length of queued buffers desired block size publish
            if (this.getBuffersLength() > bytes) {
                await this.publishData(Block.getBytes(size))
            }
        }
    }

    /**
     * @function addFile
     *
     * add file to container
     *
     * @param {object} file
     * @param {integer} size
     *
     * @returns {Promise<object>}
     */
    async addFile (file, size) {
        // require file name and path
        assert(_.isString(file.name) && file.name.length, 'file name required')
        assert(_.isString(file.path) && file.path.length, 'file path required')
        debug('addFile', file, size)
        // read file data
        const buffer = await fs.readFile(file.path)
        // determine block that file will start in
        const block = this.dataBlocks.length
        // determine offset in current block
        const offset = this.getBuffersLength()
        // info for file in container
        const containerFile = {
            block: block,
            digest: Crypto.sha256(buffer, 'hex'),
            length: buffer.length,
            name: file.name,
            offset: offset,
        }
        // add to files meta
        this.files.push(containerFile)
        // add buffer to container
        await this.addData(buffer, size)

        return containerFile
    }

    /**
     * @function addFileGroup
     *
     * adds list of files to container with given block size. when last file
     * is added the smallest block size that fits file will be used and will
     * be padded out with random data.
     *
     * @param {array} files
     * @param {integer} size
     *
     * @returns {Promise<array>}
     */
    async addFileGroup (files, size) {
        debug('addFileGroup', files, size)
        // if there is any buffered data to written to blocks write it now
        // so that each file group starts at the beginning of a block
        if (this.getBuffersLength() > 0) {
            // publish with best fit block size
            await this.publishData()
        }
        // list of files added to container
        const containerFiles = []
        // if there are any queued data buffers
        for (const file of files) {
            containerFiles.push( await this.addFile(file, size) )
        }
        // if there are any queued buffers publish
        if (this.getBuffersLength() > 0) {
            // publish with best fit block size
            await this.publishData()
        }

        return containerFiles
    }

    finalize () {
        assert(this.head, 'head not defined')
        console.log(this.head.blocks)
        // public id is hash of head block ids only
        this.publicId = Crypto.sha256(Buffer.concat([
            Buffer.from(this.head.blocks[0], 'hex'),
            Buffer.from(this.head.blocks[1], 'hex')
        ]), 'hex', 32)
        // private id is hash of head block ids and key
        this.privateId = Crypto.sha256(Buffer.concat([
            Buffer.from(this.head.blocks[0], 'hex'),
            Buffer.from(this.head.blocks[1], 'hex'),
            this.keyBuffer
        ]), 'hex', 32)
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
     * @function getBuffersLength
     *
     * get the sum length (bytes) of data buffers
     *
     * @returns {integer}
     */
    getBuffersLength () {
        const buffersLength = _.sumBy(this.dataBuffers, 'length')
        debug('getBuffersLength', buffersLength)
        return buffersLength
    }

    /**
     * @function getDataBuffer
     *
     * get a data buffer of specified bytes from queued dataBuffers.
     *
     * this method removes queued data buffers and will split a data buffer
     * if needed to get correct size.
     *
     * @param {integer} bytes
     *
     * @returns {Buffer}
     */
    getDataBuffer (bytes) {
        debug('getDataBuffer', bytes)
        // require queued data buffers
        assert(this.dataBuffers.length, 'no data buffers')
        // list of pulled data buffers
        const dataBuffers = []
        // get data buffers
        while (this.dataBuffers.length) {
            dataBuffers.push( this.dataBuffers.shift() )
            // get length of pulled data buffers
            const dataBuffersLength = _.sumBy(dataBuffers, 'length')
            // if the length of pulled buffers equals desired length then break
            if (dataBuffersLength === bytes) {
                break
            }
            // if length of pulled buffers is creater than desired length
            // must split last buffer and add remainder back to queue
            else if (dataBuffersLength > bytes) {
                // get last buffer
                const splitBuffer = dataBuffers.pop()
                // get number of bytes needed to satisfy length
                const bytesTaken = bytes - _.sumBy(dataBuffers, 'length')
                // create new buffer with bytes taken to return
                dataBuffers.push( splitBuffer.slice(0, bytesTaken) )
                // add new buffer with remaining bytes back to start of queue
                this.dataBuffers.unshift( splitBuffer.slice(bytesTaken) )
                break
            }
        }

        return Buffer.concat(dataBuffers)
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
            headLength += 65 * this.metaBlocks.length
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
        if (this.dataBlocks.length > 0) {
            // each block id is a uint8 size + 2 128bit ids + 256bit key
            headLength += 65 * this.dataBlocks.length
        }
        // if data is included in head then add to length
        else if (this.dataBuffer) {
            headLength += this.dataBuffer.length
        }
        // sha-256 hash of head
        headLength += 32

        return headLength
    }

    getInfo () {
        assert(this.head, 'head not defined')

        const secureLink = [
            this.head.size,
            this.contentType,
            this.head.blocks[0],
            this.head.blocks[1],
            this.saltBuffer.toString('hex')
        ]

        const openLink = secureLink.concat(this.key)

        return {
            chatKey: this.chatKeyBuffer.toString('hex'),
            key: this.key,
            links: {
                ciph: {
                    open: `ciph://${openLink.join('-')}`,
                    secure: `ciph://${secureLink.join('-')}`,
                },
                web: {
                    open: `${this.client.api}/enter#${openLink.join('-')}`,
                    secure: `${this.client.api}/enter#${secureLink.join('-')}`,
                }
            },
            privateId: this.privateId,
            publicId: this.publicId,
            userId: this.user.data.userId,
            secret: this.user.data.secret,
        }
    }

    async initChatKey () {
        // skip if chat key already initialized
        if (this.chatKeyBuffer) return
        // get random data
        const data = await crypto.randomBytes(64)
        // hash data to create token/secret
        this.chatKeyBuffer = Crypto.sha256(data)
    }

    async initKey () {
        // skip if key already initialized
        if (this.keyBuffer) return
        // create new key if not set
        if (!this.key.length) {
            this.key = await this.newKey()
        }
        // require valid key
        assert(typeof this.key === 'string' && this.key.length, 'key required')
        // create salt
        this.saltBuffer = await this.newSalt()
        // created derived key
        this.keyBuffer = await crypto.pbkdf2(
            Buffer.from(this.key),
            this.saltBuffer,
            10000,
            32,
            'sha256'
        )
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
        return Crypto.sha256(data, 'hex')
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
        return Crypto.sha256(data, null, 16)
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
        // add files to meta data
        this.meta.files = this.files
        // get buffer of compressed meta
        this.metaBuffer = await zlib.gzip(JSON.stringify(this.meta), {level: 9})
        // TODO: split meta into blocks if too large for head block
    }


    /**
     * @function publish
     *
     * finalize and publish container
     *
     * @returns Promise<object>
     */
    async publish () {
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
        // set id and other derived properties
        this.finalize()
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
        const size = Block.getSize(block.length)
        // get random block
        const randomBlock = await this.client.getRandomBlock(size)
        // new block is XOR of ramdp, block and data block
        const newBlock = Crypto.xorBuffer(block, randomBlock.data)
        // publish block
        console.log(`publishing ${bytes.format(block.length)} block`)
        const publishedBlock = await this.client.publishBlock(newBlock)
        // randomize order of blocks
        const blocks = await this.flip()
            ? [ publishedBlock.id, randomBlock.id ]
            : [ randomBlock.id, publishedBlock.id ]

        return { blocks, size }
    }

    /**
     * @function publishData
     *
     * publish data block(s) from buffers
     *
     * @param {integer} bytes
     *
     * @returns {Promise<array>}
     */
    async publishData (bytes) {
        debug('publishData', bytes)
        // get length of currently buffered data
        const bufferedDataLength = this.getBuffersLength()
        // skip if nothing buffered
        if (bufferedDataLength === 0) return []
        // list of data blocks published
        const publishedDataBlocks = []
        // if block size is specified then cut buffers to that size
        if (bytes) {
            while (this.getBuffersLength() >= bytes) {
                // get a single buffer of designated length
                const dataBuffer = this.getDataBuffer(bytes)
                // data buffer should include all data
                assert(dataBuffer.length === bytes, 'data buffer length mismatch')
                // publish block
                publishedDataBlocks.push( await this.publishDataBlock(dataBuffer) )
            }
        }
        // otherwise get best fit for data length
        else {
            // TODO: use two blocks when recommended
            const blockPlan = Block.getBlockPlan(bufferedDataLength)
            // get a single buffer of designated length
            const dataBuffer = this.getDataBuffer(blockPlan.one)
            // data buffer should include all data
            assert(dataBuffer.length === bufferedDataLength, 'data buffer length mismatch')
            // publish block
            publishedDataBlocks.push( await this.publishDataBlock(dataBuffer) )
        }

        return publishedDataBlocks
    }

    /**
     * @function publishDataBlock
     *
     * publish a data block from buffer
     *
     * @param {Buffer} buffer
     *
     * @returns {object}
     */
    async publishDataBlock (buffer) {
        // get block size for buffer
        const blockSize = Block.getBlockSize(buffer.length)
        // create new random block key
        const keyBuffer = Crypto.sha256( await crypto.randomBytes(64) )
        // use sha to get iv
        const ivBuffer = Crypto.sha256(keyBuffer, null, 16)
        // create new aes cipher
        const cipher = crypto.createCipheriv('AES-256-CTR', keyBuffer, ivBuffer)
        // encrypted data
        let dataBuffer
        // block needs to be padded
        if (blockSize.pad) {
            // get rand bytes to pad tail of block with
            const tailPadBuffer = await crypto.randomBytes(blockSize.pad)
            // encrypt data
            dataBuffer = Buffer.concat([
                cipher.update(buffer),
                cipher.update(tailPadBuffer),
                cipher.final()
            ])
        }
        // block does not need to be padded
        else {
            // encrypt data
            dataBuffer = Buffer.concat([
                cipher.update(buffer),
                cipher.final()
            ])
        }
        // publish block
        const ciph = await this.publishBlock(dataBuffer)
        // data block info
        const dataBlock = {
            blocks: ciph.blocks,
            keyBuffer: keyBuffer,
            size: ciph.size,
        }
        // add published block to container
        this.dataBlocks.push(dataBlock)

        return dataBlock
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
        const plainBuffer = Buffer.alloc(this.getHeadLength())
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
            for (const dataBlock of this.dataBlocks) {
                // data block size
                plainBuffer.writeUInt8(dataBlock.size, offset)
                offset += 1
                // block id 0
                const blockId0 = Buffer.from(dataBlock.blocks[0], 'hex')
                assert(blockId0.length === 16, 'invalid length block id 0')
                blockId0.copy(plainBuffer, offset)
                offset += 16
                // block id 1
                const blockId1 = Buffer.from(dataBlock.blocks[1], 'hex')
                assert(blockId1.length === 16, 'invalid length block id 1')
                blockId1.copy(plainBuffer, offset)
                offset += 16
                // key
                assert(dataBlock.keyBuffer.length === 32, 'invalid key length')
                dataBlock.keyBuffer.copy(plainBuffer, offset)
                offset += 32
            }
        }
        // otherwise add data
        else {
            this.dataBuffer.copy(plainBuffer, offset)
            offset += this.dataBuffer.length
        }
        // get hash of head data
        const headSHA = Crypto.sha256([metaBuffer, plainBuffer.slice(0, offset)])
        // add sha to end of head
        headSHA.copy(plainBuffer, offset)
        offset += 32
        // offset should equal length at end
        assert(offset === this.getHeadLength(), 'data length error')
        // get block size that accomodates header length
        const blockSize = Block.getBlockSize(this.getHeadLength() + 2)
        // use salt for initialization vector
        const ivBuffer = Crypto.sha256(this.keyBuffer, null, 16)
        // create new aes cipher
        const cipher = crypto.createCipheriv('AES-256-CTR', this.keyBuffer, ivBuffer)
        // encrypted data
        let headBuffer
        // block needs to be padded
        if (blockSize.pad) {
            // get rand bytes to pad tail of block with
            const tailPadBuffer = await crypto.randomBytes(blockSize.pad)
            // encrypt
            headBuffer = Buffer.concat([
                metaBuffer,
                cipher.update(plainBuffer),
                cipher.update(tailPadBuffer),
                cipher.final()
            ])
        }
        // block does not need to be padded
        else {
            // encrypt
            headBuffer = Buffer.concat([
                metaBuffer,
                cipher.update(plainBuffer),
                cipher.final()
            ])
        }
        // publish head block
        this.head = await this.publishBlock(headBuffer)
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
        if (this.getHeadLength() > Block.getMaxBlockSize()) return false

        return true
    }

    /**
     * @function verify
     *
     * download head blocks and all referenced meta and data blocks, decrypt,
     * and verify that data matches input.
     *
     * @returns {Promise<object>}
     */
    async verify () {
        assert(this.head, 'head not defined')

    }
}