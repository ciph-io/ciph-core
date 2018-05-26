# Ciph Publishing Guide

Ciph supports publishing three types of content:

* collection
* page
* video

Both `collection` and `page` are markdown formatted text. Pages are text only
while collections can embed images and video.

For details on markdown see the [Markdown Cheatsheet].

[Markdown Cheatsheet]: https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet

## Publishing user

All content is published under a `user id`. If a user id is not provided then a
new user will be created.

### Publishing with username and password

    bin/ciph publish collection --username foo --password bar

### Publishing with user id and secret

    bin/ciph publish collection --userid 3f516937819c19b38b86339636365aa5 --secret 13d2b472a7b17e89254cffd006850d5f

## Publishing charges

    bin/ciph publish collection --agree-charges

Publishing data "costs" 5X download credit. If you upload 1GB your download
credit will be reduced by 5GB.

If you do not specify the `--agree-charges` flag you will be prompted to agree
to charges before publishing.

## Content ownership

    bin/ciph publish collection --assert-ownership

You must only publish content that is your own or you have authorization to
publish.

If you do not specify the `--assert-ownership` flag you will be prompted to
confirm before publishing.

## Publish options

### --json

Output publish results in JSON instead of text.

### --key

Password for the published content. Default: random 64byte hex string.

### --quiet

Do not print status info while publishing. Publish result will still be shown.

### --replace-link

Full link (including key) for content to be replaced.

### --replace-token

Token to authorize replacement. Required with `--replace-link`.

### --title

Specify the title for the content.

## Publish a collection

From the `ciph-core` directory run:

    bin/ciph publish collection index.md my-image-one.jpg my-image-two.png

### Collection options

#### --index-file-name

Specify the primary markdown file. Default: index.md.

### Embedding images

All of the images for the collection must be published with the page file.

Images are embedded: `![My Image One](my-image-one.jpg)`.

The text is not required so `![](my-image-one.jpg)` works as well.

Images must be referenced by their filename only with no path information
included.

Multiple images with the same filename are not allowed.

Allowed image extensions are: jpg, jpeg, gif, png, webp. Images are not
validated.

### Embedding videos

Videos can be embedded in markdown but they must be published separately first.

Videos are embedded like: `![](https://ciph.io/enter#0-2-9e3c8fbfcc15e51626b1cc19247c92be-280d5cd8fed0105cbeca6cac43854b39-3aed9d3f892f1267198266af4331b059-404fda4315314a026c1f67cf833f531fd42da93224e86aa47838bc0851320268)`

Either the web like `https://...` or the ciph link `ciph://...` can be used.

## Publish a page

From the `ciph-core` directory run:

    bin/ciph publish page my-page.md

Where `my-page.md` is the file you want to publish.

Only links to ciph content are allowed and they must start with `ciph://`.

All other links will be displayed as text.

## Publish video

From the `ciph-core` directory run:

    bin/ciph publish video my-video.mp4

### Video options

#### --dash-duration

MPEG-DASH segment duration in seconds. Default: 5.

### Multiple input files

    bin/ciph publish video my-video.sd.mp4 my-video.hd.mp4

If multiple input files are specified then the audio, subtitle, and video tracks
from these files will be combined.

When multiple video files are provided (for adaptive streaming) all video files
should be encoded so that each segment starts with an I-Frame.

### Supported audio, subtitle and video formats

H.264 video is supported with AAC audio. Input video will be demuxed from any
container supported by FFMPEG. Input audio will be transcoded to AAC if it is
not encoded as AAC already. Video is not transcoded.

VP9 video is supported with Opus audio. Transcoding is not current supported for
VP9 sources so both audio and video must be in the correct format.

Any subtitles that can be read by FFMPEG will be converted to WebVTT format.

## Publish downloaded video

From the `ciph-core` directory run:

    bin/ciph publish video https://www.youtube.com/watch?v=....

Ciph can download YouTube videos for publishing using the [ytdl-core] package.

Like all other content you must be the owner of the YouTube video being
downloaded or be authorized to download it to use this feature.

[ytdl-core]: https://www.npmjs.com/package/ytdl-core

### Download options

#### --download-bitrate

Audio bitrate to download. Will be prompted for if not provided.

Audio bitrates available depend on whether you are downloading H.264/AAC or
VP9/Opus.

#### --download-codec

Must be either `h264` or `vp9`. The video codec determines the allowed audio
codec. Will be prompted for if not provided.

`vp9` offers smaller file sizes for the same quality or higher quality for the
same file size.

`h264` has better hardware compatibility and will work with older and low-end
devices where `vp9` may not.

#### --download-resolution

Resolution to download video at. Options include: 360p, 480p, 720p, 1080p.
Will be prompted for if not provided.
