'use strict'

/* npm modules */
const childProcess = require('mz/child_process')
const defined = require('if-defined')

/* init config */
require('./config')

/* global */

// map of container formats to segment extensions
const formatSegmentExtension = {
    mp4: 'm4s',
    webm: 'webm',
}
// shaka-packager executable
const shakaPakagerBin = process.env.SHAKA_PACKAGER_PATH

/* exports */
module.exports = class ShakaPakager {

    static async package (sources, duration, workPath, mpdFile) {
        // list of sources
        const sourceArgs = []
        // add video sources
        for (const source of sources.video) {
            const format = source.output.format
            const segmentExtension = formatSegmentExtension[source.output.format]
            // build args for source
            sourceArgs.push(`in=${source.output.path},stream=video,init_segment=${source.output.key}_init.${format},segment_template=${source.output.key}_$Number$.${segmentExtension}`)
        }
        // add audio sources
        for (const source of sources.audio) {
            const format = source.output.format
            const segmentExtension = formatSegmentExtension[source.output.format]
            // build args for source
            sourceArgs.push(`in=${source.output.path},stream=audio,init_segment=${source.output.key}_init.${format},segment_template=${source.output.key}_$Number$.${segmentExtension}`)
        }
        // build args
        const args = [`--mpd_output=${mpdFile}`, `-fragment_duration=${duration}`, '-fragment_sap_aligned=false', `-segment_duration=${duration}`, '-segment_sap_aligned=false', '--generate_static_mpd'].concat(sourceArgs)
        // run packager
        await childProcess.execFile(shakaPakagerBin, args, {
            cwd: workPath,
            maxBuffer: 1024*1024*4,
        })
    }

    static async test () {
        const [output] = await childProcess.execFile(shakaPakagerBin, ['-version'])
        assert(output.match(/shaka-packager/), 'shaka-packager not found')
    }

}