# METHOD FOR ENCRYPTING DATA FOR TRANSMISSION OR STORAGE VIA A CLOUD SERVICE SUCH THAT THE SERVICE OPERATOR CANNOT IDENTIFY THE DATA BEING TRANSMITTED OR STORED

## Background of Invention

Modern cloud services typically consist of applications running on client devices that connect to central servers to transmit or store data. These applications may be running on notebook or desktop personal computers, on smartphones, tablets or other devices. They may be downloaded and installed (“native”) or delivered via a web browser. What differentiates a “cloud” application from a traditional application is the use of a remote server for some aspect of the application’s functionality.

The transmission of user data from a client device across a network to a remote server, the storage of user data on a remote server, and the transfer of control over data from the user to the operator of the service create numerous risks for the user’s privacy and security as well as creating significant potential liability for the service operator.

Data breaches, often of epic scope, have been the rule rather than the exception. Recognizing this threat, operators of cloud services invest heavily in security.

The use of Transport Layer Security (“TLS”) to encrypt network communications between clients and servers is nearly universal with cloud services. With TLS the client encrypts data using a key it shares with the server and then sends the encrypted data to the server which can then decrypt it.

TLS secures data against some threats but it still leaves service operators, and potential attackers, with unfettered access to the plaintext of client data after that data is decrypted on the server.

Some cloud services go further by providing what is known as “end-to-end” encryption. With end-to-end encryption only clients have the keys to decrypt data and the service operator never has access to the plaintext of a user’s data. Services offering end-to-end encryption provide much better security but they are not invulnerable.

With end-to-end encryption the service operator does not have access to encrypted user data but they do still have access to “meta-data” such as which data belongs to which users, when data was created, and when data was transmitted from one user to another. This meta-data may be directly compromising to user security in some cases. In other cases meta-data may be useful in breaking the encryption of a user’s data. Even if a user’s data encryption is not broken the encrypted data could still be deleted or corrupted.

This invention builds on existing security technologies like TLS and end-to-end encryption to provide an even higher level of security for user data on cloud services. It addresses some of the weaknesses in end-to-end encryption by making it impossible for a service operator, or attacker, to identify what data belongs to which users.

## Brief Summary of Invention

This invention consists of a cloud service that stores data in standard sized blocks and allows clients to upload and download data blocks from the service.

When a client wants to store or transmit data via the service the client encrypts the data and breaks it into standard sized blocks.

For each block the client requests a random block of the same size from the cloud service. The client then performs an “XOR” operation on the random block and the block that they want to store. The result of this XOR operation is then uploaded to the cloud service.

To recover the original data a client must download both the random block and the XOR block that was created and then perform another XOR operation on these two blocks to retrieve the original data.

By storing data as an XOR of another random block every block stored by the service potentially belongs to multiple users and no one block belongs exclusively to any one user.

## Detailed Description of Invention

This invention encompasses both clients and servers connected via a network to provide a cloud service where a client application makes use of a remote server to transmit or store data.

In the invented system the server stores data as blocks of standard sizes such as 4KB, 16KB, 64KB, etc.

Each data block is identified by a unique ID that is a cryptographic hash of the block data.

Data blocks are stored without meta-data such as owner and create time, or meta-data is set to some arbitrary dummy value if meta-data must stored (e.g. on a standard computer file system).

Data blocks are immutable which in this context means that the service does not allow data blocks to be modified.

Unlike traditional cloud services or computer file systems data blocks in this system have no owner, can be accessed by anyone, and are indistinguishable from random data.

Before any client data is ever uploaded to a server the server is first seeded with an arbitrary number of data blocks of each allowed standard size that are composed of random data.

When a client wants to store or transmit data via this service the client must first package their data, encrypt it, and split it into standard sized blocks. The format used for packaging data and the encryption scheme used are up to the client. Since the server never attempts to access the encrypted data it is agnostic to the plaintext data format and encryption scheme used.

After the data is split into blocks and encrypted the client must XOR each encrypted block with a random block already stored on the server. For each encrypted block the client makes a request to the server for a randomly selected list of ids of blocks that are the same size as the client’s encrypted block. The client then picks a random block id from the list and downloads that random block.

The server should not log which random block ids are sent to which clients or which blocks a client downloads. The secrecy of random blocks can be augmented on the client side by using proxies to make requests or using a local pool of random blocks to pick from.

Once the client gets a random block it performs an XOR of the random block with the encrypted block yielding a new XOR block. The XOR block is then uploaded to the server.

To retrieve the original encrypted block a client must have the ids of both the random block and the XOR block. The client must download both the blocks and then XOR them to yield the original encrypted block.

These operations are similar to those typically used for OTP cryptography but the purpose here is not to encrypt the data block, which is already encrypted.

When OTP is used for encrypting data it is essential to keep the random data used secret. With this invention keeping the random data secret does enhance security but it is not essential. Even if an attacker knows all of the blocks needed to reverse the XOR operation they still have to break the underlying encryption.

If an attacker does not know all of the blocks needed to reverse the XOR then the XOR does provide some additional security but that is incidental to the primary purpose of the XOR operation in this invention, which is to break the ownership link between users and data blocks.

Since every block stored on the server is an XOR of a data block with another random block every block may be used by multiple different users. This makes it impossible to definitively associate any particular data block with any particular user.

Even if it is known that a data block is part of some user’s data it is impossible to know that it is not part of another user’s data as well.

OTP encryption is considered to be “unbreakable” which makes it fundamentally different from other forms of encryption. Understanding the properties that make OTP unbreakable is useful for understanding how the use of similar techniques in this invention contribute to its security model.

This invention, like the implementation of OTP with a computer, uses an XOR operation. An XOR is essentially the difference between two segments of binary data.

How an XOR works can be demonstrated with simple arithmetic. Pick any number: say 5. Now pick another number: say 7. The difference between 7 and 5 (7 - 5) is 2. If you take your random number (7) and the difference (2) you can recover the original number by repeating the operation: 7 - 2 = 5.

What can be observed here is that the number 2 has no relation to the original number 5. The difference depends entirely on what random number is picked and tells you nothing about what the original number was. Since any number can be picked as the random number the difference can also be any number. It is only by knowing both the random number and the difference that the original number can be retrieved.

The XOR of a data block with a random data block contains no information from the data block. The XOR is the difference between the data block and the random data block and so by definition it contains none of information in the original data block.

With this invention no individual data block contains any client data. Each individual data block is essentially random data. Clients can only recover their data from the server by performing an XOR on a pair of data blocks. Only the client knows which pairs of data blocks can be XOR’d together to retrieve their data.

From the perspective of the service operator, or a potential attacker, the data stored on the server is nothing but a sea of random data with no meta-data or other identifying information attached that could give it any structure or meaning.

This invention benefits users by making their use of cloud services much more secure. This invention builds on end-to-end encryption to create a cloud service that is even more secure by eliminating some of the potential vulnerabilities in end-to-end encryption.

This invention benefits cloud service operators by shifting virtually all responsibility for data security to the client and consequently eliminating virtually all potential liabilities for the service operator.

This invention is a foundational technology that can be applied to any cloud service involving the transmission or storage of data including: backing up or sharing arbitrary files or data, serving web pages, images, video, audio or other media, text, audio, or video communications services, etc.

Any cloud service that currently uses end-to-end encryption could be enhanced by integrating this invention and many cloud services that do not currently use end-to-end encryption could be implemented with vastly improved security by utilizing this invention.