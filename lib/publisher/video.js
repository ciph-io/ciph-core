'use strict'

/* native modules */
const path = require('path')

/* npm modules */
const _ = require('lodash')
const changeCase = require('change-case')
const fs = require('fs-extra')

/* app modules */
const Container = require('../container')
const FFMPEG = require('../ffmpeg')
const MP4Box = require('../mp4box')
const assert = require('../util/assert')

/* exports */
module.exports = class PublisherVideo {

    /**
     * @param {object} args
     * @param {integer} args.dashDuration
     * @param {array}  args.files
     */
    constructor (args = {}) {
        this.args = args
        // ciph container
        this.container = null
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
        // length of each dash segment in ms
        this.dashDuration = args.dashDuration || 5000
        // list of files to process
        this.files = []
        // dash mpd file name
        this.mpdFile = args.mpdFile || 'ciph.mpd'
        // prepared files to be added to mpeg-dash container
        this.sources = {
            audio: [],
            subtitle: [],
            video: [],
        }
        // meta data for combined video file
        this.video = null
        // working directory for encoding/muxing files
        this.workPath = ''
    }

    async createContainer () {
        // create new container instance for data
        this.container = new Container({
            api: this.args.api,
            key: this.args.key,
            meta: {
                type: 'video',
            },
        })
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
            const blockSize = this.container.getBlockSize(avgSize)
            // add files to container
            await this.container.addFileGroup(files, blockSize.size)
        }

        // upload to ciph platform
        return this.container.publish()
    }

    async createWorkDir () {
        const workDir = `.${Date.now()}-${process.pid}-ciph`
        this.workPath = path.resolve(process.cwd(), workDir)
        await fs.ensureDir(this.workPath)
    }

    async dashSources () {
        await MP4Box.dash(
            this.getAudioVideoSourcePaths(),
            this.dashDuration,
            path.resolve(this.workPath, this.mpdFile)
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
        for (const video of this.sources.video) {
            await FFMPEG.demuxVideo(video.input.path, video.input.index, video.output.path)
        }
        for (const audio of this.sources.audio) {
            if (audio.codec === 'aac') {
                await FFMPEG.demuxAudio(audio.input.path, audio.input.index, audio.output.path)
            }
            else {
                const bitrate = audio.channels === 2 ? 128 : 384
                await FFMPEG.encodeAudio(audio.input.path, audio.input.index, audio.output.path, bitrate)
            }
        }
        for (const subtitle of this.sources.subtitle) {
            await FFMPEG.encodeSubtitle(subtitle.input.path, subtitle.input.index, subtitle.output.path)
        }
    }

    getAudioVideoSourcePaths () {
        return this.sources.video.concat(this.sources.audio).map(source => source.output.path)
    }

    /**
     * @function ingestFiles
     *
     * validate input files and get stream info
     */
    async ingestFiles () {
        for (const inputFile of this.args.files) {
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
            else if (file.match(/init\.mp4$/)) {
                this.containerFiles.initFiles.push(info)
            }
            // dash media segment file
            else if (file.match(/\.m4s/)) {
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
            // there should only be one video stream
            assert(file.streams.video.length === 1, `${file.name} must have exactly one video stream`)
            // get video stream
            const video = file.streams.video[0]
            // video stream must be h264
            assert(video.codec_name === 'h264', `unsupported video codec ${video.codec_name} for ${file.name} (must be h264)`)
            // convert fps to number
            if (video.avg_frame_rate.match(/^\d+\/\d+$/)) {
                const extract = video.avg_frame_rate.match(/^(\d+)\/(\d+)$/)
                video.avg_frame_rate = (extract[1] / extract [2]).toFixed(3)
            }
            // if this is not the first video stream then it must match the first
            if (this.video) {
                assert(this.video.frames === video.tags.NUMBER_OF_FRAMES, `number of frames does not match for ${this.video.name} (${this.video.frames}) and ${file.name} (${video.tags.NUMBER_OF_FRAMES})`)
                assert(this.video.fps === video.avg_frame_rate, `fps does not match for ${this.video.name} (${this.video.fps}) and ${file.name} (${video.avg_frame_rate})`)
            }
            else {
                this.video = {
                    fps: video.avg_frame_rate,
                    frames: video.tags.NUMBER_OF_FRAMES,
                    name: file.name,
                }
            }
            // build meta data for video
            const videoMeta = {
                bps: parseInt(video.tags.BPS),
                codec: video.codec_name,
                frames: parseInt(video.tags.NUMBER_OF_FRAMES),
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
            // video stream must have unique resolution
            const key = `${videoMeta.width}x${videoMeta.height}`
            // get file name for extracted video
            videoMeta.output.name = `${key}.mp4`
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
                // build meta data for audio
                const audioMeta = {
                    bps: parseInt(audio.tags.BPS),
                    channels: audio.channels,
                    codec: audio.codec_name,
                    input: {
                        index: audio.index, 
                        name: file.name,
                        path: file.path,
                    },
                    language: audio.tags.language,
                    output: {},
                    sampleRate: parseInt(audio.sample_rate),
                }
                // audio stream must have unique language and channels
                const key = `${audioMeta.language}-${audioMeta.channels}`
                // get file name for extracted audio
                audioMeta.output.name = `${key}.mp4`
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
                // build meta data for subtitle
                const subtitleMeta = {
                    bytes: parseInt(subtitle.tags.NUMBER_OF_BYTES),
                    input: {
                        index: subtitle.index, 
                        name: file.name,
                        path: file.path,
                    },
                    language: subtitle.tags.language,
                    output: {},
                }
                // set type
                for (const disposition in subtitle.disposition) {
                    if (subtitle.disposition[disposition]) {
                        subtitleMeta[ changeCase.camelCase(disposition) ] = true
                    }
                }
                // subtitles must have unique language and bytes
                const key = `${subtitleMeta.language}-${subtitleMeta.bytes}`
                // get file name for extracted subtitle
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
        await FFMPEG.test()
        await MP4Box.test()
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
            await this.dashSources()
            // organize all files to be included in container
            await this.prepareContainerFiles()
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