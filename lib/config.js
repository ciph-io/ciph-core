'use strict'

/* npm modules */
const Bluebird = require('bluebird')
const ifDefined = require('if-defined')

global.defined = ifDefined
global.Promise = Bluebird

setConfigDefault('FFMPEG_PATH', '/usr/bin/ffmpeg')
setConfigDefault('FFPROBE_PATH', '/usr/bin/ffprobe')
setConfigDefault('MP4BOX_PATH', '/usr/bin/MP4Box')

function setConfigDefault (key, value) {
    if (!defined(process.env[key])) process.env[key] = value
}