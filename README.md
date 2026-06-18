# CoLM
A Colab-like notebook UI with a built-in AI agent that creates, edits, and runs cells for you. Uses OpenRouter for the brain, CodeMirror 6 for editing, and a Python child process for execution.
How it works: Type a question in the sidebar, the agent thinks, creates code cells in the notebook, runs them, and shows you the results all without leaving the page.
- Agent has tools: create_cell, edit_cell, delete_cell, run_cell, get_cells, list_files, read_file
- Code runs in a persistent Python kernel (matplotlib works, prints captured)
- 4 themes: Light, Dark, Midnight, Catppuccin
- Import/export .ipynb files
- Kernel interrupt/restart
- File browser sidebar
- Runs in Google Colab via ngrok (see colab.ipynb)
To run: npm install && npm run build && node bin/cli.js. Needs OPENROUTER_API_KEY in env.

# Running inside Colab
See colab.ipynb.
