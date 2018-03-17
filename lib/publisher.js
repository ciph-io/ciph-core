'use strict'

/* init config */
require('./config')

/* app modules */
const PublisherPage = require('./publisher/page')
const PublisherVideo = require('./publisher/video')

module.exports = class Publisher {

    static async publish (type, files, cmd) {
        let publisher

        if (type === 'page') {
            publisher = new PublisherPage({
                api: cmd.api,
                files: files,
            })
        }
        else if (type === 'video') {
            publisher = new PublisherVideo({
                api: cmd.api,
                files: files,
            })
        }
        else {
            throw new Error(`invalid publish type: ${type}`)
        }

        await publisher.publish()
    }

}