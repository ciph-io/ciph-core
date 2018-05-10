'use strict'

/* native modules */
const path = require('path')

/* npm modules */
const _ = require('lodash')
const changeCase = require('change-case')
const fs = require('fs-extra')
const langs = require('langs')

/* init config */
require('../config')

/* app modules */
const Block = require('../block')
const Container = require('../container')
const FFMPEG = require('../ffmpeg')
const ShakaPackager = require('../shaka-packager')

/* globals */

// map of audio codecs to container formats
const audioCodecFormat = {
    aac: 'mp4',
    opus: 'webm',
}
// list of supported audio codecs
const supportedVideoCodes = ['h264', 'vp9']
// map of video codecs to audio codecs
const videoCodecAudioCodec = {
    h264: 'aac',
    vp9: 'opus',
}
// map of video codecs to container formats
const videoCodecFormat = {
    h264: 'mp4',
    vp9: 'webm',
}

/* exports */
module.exports = class PublisherVideo {

    /**
     * @param {object} args
     * @param {Container} args.container
     * @param {integer} args.dashDuration
     * @param {array}  args.files
     * @param {string} args.workPath
     */
    constructor (args = {}) {
        assert(args.container, 'container required')
        // audio codec - must be same for all sources
        this.audioCodec = ''
        // container object
        this.container = args.container
        // files to include in container
        this.containerFiles = {
            // dash init files
            initFiles: [],
            // groups of dash segment files 
            mediaFiles: {},
            // dash mpd file
            mpdFile: '',
            // subtitle files
            subtitles: [],
        }
        // meta data to include in container
        this.containerMeta = {}
        // length of dash segment in seconds
        this.dashDuration = args.dashDuration || 5
        // list of files to process
        this.files = []
        // files passed from command line
        this.inputFiles = args.files
        // dash mpd file name
        this.mpdFile = 'ciph.mpd'
        // prepared files to be added to mpeg-dash container
        this.sources = {
            audio: [],
            subtitle: [],
            video: [],
        }
        // meta data for combined video file
        this.video = null
        // video codec - must be same for all sources
        this.videoCodec = ''
        // working directory for encoding/muxing files
        this.workPath = args.workPath || process.cwd()
    }

    async createContainer () {
        // add container meta data to container
        this.container.setMeta(this.containerMeta)
        // put the mpd file and init files into a single block to load first
        const startFiles = [this.containerFiles.mpdFile]
            .concat(this.containerFiles.initFiles)
        await this.container.addFileGroup(startFiles)
        // put subtitles in a single block
        if (this.containerFiles.subtitles.length) {
            await this.container.addFileGroup(this.containerFiles.subtitles)
        }
        // add each set of segmented media source files as a group
        for (const sourceName in this.containerFiles.mediaFiles) {
            const files = this.containerFiles.mediaFiles[sourceName]
            const avgSize = _.meanBy(files, 'size')
            // use block size that fits the average size segment file
            // this may need to be tuned
            const blockSize = Block.getBlockSize(avgSize)
            // add files to container
            await this.container.addFileGroup(files, blockSize.size)
        }

        // upload to ciph platform
        return this.container.publish()
    }

    async createWorkDir () {
        const workDir = `.${Date.now()}-${process.pid}-ciph`
        this.workPath = path.resolve(this.workPath, workDir)
        await fs.ensureDir(this.workPath)
    }

    async packageSources () {
        console.log(`creating mpeg-dash segments`)
        await ShakaPackager.package(
            this.sources,
            this.dashDuration,
            this.workPath,
            this.mpdFile
        )
    }

    async deleteWorkDir () {
        await fs.remove(this.workPath)
    }

    /**
     * @function encodeSources
     *
     * demux/encode sources to mp4 audio/video and vtt subtitle files
     */
    async encodeSources () {
        // demux video
        for (const video of this.sources.video) {
            console.log(`demuxing video ${video.input.path} ${video.output.path}`)
            await FFMPEG.demuxVideo(video.input.path, video.input.index, video.output.path, video.output.format)
        }
        // encode/demux audio
        for (const audio of this.sources.audio) {
            try {
                if (this.videoCodec === 'h264') {
                    if (audio.codec === 'aac') {
                        console.log(`demuxing audio ${audio.input.path} ${audio.output.path}`)
                        await FFMPEG.demuxAudio(audio.input.path, audio.input.index, audio.output.path, audio.output.format)
                    }
                    else {
                        console.log(`transcoding audio ${audio.input.path} ${audio.output.path}`)
                        const bitrate = audio.channels === 2 ? 128 : 384
                        await FFMPEG.encodeAudio(audio.input.path, audio.input.index, audio.output.path, bitrate, audio.channels > 6 ? 6 : undefined)
                    }
                    
                }
                else if (this.videoCodec === 'vp9') {
                    if (audio.codec === 'opus') {
                        console.log(`demuxing audio ${audio.input.path} ${audio.output.path}`)
                        await FFMPEG.demuxAudio(audio.input.path, audio.input.index, audio.output.path, audio.output.format)
                    }
                    else {
                        // TODO: transcode
                        throw new Error(`invalid audio codec ${audio.codec}`)
                    }
                }
                else {
                    throw new Error(`invalid video codec ${this.videoCodec}`)
                }
            }
            catch (err) {
                console.log(`audio error ${err.message} for stream #${audio.input.index}`)
                audio.error = err
            }
        }
        // encode/demux subtitles
        for (const subtitle of this.sources.subtitle) {
            try {
                await FFMPEG.encodeSubtitle(subtitle.input.path, subtitle.input.index, subtitle.output.path)
            }
            catch (err) {
                console.log(`subtitle error ${err.message} for stream #${subtitle.input.index}`)
                subtitle.error = err
            }
        }
        // filter out audio streams with errors
        this.sources.audio = this.sources.audio.filter(audio => !audio.error)
        // require at least one audio stream
        assert(this.sources.audio.length > 0, 'at least one audio stream required')
        // filter out subtitles with errors
        this.sources.subtitle = this.sources.subtitle.filter(subtitle => !subtitle.error)
    }

    /**
     * @function ingestFiles
     *
     * validate input files and get stream info
     */
    async ingestFiles () {
        for (const inputFile of this.inputFiles) {
            const filePath = path.resolve(process.cwd(), inputFile)
            const info = await FFMPEG.getInfo(filePath)
            // build file info
            const file = {
                name: inputFile,
                path: filePath,
                streams: {
                    audio: [],
                    subtitle: [],
                    video: [],
                }
            }
            for (const stream of info.streams) {
                if (defined(file.streams[stream.codec_type])) {
                    file.streams[stream.codec_type].push(stream)
                }
                else {
                    console.log(`skipping unsupported stream ${stream.index} ${stream.codec_type}`)
                }
            }
            this.files.push(file)
        }
    }

    async prepareContainerFiles () {
        // get directory listing for working directory
        const files = await fs.readdir(this.workPath)
        // group all files from directory listing
        for (const file of files) {
            const info = {
                name: file,
                path: path.resolve(this.workPath, file),
            }
            // get size
            const stat = await fs.stat(info.path)
            info.size = stat.size
            // dash mpd file
            if (file.match(/\.mpd$/)) {
                // can only be one mpd
                assert(!this.containerFiles.mpdFile, 'mpd file already defined')
                this.containerFiles.mpdFile = info
            }
            // dash init file
            else if (file.match(/init\.mp4$/) || file.match(/init\.webm$/)) {
                this.containerFiles.initFiles.push(info)
            }
            // dash media segment file
            else if (file.match(/\.m4s/) || file.match(/\.webm/)) {
                // extract source from file
                const [source] = file.split('_')
                // make sure source is defined
                if (!defined(this.containerFiles.mediaFiles[source])) {
                    this.containerFiles.mediaFiles[source] = []
                }
                this.containerFiles.mediaFiles[source].push(info)
            }
            // subtitle file
            else if (file.match(/\.vtt/)) {
                this.containerFiles.subtitles.push(info)
            }
        }
        // sort media files by segment number
        for (const source in this.containerFiles.mediaFiles) {
            this.containerFiles.mediaFiles[source] = _.sortBy(this.containerFiles.mediaFiles[source], info => parseInt(info.name.replace(/\D/g, '')))
        }
    }

    async prepareContainerMeta () {
        // prepare audio meta data
        const audioMeta = []
        for (const audio of this.sources.audio) {
            audioMeta.push({
                language: audio.language,
                title: audio.title,
            })
        }
        // prepare subtitles meta
        const subtitlesMeta = []
        for (const subtitle of this.sources.subtitle) {
            subtitlesMeta.push({
                file: subtitle.output.name,
                language: subtitle.language,
                title: subtitle.title,
            })
        }
        // prepare video meta
        const videoMeta = []
        for (const video of this.sources.video) {
            videoMeta.push({
                title: video.title,
            })
        }

        this.containerMeta = {
            audio: audioMeta,
            subtitles: subtitlesMeta,
            video: videoMeta,
        }
    }

    /**
     * @function prepareSources
     *
     * analyze all files and streams to determine which will be included in
     * final output
     */
    async prepareSources () {
        // map of audio by number of channels
        const audioSources = {}
        // map of subtitles by language
        const subtitleSources = {}
        // map of video by resolution
        const videoSources = {}
        // prepare streams from each file
        for (const file of this.files) {
            // warn if skipping video stream
            if (file.streams.video.length > 1) {
                console.log('multiple video streams - only first will be used')
            }
            // get video stream
            const video = file.streams.video[0]
            // video stream must be h264
            assert(supportedVideoCodes.includes(video.codec_name), `unsupported video codec ${video.codec_name} for ${file.name} (must be ${supportedVideoCodes.join('|')})`)
            // if video code already set for container must be same
            if (this.videoCodec) {
                assert(this.videoCodec === video.codec_name, `video codec ${video.codec_name} for ${file.name} must match existing video code ${this.videoCodec}`)
            }
            // set video codec for container
            else {
                this.videoCodec = video.codec_name
            }
            // set audio codec based on video codec
            this.audioCodec = videoCodecAudioCodec[this.videoCodec]
            // convert fps to number
            if (video.avg_frame_rate.match(/^\d+\/\d+$/)) {
                const extract = video.avg_frame_rate.match(/^(\d+)\/(\d+)$/)
                video.avg_frame_rate = (extract[1] / extract [2]).toFixed(3)
            }
            // if this is not the first video stream then it must match the first
            if (this.video) {
                assert(this.video.fps === video.avg_frame_rate, `fps does not match for ${this.video.name} (${this.video.fps}) and ${file.name} (${video.avg_frame_rate})`)
            }
            else {
                this.video = {
                    fps: video.avg_frame_rate,
                    name: file.name,
                }
            }
            // build meta data for video
            const videoMeta = {
                codec: video.codec_name,
                fps: parseFloat(video.avg_frame_rate),
                height: parseInt(video.coded_height),
                input: {
                    index: video.index, 
                    name: file.name,
                    path: file.path,
                },
                output: {},
                width: parseInt(video.coded_width),
            }
            // create title based on resolution
            let title = `${videoMeta.width}x${videoMeta.height}`
            if (videoMeta.width >= 3000) {
                title += ' (UHD)'
            }
            else if (videoMeta.width >= 1900) {
                title += ' (FHD)'
            }
            else if (videoMeta.width >= 1200) {
                title += ' (HD)'
            }
            else {
                title += ' (SD)'
            }
            videoMeta.title = title
            // video stream must have unique resolution
            const key = `${videoMeta.width}x${videoMeta.height}`
            // set format based on codec type
            const format = videoCodecFormat[this.videoCodec]
            // set output file meta data
            videoMeta.output.format = format
            videoMeta.output.key = key
            videoMeta.output.name = `${key}.${format}`
            videoMeta.output.path = path.resolve(this.workPath, videoMeta.output.name)
            // skip if there is already a source for this resolution
            if (defined(videoSources[key])) {
                console.error(`skipping ${key} video from ${file.name} - duplicate for ${videoSources[key].input.name}`)
            }
            // add to video sources
            else {
                this.sources.video.push(videoMeta)
                videoSources[key] = videoMeta
            }

            // process audio
            for (const audio of file.streams.audio) {
                // get language - should exist but default to english
                let language = _.get(audio, 'tags.language') || 'en'
                // get language info from code
                const lang = langs.where(language.length - 1, language)
                // use 2 char language code
                if (defined(lang) && defined(lang['1']) && language.length > 2) {
                    language = lang['1']
                }
                // set title
                let title = lang ? lang.local : 'Audio'
                if (audio.channels > 2) {
                    title += ' (SURROUND)'
                }
                else if (audio.channels == 2) {
                    title += ' (STEREO)'
                }
                else {
                    title += ' (MONO)'
                }
                // build meta data for audio
                const audioMeta = {
                    channels: audio.channels,
                    codec: audio.codec_name,
                    input: {
                        index: audio.index, 
                        name: file.name,
                        path: file.path,
                    },
                    language: language,
                    title: title,
                    output: {},
                    sampleRate: parseInt(audio.sample_rate),
                }
                // audio stream must have unique language and channels
                const key = `${audioMeta.language}-${audioMeta.channels}`
                // set format based on codec type
                const format = audioCodecFormat[this.audioCodec]
                // set output file meta data
                audioMeta.output.format = format
                audioMeta.output.key = key
                audioMeta.output.name = `${key}.${format}`
                audioMeta.output.path = path.resolve(this.workPath, audioMeta.output.name)
                // skip if there is already a source for this resolution
                if (defined(audioSources[key])) {
                    console.error(`skipping ${key} audio from ${file.name} - duplicate for ${audioSources[key].input.name}`)
                }
                // add to video sources
                else {
                    this.sources.audio.push(audioMeta)
                    audioSources[key] = audioMeta
                }
            }

            // process subtitle
            for (const subtitle of file.streams.subtitle) {
                // get language - should exist but default to english
                let language = _.get(subtitle, 'tags.language') || 'en'
                // get language info from code
                const lang = langs.where(language.length - 1, language)
                // use 2 char language code
                if (defined(lang) && defined(lang['1']) && language.length > 2) {
                    language = lang['1']
                }
                // set title
                let title = _.get(subtitle, 'tags.title')
                if (!title) {
                    title = lang ? lang.local : 'Subtitle'
                }
                // build meta data for subtitle
                const subtitleMeta = {
                    input: {
                        index: subtitle.index, 
                        name: file.name,
                        path: file.path,
                    },
                    language: language,
                    output: {},
                    title: title
                }
                // set type
                for (const disposition in subtitle.disposition) {
                    if (subtitle.disposition[disposition]) {
                        subtitleMeta[ changeCase.camelCase(disposition) ] = true
                        // add info to title
                        if (disposition === 'hearing_impaired' && !title.match(/sdh/i)) {
                            title += ' (SDH)'
                        }
                        if (disposition === 'forced' && !title.match(/forced/i)) {
                            title += ' (FORCED)'
                        }
                    }
                }
                // subtitles must have unique language and title
                const key = `${subtitleMeta.language}-${changeCase.paramCase(subtitleMeta.title)}`
                // get file name for extracted subtitle
                subtitleMeta.output.key = key
                subtitleMeta.output.name = `${key}.vtt`
                subtitleMeta.output.path = path.resolve(this.workPath, subtitleMeta.output.name)
                // skip if there is already a source for this resolution
                if (defined(subtitleSources[key])) {
                    console.error(`skipping ${key} subtitle from ${file.name} - duplicate for ${subtitleSources[key].input.name}`)
                }
                // add to video sources
                else {
                    this.sources.subtitle.push(subtitleMeta)
                    subtitleSources[key] = subtitleMeta
                }
            }
        }
    }

    /**
     * @returns Promise<object>
     */
    async publish () {
        // make sure command line tools available
        await ShakaPackager.test()
        await FFMPEG.test()
        // create working directory
        await this.createWorkDir()
        // catch any errors so that working directory can be deleted
        try {
            // validate and get info for files
            await this.ingestFiles()
            // analyze files/streams to get sources for output
            await this.prepareSources()
            // encode sources
            await this.encodeSources()
            // split files for dash
            await this.packageSources()
            // organize all files to be included in container
            await this.prepareContainerFiles()
            // prepare meta data to include in container
            await this.prepareContainerMeta()
            // create and publish ciph container
            await this.createContainer()
        }
        catch (err) {
            console.error(err.stack)
        }
        // cleanup working directory
        await this.deleteWorkDir()
    }
}