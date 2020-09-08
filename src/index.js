const Peer = require('simple-peer')

const { WS_URL } = process.env

const qrcode = require('qrcode')

const log = ({ error, message, line, extra }) => {
  if (!process.env.DEBUG_LOG) return
  const ws = new window.WebSocket(`${WS_URL}/debug`)
  ws.onopen = () => {
    ws.send(
      JSON.stringify({
        url: window.location.pathname,
        error,
        message,
        line,
        extra
      })
    )
    setTimeout(() => ws.close(), 100)
  }
}

window.onerror = (error, message, line) => log({ error, message, line })

if (window.location.pathname === '/new') {
  const click = document.body.appendChild(document.createElement('button'))
  click.textContent = 'start streaming your camera and mic'
  click.onclick = () => {
    click.parentNode.removeChild(click)
    window.navigator.mediaDevices
      .getUserMedia({
        video: true,
        audio: true
      })
      .then(gotMedia)
      .catch(error => log({ error }))
  }
} else {
  const peer = new Peer({ initiator: false, trickle: false })
  const ws = new window.WebSocket(`${WS_URL}${window.location.pathname}`)
  peer.on('signal', data => {
    log({ message: 'ws signal', extra: { initator: false, data: { ...data } } })
    ws.send(JSON.stringify({ type: 'signal', initiator: false, data }))
  })
  ws.onopen = () => {
    log({ message: 'connected to websocket' })
    ws.onmessage = ({ data }) => {
      const message = JSON.parse(data)
      const { type } = message
      if (type === 'signal') {
        log({ message: 'sending signal to peer', extra: message })
        peer.signal(message.data)
      }
      peer.on('stream', stream => {
        log({ message: 'got video stream from peer' })
        const video =
          document.querySelector('video') ||
          document.body.appendChild(document.createElement('video'))
        video.style = 'display: none'
        video.srcObject = stream
        const play =
          document.querySelector('button') ||
          document.body.appendChild(document.createElement('button'))
        play.textContent = 'play video'
        play.onclick = () => {
          log({ message: 'play video' })
          video.play()
          play.parentNode.removeChild(play)
          video.style = 'display: block'
        }
      })
    }
    ws.send(JSON.stringify({ type: 'follow' }))
    log({ message: 'follow' })
  }
  ws.onclose = () => {
    log({ message: 'websocket closed' })
  }
}

function gotMedia (stream) {
  log({ message: 'got hold of camera and mic' })
  const peer = new Peer({ initiator: true, stream, trickle: false })
  let signal
  peer.on('signal', data => {
    log({ message: 'got signal from initiator peer', extra: { ...data } })
    signal = data
    const ws = new window.WebSocket(`${WS_URL}/new`)
    ws.onopen = () => {
      log({ message: 'connected to websocket' })
      let id
      ws.send(JSON.stringify({ type: 'initiate' }))
      ws.onmessage = ({ data }) => {
        const message = JSON.parse(data)
        const { type } = message
        if (type === 'signal') {
          log({ message: 'sending signal to peer', extra: message })
          peer.signal(message.data)
        } else if (type === 'shareId') {
          id = message.id
          log({
            message: 'share',
            extra: `${window.location.href.replace('/new', '')}/${id}`
          })
          ws.send(
            JSON.stringify({
              type: 'signal',
              initiator: true,
              data: signal,
              id
            })
          )
          qrcode
            .toDataURL(`${window.location.href.replace('/new', '')}/${id}`)
            .then(src => {
              const shareImage =
                document.querySelector('img') ||
                document.body.appendChild(document.createElement('img'))
              shareImage.src = src
              shareImage.style = 'display: block;'
              const share =
                document.querySelector('a') ||
                document.body.appendChild(document.createElement('a'))
              share.href = `/${id}`
              share.textContent = 'share link'
              share.style = 'display: block; margin-left: 15px;'
            })
        }
      }
      ws.onclose = () => {
        log({ message: 'websocket closed' })
      }
    }
  })
}
