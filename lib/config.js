'use strict'

/* npm modules */
const Bluebird = require('bluebird')
const ifDefined = require('if-defined')

global.assert = assert
global.defined = ifDefined
global.Promise = Bluebird

const ffmpegPath = process.platform === 'win32'
	? 'C:\\ciph\\ffmpeg\\bin\\ffmpeg.exe'
	: '/usr/bin/ffmpeg'
const ffprobePath = process.platform === 'win32'
	? 'C:\\ciph\\ffmpeg\\bin\\ffprobe.exe'
	: '/usr/bin/ffprobe'
const shakaPath = process.platform === 'win32'
	? 'C:\\ciph\\shaka-packager\\shaka-packager.exe'
	: '/usr/bin/shaka-packager'

setConfigDefault('FFMPEG_PATH', ffmpegPath)
setConfigDefault('FFPROBE_PATH', ffprobePath)
setConfigDefault('SHAKA_PACKAGER_PATH', shakaPath)

function setConfigDefault (key, value) {
    if (!defined(process.env[key])) process.env[key] = value
}

function assert (assert, message) {
    if (!assert) {
        throw new Error(message)
    }
}