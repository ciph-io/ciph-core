'use strict'

/* npm modules */
const _ = require('lodash')
const inquirer = require('inquirer')

/* init config */
require('./config')

/* app modules */
const Client = require('./client')
const Container = require('./container')
const PublisherCollection = require('./publisher/collection')
const PublisherPage = require('./publisher/page')
const PublisherVideo = require('./publisher/video')
const User = require('./user')

module.exports = class Publisher {

    static async publish (type, files, cmd) {
        let publisher

        // if quiet arg is passed disable console.log
        const origConsoleLog = console.log
        if (cmd.quiet) {
            console.log = function () {}
        }
        // if agreement to upload charges is not set then prompt
        if (!cmd.agreeCharges) {
            const answer = await inquirer.prompt([{
                message: 'Uploaded data will be charged against your credit at a rate of 5X (e.g. 1GB upload costs 5GB credit). Do you agree to these charges?',
                name: 'agreeCharges',
                type: 'confirm',
            }])
            if (!answer.agreeCharges) {
                console.error('You must agree to charges to publish!')
                process.exit()
            }
        }
        // if ownership flag not set then show copyright prompt
        if (!cmd.assertOwnership) {
            const answer = await inquirer.prompt([{
                message: 'Do you own the content the content being published or are you legally authorized by the content owner to publish this content via Ciph?',
                name: 'assertOwnership',
                type: 'confirm',
            }])
            if (!answer.assertOwnership) {
                console.error('You cannot publish content that you do not own!')
                process.exit()
            }
        }
        // create/login user
        const user = new User(cmd)
        // wait for user to load and require user to have credit
        await user.promise
        // if there was an error display and exit
        if (user.error) {
            console.error(user.error.message)
            process.exit()
        }
        // create client instance for making api requests
        const client = new Client({
            api: cmd.api,
            user: user,
        })
        // arguments for container
        const containerArgs = _.pick(cmd, [
            'api',
            'key',
            'replaceLink',
            'replaceToken',
        ])
        // pass client and user to container instance
        containerArgs.client = client
        containerArgs.user = user
        // set general meta data for gontainer
        containerArgs.meta = {
            title: cmd.title,
            type: type,
            userId: user.data.userId,
        }
        // create new container - throws on error
        const container = new Container(containerArgs)
        // if replace container needs to be loaded with wait for it
        if (container.replaceContainer) {
            await container.replaceContainer.head.promise
            // if there was error throw
            if (container.replaceContainer.head.error) {
                throw container.replaceContainer.head.error
            }
        }
        // arguments for publisher
        const publisherArgs = _.pick(cmd, [
            'dashDuration',
            'downloadBitrate',
            'downloadCodec',
            'downloadResolution',
            'indexFileName',
            'workPath',
        ])
        // add container instance to publisher
        publisherArgs.container = container
        // add list of files to publish
        publisherArgs.files = files

        if (type === 'collection') {
            publisher = new PublisherCollection(publisherArgs)
        }
        else if (type === 'page') {
            publisher = new PublisherPage(publisherArgs)
        }
        else if (type === 'video') {
            publisher = new PublisherVideo(publisherArgs)
        }

        await publisher.publish()

        if (cmd.verify) {
            await container.verify()
        }

        // replace original console log
        console.log = origConsoleLog

        const info = container.getInfo()

        if (cmd.json) {
            console.log(JSON.stringify(info))
        }
        else {
            console.log('-------------------')
            console.log('Container Published')
            console.log('-------------------')
            console.log(`PRIVATE ID: ${info.privateId}`)
            console.log(`PUBLIC ID: ${info.publicId}`)
            console.log(`REPLACE TOKEN: ${info.replaceToken}`)
            if (info.originalId) {
                console.log(`ORIGINAL ID: ${info.originalId}`)
            }
            if (info.parentId) {
                console.log(`PARENT ID: ${info.parentId}`)
            }
            console.log('-------------------')
            console.log(`USER ID: ${user.data.userId}`)
            console.log(`SECRET: ${user.data.secret}`)
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

        return info
    }

}