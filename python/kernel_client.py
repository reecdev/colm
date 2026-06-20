#!/usr/bin/env python3
import sys
import json
import traceback
import base64
from io import BytesIO

# Set matplotlib to headless backend
try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
except ImportError:
    plt = None

import builtins
_original_print = builtins.print

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

def _capture_display_obj(obj, images_list):
    """Try to extract image data from a displayable object. Returns True if captured."""
    # Try mimebundle first (handles all MIME types including GIF)
    mimebundle = getattr(obj, '_repr_mimebundle_', None)
    if mimebundle:
        try:
            bundle = mimebundle()
            if bundle:
                # _repr_mimebundle_ returns (data_dict, metadata_dict)
                data_dict = bundle[0] if isinstance(bundle, tuple) else bundle
                if data_dict:
                    for mime in ('image/png', 'image/jpeg', 'image/gif', 'image/webp'):
                        data = data_dict.get(mime)
                        if data:
                            if isinstance(data, bytes):
                                b64 = base64.b64encode(data).decode('utf-8')
                            else:
                                b64 = str(data)
                            images_list.append(f'data:{mime};base64,{b64}')
                            return True
        except Exception:
            pass

    # Fallback to individual methods
    for attr, mime in (('_repr_png_', 'image/png'), ('_repr_jpeg_', 'image/jpeg')):
        fn = getattr(obj, attr, None)
        if fn:
            try:
                data = fn()
                if data:
                    if isinstance(data, bytes):
                        b64 = base64.b64encode(data).decode('utf-8')
                    else:
                        b64 = str(data)
                    images_list.append(f'data:{mime};base64,{b64}')
                    return True
            except Exception:
                pass
    return False

class StreamingWriter:
    def __init__(self, stream_type='stdout'):
        self._stream_type = stream_type
        self._buffer = ''
        self._lines = []

    def write(self, text):
        self._buffer += text
        self._lines.append(text)
        while '\n' in self._buffer:
            line, self._buffer = self._buffer.split('\n', 1)
            if line:
                msg = json.dumps({"type": "stream", "text": line + "\n", "stream": self._stream_type})
                sys.__stdout__.write(msg + '\n')
                sys.__stdout__.flush()

    def flush(self):
        if self._buffer:
            msg = json.dumps({"type": "stream", "text": self._buffer, "stream": self._stream_type})
            sys.__stdout__.write(msg + '\n')
            sys.__stdout__.flush()
            self._buffer = ''
        sys.__stdout__.flush()

    def getvalue(self):
        return ''.join(self._lines)

    def isatty(self):
        return False

def execute_code(source):
    old_stdout = sys.stdout
    old_stderr = sys.stderr

    out_writer = StreamingWriter('stdout')
    err_writer = StreamingWriter('stderr')
    sys.stdout = out_writer
    sys.stderr = err_writer

    # Capture IPython display images via monkeypatched print
    display_images = []

    def _capture_print(*objs, **kwargs):
        text_objs = []
        captured_any = False
        for obj in objs:
            if _capture_display_obj(obj, display_images):
                captured_any = True
            else:
                text_objs.append(obj)
        if text_objs:
            _original_print(*text_objs, **kwargs)
        elif captured_any and not text_objs:
            # All objects were images, print nothing
            pass
        else:
            _original_print(*objs, **kwargs)

    builtins.print = _capture_print

    try:
        exec(source, namespace)
        error = False
    except KeyboardInterrupt:
        err_writer.write("KeyboardInterrupt\n")
        error = True
    except Exception:
        traceback.print_exc()
        error = True
    finally:
        sys.stdout.flush()
        sys.stderr.flush()
        sys.stdout = old_stdout
        sys.stderr = old_stderr
        builtins.print = _original_print

    images = capture_figures() + display_images
    output = err_writer.getvalue() if error else out_writer.getvalue()
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
