'use strict'

/* native modules */
const path = require('path')

/* npm modules */
const fs = require('mz/fs')
const zlib = require('mz/zlib')

/* init config */
require('../config')

/* exports */
module.exports = class PublisherPage {

    /**
     * @param {object} args
     * @param {array}  args.files
     */
    constructor (args = {}) {
        assert(args.container, 'container required')
        this.container = args.container
        // list of files to publish
        this.files = args.files
        // currently only single file supported
        assert(args.files.length === 1, 'must provide a single file to publish')
        // require markdown file
        assert(this.files[0].match(/\.md$/), 'markdown (*.md) file required')
    }

    /**
     * @returns Promise<object>
     */
    async publish () {
        // only publish single file
        const file = this.files[0]
        // get file path from current working directory
        const filePath = path.resolve(process.cwd(), file)
        // load file
        let fileData = await fs.readFile(filePath, 'utf8')
        // gzip file
        fileData = await zlib.gzip(fileData, {level: 9})
        // add data to container
        await this.container.addData(fileData)
        // upload to ciph platform
        return this.container.publish()
    }

}