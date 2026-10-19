# Usage: assemble.py OUT TAG  -> joins @@<TAG>n@@ chunks from saved browser tool results, in order.
import json, glob, re, sys, os
out, tag = sys.argv[1], sys.argv[2]
parts = {}
for f in glob.glob('/root/.claude/projects/-home-claude*/8df62d66-f862-5026-9485-9aabd99f8442/tool-results/mcp-remote-devices-Claude_Browser__javascript_tool-*.txt'):
    try: raw = json.load(open(f))
    except Exception: continue
    t = raw[0].get('text', '')
    m = re.match(r'"@@' + tag + r'(\d+)@@', t)
    if not m: continue
    s = json.loads(t[:t.rindex('"') + 1])
    s = s[len(m.group(0)) - 1:]
    s = s.split('@@PAD')[0]
    i = int(m.group(1))
    if i not in parts or os.path.getmtime(f) > parts[i][0]: parts[i] = (os.path.getmtime(f), s)
keys = sorted(parts)
assert keys == list(range(len(keys))), keys
open(out, 'w').write(''.join(parts[k][1] for k in keys))
print(out, len(keys), 'chunks', sum(len(parts[k][1]) for k in keys), 'chars')
