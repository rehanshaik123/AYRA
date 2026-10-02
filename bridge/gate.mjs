/**
 * The tool gate — what AYRA may run, decided ahead of time.
 *
 * Voice is a bad interface for a confirmation dialog: there is no window to
 * click and the model can't pause for one. So the bridge decides. This module
 * is that decision, kept apart from the server so it can be read in one place
 * and tested on its own (`npm test`).
 *
 * createGate() returns three things the bridge hands to the Agent SDK:
 *   decide(name)  — the canUseTool verdict for one tool name
 *   builtins      — the built-in Claude Code tools AYRA may see at all
 *   disallowed    — tools removed from the model's context entirely
 */

/**
 * Built-in Claude Code tools AYRA is given at all (the SDK's `tools` option).
 *
 * The bundled Claude Code otherwise hands the model every built-in it has —
 * thirty-odd on a desktop install, from Artifact and CronCreate to
 * RemoteTrigger and SendMessage. A voice assistant needs a handful; the rest
 * cost tokens on every turn and are one more thing the gate has to be right
 * about. ToolSearch stays because MCP tools load lazily behind it.
 */
const READ_TOOLS = ['Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'ToolSearch']
const WRITE_TOOLS = ['Bash', 'PowerShell', 'Write', 'Edit']

/**
 * Both spellings of every renamed built-in are listed on purpose. The SDK
 * presents several tools to the model under newer names — Task is Agent,
 * BashOutput is TaskOutput, KillShell is TaskStop, and the MCP resource tools
 * gained a "Tool" suffix — so a set holding only the old names never matches
 * and the tool falls through to the write branch, which is the opposite of
 * what these lists mean. Keep both until the old names are certainly gone.
 */
const READ_ONLY_BUILTINS = new Set([
  'Read', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'TodoWrite',
  'Task', 'Agent', 'ToolSearch',
  'ListMcpResources', 'ListMcpResourcesTool',
  'ReadMcpResource', 'ReadMcpResourceTool',
  'BashOutput', 'TaskOutput',
])
const WRITE_BUILTINS = new Set([
  'Bash', 'PowerShell', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit',
  'KillShell', 'TaskStop',
])

/** MCP tools arrive as `mcp__<server>__<tool>`. */
export const mcpServerOf = (toolName) =>
  toolName.startsWith('mcp__') ? toolName.split('__')[1] : null

/** The tool half, which can itself contain underscores: `mcp__x__a__b` -> `a__b`. */
export const mcpToolOf = (toolName) => toolName.split('__').slice(2).join('__')

/**
 * MCP policy, and why it is shaped this way.
 *
 * A short list of "servers that can change things" is the wrong default,
 * because it is a list of what we happened to think of. Every server not on it
 * runs unconditionally — and on a real machine that quietly includes placing a
 * phone call, spending an advertising budget, deleting a generated character
 * and writing files to disk. A voice assistant cannot ask "are you sure", so
 * the bridge has to be the one that is sure.
 *
 * So the default is deny, softened in two ways so the demo stays usable:
 *
 *   1. READ_ONLY_MCP is an explicit allowlist of servers whose whole surface is
 *      lookups and generation — search, registries, analytics reads. Anything
 *      there runs in read-only mode.
 *   2. Everywhere else, the tool has to argue for itself: its own name must
 *      begin with a read verb. `list_devices` runs; `install_apk` does not.
 *
 * On top of both sits a veto: a name containing a plainly effectful verb needs
 * writes enabled no matter which server it came from, which is what keeps
 * `make_outbound_call` and `download_lottie` still until you ask for them.
 */
const READ_ONLY_MCP = new Set([
  'exa', 'exa-code', 'serper', 'serpapi', 'lottie-search', 'mcp-registry',
  'openrouter', 'openrouter-image', 'Microsoft_Clarity',
  // The generation servers belong here too, and leaving them out was a real
  // regression: `generate_image` begins with no read verb, so it fell to the
  // deny branch and "generate an image of the Mark VII suit" — the headline
  // demo — stopped working in the default mode.
  //
  // Putting them on the allowlist is safe because the veto below still applies
  // to allowlisted servers: it is what continues to withhold
  // make_outbound_call, delete_character, create_* and edit_image. Generation
  // runs; acting on the world does not.
  'higgsfield', 'heygen', 'elevenlabs',
])

/**
 * Anchored on the tool name, so it reads the verb rather than the noun.
 * `screenshot` is in here because it is a read that doesn't sound like one,
 * and the persona is told in as many words to put screenshots on the display.
 */
const READ_VERB =
  /^(get|list|read|search|find|query|fetch|check|describe|inspect|show|view|explain|screenshot)/i

/**
 * Unanchored on purpose — `make_outbound_call` and `Bulk-Edit-Events` both
 * hide their verb in the middle. `download` is here because it writes a file
 * even though it sounds like a read.
 */
const EFFECTFUL_VERB =
  /(send|call|post|create|delete|remove|update|edit|write|install|launch|tap|swipe|press|type|buy|pay|charge|publish|deploy|outbound|download)/i

/**
 * Tools whose names trip the veto without deserving it.
 *
 * The veto reads verbs out of names, which is the right instinct and
 * occasionally the wrong answer. `openrouter send-message` sends a prompt to a
 * language model and gets text back — nothing in the world changes — but it is
 * indistinguishable by name from sending mail. Asking a second model a question
 * is one of the better things this assistant can do, so it is named here
 * instead of being lost to a regex.
 *
 * Full `server__tool` keys, so an exemption can never leak across servers.
 */
const VETO_EXEMPT = new Set([
  'openrouter__send-message',
  'openrouter__send-feedback',
])

/**
 * The owner's claude.ai connectors — Gmail, Calendar, Drive, Figma and the
 * rest, attached to their Claude account rather than configured here. The
 * bundled Claude Code loads every one into AYRA's sessions, settingSources or
 * not, named `mcp__claude_ai_<Name>__<tool>`.
 *
 * Only the connectors the owner lists (AYRA_CONNECTORS) are usable at all.
 * The rest are removed from the session outright, by name, and refused here
 * too in case one appears that was not known at startup.
 *
 * The allowed ones are READ-ONLY, writes enabled or not. Sending mail, moving
 * a calendar event or sharing a file on a spoken command, with nobody asked to
 * confirm, is exactly the failure this gate exists to prevent. They open up
 * once Approve/Deny confirmations exist (PLAN.md 3.3).
 */
export const CONNECTOR_PREFIX = 'claude_ai_'
export const DEFAULT_CONNECTORS = ['Gmail', 'Google Calendar', 'Google Drive']

/** "claude.ai Google Drive" -> "claude_ai_Google_Drive", the way Claude Code names it. */
export const connectorKey = (displayName) => displayName.replace(/[^A-Za-z0-9_-]/g, '_')

/** Reads that a connector's tool names begin with; `suggest_time` only computes. */
const CONNECTOR_READ = /^(get|list|search|read|suggest)/i

/**
 * @param {{ allowWrites: boolean, connectors?: string[], everConnected?: string[] }} options
 *   connectors    — connector names AYRA may read, e.g. ['Gmail', 'Google Calendar']
 *   everConnected — every connector on the account, as Claude Code lists them
 *                   ("claude.ai Figma"); the ones not allowed are removed
 */
export function createGate({ allowWrites, connectors = DEFAULT_CONNECTORS, everConnected = [] }) {
  const allowed = new Set(
    connectors.map((name) => connectorKey(`claude.ai ${name.trim()}`).toLowerCase()),
  )
  const excluded = everConnected
    .filter((name) => typeof name === 'string' && name.startsWith('claude.ai '))
    .filter((name) => !allowed.has(connectorKey(name).toLowerCase()))

  function decide(name) {
    if (READ_ONLY_BUILTINS.has(name)) return true
    if (WRITE_BUILTINS.has(name)) return allowWrites

    const server = mcpServerOf(name)
    if (server) {
      // The owner's account connectors: listed ones may read, nothing more.
      if (server.startsWith(CONNECTOR_PREFIX)) {
        if (!allowed.has(server.toLowerCase())) return false
        const op = mcpToolOf(name)
        return CONNECTOR_READ.test(op) && !EFFECTFUL_VERB.test(op)
      }

      // The HUD, and the interface controls beside it. Both run in this process
      // and draw on our own screen, so neither is something to withhold —
      // without them AYRA has no display at all. They also have to be named
      // here rather than left to the verb rules below, which read `ui_theme` as
      // a write and would hold the whole surface back behind writes.
      if (server === 'ayra' || server === 'ayra_ui') return true

      // The browser server gates itself, at construction: chromeServer() only
      // builds the acting tools — click, type, form input, close tab — when
      // writes are on, so anything that reaches here at all is something the
      // same policy has already permitted. Deciding it a second time by reading
      // verbs out of the name would only get it wrong: `chrome_navigate` begins
      // with no read verb and would fall to the write branch, which would
      // withhold the one tool the whole server is for.
      if (server === 'ayra_chrome') return true

      // The camera. Not withheld behind writes: looking changes nothing, and
      // the real gate is the browser's own camera permission plus an indicator
      // the user can see for as long as it is live.
      if (server === 'ayra_eyes') return true

      const tool = mcpToolOf(name)
      if (EFFECTFUL_VERB.test(tool) && !VETO_EXEMPT.has(`${server}__${tool}`)) {
        return allowWrites
      }
      // The session tools this bridge is developed inside count as read-only too.
      if (READ_ONLY_MCP.has(server) || server.startsWith('ccd_session')) return true
      return READ_VERB.test(tool) ? true : allowWrites
    }
    return allowWrites
  }

  return {
    decide,
    builtins: allowWrites ? [...READ_TOOLS, ...WRITE_TOOLS] : [...READ_TOOLS],
    disallowed: excluded.map((name) => `mcp__${connectorKey(name)}`),
    allowedConnectors: connectors.map((name) => name.trim()).filter(Boolean),
    excludedConnectors: excluded.map((name) => name.slice('claude.ai '.length)),
  }
}
