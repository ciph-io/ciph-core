'use strict'

/* npm modules */
const childProcess = require('mz/child_process')
const defined = require('if-defined')
const ffprobe = require('ffprobe')

/* app modules */
const assert = require('./util/assert')

/* global */

// ffmpeg executable
const ffmpegBin = process.env.FFMPEG_PATH
const ffprobeBin = process.env.FFPROBE_PATH

/* exports */
module.exports = class FFMPEG {

    static async demuxVideo (inputFile, streamIndex, outputFile) {
        await childProcess.exec(`${ffmpegBin} -i ${inputFile} -c:v copy -map 0:${streamIndex} -f mp4 ${outputFile}`)
    }

    static async getInfo (file) {
        return ffprobe(file, {path: ffprobeBin})
    }

    static async test () {
        const output = await childProcess.exec(`${ffmpegBin} -version`)
        const [, version] = output[0].match(/ffmpeg version (\d+\.\d+\.\d+)/)
        assert(defined(version), 'ffmpeg not found')
    }

}