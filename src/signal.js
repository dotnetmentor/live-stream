const WebSocket = require('ws')
const wss = new WebSocket.Server({ port: 5000 })
const ulid = require('./ulid')
const log = require('server-base-log')(__filename)
const { DEBUG_LOG } = process.env

const db = []

wss.on('connection', (ws, req) => {
  if (req.url === '/debug') {
    if (!DEBUG_LOG) return
    ws.on('message', data => {
      log.debug(JSON.parse(data))
    })
    return
  }
  let id = req.url === '/new' ? null : req.url.slice(1)
  ws.on('message', data => {
    const message = JSON.parse(data)
    const { type, initiator } = message
    if (type === 'initiate') {
      ulid().then(newId => {
        id = newId
        db.push({
          ws,
          id,
          peer: null
        })
        ws.send(JSON.stringify({ type: 'shareId', id }))
      })
    } else if (type === 'follow') {
      const free = db.find(x => x.id === id)
      if (!free) {
        log.debug('closing (follow) because no pair found')
        ws.close()
      } else {
        free.peer = ws
        ws.send(JSON.stringify({ type: 'signal', id, data: free.signal }))
      }
    } else if (type === 'signal') {
      if (initiator) {
        const free = db.find(x => x.id === id)
        free.signal = message.data
      } else {
        const pair = db.find(x => x.id === id)
        if (!pair) {
          log.debug('closing (signal) because no pair found')
          ws.close()
        } else {
          pair.ws.send(JSON.stringify({ type: 'signal', data: message.data }))
        }
      }
    } else {
      log.error(new Error(`unknown ${type}`))
    }
  })
})
