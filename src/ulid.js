const { promisify } = require('util')
const randomBytes = promisify(require('crypto').randomBytes)

module.exports = async function ulid () {
  let now = Date.now()
  if (now <= ulid.now) now = ulid.now + 1
  ulid.now = now

  const time = now.toString(32).padStart(10, '0')
  const random = [...(await randomBytes(16))]
    .map(x => (x % 32).toString(32))
    .join('')

  return (time + random).toUpperCase()
}
