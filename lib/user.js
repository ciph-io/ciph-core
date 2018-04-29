'use strict'

/* npm modules */
const crypto = require('mz/crypto')
const request = require('request-promise')

/* app modules */
const Crypto = require('./util/crypto')

module.exports = class User {

    constructor (args) {
        // set api host
        this.api = args.api || 'https://ciph.io'
        // user data populated after login
        this.data = null
        // error set if login/create fails
        this.error = null
        // if username or password set then must authenicate as user
        if (args.username || args.password) {
            assert(args.username, 'username required if password set')
            assert(args.password, 'password required if username set')
            // login with username and password
            this.promise = this.loginUsername(args.username, args.password)
        }
        // if userid or secret set then authenticate with id
        else if (args.userid || args.secret) {
            assert(args.userid, 'userid required if secret set')
            assert(args.secret, 'secret required if userid set')
            // login with userid and secret
            this.promise = this.loginUserId(args.userid, args.secret)
        }
        // otherwise create new user
        else {
            this.promise = this.createNewUser()
        }
        // catch errors and store
        this.promise = this.promise.catch(err => {
            this.error = err
        })
        // clear promise once loaded
        .then(() => {
            this.promise = null
        })
    }

    /**
     * @function createNewUser
     *
     * make api request to create new user with random id/secret
     *
     * @returns {Promise}
     */
    async createNewUser () {
        console.log('create new user')

        const res = await request({
            json: true,
            method: 'POST',
            uri: `${this.api}/user`,
        })

        assert(res.userId && res.secret, 'invalid response')

        return this.loginUserId(res.userId, res.secret)
    }

    /**
     * @function deriveUserIdAndSecret
     *
     * derive userId/secret from username/password using pbkdf
     *
     * @param {string} username
     * @param {string} password
     *
     * @returns {Promise<object>}
     */
    async deriveUserIdAndSecret (username, password) {
        // get userId from username and password iwth pdkdf
        const userId = await crypto.pbkdf2(
            Buffer.from(username),
            Buffer.from(password),
            10000,
            32,
            'sha256'
        )
        // get secret from hash of user id
        const secret = Crypto.sha256(userId)

        return {
            userId: userId.toString('hex').substr(0, 32),
            secret: secret.toString('hex').substr(0, 32),
        }
    }

    /**
     * @function getAuthHeaders
     *
     * @returns {object}
     */
    getAuthHeaders () {
        assert(this.data && this.data.userId && this.data.token, 'invalid user')
        // id for token depends on whether credit belongs to user or anon
        const tokenId = this.data.token.type === 'user'
            ? this.data.userId
            : this.data.anonId
        // return headers for making download request
        return {
            'Accept': tokenId,
            'Accept-Language': encodeURIComponent(this.data.token.value),
            'Content-Language': this.data.token.expires,
        }
    }

    /**
     * @function getUser
     *
     * get user from api
     *
     * @param {string} userId
     * @param {string} secret
     *
     * @returns {Promise<object>}
     */
    async getUser (userId, secret) {
        const res = await request({
            headers: {'x-secret': secret},
            json: true,
            qs: { userId },
            uri: `${this.api}/user`,
        })

        assert(res.userId === userId && res.secret === secret, 'invalid response')
        assert(res.credit > 0, 'insufficient credit')

        this.data = res

        return res
    }

    /**
     * @function loginUserId
     *
     * login with user id and secret
     *
     * @param {string} userId
     * @param {string} secret
     *
     * @returns {Promise}
     */
    async loginUserId (userId, secret) {
        console.log('logging in with user id')
        const user = await this.getUser(userId, secret)
        console.log(`logged in as ${user.displayUserId}@${user.anonId} - ${user.displayCredit} credit remaining`)
    }

    /**
     * @function loginUsername
     *
     * derive the userid and secret from username and password and login
     *
     * @param {string} username
     * @param {string} password
     *
     * @returns {Promise}
     */
    async loginUsername (username, password) {
        console.log('logging in with username')

        const user = await this.deriveUserIdAndSecret(username, password)

        return this.loginUserId(user.userId, user.secret)
    }

    /**
     * @function refresh
     *
     * reload user
     *
     * @returns {Promise}
     */
    async refresh () {
        // if already loading then return existing promise
        if (this.promise) {
            return this.promise
        }
        // data must be load with userId and secret
        assert(this.data && this.data.userId && this.data.secret, 'no user')
        // request user - store promise while loading
        this.promise = this.getUser(this.data.userId, this.data.secret)
        // wait for user to load
        await this.promise
        // clear promise when done
        this.promise = null
    }
}