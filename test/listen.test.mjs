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

test('words that came out of the laptop\'s speakers reach the face empty; the owner\'s pass (2026-10-22)', () => {
  const client = new EventEmitter()
  client.OPEN = 1
  client.readyState = 1
  client.sent = []
  client.send = (s) => client.sent.push(JSON.parse(s))
  const ups = []
  const connect = () => {
    const u = new EventEmitter()
    u.sent = []
    u.send = (s) => u.sent.push(JSON.parse(s))
    u.close = () => {}
    ups.push(u)
    return u
  }
  const judged = []
  const recorded = []
  // The fake meter says a segment is from the speakers when its first byte is 9.
  const judge = (pcm, at) => (judged.push({ bytes: pcm.length, at }), { fromSpeakers: pcm[0] === 9, corr: pcm[0] === 9 ? 0.8 : 0.1 })
  relayListening(client, { key: 'k', connect, judge, record: (e) => recorded.push(e), now: () => 1000 })
  const audio = (bytes) => client.emit('message', Buffer.from(bytes), true)
  const commit = () => client.emit('message', Buffer.from(JSON.stringify({ type: 'commit' })), false)
  const from = (msg) => ups[0].emit('message', Buffer.from(JSON.stringify(msg)))

  // Outside the minutes after an answer nothing is checked — the owner may be talking over her.
  audio([9, 9])
  from({ message_type: 'session_started' })
  commit()
  from({ message_type: 'committed_transcript', text: 'stop' })
  assert.equal(client.sent.filter((m) => m.type === 'final').at(-1).text, 'stop')
  assert.equal(judged.length, 0)

  client.emit('message', Buffer.from(JSON.stringify({ type: 'follow', on: true })), false)
  audio([9, 9, 9, 9])
  commit()
  audio([1, 2, 3, 4])
  commit()
  from({ message_type: 'committed_transcript', text: 'Okay, so now open the terminal' })
  from({ message_type: 'committed_transcript', text: 'OK, note this' })
  const finals = client.sent.filter((m) => m.type === 'final').map((m) => m.text)
  assert.deepEqual(finals, ['stop', '', 'OK, note this'])
  assert.deepEqual(judged.map((j) => j.bytes), [4, 4])
  assert.equal(recorded.length, 1)
  assert.equal(recorded[0].result, 'speakers')
  // A commit that came back with no words takes its audio with it: the next words get the next audio.
  audio([9, 9])
  commit()
  audio([5, 5])
  commit()
  from({ message_type: 'insufficient_audio_activity' })
  from({ message_type: 'committed_transcript', text: 'OK, add this' })
  assert.equal(client.sent.filter((m) => m.type === 'final').at(-1).text, 'OK, add this')
})

test('without a meter, or when it fails, every word is the owner\'s', () => {
  const client = new EventEmitter()
  client.OPEN = 1
  client.readyState = 1
  client.sent = []
  client.send = (s) => client.sent.push(JSON.parse(s))
  const ups = []
  const connect = () => {
    const u = new EventEmitter()
    u.send = () => {}
    u.close = () => {}
    ups.push(u)
    return u
  }
  relayListening(client, { key: 'k', connect, judge: () => { throw new Error('meter down') } })
  client.emit('message', Buffer.from(JSON.stringify({ type: 'follow', on: true })), false)
  client.emit('message', Buffer.from([9, 9]), true)
  client.emit('message', Buffer.from(JSON.stringify({ type: 'commit' })), false)
  ups[0].emit('message', Buffer.from(JSON.stringify({ message_type: 'committed_transcript', text: 'OK, open Notepad' })))
  assert.equal(client.sent.at(-1).text, 'OK, open Notepad')
})
