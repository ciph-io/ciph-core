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
