const merge = require('lodash/merge')

const isBrowser = typeof window !== 'undefined'
const ip = process.env.IP || 'localhost'
const port = process.env.PORT || 3000
const basename = `/${process.env.PUBLIC_PATH || ''}`.replace('//', '/')

const config = {
  all: {
    clientId: process.env.CLIENT_ID || 'ncCUEfpAhAcJmFsq5FfmLb5Hv4wW70cq',
    clientSecret: process.env.CLIENT_SECRET || 'An24qg07qCKpwUqG',
    isDev: process.env.NODE_ENV !== 'production',
    isBrowser,
    ip,
    port,
    timeout: 0.2,
  },
  test: {},
  development: {},
  production: {
    ip: process.env.IP || '0.0.0.0',
    port: process.env.PORT || 8080,
    timeout: process.env.UPDATE_TIMEOUT || 20
  },
}

module.exports = merge(config.all, config[config.all.env])
