#!/usr/bin/env python3
import sys
import json
import traceback
import base64
from io import StringIO, BytesIO

# Set matplotlib to headless backend
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
except ImportError:
    plt = None

namespace = {}

def capture_figures():
    if plt is None:
        return []
    figs = [plt.figure(n) for n in plt.get_fignums()]
    if not figs:
        return []
    images = []
    for fig in figs:
        buf = BytesIO()
        fig.savefig(buf, format='png', bbox_inches='tight', dpi=100)
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode('utf-8')
        images.append(b64)
        plt.close(fig)
    return images

def execute_code(source):
    old_stdout = sys.stdout
    old_stderr = sys.stderr

    out = StringIO()
    err = StringIO()
    sys.stdout = out
    sys.stderr = err

    try:
        exec(source, namespace)
        error = False
    except KeyboardInterrupt:
        err.write("KeyboardInterrupt\n")
        error = True
    except Exception:
        traceback.print_exc()
        error = True
    finally:
        sys.stdout = old_stdout
        sys.stderr = old_stderr

    images = capture_figures()
    output = err.getvalue() if error else out.getvalue()
    if error and not output:
        output = "Execution interrupted"

    return {
        "output": output,
        "error": error,
        "images": images,
    }

def main():
    while True:
        try:
            line = sys.stdin.readline()
        except KeyboardInterrupt:
            continue
        if not line:
            break

        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue

        if msg.get("type") == "execute":
            source = msg.get("code", "")
            result = execute_code(source)
            reply = {
                "type": "result",
                "output": result["output"],
                "error": result["error"],
                "images": result.get("images", []),
            }
            sys.stdout.write(json.dumps(reply) + "\n")
            sys.stdout.flush()

if __name__ == "__main__":
    main()
