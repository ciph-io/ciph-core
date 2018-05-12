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
            indexFile: null,
            // images files
            imageFiles: [],
            // page files
            pageFiles: [],
        }
        // meta data to include in container
        this.containerMeta = {
            images: [],
            index: '',
            pages: [],
        }
        // name of index file
        this.indexFileName = args.indexFileName || 'index.md'
        // list of files to publish
        this.inputFiles = args.files
    }

    async createContainer () {
        // add container meta data to container
        this.container.setMeta(this.containerMeta)
        // combine index and page files into group
        const pageFiles = [this.containerFiles.indexFile].concat(this.containerFiles.pageFiles)
        await this.container.addFileGroup(pageFiles)
        // add images as a group
        await this.container.addFileGroup(this.containerFiles.imageFiles)
        // upload to ciph platform
        return this.container.publish()
    }

    async ingestDir (dir) {
        // load dir
        const files = await fs.readdir(dir)
        // ingest files
        for (let file of files) {
            file = path.resolve(dir, file)
            this.ingestFile(file)
        }
    }

    async ingestFiles () {
        for (let file of this.inputFiles) {
            file = path.resolve(process.cwd(), file)
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
        if (path.basename(file) === this.indexFileName) {
            assert(!this.containerFiles.indexFile, `index file ${this.indexFileName} already defined`)
            this.containerFiles.indexFile = {
                name: path.basename(file),
                path: file,
            }
        }
        else if (Type.isValidPageFile(file)) {
            this.containerFiles.pageFiles.push({
                name: path.basename(file),
                path: file,
            })
        }
        else if (Type.isValidImageFile(file)) {
            this.containerFiles.imageFiles.push({
                name: path.basename(file),
                path: file,
            })
        }
        else {
            throw new Error(`invalid file type ${file}`)
        }
    }

    async prepareContainerFiles () {
        // require index
        assert(this.containerFiles.indexFile, 'index.md required')
        // check for any duplicate file names
        const fileNames = {}

        const allFiles = this.containerFiles.pageFiles
            .concat(this.containerFiles.imageFiles)

        for (const file of allFiles) {
            assert(!fileNames[file.name], `duplicate file ${file.name}`)
            fileNames[file.name] = true
        }
    }

    async prepareContainerMeta () {
        this.containerMeta.index = this.containerFiles.indexFile.name

        for (const file of this.containerFiles.pageFiles) {
            this.containerMeta.pages.push(file.name)
        }

        for (const file of this.containerFiles.imageFiles) {
            this.containerMeta.images.push(file.name)
        }
    }

    async publish () {
        await this.ingestFiles()
        await this.prepareContainerFiles()
        await this.prepareContainerMeta()
        await this.createContainer()
    }

}