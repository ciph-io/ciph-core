# Ciph Ecosystem

Besides simply transmitting data the Ciph platform must also support:

* tracking data usage
* offering free and paid data
* compensating content creators

* chat
* ratings
* parental controls

These features must be provided in a way that is consistent with Ciph's core
values of security, privacy and censorship resistance.

In order to achieve the scale that Ciph requires all features must be able to
be implemented using simple key/value and log data structures where the keys
are cryptographic hashes that allow data to be easily sharded.

## Content Containers

Content containers consist of one `head` block that describes the content and
zero or more `meta` and `data` blocks.

Containers have two ids: a `private id` and a `public id`.

Unlike blocks, which are not related to any one piece of content, container ids
do identify a specific piece of content, and so they are inherently vulnerable
to censorship.

Consequently it must be assumed that all functionality that uses container ids
is subject to failure and cannot be relied upon.

### Container Private Id

The `private id` for a container is a hash of the raw binary data of the
container block ids and key:

    block 0 id|block 1 id|key

### Container Public Id

The `public id` for a container is a hash of the raw binary data of the
container block ids:

    block 0 id|block 1 id

### Container Replace (Update)

Whenever a client accesses a container it can use the container `private id` to
check if the container has been replaced or marked as deleted.

When a container is first published a token is created for its private id. This
token must be provided to create a replacement.

The replacement link must contain:

    size|block 0 id|block 1 id|iv

The replacement container must be encrypted with the same key as the original
container and the new randomly generated initialization vector (iv).

The replacement container must use the same replace token as the original
container.

The Ciph platform only stores the most recent replacement for a container and
a container may be replaced multiple times.

If a container is a replacement for another container and it is being replaced
then the container that is being replaced should have its replacement link
updated to point to original container id and then the original container id
should have its replacement link updated to point to the new container.

                ------------------->
    original --/ replacement --/ replacement
            <------------------

                ---------------------------------------->
    original --/ replacement --/ replacement --/  new replacement
            <------------------               /
         <------------------------------------

By updating replacements to point back to the original and then updating the
original to point to the new replacement the current replacement can be
resolved from any intermediary replacement with two reads and a new
replacement can be created with two writes.

### Container Delete

Containers can also be marked as deleted. Marking a container as deleted does
not actually delete any data.

It is up to clients to decide how to handle containers that are marked as
deleted.

In the normal case deleted flags will be ignored. However, marking a container
as deleted will prevent any previously created replacements from being resolved.

When deleting a replacement the replacement should be updated to point back to
the original and only the original should be marked as deleted.

### Chat

The container `private id` is used as the target for all chat messages. Chat
messages are encrypted with the random chat key that is included in the `head`
block.

The Ciph chat system is content oriented. When users access a content container
they can view recent chat messages related to the container and they have
the option of "following" the chat for that container.

Every user has a global chat view where the chat messages from all of the
containers they follow are displayed in a real time feed.

Users can easily jump back and forth between the global chat view and the chat
thread for any particular content container.

## Anons

Anonymous clients that are not logged in to a registered user account are
identified by an 8byte hex `anon id` derived from the users IP address.

The `anon id` is used for tracking free data usage and for blocking users in
chat.

Client IP addresses are never stored.

Anon ids are not necessarily unique to IP addresses and it is possible that
different IP addresses will have the same anon id in rare cases.

## Users

Users in the Ciph system are identified by a 128bit (32byte hex) id.

### Registration

New user ids are issued upon request. By default a new user id is created for
every new container that is created.

When creating a new user the client can specify a 32 byte hex secret. If not a
new random secret will be created.

The user secret must be sent to validate requests that require authentication.

## Ratings

Any user id can submit ratings for any content id.

Content can be rated on three properties:

* technical quality (is the presentation of the content good)
* content quality (is the content itself good)
* age appropriateness (what age level is the content appropriate for)

Each rating is represented as a scale of 1-9 with 0 indicating no rating given.

After users access content clients should present them with a prompt to rate
the content.

Users ids are not stored with ratings.

A partial hash of the IP address salted with the content id is used to prevent
duplicate ratings from the same IP

## Parental Controls

Whenever a container is accessed clients should retrieve the ratings for that
content and then use the age appropriateness rating to determine what hostname
to request additional content blocks from.

By using a different hostname for unrated content and for each different level
of age appropriateness Ciph makes it possible for parents to block
inappropriate content at the network level by blocking the hostnames for
content that is not allowed.

When a user is signed in to a premium account where they have verified their
identify and adulthood by making a purchase their requests will be routed to
a different hostname that is not blocked and any parental controls are enforced
at the account level instead of the network level.

For instance, with a logged in account parents can set controls and require
that a password be entered in order to view content that exceeds the set
limits.

## Paid Data

Ciph is a paid service but provides a free monthly data allocation on a per
IP address basis.

Example data prices (subject to change)

* $10 / 200GB Data
* $20 / 500GB Data
* $35 / 1000GB Data

## Compensating Content Creators

Ciph shares 50% of **gross revenue** with content creators.

Revenue share is allocated to the user ids that are registered for content
containers based on the "Last One Wins" method.

For example:

If a users accesses a content container that is registered to a user id and
then upgrades to the premium tier the user id registered for that content
container will recieve 50% of the amount the user paid.

## Tracking Data Usage

Data usage is tracked both by `anon id` and `user id`.

When a user is logged into a registered user account with credit available then
their user credit will be used first and any anon credit will be used if they
have no user credit remaining.

Free anon credit is issued per `anon id` which is derived from IP address so
almost every unique IP address should get free credit every month.

Because anon ids are not 100% unique for IPs and because some users share IPs
there is no guarantee that individual anons will get free credit.
