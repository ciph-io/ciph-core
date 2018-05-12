# Data Format

The Ciph client and platform encapsulate media in an encrypted container
and then segment that container into standard sized blocks for storage and
distribution.

## Overview

Each Ciph container includes a `head` block, zero or more `meta` blocks and
zero or more `data` blocks.

If all of the container content will fit into a single block then it is not
necessaary to create additional `meta` and `data` blocks.

The Ciph client creates a new media container from one or more input files.
Input files are processed and if the size of the input data exceeds a single
block then `data` blocks are created.

All meta information for the `data` is stored in the `meta` data for the
container which is JSON encoded and gzip'd before storing.

After any `data` blocks are created and the `meta` data is finalized then the
`head` block can be created.

The `head` must fit into a single block so its maximum size is 16MB but in
most cases should be much smaller than this.

## Encryption

Containers are encrypted using [AES-CTR].

Each container has a random 256bit (32 byte) password. Users can provide
passwords but for optimal security this is not recommended.

Each container has a random 16 byte salt that is used both to derive the
encryption key from the password using PBKDF2.

PBKDF2 is used with 10,000 rounds to derive the encryption key from the
password.

Any extra `data` or `meta` blocks have their own random encryption keys that
are stored in the container `head`.

The initialization vector (IV) used for encryption is the first 16 bytes of
an SHA-256 hash of the key.

[AES-CTR]: https://tools.ietf.org/html/rfc3686

## Block Sizes

* 0 : 4KB
* 1 : 16KB
* 2 : 64KB
* 3 : 256KB 
* 4 : 1MB
* 5 : 4MB
* 6 : 16MB

## Content Types

* 0 : Collection
* 1 : Page
* 2 : Video
* 3 : Audio
* 4 : Image

## Header Block (v1)

----------Plain----------
1 Byte          uint8   Format Version
1 Byte          uint8   Content Type (collection, audio, image, page, video)
--------Encrypted--------
32 Bytes        raw     Chat Key
4 Bytes         uint32  Meta Data Length
2 Bytes         uint16  Number of Meta Blocks
0-? Bytes       raw     Meta Block Ids (or) Meta Data
8 Bytes         float64 Data Length
4 Bytes         uint32  Number of Data Blocks
0-? Bytes       raw     Data Block Ids (or) Data
32 Bytes        raw     SHA-256 hash of head
? Bytes         raw     Random Padding

All numeric values are stored in Network Byte Order (big-endian).

## Chat Key

The Ciph platform allows users to engage in live chat.

The `chat key` is a 256 bit (32 byte) random key used to encrypt all chat
messages for the container.

## Meta Data

Meta data is JSON encoded and gzip'd.

### Common Properties

#### files

#### originalId

#### parentId

## Links

Blocks are identified by the first 128 bits (16 bytes) of an SHA-256 (SHA-2)
hash.

Every data block has two stored blocks that must be XORd to recover the data so
every block link must have the ids of both blocks.

The block size is needed along with the block id in order to retrieve a block.

The order of block id 0 and block id 1 in links is randomized.

### Internal Links

| Block Size (1 byte uint8) |
| Block id 0 (16 byte raw)  |
| Block id 1 (16 byte raw)  |
| Key (32 bytes raw)        | 

Internal links to `head` and `data` blocks are stored as binary data with a
total length of 65 bytes.

### External Links

| Block Size (Digit)       |-|
| Content Type (Digit)     |-|
| Block id 0 (32 byte hex) |-|
| Block id 1 (32 byte hex) |-|
| Salt (32 byte hex)       |-|
| Password* (64 byte hex)  |

\*optional

External block links start with the block size and content type encoded as
ascii integers. All other fields are hex encoded.

The content type is included in links so that indexers can organize links by
content type without accessing content data. Ciph clients will reject content
that does not match the link content type.

The salt is used with PBKDF2 to derive the encryption key from the password.

The password may be included in the link which will allow the content to be
opened without providing a password. If the password is not included then the
client will prompt the user for a password when attempting to open a link.
