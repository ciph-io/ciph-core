'use strict'

const KB = 1024
const MB = 1024*KB

const blockSizes = [ 4*KB, 16*KB, 64*KB, 256*KB, 1*MB, 4*MB, 16*MB ]
const maxBlockSize = blockSizes[blockSizes.length-1]
const minBlockSize = blockSizes[0]

module.exports = class Block {

    /**
     * @function getBlockPlan
     *
     * get block size(s) that best fit data length. If splitting data into
     * two blocks yields significant size reduction then this will be
     * recommended.
     *
     * @param {integer} bytes
     *
     * @returns {Object}
     */
    static getBlockPlan (bytes) {
        const plan = {}
        // find smallest one or two blocks that will fit length
        for (let i=0; i < blockSizes.length; i++) {
            // if current block is large enough then use
            if (blockSizes[i] >= bytes) {
                plan.one = blockSizes[i]
            }
            // if current block plus next block is large enough then use
            if (blockSizes[i] + blockSizes[i+1] >= bytes) {
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
     * @param {integer} bytes
     *
     * @returns {object}
     */
    static getBlockSize (targetBytes) {
        // find smalles block size that fits length
        for (const size in blockSizes) {
            const bytes = blockSizes[size]
            // if length does not exceed block size use
            if (targetBytes <= bytes) {
                return {
                    bytes: bytes,
                    pad: bytes - targetBytes,
                    size: size,
                }
            }
        }
        // throw error if not block size found
        throw new Error('invalid block length')
    }

    /**
     * @function getBlockSizes
     *
     * get array of bytes where array index is the block size
     *
     * @returns {array}
     */
    static getBlockSizes () {
        return blockSizes
    }

    /**
     * @function getBytes
     *
     * get number of bytes that correspond to block size. throws on invalid
     * block size.
     *
     * @param {integer|string} size
     *
     * @returns {integer}
     */
    static getBytes (size) {
        assert(defined(blockSizes[size]), 'invalid block size')
        return blockSizes[size]
    }

    /**
     * @function getMaxBlockSize
     *
     * get largest block size bytes
     *
     * @returns {integer}
     */
    static getMaxBlockSize () {
        return maxBlockSize
    }

    /**
     * @function getMinBlockSize
     *
     * get smallest block size bytes
     *
     * @returns {integer}
     */
    static getMinBlockSize () {
        return minBlockSize
    }

    /**
     * @function getSize
     *
     * get block size that corresponds to bytes. throws on invalid bytes.
     *
     * @param {integer|string} bytes
     *
     * @returns {integer}
     */
    static getSize (bytes) {
        const size = blockSizes.indexOf(bytes)
        assert(size >= 0, 'invalid block size')
        return size
    }

}