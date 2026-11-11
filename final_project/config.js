const { randomBytes } = require('node:crypto');

module.exports = {
  jwtSecret: process.env.JWT_SECRET || randomBytes(48).toString('hex'),
  sessionSecret: process.env.SESSION_SECRET || randomBytes(48).toString('hex')
};
