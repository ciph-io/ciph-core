'use strict'

/* native modules */
const path = require('path')

/* npm modules */
const fs = require('mz/fs')
const zlib = require('mz/zlib')

/* init config */
require('../config')

/* app modules */
const Type = require('../type')

/* exports */
module.exports = class PublisherPage {

    /**
     * @param {object} args
     * @param {object} args.container
     * @param {array}  args.files
     */
    constructor (args = {}) {
        assert(args.container, 'container required')
        this.container = args.container
        // files to include in container
        this.containerFiles = {
            // index.md file (required)
            indexFile: '',
            // images files to display in page fils
            imageFiles: [],
        }
        // list of files to publish
        this.inputFiles = args.files
    }

    async ingestDir (dir) {
        // load dir
        const files = await fs.readdir(dir)
        // ingest files
        for (const file of files) {

        }
    }

    async ingestFiles () {
        for (const file of this.inputFiles) {
            const stat = await fs.stat(file)
            // if directory get all files from directory
            if (stat.isDirectory()) {
                // only one dir allowed
                assert(this.inputFiles.length === 1, 'only single dir allowed')
                // ingest files from dir
                await this.ingestDir(file)
            }
            // otherwise get file
            else {
                this.ingestFile(file)
            }
        }
    }

    async ingestFile (file) {

    }

    async publish () {
        await this.ingestFiles()
    }

}