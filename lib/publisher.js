'use strict'

/* init config */
require('./config')

/* app modules */
const PublisherPage = require('./publisher/page')
const PublisherVideo = require('./publisher/video')

module.exports = class Publisher {

    static async publish (type, files, cmd) {
        let publisher

        // if quiet arg is passed disable console.log
        const origConsoleLog = console.log
        if (cmd.quiet) {
            console.log = function () {}
        }

        const args = {
            api: cmd.api,
            files: files,
            key: cmd.key,
            title: cmd.title,
            workPath: cmd.workPath,
        }

        if (type === 'page') {
            publisher = new PublisherPage(args)
        }
        else if (type === 'video') {
            publisher = new PublisherVideo(args)
        }
        else {
            throw new Error(`invalid publish type: ${type}`)
        }

        await publisher.publish()

        if (cmd.verify) {
            await publisher.container.verify()
        }

        // replace original console log
        console.log = origConsoleLog

        const info = publisher.container.getInfo()

        if (cmd.json) {
            console.log(JSON.stringify(info))
        }
        else {
            console.log('-------------------')
            console.log('Container Published')
            console.log('-------------------')
            console.log(`PRIVATE ID: ${info.privateId}`)
            console.log(`PUBLIC ID: ${info.publicId}`)
            console.log('-------------------')
            console.log(`KEY: ${info.key}`)
            console.log('-------------------')
            console.log(`CHAT KEY: ${info.chatKey}`)
            console.log('-------------------')
            console.log(`CIPH SECURE LINK: ${info.links.ciph.secure}`)
            console.log('-------------------')
            console.log(`CIPH OPEN LINK: ${info.links.ciph.open}`)
            console.log('-------------------')
            console.log(`WEB SECURE LINK: ${info.links.web.secure}`)
            console.log('-------------------')
            console.log(`WEB OPEN LINK: ${info.links.web.open}`)
            console.log('-------------------')
        }
    }

}