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
        const args = [
            '-i', inputFile,
            '-loglevel', 'fatal',
            '-c:a', 'copy', '-map', `0:${streamIndex}`,
            '-f', 'mp4', outputFile
        ]
        await childProcess.execFile(ffmpegBin, args)
    }

    static async demuxVideo (inputFile, streamIndex, outputFile) {
        const args = [
            '-i', inputFile,
            '-loglevel', 'fatal',
            '-c:v', 'copy', '-map', `0:${streamIndex}`,
            '-f', 'mp4', outputFile
        ]
        await childProcess.execFile(ffmpegBin, args)
    }

    static async encodeAudio (inputFile, streamIndex, outputFile, bitrate, channels) {
        // encode with libfdk
        if (hasFdkAac) {
            const args = [
                '-i', inputFile,
                '-loglevel', 'fatal',
                '-c:a', 'libfdk_aac', '-vbr', '4', '-map', `0:${streamIndex}`,
            ]
            if (channels) {
                args.push('-ac', channels)
            }
            args.push('-f', 'mp4', outputFile)
            await childProcess.execFile(ffmpegBin, args)
        }
        // encode with ffmpeg aac encoder
        else {
            const args = [
                '-i', inputFile,
                '-loglevel', 'fatal',
                '-strict', 'experimental',
                '-c:a', 'aac', '-b:a', `${bitrate}k`,  '-map', `0:${streamIndex}`,
            ]
            if (channels) {
                args.push('-ac', channels)
            }
            args.push('-f', 'mp4', outputFile)
            await childProcess.execFile(ffmpegBin, args)
        }
    }

    static async encodeSubtitle (inputFile, streamIndex, outputFile) {
        const args = [
            '-i', inputFile,
            '-loglevel', 'fatal',
            '-map', `0:${streamIndex}`,
            outputFile
        ]
        await childProcess.execFile(ffmpegBin, args)
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