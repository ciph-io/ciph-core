# Data Format

The c:ph client and platform encapsulate media in an encrypted container
and then segment that data into standard sized blocks for storage and
distribution.

## Overview

Each c:ph container includes a `header` block, zero or more `meta` blocks and
zero or more `data` blocks.

If all of the container content will fit into a single block then it is not
necessaary to create additional `meta` and `data` blocks.

The c:ph client creates a new media container from one or more input files.
Input files are processed and if the size of the input data exceeds a single
block then `data` blocks are created.

All meta information for the `data` is stored in the `meta` data for the
container which is JSON encoded and gzip'd before storing.

After any `data` blocks are created and the `meta` data is finalized then the
`header` block can be created.

The `header` must fit into a single block so its maximum size is 16MB but in
most cases should be much smaller than this.

## Encryption

Containers are encrypted using AES-CTR (counter mode) which allows individual
blocks to be decrypted without decrypting all of the data that came before
them. This allows for seeking in videos and extracting individual files from
larger collections.

The `head` block starts with a pad of random data that is a random length. This
random data pad makes known-plaintext attacks against the encryption scheme
more difficult by making sure than known features of the file format do not
appear in consistent positions.

The random pad data is also used to provide the initialization vectors for any
additional `data` or `meta` blocks.

## Block Sizes

* 0 : 256KB 
* 1 : 1MB
* 2 : 4MB
* 3 : 16MB

## Content Types

* 0 : Collection
* 1 : Page
* 2 : Video
* 3 : Audio
* 4 : Image

## Header Block

1 Byte          uint8   Format Version
1 Byte          uint8   Content Type (collection, audio, image, page, video)
2 Bytes         uint16  Random Pad Length
128-8192 Bytes  raw     Random Pad Data
4 Bytes         uint32  Meta Data Length
2 Bytes         uint16  Number of Meta Blocks
0-? Bytes       raw     Meta Block Ids (or) Meta Data
2 Bytes         uint16  Data Length in Gigabytes
4 Bytes         uint32  Remaining Data Length in Bytes
4 Bytes         uint32  Number of Data Blocks
0-? Bytes       raw     Data Block Ids (or) Data
? Bytes         raw     Random Padding