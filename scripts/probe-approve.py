"""Live probe: does the adapter ask for permission in the mode Goose maps Approve to,
and what does the session/request_permission payload look like?

usage: probe-approve.py <modeId> <cmd...>
Sends initialize, session/new, session/set_mode, session/prompt; answers the first
session/request_permission with reject_once; prints every permission request verbatim.
"""

import json
import os
import select
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
mode_id = sys.argv[1]
cmd = sys.argv[2:]
env = dict(os.environ)
env.pop("CLAUDECODE", None)
p = subprocess.Popen(
    cmd,
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    env=env,
    cwd=HERE,
    text=True,
)


def send(o):
    p.stdin.write(json.dumps(o) + "\n")
    p.stdin.flush()


send({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": 1, "clientCapabilities": {"fs": {"readTextFile": False, "writeTextFile": False}, "terminal": False}}})
send({"jsonrpc": "2.0", "id": 2, "method": "session/new", "params": {"cwd": HERE, "mcpServers": []}})

session_id = None
stage = "init"
deadline = time.time() + 180
answered = 0
while time.time() < deadline:
    r, _, _ = select.select([p.stdout], [], [], 1)
    if not r:
        continue
    line = p.stdout.readline()
    if not line:
        break
    try:
        o = json.loads(line)
    except Exception:
        print("RAW", line.strip()[:200])
        continue

    if o.get("id") == 2 and "result" in o:
        session_id = o["result"]["sessionId"]
        print("SESSION", session_id, "modes:", json.dumps(o["result"].get("modes"))[:200])
        send({"jsonrpc": "2.0", "id": 3, "method": "session/set_mode", "params": {"sessionId": session_id, "modeId": mode_id}})
    elif o.get("id") == 3:
        print("SET_MODE RESULT", json.dumps(o)[:300])
        send({"jsonrpc": "2.0", "id": 4, "method": "session/prompt", "params": {"sessionId": session_id, "prompt": [{"type": "text", "text": "Create a file named probe-write.txt in the current directory containing the single line HELLO. Use your file-write tool. Do not ask me anything first."}]}})
        stage = "prompting"
    elif o.get("id") == 4:
        print("PROMPT RESULT", json.dumps(o)[:400])
        break
    elif o.get("method") == "session/request_permission":
        answered += 1
        print("PERMISSION REQUEST >>>")
        print(json.dumps(o["params"], indent=1)[:3000])
        opts = o["params"]["options"]
        reject = next((x for x in opts if x["kind"] == "reject_once"), opts[-1])
        send({"jsonrpc": "2.0", "id": o["id"], "result": {"outcome": {"outcome": "selected", "optionId": reject["optionId"]}}})
        print("<<< answered reject_once:", reject["optionId"])
    elif o.get("method") == "session/update":
        u = o["params"].get("update", {})
        kind = u.get("sessionUpdate")
        if kind in ("agent_message_chunk", "agent_thought_chunk"):
            continue
        print("UPDATE", kind, json.dumps(u)[:300])
    elif "method" in o and o.get("id") is not None:
        print("AGENT->CLIENT REQ", o["method"], json.dumps(o.get("params"))[:300])
        send({"jsonrpc": "2.0", "id": o["id"], "result": {}})
    else:
        print("OTHER", json.dumps(o)[:250])

print("permission requests seen:", answered, "stage:", stage)
p.kill()
print("STDERR:", p.stderr.read()[-1200:])
