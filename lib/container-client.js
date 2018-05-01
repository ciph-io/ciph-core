'use strict'

/* npm modules */
const zlib = require('mz/zlib')

/* app modules */
const Block = require('./block')
const ContentType = require('./content-type')
const Crypto = require('./crypto')
const Type = require('./type')

 /* exports */
module.exports = class ContainerClient {

    constructor (url, options = {}) {
        assert(options.client, 'client required')
        this.link = this.getLinkFromUrl(url)
        // encryption key for chat messages
        this.chatKeyBuffer = null
        // client for making requests
        this.client = options.client
        // list of data blocks
        this.dataBlocks = []
        // data included in head block if any
        this.dataBuffer = null
        // key buffer that will be derived from string password and salt
        this.keyBuffer = null
        // 32 byte hex hash id of head block ids and derived key
        this.privateId = ''
        // 32 byte hex hash id of head block ids
        this.publicId = ''
        // meta data
        this.meta = null
        // list of meta blocks if any
        this.metaBlocks = []
        // head block
        this.head = {
            data: null,
            error: null,
        }
        // load head - catch and store error
        this.head.promise = this.loadHead().catch(err => {
            this.head.error = err
        })
    }

    /**
     * @function decodeHead
     *
     * extract binary encoded head data
     *
     * @param {Buffer} data
     * @param {Buffer} block
     *
     * @returns {Promise<object>}
     */
    async decodeHead (data, block) {
        let offset = 0
        // chat key is first 32 bytes
        this.chatKeyBuffer = data.slice(offset, 32)
        offset += 32
        // meta data length uint32 (4 bytes)
        const metaLength = data.readUInt32BE(offset)
        offset += 4
        // number of meta blocks uint16 (2 bytes)
        const numMetaBlocks = data.readUInt16BE(offset)
        offset += 2
        // get meta data
        const metaData = data.slice(offset, offset+metaLength)
        offset += metaLength
        // data length float64 (8 bytes)
        const dataLength = data.readDoubleBE(offset)
        offset += 8
        // number of data blocks uint32 (4 bytes)
        const numDataBlocks = data.readUInt32BE(offset)
        offset += 4
        // if there are no data blocks then data is in head
        if (numDataBlocks === 0) {
            this.dataBuffer = data.slice(offset, offset+dataLength)
            offset += dataLength
        }
        // get info for each data block
        for (let i=0; i < numDataBlocks; i++) {
            // block size uint8 (1 byte)
            const blockSize = data.readUInt8(offset)
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
                ids: [
                    blockId0.toString('hex'),
                    blockId1.toString('hex'),
                ],
                key: key,
                size: blockSize,
            })
        }
        // SHA-256 digest of head data
        const headDigest = data.slice(offset, offset+32)
        // calculate digest to verify
        const digest = await Crypto.sha256([
            // first two unencrypted bytes from block
            block.slice(0, 2),
            // decrypted data from block up to digest
            data.slice(0, offset)
        ])
        assert(digest.equals(headDigest), 'head digest verification failed')
        // if there are no meta blocks then meta is included in head
        if (numMetaBlocks === 0) {
            // decompress meta data
            const metaUnzipped = (await zlib.unzip(metaData)).toString()
            // parse data
            this.meta = JSON.parse(metaUnzipped)
        }
        else {
            throw new Error('meta blocks not yet supported')
        }
        // set ids once data verified
        this.publicId = await Crypto.sha256([
            Buffer.from(this.link.blockId0, 'hex'),
            Buffer.from(this.link.blockId1, 'hex')
        ], 'hex', 32)
        this.privateId = await Crypto.sha256([
            Buffer.from(this.link.blockId0, 'hex'),
            Buffer.from(this.link.blockId1, 'hex'),
            this.keyBuffer
        ], 'hex', 32)
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
    findFile (match) {
        // if meta does not contain files array then not found
        if (!Array.isArray(this.meta.files)) {
            return null
        }

        const found = this.findFiles(match)

        return found.length > 0 ? found[0] : null
    }

    /**
     * @function findFiles
     *
     * search for file(s) by string name or regular expression
     *
     * @param {string|RegExp} match
     *
     * @returns {array}
     */
    findFiles (match) {
        // if meta does not contain files array then not found
        if (!Array.isArray(this.meta.files)) {
            return []
        }

        const files = this.meta.files
        const length = files.length

        const found = []

        if (typeof match === 'string') {
            for (let i=0; i < length; i++) {
                if (files[i].name === match) found.push(files[i])
            }
        }
        else {
            for (let i=0; i < length; i++) {
                if (files[i].name.match(match)) found.push(files[i])
            }
        }

        return found
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
     * @returns {Promise<Buffer>}
     */
    async getBlock (blockSize, blockId0, blockId1) {
        const [data0, data1] = await Promise.all([
            this.client.getBlock(blockSize, blockId0),
            this.client.getBlock(blockSize, blockId1),
        ])

        return Crypto.xorBuffer(data0, data1)
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
    getBlocksForFile (file) {
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
    async getFile (fileName) {
        // fileName = decodeURI(fileName)
        // // get file data
        // const file = this.findFile(fileName)
        // assert(file, 'file not found')
        // // get block(s) that contain file
        // const dataBlocks = this.getBlocksForFile(file)
        // // promises to be resolved with retrieved blocks
        // const blocks = await Promise.all(dataBlocks.map(async dataBlock => {
        //     // fetch and xor blocks
        //     const block = await this.getBlock(dataBlock.size, dataBlock.ids[0], dataBlock.ids[1])
        //     // decrypt block
        //     return this.decryptBlock(block, dataBlock.key)
        // }))
        // // create new buffer for file data
        // const buffer = new ArrayBuffer(file.length)
        // let bytesRemaining = file.length
        // let dstOffset = 0
        // // copy data to buffer
        // for (let i=0; i < dataBlocks.length; i++) {
        //     const dataBlock = dataBlocks[i]
        //     const srcBuffer = blocks[i]
        //     const srcOffset = i === 0 ? file.offset : 0
        //     const copyBytes = bytesRemaining > blockSizes[dataBlock.size] - srcOffset
        //         ? blockSizes[dataBlock.size] - srcOffset
        //         : bytesRemaining
        //     CiphUtil.bufferCopy(srcBuffer, buffer, copyBytes, srcOffset, dstOffset)
        //     bytesRemaining -= copyBytes
        //     dstOffset += copyBytes
        // }
        // // get digest of file to validate
        // const digest = await CiphUtil.sha256(buffer)
        // assert(CiphUtil.bufferToHex(digest) === file.digest, 'invalid file')

        // return buffer
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
    getLinkFromUrl (url) {
        // remove any protocol from url
        url = url.replace(/^\w+:\/\/(.*?\/enter\?ciph=)?/, '')
        // split url into parts
        const [blockSize, contentType, blockId0, blockId1, salt, password] = url.split('-')
        // validate url
        assert(Type.isValidBlockSize(blockSize), 'invalid block size')
        assert(Type.isValidContentType(contentType), 'invalid content type')
        assert(Type.isValidHex32(blockId0), 'invalid block id 0')
        assert(Type.isValidHex32(blockId1), 'invalid block id 1')
        assert(Type.isValidHex32(salt), 'invalid salt')

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
     * @function getPage
     *
     * get unzipped page text
     *
     * @returns {string}
     */
    getPage () {
        assert(this.meta && this.meta.type === 'page', 'invalid content type')
        assert(this.dataBuffer, 'dataBuffer is null')
        // decompress page data
        return pako.ungzip(this.dataBuffer, { to: 'string' })
    }

    /**
     * @function loadHead
     *
     * load head block
     * prompt for password if not in url
     *
     * @returns {Promise}
     */
    async loadHead () {
        // download and xor blocks to get original encrypted block
        const block = await this.getBlock(
            this.link.blockSize,
            this.link.blockId0,
            this.link.blockId1
        )
        // get version from block
        this.head.version = block.readUInt8(0)
        assert(this.head.version === 1, 'invalid version')
        // get content type from block
        this.head.contentType = block.readUInt8(1)
        assert(this.head.contentType === this.link.contentType, 'content type mismatch')
        // first two bytes are plain, rest of head block is encrypted
        const encryptedBlock = block.slice(2)
        // retry decrypting head until password correct or canceled
        assert(typeof this.link.password === 'string' && this.link.password.length, 'password required')
        // derive key from password and salt
        this.keyBuffer = await Crypto.deriveKey(
            Buffer.from(this.link.password),
            Buffer.from(this.link.salt, 'hex')
        )
        // decrypt head block
        const data = await Crypto.decryptBlock(encryptedBlock, this.keyBuffer)
        // extract binary encoded head data
        const head = await this.decodeHead(data, block)
    }

    /**
     * @function validate
     *
     * fetch all files to validate
     *
     */
    async validate () {
        for (const file of this.meta.files) {
            await this.getFile(file.name)
        }
    }
}