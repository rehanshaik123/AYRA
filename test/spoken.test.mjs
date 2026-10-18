import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ackFor, createSpokenFilter, isQuestion, unwrapMore } from '../bridge/spoken.mjs'

const run = (deltas, { question = false, command = '' } = {}) => {
  const f = createSpokenFilter({ question, command })
  const parts = [...deltas.flatMap((d) => f.push(d)), ...f.end()]
  return {
    spoken: parts.filter((p) => !p.quiet).map((p) => p.text).join(''),
    shown: parts.map((p) => p.text).join(''),
  }
}

test('a task done: one word for what was asked; what she wrote goes to her log, unsaid', () => {
  const r = run(['I made the ayra-test folder ', 'in your Documents. ', 'It is at E:\\Documents\\ayra-test.'], { command: 'Create a folder called ayra-test in my Documents folder.' })
  assert.equal(r.spoken, 'Created. ')
  assert.match(r.shown, /I made the ayra-test folder in your Documents\. It is at/)
  assert.equal(run(['Spotify is now open and playing your mix.'], { command: 'Hey AYRA, open Spotify' }).spoken, 'Opened. ')
  assert.equal(run(['I have sent the email to Priya just now.'], { command: 'send the email to Priya' }).spoken, 'Sent. ')
  assert.equal(run(['All of the tabs in that window are closed now.'], { command: 'close those tabs' }).spoken, 'Closed. ')
  // No known verb in the command: the answer as written ("Done." would hide it).
  assert.equal(run(['I tidied things up for you on the desktop.'], { command: 'tidy my desktop' }).spoken, 'I tidied things up for you on the desktop.')
  assert.equal(run(["It's 31 degrees and sunny in Hyderabad."], { command: 'weather in Hyderabad' }).spoken, "It's 31 degrees and sunny in Hyderabad.")
})

test('the review\'s cases (2026-10-18): only a plain success becomes the one word', () => {
  for (const [command, said] of [
    ['send the report to Priya', "Priya's email bounced back as undeliverable."],
    ['delete the temp files', 'They are locked by another program, so nothing was removed.'],
    ['download the invoice', 'The site wants you to log in first.'],
    ['open the report', "There's no report in Downloads or Documents."],
  ]) {
    assert.equal(run([said], { command }).spoken, said, said)
  }
  // A question after a first sentence is said too, a remark is not.
  const r = run(['I found three reports in Documents. ', 'They are all from October. ', 'Which one should I open?'], { command: 'open the report' })
  assert.match(r.spoken, /I found three reports in Documents\. Which one should I open\?/)
  assert.ok(!r.spoken.includes('October'))
  const ok = run(['I opened the report in Word. ', 'But the second copy failed to open.'], { command: 'open the reports' })
  assert.equal(ok.spoken, 'Opened. But the second copy failed to open.')
})

test('trouble, a question back, or something important: said as she wrote it', () => {
  for (const said of [
    "I couldn't find a folder called reports.",
    'Which of the two Notepad windows do you mean?',
    'Done, but the second file was already there.',
    'The email is ready and needs your OK to send.',
  ]) {
    const r = run([said, ' More details here.'], { command: 'do it' })
    assert.equal(r.spoken.trim(), said, said)
    assert.ok(!r.spoken.includes('More details'))
  }
})

test('already short: said as is', () => {
  assert.equal(run(['Done.'], { command: 'open notepad' }).spoken, 'Done.')
  assert.equal(run(['Opened it, boss.'], { command: 'open notepad' }).spoken, 'Opened it, boss.')
})

test('a sentence end split across deltas is seen', () => {
  const r = run(['The folder', ' is ready for', ' you now.', ' Extra words.'], { command: 'make a folder' })
  assert.equal(r.spoken, 'Created. ')
  assert.match(r.shown, /The folder is ready for you now\. Extra words\./)
})

test('one runaway sentence: judged at TASK_CHARS, the rest in the log', () => {
  const long = `${'word '.repeat(120)}end`
  const r = run([long], { command: 'organise my files' })
  assert.ok(r.spoken.length <= 320, String(r.spoken.length))
  assert.ok(r.shown.endsWith('end'))
})

test('<more> is shown, never spoken — in any split', () => {
  const full = 'Opened it. <more>Steps: 1. open 2. click 3. done.</more> Want anything else?'
  for (let size = 1; size <= 7; size++) {
    const parts = []
    for (let i = 0; i < full.length; i += size) parts.push(full.slice(i, i + size))
    const r = run(parts, { question: true })
    assert.equal(r.spoken, 'Opened it.  Want anything else?', `size ${size}`)
    assert.ok(r.shown.includes('Steps: 1. open'), `size ${size}`)
    assert.ok(!r.shown.includes('<more>') && !r.shown.includes('</more>'), `size ${size}`)
  }
})

test('a question is answered in full', () => {
  const r = run(['It works like this. First the planner reads it. Then the agents search. Then a reviewer ranks.'], { question: true })
  assert.ok(r.spoken.includes('Then a reviewer ranks.'))
})

test('ackFor: the word for what was asked', () => {
  assert.equal(ackFor('Hey AYRA, create a new note'), 'Created.')
  assert.equal(ackFor('can you open YouTube'), 'Opened.')
  assert.equal(ackFor('save it'), 'Saved.')
  assert.equal(ackFor('delete the old screenshots'), 'Deleted.')
  assert.equal(ackFor('rename the file'), 'Done.')
})

test('isQuestion: questions, requests to explain or to find out; everything else is a task', () => {
  for (const q of ['What is the gold price?', 'Hey AYRA, why is the sky blue', 'how does researcher mode work', 'explain the bubble', 'Tell me about Node 24', 'can you explain the bubble?', 'is it raining', 'find the biggest files in Downloads', 'check the weather in Hyderabad', 'research the best laptops']) {
    assert.equal(isQuestion(q), true, q)
  }
  for (const t of ['open spotify', 'Hey AYRA, clean up my downloads folder', 'send the report to my drive', 'play some music', 'can you open notepad?', 'Could you please create a folder called Notes']) {
    assert.equal(isQuestion(t), false, t)
  }
})

test('unwrapMore keeps the words, drops the tags', () => {
  assert.equal(unwrapMore('Done. <more>Details.</more>'), 'Done. Details.')
})
