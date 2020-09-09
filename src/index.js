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
    getMedia()
      .then(gotMedia)
      .catch(error => log({ error }))
  }
} else {
  const peer = new Peer({ initiator: false, trickle: false })
  window.peer = peer
  const ws = new window.WebSocket(`${WS_URL}${window.location.pathname}`)
  peer.on('signal', data => {
    log({ message: 'ws signal', extra: { initator: false, data: { ...data } } })
    ws.send(JSON.stringify({ type: 'signal', initiator: false, data }))
  })
  const caption = document.body.appendChild(document.createElement('p'))
  peer.on('data', data => {
    const message = JSON.parse(data)
    if (message.type === 'setCaption') {
      caption.textContent = message.value
    }
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
        const video = document.body.appendChild(document.createElement('video'))
        video.style = 'display: none'
        video.controls = true
        video.srcObject = stream
        const play = document.body.appendChild(document.createElement('button'))
        play.textContent = 'play video'
        play.onclick = () => {
          log({ message: 'play video' })
          video
            .play()
            .catch(error => log({ error, extra: 'peer failed to play video' }))
          play.parentNode.removeChild(play)
          video.style = 'display: block; width: 100vw;'
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

function getMedia () {
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'environment'
    },
    audio: {
      sampleRate: 48000,
      channelCount: 2,
      volume: 1.0,
      echoCancellation: false,
      noiseSuppression: false,
      audioGainControl: false
    }
  })
}

function gotMedia (stream) {
  log({ message: 'got hold of camera and mic' })
  const video = document.body.appendChild(document.createElement('video'))
  video.style = 'width: 40vw'

  const noSoundStream = stream.clone()
  for (const audioTrack of noSoundStream.getAudioTracks()) {
    audioTrack.enabled = false
  }

  video.srcObject = noSoundStream
  video.controls = true
  video.play().catch(error => log({ error, extra: 'failed to play own video' }))

  const pauseResume = () => {
    for (const audioTrack of stream.getAudioTracks()) {
      audioTrack.enabled = !video.muted && video.volume > 0.1 && !video.paused
    }
    for (const videoTrack of stream.getVideoTracks()) {
      videoTrack.enabled = !video.paused
    }
  }

  video.onvolumechange = pauseResume
  video.onpause = pauseResume
  video.onplay = pauseResume

  const peer = new Peer({
    initiator: true,
    stream,
    trickle: false,
    sdpTransform: sdp => sdp.replace(/sendrecv/g, 'sendonly')
  })
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
              const shareImage = document.body.appendChild(
                document.createElement('img')
              )
              shareImage.src = src
              shareImage.style = 'display: block;'
              const share = document.body.appendChild(
                document.createElement('a')
              )
              share.href = `/${id}`
              share.textContent = 'share link'
              share.style = 'display: block; margin-left: 15px;'
              share.onclick = e => {
                if (iframeCheck.checked) {
                  e.preventDefault()
                  const iframe = document.createElement('iframe')
                  iframe.src = share.href
                  iframe.height = '100%'
                  iframe.width = '40%'
                  iframe.style = 'position: fixed; top: 0px; right: 0px;'
                  window.document.body.appendChild(iframe)
                }
              }

              const shareInline = document.body.appendChild(
                document.createElement('label')
              )
              shareInline.style = 'display: block; margin: 15px;'
              shareInline.textContent = 'in iframe?'

              const iframeCheck = document.createElement('input')
              iframeCheck.type = 'checkbox'

              shareInline.appendChild(iframeCheck)

              const caption = document.body.appendChild(
                document.createElement('input')
              )
              caption.style = 'display: block; margin: 15px'
              caption.placeholder = 'Caption for video'

              const setCaption = () => {
                if (setCaption.timer) {
                  clearTimeout(setCaption.timer)
                  setCaption.timer = null
                }
                setCaption.timer = setTimeout(() => {
                  const send = () =>
                    peer.send(
                      JSON.stringify({
                        type: 'setCaption',
                        value: caption.value
                      })
                    )
                  if (peer.connected) {
                    send()
                  } else {
                    peer.on('connect', send)
                  }
                }, 500)
              }
              caption.oninput = setCaption
            })
        }
      }
      ws.onclose = () => {
        log({ message: 'websocket closed' })
      }
    }
  })
}
