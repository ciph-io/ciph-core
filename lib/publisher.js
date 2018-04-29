'use strict'

/* npm modules */
const _ = require('lodash')
const inquirer = require('inquirer')

/* init config */
require('./config')

/* app modules */
const Client = require('./client')
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
        // prepare publish args
        const args = _.pick(cmd, ['api', 'key', 'title', 'workPath'])
        args.files = files
        // create/login user
        args.user = new User(cmd)
        // wait for user to load and require user to have credit
        await args.user.promise
        // if there was an error display and exit
        if (args.user.error) {
            console.error(args.user.error.message)
            process.exit()
        }
        // create client instance for making api requests
        args.client = new Client({
            api: cmd.api,
            user: args.user,
        })

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