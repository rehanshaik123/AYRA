// Unit tests for bridge/listen.mjs — the live-hearing relay. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { relayListening, upstreamUrl, audioMessage } from '../bridge/listen.mjs'

/** A face socket and an ElevenLabs socket, both fake. */
function rig() {
  const client = new EventEmitter()
  client.OPEN = 1
  client.readyState = 1
  client.sent = []
  client.send = (s) => client.sent.push(JSON.parse(s))
  const ups = []
  const connect = (url, key) => {
    const u = new EventEmitter()
    u.url = url
    u.key = key
    u.sent = []
    u.send = (s) => u.sent.push(JSON.parse(s))
    u.closed = false
    u.close = () => {
      u.closed = true
    }
    ups.push(u)
    return u
  }
  const relay = relayListening(client, { key: 'k', language: 'en', keyterms: ['AYRA'], connect })
  const audio = (bytes) => client.emit('message', Buffer.from(bytes), true)
  const json = (msg) => client.emit('message', Buffer.from(JSON.stringify(msg)), false)
  const from = (u, msg) => u.emit('message', Buffer.from(JSON.stringify(msg)))
  return { client, ups, relay, audio, json, from }
}

test('the upstream URL asks for realtime Scribe, 16 kHz PCM, the language and the name', () => {
  const url = new URL(upstreamUrl({ language: 'en', keyterms: ['AYRA'] }))
  assert.equal(url.host, 'api.elevenlabs.io')
  assert.equal(url.searchParams.get('model_id'), 'scribe_v2_realtime')
  assert.equal(url.searchParams.get('audio_format'), 'pcm_16000')
  assert.equal(url.searchParams.get('language_code'), 'en')
  assert.equal(url.searchParams.get('commit_strategy'), 'manual')
  assert.deepEqual(url.searchParams.getAll('keyterms'), ['AYRA'])
})

test('audio is base64 in an input_audio_chunk', () => {
  assert.deepEqual(audioMessage(Buffer.from([1, 2, 3])), {
    message_type: 'input_audio_chunk', audio_base_64: 'AQID', commit: false, sample_rate: 16000,
  })
  assert.equal(audioMessage(new Uint8Array(0), true).audio_base_64, '')
})

test('audio before the session starts is held, then flushed in order', () => {
  const { ups, audio, json, from } = rig()
  audio([1])
  audio([2])
  assert.equal(ups.length, 1, 'first audio opens the session')
  assert.equal(ups[0].key, 'k')
  assert.equal(ups[0].sent.length, 0, 'nothing sent before session_started')
  from(ups[0], { message_type: 'session_started' })
  audio([3])
  json({ type: 'commit' })
  assert.deepEqual(
    ups[0].sent.map((m) => [m.audio_base_64, m.commit]),
    [['AQ==', false], ['Ag==', false], ['Aw==', false], ['', true]],
  )
})

test('partial and final words go back to the face', () => {
  const { client, ups, audio, from } = rig()
  audio([1])
  from(ups[0], { message_type: 'session_started' })
  from(ups[0], { message_type: 'partial_transcript', text: 'Hey AYRA' })
  from(ups[0], { message_type: 'committed_transcript', text: 'Hey AYRA, what time is it?' })
  assert.deepEqual(client.sent, [
    { type: 'partial', text: 'Hey AYRA' },
    { type: 'final', text: 'Hey AYRA, what time is it?' },
  ])
})

test('warm opens the session with no audio; a commit with nothing open is ignored', () => {
  const { ups, json } = rig()
  json({ type: 'commit' })
  assert.equal(ups.length, 0)
  json({ type: 'warm' })
  json({ type: 'warm' })
  assert.equal(ups.length, 1)
})

test('a quota error reaches the face and closes the session; the next audio reopens it', () => {
  const { client, ups, audio, from } = rig()
  audio([1])
  from(ups[0], { message_type: 'quota_exceeded', error: 'out of credits' })
  assert.deepEqual(client.sent.at(-1), { type: 'error', code: 'quota_exceeded', message: 'out of credits' })
  assert.equal(ups[0].closed, true)
  audio([2])
  assert.equal(ups.length, 2)
})

test('the face going away closes the upstream session', () => {
  const { client, ups, audio } = rig()
  audio([1])
  client.emit('close')
  assert.equal(ups[0].closed, true)
})
