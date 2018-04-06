'use strict'

/* npm modules */
const childProcess = require('mz/child_process')
const defined = require('if-defined')
const ffprobe = require('ffprobe')

/* app modules */
const assert = require('./util/assert')

/* global */

// set true FDK AAC encoder available
let hasFdkAac = false

// ffmpeg executable
const ffmpegBin = process.env.FFMPEG_PATH
const ffprobeBin = process.env.FFPROBE_PATH

/* exports */
module.exports = class FFMPEG {

    static async demuxAudio (inputFile, streamIndex, outputFile) {
        await childProcess.execFile(ffmpegBin, ['-i', inputFile, '-c:a', 'copy', '-map', `0:${streamIndex}`, '-f', 'mp4', outputFile])
    }

    static async demuxVideo (inputFile, streamIndex, outputFile) {
        await childProcess.execFile(ffmpegBin, ['-i', inputFile, '-c:v', 'copy', '-map', `0:${streamIndex}`, '-f', 'mp4', outputFile])
    }

    static async encodeAudio (inputFile, streamIndex, outputFile, bitrate) {
        // encode with libfdk
        if (hasFdkAac) {
            await childProcess.execFile(ffmpegBin, ['-i', inputFile, '-c:a', 'libfdk_aac', '-vbr', '4', '-map', `0:${streamIndex}`, '-f', 'mp4', outputFile])
        }
        // encode with ffmpeg aac encoder
        else {
            await childProcess.execFile(ffmpegBin, ['-i', inputFile, '-c:a', 'aac', '-b:a', `${bitrate}k`, '-strict', 'experimental', '-map', `0:${streamIndex}`, '-f', 'mp4', outputFile])
        }
    }

    static async encodeSubtitle (inputFile, streamIndex, outputFile) {
        await childProcess.execFile(ffmpegBin, ['-i', inputFile, '-map', `0:${streamIndex}`, outputFile])
    }

    static async getInfo (file) {
        return ffprobe(file, {path: ffprobeBin})
    }

    static async test () {
        const [ output ] = await childProcess.execFile(ffmpegBin, ['-version'])
        assert(output.match(/ffmpeg version/), 'ffmpeg not found')
        // check for libfdk support
        if (output.match(/enable-libfdk-aac/)) {
            hasFdkAac = true
        }
    }

}