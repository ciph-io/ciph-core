# Ciph

Ciph is a social media platform that is designed to provide privacy, security,
and data ownership for its users while being resistant to censorship.

Ciph allows users to share text documents, images, audio and video.

Ciph uses well established standard cryptographic algorithms like AES and SHA-2
to encrypt all data and then uses a unique distributed encryption algorithm
based on one-time pad (OTP) cryptography to enhance privacy and resist
censorship.

## Distributed Encryption

With Ciph all files are encrypted and then split up into standard sized blocks
before being published.

Every time a Ciph client publishes a block it takes a random existing block
from the Ciph flatform and XORs the data block with the random block.

The client then publishes the XOR as a new block on the Ciph platform.

                                Ciph
                                ----

                                 ||
                                 \/

    ----------------       ----------------
    |  Data Block  |  XOR  |  Rand Block  |
    ----------------       ----------------

                       ||
                       \/

                ----------------
                |   New Block  |
                ----------------

                       ||
                       \/

                      ----
                      Ciph

An XOR is a computer operation that produces the *difference* between two
blocks of data.

By performing another XOR of the new block and the random block the original
XOR can be reversed and the original data can be retrieved.

The Ciph platform never stores any actual user data. It only stores the
*difference* between the user data and some other random data.

Because every block stored on the Ciph platform can be randomly used for
multiple different other blocks no block belongs to any one user or file.

This design makes it impossible to trace data blocks to individual files which
protects user privacy and makes censorship much more difficult.

## Supported Media

The Ciph platform supports text, video, and audio content but does not support
dynamic or interactive content.

The Ciph platform is specifically designed to prevent user monitoring, tracking
and analytics.

### Text Content

Text content on the Ciph platform is formatted using markdown.

Links to other Ciph content and embedded images, audio and video are allowed.

HTML, CSS, JavaScript, and links to regular web content are not allowed.

### Video Content

Ciph supports h.264 video and AAC audio in mp4 containers and uses MPEG-DASH
to support adaptive bitrate videos.

Ciph does not currently support live streaming video but future support is
planned.

Ciph uses Google's Shaka Player with a custom network/data plugin that handles
the request and decode of encrypted Ciph content.

### Audio Content

Ciph supports audio in the MP3, AAC and FLAC formats.

### Image Content

Ciph supports images in the GIF, JPG, and PNG formats

### Media Collections

Ciph allows collections of content to be published together.

Types of media collections include:

* Video and audio playlists
* Photo albums
* Collections of linked text pages
* Text pages with embedded images, video and audio

## Supported Devices/Browsers

### Desktop

* Web Browsers (Opera, Chrome, Firefox on Linux, Windows, Mac)
* Native Electron Application (Linux, Windows, Mac)

### Mobile

* Web Browsers (Chrome on Android)
* Native apps planned

## Unsupported Devices/Browsers

* iOS Safari (missing MediaSource support)
* Edge (missing AES-CTR, FLAC, could be polyfilled)
