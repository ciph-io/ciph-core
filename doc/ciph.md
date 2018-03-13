# c:ph

c:ph is a social media platform that is designed to provide privacy, security,
and data ownership for its users while being resistant to censorship.

c:ph allows users to share text documents, videos, and audio.

c:ph allows users to share their media without allowing the platform operator
to access or modify that media.

c:ph utilizes well established cryptographic algorithms like AES and SHA-2 along
with a unique distributed encryption scheme that uses the properties of one-time
pad (OTP) encryption to allow users to share and retrieve their data without ever
storing the actual data on the c:ph platform.

## Distributed Encryption

With c:ph all files are split up into standard sized blocks before being
published.

Every time the c:ph client publishes a block it takes a random existing block
from the c:ph flatform and XORs the data block with the random block.

The client then publishes the XOR as a new block on the c:ph platform.

                                c:ph
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
                      c:ph

An XOR is a computer operation that produces the *difference* between two
blocks of data.

By performing another XOR of the new block and the random block the original
XOR can be reversed and the original data can be retrieved.

This aspect of the c:ph platform relies on the properties of OTP encryption,
which is mathematically proven to be unbreakable, to provide security and
privacy for users.

No data block on the c:ph platform contains any user data and no data block is
unique to any particular user. This design dramatically enhances the privacy,
security, and censorship resistance of the c:ph platform.

## Supported Media

The c:ph platform supports text, video, and audio content but does not support
dynamic or interactive content.

The c:ph platform is specifically designed to not include any features that
would allow for user monitoring, tracking or analytics.

### Text Content

Text content on the c:ph platform is formatted using markdown.

Links to other c:ph content and embedded audio and video are allowed.

HTML, CSS, JavaScript, and links to regular web content are not allowed.

### Video Content

c:ph supports h.264 video and AAC audio in mp4 containers and uses MPEG-DASH
to support adaptive bitrate videos.

c:ph does not currently support live streaming video but future support is
planned for.

c:ph uses Google's Shaka Player along with a custom data plugin to playback
video in the browser and desktop clients.

### Audio Content

c:ph supports audio in the MP3, AAC and FLAC formats.

### Image Content

c:ph supports images in the GIF, JPG, and PNG formats

### Media Collections

c:ph allows collections of content to be published together.

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
* Edge (missing AES-CTR, could probably be polyfilled)
