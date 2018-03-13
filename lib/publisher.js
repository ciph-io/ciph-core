'use strict'

/* app modules */
const PublisherPage = require('./publisher/page')

module.exports = class Publisher {

    static async publish (type, files) {
        let publisher

        if (type === 'page') {
            publisher = new PublisherPage({
                files: files,
            })
        }
        else {
            throw new Error(`invalid publish type: ${type}`)
        }

        await publisher.publish()
    }

}