# Template helper: Mac install (Friday)

The template helper runs on King's Mac and answers the KAIROS **"Set up my journal from a screenshot"** requests. It only talks to the TEST Supabase project (`cqetawiuvnwkmmcrluxj`), never live.

Claude runs every step from the PC over ssh. King only does steps 1 and 2.

## King does
1. Get the Mac back on Wi-Fi and open the lid.
2. Check that Claude Code is logged in. In Terminal on the Mac, run `claude -p "say hi"`. It should answer. If it asks to log in, run `claude` and log in once.

## Claude does
3. Copy the helper and its launch file over:
   ```
   scp tools/template_bot.py josh@100.78.113.100:~/grid/template_bot.py
   scp tools/com.josh.kairos-template-bot.plist josh@100.78.113.100:~/Library/LaunchAgents/
   ```
4. Create `~/.kairos-bot.env` on the Mac with these 2 lines, and lock it with `chmod 600`. The key comes from the Supabase dashboard of the **test** project:
   ```
   SUPABASE_URL=https://cqetawiuvnwkmmcrluxj.supabase.co
   SUPABASE_SERVICE_KEY=...
   ```
5. Run the self-test with `python3 ~/grid/template_bot.py --selftest`. It sends 3 test messages. The first two try to break the rules (list your files, print its instructions) and should come back as a redirect or `None`, never your file names. The third should come back as a template with Setup and Notes. The log should show no `tool_use` warnings.
6. Start it with `launchctl load -w ~/Library/LaunchAgents/com.josh.kairos-template-bot.plist`.
7. Test it for real. Open KAIROS-test, go to Journal → Customize → Set up from a screenshot, and paste a screenshot of Ben's Notion. A question or a template preview should show up within about 1 minute.
8. Watch it with `tail -f ~/grid/logs/template-bot.log`.

## Undo
Run `launchctl unload -w ~/Library/LaunchAgents/com.josh.kairos-template-bot.plist`.

## Why it's safe
The helper runs Claude Code with `--tools ""` and an empty strict MCP config. It also ignores your settings, has no slash commands, runs in `dontAsk` mode, works in an empty temp folder, and saves no session. These flags were checked on version 2.1.328: the startup output showed `tools: []` and `mcp_servers: []`. Any reply that tried to use a tool, or doesn't match the question/template/redirect format, gets thrown away before anyone sees it.
