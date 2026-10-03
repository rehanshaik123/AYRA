/**
 * The tool gate — what AYRA may run, decided ahead of time.
 *
 * Voice is a bad interface for a confirmation dialog: there is no window to
 * click and the model can't pause for one. So the bridge decides. This module
 * is that decision, kept apart from the server so it can be read in one place
 * and tested on its own (`npm test`).
 *
 * createGate() returns what the bridge hands to the Agent SDK:
 *   decide(name)         — may this tool run at all
 *   review(name, input)  — and this particular call: allow, deny, or ask the owner
 *   builtins             — the built-in Claude Code tools AYRA may see at all
 *   disallowed           — tools removed from the model's context entirely
 */

/**
 * What AYRA asks the owner about first. The owner gave her the whole laptop
 * (2026-10-03, answer "a") with exactly these four exceptions; everything else
 * she just does. The words are what the owner sees on the Approve card.
 */
export const ASK = {
  money: 'spends money',
  send: 'sends or posts something as you',
  delete: 'deletes something for good',
  security: 'touches passwords or security settings',
}

/** A command token: at the start, or after a separator, and ending at one. */
const cmd = (names) =>
  new RegExp(`(?:^|[\\s;|&({])(?:${names})(?=$|[\\s;|&)}])`, 'i')

/**
 * Shell commands that need the owner's yes, by what they do. Rules, not a
 * model: they run in microseconds, so ordinary commands cost no lag at all.
 * Moving a file to the Recycle Bin is not on the list — it can be undone.
 */
const COMMAND_RULES = [
  [ASK.delete, cmd('remove-item|ri|rm|rmdir|rd|del|erase|clear-recyclebin|clear-disk|remove-partition|format-volume|initialize-disk|diskpart|sdelete')],
  [ASK.delete, /(?:^|[\s;|&(])format(?:\.com)?\s+[a-z]:/i],
  [ASK.delete, /cipher(?:\.exe)?\s+\/w/i],
  [ASK.security, /(?:set|add|remove)-mppreference|netsh(?:\.exe)?\s+(?:adv)?firewall|(?:set|new|remove|disable|enable)-netfirewall|set-executionpolicy|bcdedit|manage-bde|(?:enable|disable|suspend)-bitlocker|cmdkey|vaultcmd|takeown|icacls|set-acl/i],
  [ASK.security, /net(?:\.exe)?\s+(?:user|localgroup|accounts)|(?:set|new|remove|enable|disable|rename)-localuser|(?:add|remove)-localgroupmember/i],
  [ASK.security, /reg(?:\.exe)?\s+(?:add|delete|import|restore)|(?:set|new|remove)-itemproperty\s[^;|]*hk(?:lm|cu|ey)|certutil(?:\.exe)?\s+-(?:add|del)/i],
  [ASK.security, /(?:set|stop)-service\s[^;|]*(?:windefend|wscsvc|mpssvc|wuauserv)/i],
  [ASK.send, /send-mailmessage|invoke-(?:webrequest|restmethod)\b[^;|]*-method\s+['"]?(?:post|put|patch|delete)/i],
  [ASK.send, /(?:^|[\s;|&(])(?:curl|curl\.exe|wget)\b[^;|]*(?:-x\s*['"]?(?:post|put|patch)|--data|--form|\s-d\s|\s-f\s)/i],
]

/** Why a shell command needs the owner's yes, or null. */
export function riskOfCommand(command) {
  const text = String(command ?? '')
  for (const [reason, re] of COMMAND_RULES) if (re.test(text)) return reason
  return null
}

/**
 * Files AYRA may not write without asking: the system, programs, start-up
 * entries and keys. Everything in the owner's own folders is hers to use.
 */
const PROTECTED_PATH =
  /^(?:[a-z]:)?[\\/](?:windows|program files(?: \(x86\))?|programdata)(?:[\\/]|$)|[\\/]\.(?:ssh|gnupg|aws)[\\/]|[\\/]start menu[\\/]programs[\\/]startup[\\/]|[\\/]drivers[\\/]etc[\\/]hosts$/i

/** Why writing this file needs the owner's yes, or null. */
export function riskOfPath(path) {
  return PROTECTED_PATH.test(String(path ?? '')) ? ASK.security : null
}

/** Button and link words, by what pressing them does. */
const MONEY = /\b(?:buy|pay|purchase|checkout|check out|place (?:your )?order|order now|confirm (?:order|payment|purchase)|subscribe|upgrade|donate|transfer|send money|book now|reserve|rent now|add funds|top up)\b/i
const DELETE = /\b(?:delete|remove|trash|discard|erase|deactivate|close (?:my )?account|wipe|empty (?:bin|trash))\b/i
const SEND = /\b(?:send|post|publish|tweet|reply|comment|share|submit|apply|message|invite|connect|upload)\b/i
/** Pages where any action is a security change. */
const SECURITY_PAGE = /accounts\.google\.com|myaccount\.google\.com\/(?:security|signinoptions)|\/(?:security|password|passwords|2fa|two-factor|mfa)(?:[/?#]|$)|^chrome:\/\/(?:settings|password)/i

/**
 * Why an action on a web page or app window needs the owner's yes, or null.
 *
 * @param {{ action: 'click'|'type'|'enter', label?: string, url?: string,
 *           field?: 'password'|'search'|'text'|'' }} what
 *   label — the visible name of the button, link or field
 *   field — what kind of box the action is in
 */
export function riskOfPageAction({ action, label = '', url = '', field = '' }) {
  if (action === 'type' && field === 'password') return ASK.security
  if (SECURITY_PAGE.test(url)) return ASK.security
  if (action === 'click') {
    if (MONEY.test(label)) return ASK.money
    if (DELETE.test(label)) return ASK.delete
    if (SEND.test(label)) return ASK.send
  }
  // Enter in a message box sends the message. In a search box it searches.
  if (action === 'enter' && field !== 'search') return ASK.send
  return null
}

/**
 * Built-in Claude Code tools AYRA is given at all (the SDK's `tools` option).
 *
 * The bundled Claude Code otherwise hands the model every built-in it has —
 * thirty-odd on a desktop install, from Artifact and CronCreate to
 * RemoteTrigger and SendMessage. A voice assistant needs a handful; the rest
 * cost tokens on every turn and are one more thing the gate has to be right
 * about. ToolSearch stays because MCP tools load lazily behind it.
 *
 * Web only unless `laptop` is set: then the laptop's files too, and with writes
 * the shell and file edits — each call reviewed against the ask-first list.
 */
const READ_TOOLS = ['WebFetch', 'WebSearch', 'ToolSearch']
/** The laptop's files, to read and search. */
const FILE_TOOLS = ['Read', 'Glob', 'Grep']
/** PowerShell rather than Bash: the laptop is Windows, and it is the native shell. */
const WRITE_TOOLS = ['PowerShell', 'Write', 'Edit']

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
 * @param {{ allowWrites: boolean, laptop?: boolean, connectors?: string[], everConnected?: string[] }} options
 *   laptop        — AYRA may use the laptop's files (and, with writes, its shell)
 *   connectors    — connector names AYRA may read, e.g. ['Gmail', 'Google Calendar']
 *   everConnected — every connector on the account, as Claude Code lists them
 *                   ("claude.ai Figma"); the ones not allowed are removed
 */
export function createGate({ allowWrites, laptop = false, connectors = DEFAULT_CONNECTORS, everConnected = [] }) {
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

      // The HUD. It runs in this process and draws on our own screen, so it is
      // not something to withhold — without it AYRA has no display at all. It
      // is named here rather than left to the verb rules below, which would
      // read `display` and `blade` as neither a read nor a write.
      if (server === 'ayra') return true

      // Her Chrome (browser.mjs). It gates itself, twice over: without writes
      // only the reading tools are built, and every click, submit and Enter is
      // checked against the ask-first list with the element's real label —
      // which only the tool can see, so the asking happens there.
      if (server === 'ayra_browser') return true

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

  /**
   * One particular call: 'allow', 'deny', or 'ask' with the reason and what
   * exactly would happen, for the owner's Approve card.
   */
  function review(name, input = {}) {
    if (!decide(name)) return { verdict: 'deny' }
    let reason = null
    let detail = ''
    if (name === 'PowerShell' || name === 'Bash') {
      detail = String(input?.command ?? '')
      reason = riskOfCommand(detail)
    } else if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(name)) {
      detail = String(input?.file_path ?? input?.notebook_path ?? '')
      reason = riskOfPath(detail)
    }
    return reason ? { verdict: 'ask', reason, detail } : { verdict: 'allow' }
  }

  return {
    decide,
    review,
    builtins: [
      ...READ_TOOLS,
      ...(laptop ? FILE_TOOLS : []),
      ...(allowWrites ? WRITE_TOOLS : []),
    ],
    disallowed: excluded.map((name) => `mcp__${connectorKey(name)}`),
    allowedConnectors: connectors.map((name) => name.trim()).filter(Boolean),
    excludedConnectors: excluded.map((name) => name.slice('claude.ai '.length)),
  }
}
