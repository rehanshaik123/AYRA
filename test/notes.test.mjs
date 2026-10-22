// Unit tests for bridge/notes.mjs — AYRA's note taker in the owner's Obsidian vault. `npm test`
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ATTACHMENTS, HISTORY, INDEX, OVERALL, WRITER_SCHEMA, WRITER_SYSTEM,
  addToIndex, appendTo, captionTextOf, cleanWritten, clock, findByName, fixPictureLinks, folderOf, frontOf, inVault, insertTop,
  mergeParts, noteFile, notesTools, partsOf, replaceIn, searchNotes, slugify, sourceKey, tagsOf, today, writerPrompt,
} from '../bridge/notes.mjs'

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

test('a title becomes a file name; letters of any language stay', () => {
  assert.equal(slugify('Gradient Descent: the idea!'), 'gradient-descent-the-idea')
  assert.equal(slugify("Python's async/await"), 'pythons-async-await')
  assert.equal(slugify('Café résumé'), 'cafe-resume')
  assert.equal(slugify('मशीन लर्निंग'), 'मशीन-लर्निंग')
  assert.ok(slugify('x'.repeat(200)).length <= 60)
  assert.equal(slugify('---'), '')
})

test('topic folders: two levels at most, never the pictures folder', () => {
  assert.equal(folderOf('Machine Learning/Optimisers'), 'machine-learning/optimisers')
  assert.equal(folderOf('a/b/c'), 'a/b')
  assert.equal(folderOf('..\\..\\Windows'), 'windows')
  assert.equal(folderOf('attachments/x'), 'x')
  assert.equal(folderOf(''), '')
})

test('paths stay inside the vault and out of the app\'s own folders', () => {
  const vault = join(tmpdir(), 'vault-x')
  assert.ok(inVault(vault, 'ml/gradient-descent.md').endsWith(join('ml', 'gradient-descent.md')))
  assert.ok(inVault(vault, 'ml/gradient-descent').endsWith('.md'))
  for (const bad of ['../outside.md', '..\\..\\Windows\\win.ini', '.obsidian/app.json', 'ml/.hidden/x.md', `${HISTORY}/ml/x.md`, '', '   ']) {
    assert.equal(inVault(vault, bad), null, bad)
  }
  // Absolute paths are read as inside the vault, never as the drive.
  assert.ok(inVault(vault, '/etc/passwd').startsWith(vault))
  assert.equal(inVault(vault, 'attachments/x.jpg', { any: true })?.endsWith('x.jpg'), true)
})

test('the same video under any of its addresses is one source', () => {
  const id = 'youtube:IHZwWFHWa-w'
  for (const u of [
    'https://www.youtube.com/watch?v=IHZwWFHWa-w',
    'https://www.youtube.com/watch?v=IHZwWFHWa-w&t=95s&list=PLx',
    'https://youtu.be/IHZwWFHWa-w?si=abc',
    'https://m.youtube.com/watch?v=IHZwWFHWa-w',
    'https://www.youtube.com/shorts/IHZwWFHWa-w',
  ]) assert.equal(sourceKey(u), id, u)
  assert.equal(sourceKey('https://example.com/post/?utm_source=x#top'), 'example.com/post')
  assert.equal(sourceKey('https://example.com/a?page=2'), 'example.com/a?page=2')
  assert.equal(sourceKey('not a url'), '')
})

test('a new note keeps the vault\'s style: front matter, the "Saved by" box, the body', () => {
  const note = noteFile({
    title: 'Gradient Descent', date: '2026-10-22', tags: ['ML', '#optimization'],
    source: 'https://www.youtube.com/watch?v=IHZwWFHWa-w', asked: 'make "notes" on this', body: '# Gradient Descent\n\n## In one line\n\nDownhill.',
  })
  assert.match(note, /^---\ntitle: Gradient Descent\ndate: 2026-10-22\ntags: \[ml, optimization, ayra-saved\]\nsource: "https:\/\/www\.youtube\.com\/watch\?v=IHZwWFHWa-w"\n---\n/)
  assert.match(note, /\n# Gradient Descent\n\n> \[!NOTE\]\n> Saved by AYRA on 2026-10-22 when you asked: "make 'notes' on this"\.\n> Source: <https:\/\/www\.youtube\.com/)
  // Her own "# Title" line is not doubled.
  assert.equal(note.match(/^# /gm).length, 1)
  assert.equal(frontOf(note).title, 'Gradient Descent')
  assert.deepEqual(frontOf(note).tags, ['ml', 'optimization', 'ayra-saved'])
  assert.equal(frontOf(note).source, 'https://www.youtube.com/watch?v=IHZwWFHWa-w')
  // A title YAML would misread is quoted.
  assert.equal(frontOf(noteFile({ title: 'C++: pointers', date: '2026-10-22', body: 'x' })).title, 'C++: pointers')
})

test('tags: lower case, no spaces, nested with "/"', () => {
  assert.deepEqual(tagsOf(['Machine Learning', '#ml', 'ML', 'dsa/Graphs', '']), ['machine-learning', 'ml', 'dsa/graphs'])
})

test('the home page gets one line, under its folder\'s other notes or a new heading', () => {
  const index = '---\ntitle: Home\n---\n\n# Home\n\n## Machine learning\n\n- [Gradient Descent](ml/gradient-descent.md): stepping downhill\n'
  const more = addToIndex(index, { title: 'Adam', rel: 'ml/adam.md', summary: 'the optimiser' })
  assert.match(more, /- \[Gradient Descent\]\(ml\/gradient-descent\.md\): stepping downhill\n- \[Adam\]\(ml\/adam\.md\): the optimiser\n$/)
  // Its line can be told something new — once screen pictures get their notes.
  assert.match(addToIndex(more, { title: 'Adam', rel: 'ml/adam.md', summary: 'per-weight steps', replace: true }), /- \[Adam\]\(ml\/adam\.md\): per-weight steps\n$/)
  const fresh = addToIndex(more, { title: 'Lists', rel: 'python/lists.md', summary: 'slicing', topic: 'Python' })
  assert.match(fresh, /\n## Python\n\n- \[Lists\]\(python\/lists\.md\): slicing\n$/)
  assert.equal(addToIndex(fresh, { title: 'Adam', rel: 'ml/adam.md' }), fresh)
  // A note in a sub-folder doesn't count as the parent folder's.
  const sub = addToIndex(index, { title: 'Graphs', rel: 'ml/deep/graphs.md' })
  assert.match(sub, /## Ml \/ Deep\n\n- \[Graphs\]/)
  assert.match(addToIndex('', { title: 'X', rel: 'x.md' }), /^# Home\n\n## Notes\n\n- \[X\]\(x\.md\)\n$/)
})

test('adding keeps everything there: at the end, under a section, or at the top', () => {
  const note = '---\ntitle: T\n---\n\n# T\n\n> [!NOTE]\n> Saved by AYRA.\n\n## A\n\none\n\n## B\n\ntwo\n'
  assert.match(appendTo(note, 'three'), /two\n\nthree\n$/)
  const underA = appendTo(note, 'more on A', 'a')
  assert.match(underA, /## A\n\none\n\nmore on A\n\n## B/)
  assert.match(appendTo(note, 'new', 'From the screen'), /two\n\n## From the screen\n\nnew\n$/)
  const top = insertTop(note, '%% ayra %%\n## In one line\n\nIt.')
  assert.match(top, /> Saved by AYRA\.\n\n%% ayra %%\n## In one line\n\nIt\.\n\n## A/)
  assert.ok(top.startsWith('---\ntitle: T\n---'))
  // Nothing that was there goes missing.
  for (const s of [underA, top]) for (const part of ['one', 'two', '## A', '## B', 'Saved by AYRA.']) assert.ok(s.includes(part), part)
})

test('an edit changes one exact passage, or says how often it was found', () => {
  assert.deepEqual(replaceIn('a b a', 'b', 'c'), { text: 'a c a', count: 1 })
  assert.deepEqual(replaceIn('a b a', 'a', 'c'), { text: null, count: 2 })
  assert.deepEqual(replaceIn('a b a', 'a', 'c', true), { text: 'c b c', count: 2 })
  assert.deepEqual(replaceIn('a b a', 'z', 'c'), { text: null, count: 0 })
  assert.deepEqual(replaceIn('x', '', 'c'), { text: null, count: 0 })
  // "$&" in the new text is written as it is, not as a pattern.
  assert.equal(replaceIn('cost: X', 'X', '$& 5').text, 'cost: $& 5')
})

test('picture links are made relative to the note they sit in', () => {
  assert.equal(fixPictureLinks('![a](attachments/x.jpg)', 'ml/n.md'), '![a](../attachments/x.jpg)')
  assert.equal(fixPictureLinks('![a](attachments/x.jpg)', 'ml/deep/n.md'), '![a](../../attachments/x.jpg)')
  assert.equal(fixPictureLinks('![a](attachments/x.jpg)', 'n.md'), '![a](attachments/x.jpg)')
  assert.equal(fixPictureLinks('[site](https://x.com/attachments/y)', 'ml/n.md'), '[site](https://x.com/attachments/y)')
})

test('search: titles count most, every word found counts more than one word often', () => {
  const notes = [
    { rel: 'ml/gradient-descent.md', text: '---\ntitle: Gradient Descent\ntags: [ml, optimization]\naliases: [GD]\n---\n# Gradient Descent\nThe learning rate matters.' },
    { rel: 'ml/adam.md', text: '---\ntitle: Adam\ntags: [ml]\n---\n# Adam\nAdam keeps a learning rate per weight. learning learning learning' },
    { rel: 'python/lists.md', text: '---\ntitle: Lists\n---\n# Lists\nSlicing.' },
  ]
  assert.equal(searchNotes(notes, 'gradient descent')[0].rel, 'ml/gradient-descent.md')
  assert.equal(searchNotes(notes, 'GD')[0].rel, 'ml/gradient-descent.md')
  assert.deepEqual(searchNotes(notes, 'learning rate').map((h) => h.rel).sort(), ['ml/adam.md', 'ml/gradient-descent.md'])
  assert.deepEqual(searchNotes(notes, 'quantum'), [])
  assert.deepEqual(searchNotes(notes, ''), [])
  assert.ok(searchNotes(notes, 'slicing')[0].lines[0].includes('Slicing'))
})

test('a note is named by its title, aliases or path — never by words in its text', () => {
  const notes = [
    { rel: 'ml/gradient-descent.md', text: '---\ntitle: Gradient Descent\naliases: [GD]\n---\n> [!NOTE]\n> python python' },
    { rel: 'python/lists.md', text: '---\ntitle: Python Lists\n---\n> [!NOTE]' },
    { rel: 'python/lists-and-tuples-in-depth.md', text: '---\ntitle: Python Lists and Tuples in Depth\n---\n' },
  ]
  assert.equal(findByName(notes, 'gradient descent'), 'ml/gradient-descent.md')
  assert.equal(findByName(notes, 'my GD notes'), 'ml/gradient-descent.md')
  assert.equal(findByName(notes, 'the python lists note'), 'python/lists.md')
  assert.equal(findByName(notes, 'python'), 'python/lists.md')
  assert.equal(findByName(notes, 'no such note'), null)
  assert.equal(findByName(notes, 'note'), null)
  assert.equal(findByName(notes, ''), null)
})

test('captions: paragraphs with times, cut into parts between paragraphs', () => {
  assert.equal(clock(5), '0:05')
  assert.equal(clock(185), '3:05')
  assert.equal(clock(3723), '1:02:03')
  const lines = [{ at: 0, text: 'a' }, { at: 10, text: 'b' }, { at: 31, text: 'c' }, { at: 95, text: 'd' }]
  assert.equal(captionTextOf(lines), '[0:00] a b\n[0:31] c\n[1:35] d')
  const long = Array.from({ length: 300 }, (_, i) => `[${clock(i * 30)}] ${'word '.repeat(60)}`).join('\n')
  const { parts, dropped } = partsOf(long, 20_000, 5)
  assert.ok(parts.length > 1 && parts.length <= 5)
  assert.equal(parts[0].from, '0:00')
  for (const p of parts) assert.ok(p.text.startsWith('[') && p.text.length <= 20_400)
  // Nothing in between is lost: the parts are the captions, in order.
  assert.equal(dropped, null)
  assert.equal(parts.map((p) => p.text).join('\n'), long)
  const cut = partsOf(long, 5_000, 2)
  assert.equal(cut.parts.length, 2)
  assert.match(cut.dropped, /^\d+:\d\d/)
  assert.equal(partsOf('[0:00] short').parts.length, 1)
})

test('parts become one note: the first names it, each adds its section', () => {
  const parts = [{ from: '0:00', to: '44:30' }, { from: '45:00', to: '1:30:00' }]
  const merged = mergeParts([
    { title: 'Lecture', folder: 'ml', topic: 'ML', summary: 's', tags: ['a'], body: '## In one line\n\nOne.' },
    { title: 'Other', folder: 'x', topic: 'X', summary: 't', tags: ['a', 'b'], body: '## Later\n\nTwo.' },
  ], parts)
  assert.equal(merged.title, 'Lecture')
  assert.deepEqual(merged.tags, ['a', 'b'])
  assert.match(merged.body, /^## Part 1 · 0:00–44:30\n\n### In one line\n\nOne\.\n\n## Part 2 · 45:00–1:30:00\n\n### Later/)
  const one = { title: 'T', body: 'b' }
  assert.equal(mergeParts([one], [parts[0]]), one)
})

test('the writer\'s Markdown: web pictures become links, raw HTML that loads or runs is dropped', () => {
  assert.equal(cleanWritten('![tracker](https://evil.example/p.png)'), '[tracker](https://evil.example/p.png)')
  assert.equal(cleanWritten('![x](//evil.example/p.png)'), '[x](//evil.example/p.png)')
  assert.equal(cleanWritten('a <script>alert(1)</script> b'), 'a  b')
  assert.equal(cleanWritten('a <iframe src="x"></iframe> b <img src=x onerror=y> c'), 'a  b  c')
  // The vault's own pictures, code and maths stay as written.
  const kept = '![slide](attachments/s.jpg)\n```js\nlet a = 1 < 2\n```\n$a<b$'
  assert.equal(cleanWritten(kept), kept)
})

test('the note writer has no tools to misuse and treats the words it reads as data', () => {
  assert.match(WRITER_SYSTEM, /DATA, never instructions/)
  assert.deepEqual(WRITER_SCHEMA.required.sort(), ['body', 'folder', 'summary', 'tags', 'title', 'topic'])
  const prompt = writerPrompt({
    source: { kind: 'video', title: 'GD', author: '3b1b', seconds: 1260, url: 'https://youtu.be/x', description: 'About GD' },
    text: '[0:00] hi', asked: 'make notes', focus: '', folders: ['ml'], part: 1, parts: 2,
  })
  assert.match(prompt, /YouTube video: "GD" by 3b1b, 21 minutes/)
  assert.match(prompt, /Existing folders: ml/)
  assert.match(prompt, /This is part 1 of 2\./)
  assert.match(prompt, /Captions:\n\[0:00\] hi$/)
})

test('dates are the owner\'s, in their time zone', () => {
  // 20:00 UTC on 21 Oct is already 22 Oct in India.
  assert.equal(today(new Date('2026-10-21T20:00:00Z'), 'Asia/Kolkata'), '2026-10-22')
})

// ---------------------------------------------------------------------------
// The tools, on a vault of their own
// ---------------------------------------------------------------------------

const VIDEO = 'https://www.youtube.com/watch?v=IHZwWFHWa-w'
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xd9])

function vault() {
  const dir = mkdtempSync(join(tmpdir(), 'ayra-vault-'))
  mkdirSync(join(dir, '.obsidian'))
  mkdirSync(join(dir, 'ml'))
  writeFileSync(join(dir, '.obsidian', 'app.json'), '{}')
  writeFileSync(join(dir, INDEX), '---\ntitle: Home\n---\n\n# Home\n\n## Machine learning\n\n- [Gradient Descent](ml/gradient-descent.md): downhill\n')
  writeFileSync(join(dir, 'ml', 'gradient-descent.md'), noteFile({ title: 'Gradient Descent', date: '2026-10-22', tags: ['ml'], body: '## The idea\n\nStep downhill.' }))
  return dir
}

const by = (tools) => Object.fromEntries(tools.map((t) => [t.name, t.handler]))
const out = (r) => r.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')

test('without writes only reading is offered', () => {
  const dir = vault()
  try {
    assert.deepEqual(notesTools({ allowWrites: false, vault: dir }).map((t) => t.name), ['notes_search', 'notes_read'])
    assert.deepEqual(notesTools({ allowWrites: true, vault: dir }).map((t) => t.name), [
      'notes_search', 'notes_read', 'notes_capture', 'notes_save', 'notes_add', 'notes_edit', 'notes_picture', 'notes_open',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('save → search → read → add → edit, and the home page keeps up', async () => {
  const dir = vault()
  try {
    const t = by(notesTools({ allowWrites: true, vault: dir }))
    const saved = await t.notes_save({ title: 'Adam Optimiser', folder: 'ml', body: '## In one line\n\nPer-weight steps.', summary: 'adaptive steps', tags: ['ml'], source: VIDEO, asked: 'save this' })
    assert.match(out(saved), /Saved ml\/adam-optimiser\.md/)
    assert.match(readFileSync(join(dir, INDEX), 'utf8'), /- \[Gradient Descent\]\(ml\/gradient-descent\.md\): downhill\n- \[Adam Optimiser\]\(ml\/adam-optimiser\.md\): adaptive steps/)
    // A second note from the same video is refused — add to the first.
    const again = await t.notes_save({ title: 'Adam again', folder: 'ml', body: 'x', summary: 'y', source: 'https://youtu.be/IHZwWFHWa-w' })
    assert.equal(again.isError, true)
    assert.match(out(again), /ml\/adam-optimiser\.md/)
    // Same title, no source: a second file, never the first one overwritten.
    await t.notes_save({ title: 'Adam Optimiser', folder: 'ml', body: 'second', summary: 's' })
    assert.ok(existsSync(join(dir, 'ml', 'adam-optimiser-2.md')))
    assert.match(readFileSync(join(dir, 'ml', 'adam-optimiser.md'), 'utf8'), /Per-weight steps/)

    assert.match(out(await t.notes_search({ query: 'adam' })), /ml\/adam-optimiser\.md/)
    assert.match(out(await t.notes_search({})), /Folders: ml/)
    assert.match(out(await t.notes_read({ note: 'ml/adam-optimiser' })), /Per-weight steps/)
    assert.match(out(await t.notes_read({ note: 'Gradient Descent' })), /Step downhill/)
    assert.equal((await t.notes_read({ note: '.obsidian/app.json' })).isError, true)

    await t.notes_add({ note: 'ml/adam-optimiser.md', text: 'Bias correction matters early.', heading: 'In one line' })
    assert.match(readFileSync(join(dir, 'ml', 'adam-optimiser.md'), 'utf8'), /Per-weight steps\.\n\nBias correction/)
    await t.notes_add({ note: 'ml/adam-optimiser.md', text: 'TOP', at: 'top' })
    assert.match(readFileSync(join(dir, 'ml', 'adam-optimiser.md'), 'utf8'), /> Source: <[^>]+>\n\nTOP\n\n## In one line/)
    assert.equal((await t.notes_add({ note: INDEX, text: 'x' })).isError, true)

    const edited = await t.notes_edit({ note: 'ml/adam-optimiser.md', find: 'Per-weight steps.', replace: 'A step size for every weight.' })
    assert.match(out(edited), /Changed ml\/adam-optimiser\.md/)
    const now = readFileSync(join(dir, 'ml', 'adam-optimiser.md'), 'utf8')
    assert.match(now, /A step size for every weight\./)
    // The version before is kept, hidden from Obsidian.
    const kept = readdirSync(join(dir, HISTORY, 'ml', 'adam-optimiser'))
    assert.equal(kept.length, 1)
    assert.match(readFileSync(join(dir, HISTORY, 'ml', 'adam-optimiser', kept[0]), 'utf8'), /Per-weight steps\./)
    assert.equal((await t.notes_edit({ note: 'ml/adam-optimiser.md', find: 'not there', replace: 'x' })).isError, true)
    // Hidden history never shows up in search.
    assert.doesNotMatch(out(await t.notes_search({ query: 'per-weight' })), new RegExp(HISTORY))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('secrets are blanked before a note is written', async () => {
  const dir = vault()
  try {
    const t = by(notesTools({ allowWrites: true, vault: dir }))
    await t.notes_save({ title: 'Keys', folder: 'misc', body: 'my key is sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGH', summary: 's' })
    assert.doesNotMatch(readFileSync(join(dir, 'misc', 'keys.md'), 'utf8'), /sk-ant-api03-abcdefghijklmnop/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('"note this on screen": the picture goes into the video\'s note, or makes one', async () => {
  const dir = vault()
  const blades = []
  try {
    const capture = async () => ({ jpeg: JPEG, url: `${VIDEO}&t=10s`, title: 'Gradient descent, how neural networks learn - YouTube', at: 185, said: 'the cost function' })
    const t = by(notesTools({ allowWrites: true, vault: dir, capture, emitBlade: (b) => blades.push(b) }))
    // No note for this video yet, and no folder: the picture is saved and the Markdown handed back.
    const loose = await t.notes_picture({})
    assert.match(out(loose), /no note for it yet/)
    assert.equal(loose.content[0].type, 'image')
    // With a folder, a note is made for the video.
    const made = await t.notes_picture({ folder: 'ml' })
    assert.match(out(made), /in ml\/gradient-descent-how-neural-networks-learn\.md, under "From the screen"/)
    assert.match(out(made), /Being said then: "the cost function"/)
    const note = readFileSync(join(dir, 'ml', 'gradient-descent-how-neural-networks-learn.md'), 'utf8')
    // The page's name without the site's.
    assert.match(note, /## From the screen\n\n!\[Gradient descent, how neural networks learn at 3:05\]\(\.\.\/attachments\/[\w-]+\.jpg\)/)
    assert.match(note, /\[watch from 3:05\]\(https:\/\/www\.youtube\.com\/watch\?v=IHZwWFHWa-w&t=185s\)/)
    // Kept by its plain address, not the moment it was opened at.
    assert.match(note, /^source: "https:\/\/www\.youtube\.com\/watch\?v=IHZwWFHWa-w"$/m)
    // The next picture of the same video lands in the same note, under the same section.
    await t.notes_picture({ caption: 'The cost surface' })
    const after = readFileSync(join(dir, 'ml', 'gradient-descent-how-neural-networks-learn.md'), 'utf8')
    assert.equal(after.match(/## From the screen/g).length, 1)
    assert.match(after, /\*The cost surface\*/)
    assert.equal(readdirSync(join(dir, ATTACHMENTS)).length, 3)
    assert.equal(blades.length, 3)
    assert.equal((await t.notes_picture({ note: 'no such note' })).isError, true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('"prepare overall notes": the whole video, written up, filed, and never twice by accident', async () => {
  const dir = vault()
  const asked = []
  try {
    const lines = Array.from({ length: 40 }, (_, i) => ({ at: i * 15, text: `sentence ${i}` }))
    const source = async () => ({ kind: 'video', title: 'Gradient descent', author: '3b1b', seconds: 600, url: VIDEO, description: 'd', lines })
    const write = async ({ prompt }) => {
      asked.push(prompt)
      return { title: 'Gradient Descent, Visually', folder: 'ml', topic: 'Machine learning', summary: 'how networks learn', tags: ['ml'], body: '## In one line\n\nDownhill on the cost.' }
    }
    const t = by(notesTools({ allowWrites: true, vault: dir, source, write }))
    const r = await t.notes_capture({ asked: 'prepare overall notes of this video' })
    assert.match(out(r), /Saved ml\/gradient-descent-visually\.md: how networks learn/)
    // Every word of the captions reached the writer, and the learner's words.
    assert.match(asked[0], /\[0:00\] sentence 0 sentence 1/)
    assert.match(asked[0], /sentence 39/)
    assert.match(asked[0], /The learner asked: "prepare overall notes of this video"/)
    const note = readFileSync(join(dir, 'ml', 'gradient-descent-visually.md'), 'utf8')
    assert.ok(note.includes(OVERALL))
    assert.match(readFileSync(join(dir, INDEX), 'utf8'), /\[Gradient Descent, Visually\]\(ml\/gradient-descent-visually\.md\): how networks learn/)
    // Asked again: it says so, rather than writing a second set.
    const twice = await t.notes_capture({})
    assert.equal(twice.isError, true)
    assert.equal(asked.length, 1)
    // Unless they want them again: added, nothing lost.
    await t.notes_capture({ again: true })
    const both = readFileSync(join(dir, 'ml', 'gradient-descent-visually.md'), 'utf8')
    assert.equal(both.split(OVERALL).length - 1, 2)
    assert.match(both, /## Written again on/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('overall notes go on top of a note that has screen pictures already', async () => {
  const dir = vault()
  try {
    const capture = async () => ({ jpeg: JPEG, url: VIDEO, title: 'GD - YouTube', at: 30, said: '' })
    const source = async () => ({ kind: 'video', title: 'GD', url: VIDEO, description: '', lines: [{ at: 0, text: 'hello' }] })
    const write = async () => ({ title: 'X', folder: 'ml', topic: 'ML', summary: 's', tags: [], body: '## In one line\n\nOverall.' })
    const t = by(notesTools({ allowWrites: true, vault: dir, capture, source, write }))
    await t.notes_picture({ folder: 'ml' })
    const r = await t.notes_capture({})
    assert.match(out(r), /are in ml\/gd\.md/)
    const note = readFileSync(join(dir, 'ml', 'gd.md'), 'utf8')
    assert.ok(note.indexOf('Overall.') < note.indexOf('## From the screen'))
    // The home page now says what the notes cover, not "pictures from the video".
    assert.match(readFileSync(join(dir, INDEX), 'utf8'), /\]\(ml\/gd\.md\): s\n/)
    assert.doesNotMatch(readFileSync(join(dir, INDEX), 'utf8'), /Pictures from the video/)
    // The edit kept the version before.
    assert.equal(readdirSync(join(dir, HISTORY, 'ml', 'gd')).length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a video with no captions, or a long one, says so instead of pretending', async () => {
  const dir = vault()
  try {
    const none = by(notesTools({ allowWrites: true, vault: dir, source: async () => ({ kind: 'video', title: 'Silent', url: VIDEO, description: '', lines: null }), write: async () => ({}) }))
    const r = await none.notes_capture({})
    assert.equal(r.isError, true)
    assert.match(out(r), /no captions/)

    const page = by(notesTools({
      allowWrites: true, vault: dir,
      source: async () => ({ kind: 'page', title: 'Long read', url: 'https://example.com/a', text: 'words', cut: true }),
      write: async () => ({ title: 'Long read', folder: 'reading', topic: 'Reading', summary: 's', tags: [], body: '## In one line\n\nIt.' }),
    }))
    const p = await page.notes_capture({})
    assert.match(out(p), /first 60,000 characters only/)
    assert.match(readFileSync(join(dir, 'reading', 'long-read.md'), 'utf8'), /> \[!WARNING\]\n> These notes cover the first 60,000 characters only\./)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('notes_open opens the note in Obsidian through its own link', async () => {
  const dir = vault()
  const opened = []
  try {
    const t = by(notesTools({ allowWrites: true, vault: dir, openUri: (u) => opened.push(u) }))
    await t.notes_open({ note: 'Gradient Descent' })
    assert.equal(opened.length, 1)
    assert.ok(opened[0].startsWith('obsidian://open?path='))
    assert.ok(decodeURIComponent(opened[0].slice('obsidian://open?path='.length)).endsWith(join('ml', 'gradient-descent.md')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a vault that is not there is said plainly', async () => {
  const t = by(notesTools({ allowWrites: true, vault: join(tmpdir(), 'no-such-vault-ayra') }))
  const r = await t.notes_search({})
  assert.equal(r.isError, true)
  assert.match(out(r), /is not there/)
})
