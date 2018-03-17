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

Containers are encrypted using [AES-CTR] (counter mode) which allows individual
blocks to be decrypted without decrypting all of the data that came before
them. This allows for seeking in videos and extracting individual files from
larger collections.

The `head` block starts with a pad of random data that is a random length. This
random data pad makes known-plaintext attacks against the encryption scheme
more difficult by making sure than known features of the file format do not
appear in consistent positions.

[AES-CTR]: https://tools.ietf.org/html/rfc3686

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

----------Plain----------
1 Byte          uint8   Format Version
1 Byte          uint8   Content Type (collection, audio, image, page, video)
--------Encrypted--------
16 Bytes        raw     Replace Token
32 Bytes        raw     Chat Key
2 Bytes         uint16  Random Pad Length
2-4096 Bytes    raw     Random Pad Data
4 Bytes         uint32  Meta Data Length
2 Bytes         uint16  Number of Meta Blocks
0-? Bytes       raw     Meta Block Ids (or) Meta Data
8 Bytes         float64 Data Length
4 Bytes         uint32  Number of Data Blocks
0-? Bytes       raw     Data Block Ids (or) Data
? Bytes         raw     Random Padding

All numeric values are stored in Network Byte Order (big-endian).

## Replace Token

When publishing a new encrypted container clients request a `replace token`
from the c:ph platform and recieve a `token` and a `secret`.

If the client wants to update or delete the container they make a request to
the replace API with the link for the replacement containter signed with the
secret using HMAC-SHA-256.

The same container may be replaced any number of times but the c:ph platform
only stores the most recent replacement.

When clients begin downloading a container they should retrieve the replace
token first and check to see if the container has been replaced before
downloading.

The owner of a container can also mark a replace token as deleted. Marking
the token as deleted does not delete any blocks from the c:ph platform so
the data can still be retrieved.

## Chat Key

The c:ph platform allows users to engage in live chat.

The `chat key` is a 256 bit (64 byte) random key used to encrypt all chat
messages for the container.

## Links

Blocks are identified by the first 128 bits (16 bytes) of an SHA-256 (SHA-2)
hash.

Every data block has two stored blocks that must be XORd to recover the data so
every block link must have the ids of both blocks.

The block size is needed along with the block id in order to retrieve a block.

The order of block id 0 and block id 1 in links is randomized.

### Internal Links

| Block Size (1 byte uint8) | block id 0 (16 byte raw) | block id 1 (16 byte raw) | key (32 bytes)

Internally block links are stored as binary data with a total length of 33 bytes.

### External Links

| Block Size |:| Content Type |:| block id 0 (32 byte hex) |:|
 block id 1 (32 byte hex) |:| salt (16 byte hex) |:| password 

External block links start with both the block size and content type encoded as
ascii integers. Block ids are hex encoded.

The content type is included in links so that indexers can organize links by
content type without accessing content data. c:ph clients will reject content
that does not match the link content type.

The salt is used with PBKDF2 to derive the encryption key from the password.

The password may be included in the link which will allow the content to be
opened without providing a password. If the password is not included then the
client will prompt the user for a password when attempting to open a link.