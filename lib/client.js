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
        hosts: [
            'https://proxy-de-1.ciph.io',
            'https://proxy-de-2.ciph.io',
            'https://proxy-de-3.ciph.io',
            'https://proxy-de-4.ciph.io',
        ],
        region: 'de',
        time: 0,
    },
    {
        hosts: [
            'https://proxy-usc-1.ciph.io',
            'https://proxy-usc-2.ciph.io',
        ],
        region: 'usc',
        time: 0,
    },
    {
        hosts: [
            'https://proxy-use-1.ciph.io',
            'https://proxy-use-2.ciph.io',
        ],
        region: 'use',
        time: 0,
    },
    {
        hosts: [
            'https://proxy-usw-1.ciph.io',
            'https://proxy-usw-2.ciph.io',
        ],
        region: 'usw',
        time: 0,
    },
]

const testBlockPath = '/get-proxy/0/5ff536a6d8d90bd3a561cd8440810b90.ciph'

module.exports = class Client {

    constructor (args = {}) {
        assert(args.user, 'user required')
        // set api host
        this.api = args.api || 'https://ciph.io'
        this.proxyHost = ''
        this.user = args.user
        // set proxy host based on best response time
        this.setProxyHost()
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
        try {
            const uri = `${this.api}/replace`
            console.log(`post ${uri}`)
            // make request - returns 204 on success
            await request({
                body: body,
                json: true,
                method: 'POST',
                uri: uri,
            })
        }
        catch (err) {
            if (retry) {
                throw err
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
        try {
            const uri = `${this.api}/replace/token`
            console.log(`post ${uri}`)
            const replaceToken = await request({
                body: { privateId, token },
                json: true,
                method: 'POST',
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
                throw err
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
        try {
            console.log(`get ${this.proxyHost}/get-proxy/${size}/${blockId}.ciph`)
            // download block
            const block = await request({
                encoding: null,
                headers: this.user.getAuthHeaders(),
                uri: `${this.proxyHost}/get-proxy/${size}/${blockId}.ciph`,
            })
            // validate downloaded data
            assert(block.length === Block.getBytes(size), 'invalid length')
            assert(Crypto.blockId(block) === blockId, 'invalid data')

            return block
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
                return this.getBlock(size, blockId, true)
            }
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
     *
     * @returns {Promise<Buffer>}
     */
    async getRandomBlockId (size) {
        console.log(`get ${this.api}/random`)
        const res = await request(`${this.api}/random`, {
            json: true,
            qs: {size},
        })
        assert(Array.isArray(res), 'invalid response')
        return randomItem(res)
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
        try {
            // get upload url and token to perform upload
            const start = await this.publishStart(block)
            // do upload
            const upload = await this.publishUpload(block, start)
            // complete upload
            const finish = await this.publishFinish(block, upload)
            // require valid response
            assert(finish && finish.published, 'publish failed')
        }
        catch (err) {
            if (retry) {
                throw err
            }
            else {
                if (err.statusCode === 402) {
                    throw new Error('insufficient credit')
                }
                else {
                    return this.publishBlock(data, true)
                }
            }
        }
        // return published block data
        return block
    }

    /**
     * @function publishFinish
     *
     * @param {object} block
     * @param {object} upload
     *
     * @returns {Promise<object>}
     */
    async publishFinish (block, upload) {
        console.log(`post ${this.api}/publish/finish`)
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
            uri: `${this.api}/publish/finish`,
        })
    }

    /**
     * @function publishStart
     *
     * @param {object} block
     *
     * @returns {Promise<object>}
     */
    async publishStart (block) {
        console.log(`post ${this.api}/publish/start`)
        return request({
            body: {
                blockId: block.id,
                secret: this.user.data.secret,
                size: block.size,
                userId: this.user.data.userId,
            },
            json: true,
            method: 'POST',
            uri: `${this.api}/publish/start`,
        })
    }

    /**
     * @function publishUpload
     *
     * @param {object} block
     * @param {object} start
     *
     * @returns {Promise<object>}
     */
    async publishUpload (block, start) {
        console.log(`post ${start.url}`)
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
            uri: start.url,
        })
    }

    /**
     * @function setProxyHost
     *
     * set proxy host, first using default, then setting host based on respose
     * time from tests hosts in each region
     *
     */
    setProxyHost () {
        let dev = false
        // if in dev use dev proxy host
        if (this.api === 'https://dev.ciph.io') {
            this.proxyHost = 'https://proxy-dev-1.ciph.io'
            return
        }
        // otherwise default to random tier 1 proxy
        else {
            this.proxyHost = randomItem(proxyHosts[0].hosts)
        }

        const start = Date.now()

        let set = false

        for (const proxyHostRegion of proxyHosts) {
            const newProxyHost = randomItem(proxyHostRegion.hosts)
            request(`${newProxyHost}${testBlockPath}`).then(res => {
                proxyHostRegion.time = Date.now() - start
                if (!set) {
                    console.log(`set proxy host: ${newProxyHost}`)
                    this.proxyHost = newProxyHost
                    set = true
                }
            }).catch(console.error)
        }
    }

}