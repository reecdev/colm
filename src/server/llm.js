const SYSTEM_PROMPT = `You are an AI assistant embedded in a Jupyter notebook web UI called CoLM.
You have tools to interact with the notebook environment.

CAPABILITIES:
- Create notebook cells, then execute them with run_cell to see results
- Edit and delete notebook cells
- Browse and read files on the server filesystem
- Answer questions about code, data, and general topics
- Use get_cells to see all cells including their content, type, id, and output
- Workflow: create_cell → run_cell(cellId) → output is returned to you — share it with the user

NOTEBOOK TIPS:
- The environment is similar to Google Colab, but you should use % instead of !
- To display images, use IPython.display: from IPython.display import display, Image
- For matplotlib, always call plt.show() to render plots
- Use print() for text output — it will be captured and returned
- The kernel namespace persists across cell executions, so variables and imports carry over
- Reuse existing cells if applicable, cells you previously made can be executed or deleted at any time
- Delete temporary cells such as tests in the final notebook if you don't need them for the final product

RULES:
- Prefer pandas, matplotlib, numpy for data work
- Keep explanations clear and concise. Never use tables in your responses.
- If you get an error, try to fix it and re-run
- NEVER write code in your chat responses. Only use create_cell to put code in the notebook, then run_cell to execute it.
- When asked to edit, refactor, or optimize existing code, use edit_cell (don't create a new cell).
- **Reuse cells whenever possible.** If a cell already exists with similar code, edit and re-run it instead of creating a brand new cell. The notebook should stay clean and not grow unnecessarily.
- Your chat messages should contain only natural language explanations, analysis, and answers.
- Never use tables in your responses. Use bullet points or plain text instead.`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'run_cell',
      description: 'Execute a notebook cell by ID. Returns the output (stdout/stderr/error/images).',
      parameters: {
        type: 'object',
        properties: {
          cellId: { type: 'string', description: 'The ID of the cell to execute (must already exist)' },
        },
        required: ['cellId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_cell',
      description: 'Create a new cell in the notebook.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['code', 'markdown'], description: 'Cell type' },
          content: { type: 'string', description: 'Cell content' },
          index: { type: 'integer', description: 'Position to insert at (default: end)' },
        },
        required: ['type', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_cell',
      description: 'Replace the content of an existing cell by ID.',
      parameters: {
        type: 'object',
        properties: {
          cellId: { type: 'string', description: 'The cell ID to edit' },
          content: { type: 'string', description: 'New cell content' },
        },
        required: ['cellId', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_cell',
      description: 'Delete a cell by ID.',
      parameters: {
        type: 'object',
        properties: {
          cellId: { type: 'string', description: 'The cell ID to delete' },
        },
        required: ['cellId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and directories at a given path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path (default: ".")' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read the contents of a file at a given path.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to read' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_cells',
      description: 'Get all current notebook cells with their IDs, types, content, and output.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];

function buildMessages(userText, history) {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];
  for (const msg of history) {
    messages.push({ role: msg.role, content: msg.content });
  }
  messages.push({ role: 'user', content: userText });
  return messages;
}

async function apiPost(body, sendStatus, signal) {
  const url = `${body.baseUrl}/chat/completions`;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${body.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body.payload),
      signal,
    });

    if (response.ok) return response;

    if (response.status === 429) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      let seconds = 5;
      const retryAfterHeader = response.headers.get('Retry-After');
      if (retryAfterHeader) {
        seconds = parseInt(retryAfterHeader);
        if (isNaN(seconds)) seconds = 5;
      } else {
        try {
          const errBody = await response.json();
          if (errBody?.error?.retry_after) seconds = parseInt(errBody.error.retry_after) || 5;
        } catch {}
      }
      seconds = Math.max(seconds, 1);

      if (sendStatus) sendStatus(`Throttled, resuming in ${seconds}s`);

      // Countdown sleep that respects abort signal
      for (let remaining = seconds; remaining > 0; remaining--) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, 1000);
          if (signal) {
            signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('Aborted', 'AbortError'));
            }, { once: true });
          }
        });
        if (remaining > 1 && sendStatus) {
          sendStatus(`Throttled, resuming in ${remaining - 1}s`);
        }
      }

      if (sendStatus) sendStatus('');
      continue;
    }

    const text = await response.text();
    throw new Error(`API error ${response.status} from ${url}: ${text}`);
  }

  throw new Error(`API rate limited after 3 retries from ${url}`);
}

async function* streamTokens(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const token = parsed.choices?.[0]?.delta?.content || '';
        if (token) yield token;
      } catch {
        // skip malformed chunks
      }
    }
  }
}

async function* streamChat(userText, history, model, apiKey, executeTool, baseUrl, sendStatus, signal) {
  const messages = buildMessages(userText, history);
  let currentMessages = [...messages];
  const maxRounds = 10;

  // Phase 1: non-streaming tool-calling rounds
  for (let round = 0; round < maxRounds; round++) {
    let response;
    try {
      response = await apiPost({
        apiKey,
        baseUrl,
        payload: {
          model: model || 'openrouter/free',
          messages: currentMessages,
          stream: false,
          max_tokens: 4096,
          tools: TOOLS,
          tool_choice: 'auto',
        },
      }, sendStatus, signal);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      // If tool calling fails, fall back to plain streaming
      if (round === 0) {
        const fallback = await apiPost({
          apiKey,
          baseUrl,
          payload: {
            model: model || 'openrouter/free',
            messages: currentMessages,
            stream: true,
            max_tokens: 4096,
          },
        }, sendStatus, signal);
        yield* streamTokens(fallback);
        return;
      }
      throw err;
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (!choice) throw new Error('No choices in API response');

    const finishReason = choice.finish_reason;
    const message = choice.message || {};

    if (finishReason === 'tool_calls' && message.tool_calls) {
      currentMessages.push({
        role: 'assistant',
        content: message.content || null,
        tool_calls: message.tool_calls,
      });

      for (const toolCall of message.tool_calls) {
        let args;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          try {
            args = JSON.parse(
              toolCall.function.arguments.replace(/'/g, '"').replace(/(\w+):/g, '"$1":')
            );
          } catch {
            args = {};
          }
        }

        let result;
        try {
          result = await executeTool(toolCall.function.name, args);
        } catch (err) {
          result = { error: err.message };
        }

        currentMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }
    } else {
      // Text response — no tool calls. Stream this as the final answer.
      const assistantText = message.content || '';

      // Re-request with streaming to deliver tokens
      const streamResponse = await apiPost({
        apiKey,
        baseUrl,
        payload: {
          model: model || 'openrouter/free',
          messages: currentMessages,
          stream: true,
          max_tokens: 4096,
        },
      }, sendStatus, signal);
      yield* streamTokens(streamResponse);
      return;
    }
  }

  // Fallback if max rounds reached: stream whatever we have
  const streamResponse = await apiPost({
    apiKey,
    baseUrl,
    payload: {
      model: model || 'openrouter/free',
      messages: currentMessages,
      stream: true,
      max_tokens: 4096,
    },
  }, sendStatus, signal);
  yield* streamTokens(streamResponse);
}

module.exports = { streamChat };
