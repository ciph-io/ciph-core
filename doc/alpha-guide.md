# Alpha Guide

This guide covers installing `ciph-core` and required dependencies on Ubuntu
Linux to upload `page` and `video` content to the Ciph platform.

## Automated Ubuntu Install

After cloning ciph-core repo run as root:

    ~/ciph-core$ dev/ciph-core-ubuntu-install.sh

This script will:

* download and compile ffmpeg with libfdk-aac
* copy ffmpeg and ffprobe to /usr/bin
* download shaka-packger and copy to /usr/bin/shaka-packager
* add nodesource reponsitory
* install nodejs
* run npm install

## Manual Ubuntu Install

### Node.js

    curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
    sudo apt install -y nodejs

### FFMPEG (Easy LQ)

    sudo apt install -y ffmpeg

### FFMPEG (Harder HQ)

To compile ffmpeg with the higher quality Fraunhofer FDK AAC encoder follow the
instructions here: https://trac.ffmpeg.org/wiki/CompilationGuide/Ubuntu

### Shaka Packager

Download the `packager-linux` binary from: https://github.com/google/shaka-packager/releases

Copy to /usr/bin/shaka-packager or set the SHAKA_PACKAGER_PATH env variable to
the absolute path of the executable.

### Clone ciph-core repository

    git clone https://github.com/ciph-io/ciph-core.git

### Install npm modules

    cd ciph-core
    npm install

## Publish a file

From the `ciph-core` directory run:

    bin/ciph publish page my-page.md

Where `my-page.md` is the file you want to publish.

Only links to ciph content are allowed and they must start with `ciph://`.

All other links will be displayed as text.

## Publish video(s)

From the `ciph-core` directory run:

    bin/ciph publish video my-video.mp4

    bin/ciph publish video my-video.sd.mp4 my-video.hd.mp4

Video publishing is currently very limited and does not have many options.

* video must be encoded as h264
* video is never re-encoded
* if audio is not aac it will be re-encoded as aac
* subtitles will be re-encoded as WebVTT
* video will be split into 5 second segments for MPEG-DASH
* if multiple video sources are provided duplicate subtitles and audio streams
  will be skipped
* with multiple video streams video must be re-encoded so that every segment
  starts with an I-Frame or skipping will occur when switching between streams.
  it is recommended to only use a single video source/stream unless you are
  re-encoding all of your sources.
