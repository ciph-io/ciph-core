'use strict'

/* npm modules */
const crypto = require('mz/crypto')
const randomItem = require('random-item')
const request = require('request-promise')

/* app modules */
const Block = require('./block')
const Crypto = require('./crypto')

/* globals */
const proxyHosts = [
    {
        host: 'https://proxy-de-1.ciph.io',
    },
    {
        host: 'https://proxy-de-2.ciph.io',
    },
    {
        host: 'https://proxy-de-3.ciph.io',
    },
    {
        host: 'https://proxy-de-4.ciph.io',
    },
]

module.exports = class Client {

    constructor (args = {}) {
        assert(args.user, 'user required')
        // set api host
        this.api = args.api || 'https://ciph.io'
        this.user = args.user
    }

    /**
     * @function createReplace
     *
     * create a new replace entry
     *
     * @param {object} body
     * @param {boolean} retry
     *
     * @returns {Promise}
     */
    async createReplace (body, retry) {
        const uri = `${this.api}/replace`
        console.log(`post ${uri}`)
        try {
            // make request - returns 204 on success
            await request({
                body: body,
                json: true,
                method: 'POST',
                timeout: 10000,
                uri: uri,
            })
        }
        catch (err) {
            if (retry) {
                throw new Error(`POST ${uri} Error: ${err.message}`)
            }
            else {
                return this.createReplace(body, true)
            }
        }
    }

    /**
     * @function createReplaceToken
     *
     * create new replace token for container private id. token will be
     * created if not set.
     *
     * @param {string} privateId
     * @param {string} token
     * @param {boolean} retry
     *
     * @return {Promise<object>}
     */
    async createReplaceToken (privateId, token, retry) {
        const uri = `${this.api}/replace/token`
        console.log(`post ${uri}`)
        try {
            const replaceToken = await request({
                body: { privateId, token },
                json: true,
                method: 'POST',
                timeout: 10000,
                uri: uri,
            })
            // validate response
            assert(replaceToken.privateId === privateId, 'invalid response')
            if (token) {
                assert(replaceToken.token === token, 'invalid response')
            }
            else {
                assert(replaceToken.token, 'invalid response')
            }

            return replaceToken
        }
        catch (err) {
            if (retry) {
                throw new Error(`POST ${uri} Error: ${err.message}`)
            }
            else {
                return this.createReplaceToken(privateId, token, true)
            }
        }
    }

    /**
     * @function getBlock
     *
     * get block identified by size and id
     *
     * @param {integer|string} size
     * @param {string} blockId
     * @param {boolean} retry
     *
     * @returns {Promise<Buffer>}
     */
    async getBlock (size, blockId, retry) {
        const uri = `${this.getProxyHost()}/get-proxy/${size}/${blockId}.ciph`
        console.log(`get ${uri}`)
        try {
            // download block
            const block = await request({
                encoding: null,
                headers: this.user.getAuthHeaders(),
                timeout: 10000,
                uri: uri,
            })
            // validate downloaded data
            assert(block.length === Block.getBytes(size), 'invalid length')
            assert(Crypto.blockId(block) === blockId, 'invalid data')

            return block
        }
        catch (err) {
            if (retry) {
                throw new Error(`GET ${uri} Error: ${err.message}`)
            }
            else {
                // refresh user on token error
                if (err.statusCode === 401) {
                    await this.user.refresh()
                }
                // retry
                return this.getBlock(size, blockId, true)
            }
        }
    }

    /**
     * @function getProxyHost
     *
     * choose proxy host to use for request
     */
    getProxyHost () {
        // if in dev use dev proxy host
        if (this.api === 'https://dev.ciph.io') {
            return 'https://proxy-dev-1.ciph.io'
        }
        // otherwise default to random proxy
        else {
            return randomItem(proxyHosts).host
        }
    }

    /**
     * @function getRandomBlock
     *
     * get random block id of given size then download block
     *
     * @param {integer|string} size
     * @param {boolean} retry
     *
     * @returns {Promise<object>}
     */
    async getRandomBlock (size, retry) {
        try {
            // get random id from api
            const blockId = await this.getRandomBlockId(size)
            // download block
            const randomBlock = await this.getBlock(size, blockId, true)

            return {
                data: randomBlock,
                id: blockId,
                size: size,
            }
        }
        catch (err) {
            if (retry) {
                throw err
            }
            else {
                // refresh user on token error
                if (err.statusCode === 401) {
                    await this.user.refresh()
                }
                return this.getRandomBlock(size, true)
            }
        }
    }

    /**
     * @function getRandomBlockId
     *
     * get random block id of given size then download block
     *
     * @param {integer|string} size
     * @param {boolean} retry
     *
     * @returns {Promise<Buffer>}
     */
    async getRandomBlockId (size, retry) {
        const uri = `${this.api}/random`
        console.log(`get ${uri}`)
        try {
            const res = await request(uri, {
                json: true,
                qs: {size},
                timeout: 10000,
            })
            assert(Array.isArray(res), 'invalid response')
            return randomItem(res)
        }
        catch (err) {
            if (retry) {
                throw new Error(`GET ${uri} Error: ${err.message}`)
            }
            else {
                return this.getRandomBlockId(size, true)
            }
        }
    }

    /**
     * @function publishBlock
     *
     * @param {Buffer} data
     * @param {boolean} retry
     *
     * @returns {Promise}
     */
    async publishBlock (data, retry) {
        // get block id from data
        const blockId = Crypto.blockId(data)
        // get size for bytes
        const size = Block.getSize(data.length)
        // block data
        const block = {
            data: data,
            id: blockId,
            size: size,
        }
        // get upload url and token to perform upload
        const start = await this.publishStart(block)
        // do upload
        const upload = await this.publishUpload(block, start)
        // complete upload
        const finish = await this.publishFinish(block, upload)
        // require valid response
        assert(finish && finish.published, 'publish failed')
        // return published block data
        return block
    }

    /**
     * @function publishFinish
     *
     * @param {object} block
     * @param {object} upload
     * @param {boolean} retry
     *
     * @returns {Promise<object>}
     */
    async publishFinish (block, upload, retry) {
        const uri = `${this.api}/publish/finish`
        console.log(`post ${uri}`)
        try {
            return request({
                body: {
                    blockId: block.id,
                    secret: this.user.data.secret,
                    serverId: upload.serverId,
                    signature: upload.signature,
                    size: block.size,
                    userId: this.user.data.userId,
                },
                json: true,
                method: 'POST',
                timeout: 10000,
                uri: uri,
            })
        }
        catch (err) {
            if (retry) {
                throw new Error(`POST ${uri} Error: ${err.message}`)
            }
            else {
                return this.publishFinish(block, upload, true)
            }
        }
    }

    /**
     * @function publishStart
     *
     * @param {object} block
     * @param {boolean} retry
     *
     * @returns {Promise<object>}
     */
    async publishStart (block, retry) {
        const uri = `${this.api}/publish/start`
        console.log(`post ${uri}`)
        try {
            return request({
                body: {
                    blockId: block.id,
                    secret: this.user.data.secret,
                    size: block.size,
                    userId: this.user.data.userId,
                },
                json: true,
                method: 'POST',
                timeout: 10000,
                uri: uri,
            })
        }
        catch (err) {
            if (retry) {
                throw new Error(`POST ${uri} Error: ${err.message}`)
            }
            else {
                if (err.statusCode === 402) {
                    throw new Error('insufficient credit')
                }
                else {
                    return this.publishStart(block, true)
                }
            }
        }
    }

    /**
     * @function publishUpload
     *
     * @param {object} block
     * @param {object} start
     * @param {boolean} retry
     *
     * @returns {Promise<object>}
     */
    async publishUpload (block, start, retry) {
        console.log(`post ${start.url}`)
        try {
            return request({
                formData: {
                    blockId: block.id,
                    block: {
                        value: block.data,
                        options: {
                            filename: `${block.id}.ciph`,
                            contentType: 'application/octet-stream',
                        },
                    },
                    signature: start.signature,
                    size: block.size,
                },
                json: true,
                method: 'POST',
                timeout: 10000,
                uri: start.url,
            })
        }
        catch (err) {
            if (retry) {
                throw new Error(`POST ${start.url} Error: ${err.message}`)
            }
            else {
                return this.publishUpload(block, start, true)
            }
        }
    }

}