'use strict'

/* npm modules */
const childProcess = require('mz/child_process')
const defined = require('if-defined')

/* app modules */
const assert = require('./util/assert')

/* global */

// shaka-packager executable
const shakaPakagerBin = process.env.SHAKA_PACKAGER_PATH

/* exports */
module.exports = class ShakaPakager {

    static async package (sources, duration, workPath, mpdFile) {
        // build video args
        const videoSourceArgs = []
        for (const source of sources.video) {
            videoSourceArgs.push(
                `in=${source.output.path},stream=video,init_segment=${source.output.key}_init.mp4,segment_template='${source.output.key}_$Number$.m4s'`
            )
        }
        const videoSourceArg = videoSourceArgs.join(' ')
        // build audio args
        const audioSourceArgs = []
        for (const source of sources.audio) {
            audioSourceArgs.push(
                `in=${source.output.path},stream=audio,init_segment=${source.output.key}_init.mp4,segment_template='${source.output.key}_$Number$.m4s'`
            )
        }
        const audioSourceArg = audioSourceArgs.join(' ')
        // build subtitle args
        const subtitleSourceArgs = []
        for (const source of sources.subtitle) {
            // subtitleSourceArgs.push(
            //     `in=${source.output.path},stream=text,lang=${source.language},init_segment=${source.output.key}_init.mp4,segment_template='${source.output.key}_$Number$.mp4'`
            // )
        }
        const subtitleSourceArg = subtitleSourceArgs.join(' ')

        const cwd = process.cwd()

        process.chdir(workPath)

        try {
            await childProcess.exec(`${shakaPakagerBin} --mpd_output=${mpdFile} -fragment_duration=${duration} -fragment_sap_aligned=false -segment_duration=5 -segment_sap_aligned=false --generate_static_mpd ${videoSourceArg} ${audioSourceArg} ${subtitleSourceArgs}`)
        }
        catch (err) {
            process.chdir(cwd)
            throw err
        }

        process.chdir(cwd)

    }

    static async test () {
        const [output] = await childProcess.exec(`${shakaPakagerBin}  -version`)
        assert(output.match(/shaka-packager/), 'shaka-packager not found')
    }

}