'use strict'

/* native modules */
const path = require('path')

/* npm modules */
const _ = require('lodash')
const crypto = require('mz/crypto')
const defined = require('if-defined')
const randomInt = require('random-int')
const fs = require('mz/fs')
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
const maxBlockSize = blockSizes[blockSizes.length-1]
// minimum block size
const minBlockSize = blockSizes[0]
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
        // 32 byte hex hash id of head block ids and derived key
        this.id = ''
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
        // salt for PBKDF / AES-CTR IV
        this.saltBuffer = null
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
     * @param {integer} blockSize
     */
    async addData (buffer, blockSize) {
        assert(!this.done, 'cannot addData when done')
        // get validated block size in bytes
        blockSize = this.getBlockSizeBytes(blockSize)
        // add data buffer to queue
        this.dataBuffers.push(buffer)
        // and length of data to total data length
        this.dataLength += buffer.length
        // if length of queued buffers desired block size publish
        if (this.getBuffersLength() > blockSize) {
            await this.publishData(blockSize)
        }
    }

    /**
     * @function addFile
     *
     * add file to container
     *
     * @param {object} file
     * @param {integer} blockSize
     *
     * @returns {Promise<object>}
     */
    async addFile (file, blockSize) {
        // require file name and path
        assert(_.isString(file.name) && file.name.length, 'file name required')
        assert(_.isString(file.path) && file.path.length, 'file path required')
        // read file data
        const buffer = await fs.readFile(file.path)
        // determine block that file will start in
        const block = this.dataBlocks.length
        // determine offset in current block
        const offset = this.getBuffersLength()
        // info for file in container
        const containerFile = {
            block: block,
            digest: sha256(buffer, 'hex'),
            length: buffer.length,
            name: file.name,
            offset: offset,
        }
        // add to files meta
        this.files.push(containerFile)
        // add buffer to container
        await this.addData(buffer, blockSize)

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
     * @param {integer} blockSize
     *
     * @returns {Promise<array>}
     */
    async addFileGroup (files, blockSize) {
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
            containerFiles.push( await this.addFile(file, blockSize) )
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
        // set id as 128 bit (32 byte hex) hash of head blocks and key
        this.id = sha256(Buffer.concat([
            Buffer.from(this.head.blocks[0], 'hex'),
            Buffer.from(this.head.blocks[1], 'hex'),
            this.keyBuffer
        ]), 'hex').substr(0, 32)
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
     * @function getBlockPlan
     *
     * get block size(s) that best fit data length. If splitting data into
     * two blocks yields significant size reduction then this will be
     * recommended.
     *
     * @param {integer} length
     *
     * @returns {Object}
     */
    getBlockPlan (length) {
        const plan = {}
        // find smallest one or two blocks that will fit length
        for (let i=0; i < blockSizes.length; i++) {
            // if current block is large enough then use
            if (blockSizes[i] >= length) {
                plan.one = blockSizes[i]
            }
            // if current block plus next block is large enough then use
            if (blockSizes[i] + blockSizes[i+1] >= length) {
                plan.two = [blockSizes[i], blockSizes[i+1]]
            }
            // if plan complete then finish
            if (defined(plan.one) && defined(plan.two)) break
        }
        // calculate space savings of two blocks over one
        plan.savings = plan.one - (plan.two[0] + plan.two[1])
        // only recommend two blocks if savings is large because additional
        // blocks add overhead throughout the system
        plan.recommend = plan.savings > 16*KB ? 'two' : 'one'

        return plan
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
     * @function getBlockSizeBytes
     *
     * get the bytes for a given block size or if bytes are passed in
     * validate that they match a standard block size. if blockSize
     * argument is not defined default to max block size.
     *
     * @param {integer} blockSize
     *
     * @returns {integer}
     */
    getBlockSizeBytes (blockSize) {
        // use max block size if not defined
        if (!defined(blockSize)) return maxBlockSize
        // if block size is >= minBlockSize must be bytes
        if (blockSize >= minBlockSize && blockSizes.includes(blockSize)) {
            return blockSize
        }
        // otherwise must be id of block size
        else if (defined(blockSizes[blockSize])) {
            return blockSizes[blockSize]
        }
        else {
            throw new Error('invalid block size')
        }
    }

    /**
     * @function getBuffersLength
     *
     * get the sum length (bytes) of data buffers
     *
     * @returns {integer}
     */
    getBuffersLength () {
        return _.sumBy(this.dataBuffers, 'length')
    }

    /**
     * @function getDataBuffer
     *
     * get a data buffer of specified length from queued dataBuffers.
     *
     * this method removes queued data buffers and will split a data buffer
     * if needed to get correct size.
     *
     * @param {integer} length
     *
     * @returns {Buffer}
     */
    getDataBuffer (length) {
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
            if (dataBuffersLength === length) {
                break
            }
            // if length of pulled buffers is creater than desired length
            // must split last buffer and add remainder back to queue
            else if (dataBuffersLength > length) {
                // get last buffer
                const splitBuffer = dataBuffers.pop()
                // get number of bytes needed to satisfy length
                const bytesTaken = length - _.sumBy(dataBuffers, 'length')
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
            id: this.id,
            key: this.key,
            links: {
                ciph: {
                    open: `ciph://${openLink.join('-')}`,
                    secure: `ciph://${secureLink.join('-')}`,
                },
                web: {
                    open: `${this.api}/enter?ciph=${openLink.join('-')}`,
                    secure: `${this.api}/enter?ciph=${secureLink.join('-')}`,
                }
            }
        }
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
        return sha256(data).slice(0, 16)
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
        const size = blockSizes.indexOf(block.length)
        assert(size >= 0, 'invalid block size')
        // get download links for random block
        let random
        try {
            random = await requestPromise({
                json: true,
                qs: { size },
                uri: `${this.api}/random`,
            })
            assert(random.length > 0, 'no random blocks found')
        }
        catch (err) {
            console.error('Error: get random block')
            throw err
        }
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
        console.log(`publishing ${block.length}b block`)
        // start publish
        let start
        try {
            start = await requestPromise({
                body: { blockId: newBlockId, size: size },
                json: true,
                method: 'POST',
                uri: `${this.api}/publish/start`,
            })
        }
        catch (err) {
            console.error('Error: publish start')
            throw err
        }
        // upload file
        let upload
        try {
            upload = await requestPromise({
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
                },
                json: true,
                method: 'POST',
                uri: start.url,
            })
        }
        catch (err) {
            console.error('Error: block upload')
            throw err
        }
        // finish publish
        let finish
        try {
            finish = await requestPromise({
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
        }
        catch (err) {
            console.error('Error: publish finish')
            throw err
        }
        // randomize order of blocks
        const blocks = await this.flip()
            ? [ newBlockId, randomBlockInfo.blockId ]
            : [ randomBlockInfo.blockId, newBlockId ]

        return { blocks, size }
    }

    /**
     * @function publishData
     *
     * publish data block(s) from buffers
     *
     * @param {integer} blockSize
     *
     * @returns {Promise<array>}
     */
    async publishData (blockSize) {
        // get length of currently buffered data
        const bufferedDataLength = this.getBuffersLength()
        // skip if nothing buffered
        if (bufferedDataLength === 0) return []
        // list of data blocks published
        const publishedDataBlocks = []
        // if block size is specified then cut buffers to that size
        if (blockSize) {
            while (this.getBuffersLength() >= blockSize) {
                // get a single buffer of designated length
                const dataBuffer = this.getDataBuffer(blockSize)
                // data buffer should include all data
                assert(dataBuffer.length === blockSize, 'data buffer length mismatch')
                // publish block
                publishedDataBlocks.push( await this.publishDataBlock(dataBuffer) )
            }
        }
        // otherwise get best fit for data length
        else {
            // TODO: use two blocks when recommended
            const blockPlan = this.getBlockPlan(bufferedDataLength)
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
        const blockSize = this.getBlockSize(buffer.length)
        // create new random block key
        const keyBuffer = sha256( await crypto.randomBytes(64) )
        // use sha to get iv
        const ivBuffer = sha256(keyBuffer).slice(0, 16)
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
        const headSHA = sha256([metaBuffer, plainBuffer.slice(0, offset)])
        // add sha to end of head
        headSHA.copy(plainBuffer, offset)
        offset += 32
        // offset should equal length at end
        assert(offset === this.getHeadLength(), 'data length error')
        // get block size that accomodates header length
        const blockSize = this.getBlockSize(this.getHeadLength() + 2)
        // use salt for initialization vector
        const ivBuffer = sha256(this.keyBuffer).slice(0, 16)
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
        if (this.getHeadLength() > maxBlockSize) return false

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