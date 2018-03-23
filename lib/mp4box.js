'use strict'

/* npm modules */
const childProcess = require('mz/child_process')
const defined = require('if-defined')

/* app modules */
const assert = require('./util/assert')

/* global */

// mp4box executable
const mp4boxBin = process.env.MP4BOX_PATH

/* exports */
module.exports = class MP4Box {

    static async dash (files, duration, mpdFile) {
        await childProcess.exec(`MP4Box -dash ${duration} -frag ${duration} -url-template ${files.join(' ')} -out ${mpdFile}`)
    }

    static async test () {
        const [, output] = await childProcess.exec(`MP4Box -version`)
        const [, version] = output.match(/MP4Box - GPAC version (\d+\.\d+\.\d+)/)
        assert(defined(version), 'mp4box not found')
    }

}