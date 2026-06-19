# CoLM
A Colab-like notebook UI with a built-in AI agent that creates, edits, and runs cells for you.
Meant for use with Google Colab and other sandboxed platforms.


<img width="640" height="360" alt="output" src="https://github.com/user-attachments/assets/1a7ce7d8-6880-4b18-89a5-47d67d360b43" />

## Basic Usage with Google Colab
To set up, ensure you have an NGROK token and that you have set all of your API keys in Colab secrets
Then, simply import the colab.ipynb notebook into Google Colab or your platform of choice and hit the Run All button.
You'll be provided with links in the final cell. To open the CoLM UI, **click on the link after the text that says "CoLM is running at:"**
If HTTPS does not work, try to load the link via HTTP instead of HTTPS.

**Do not share your CoLM instance links with anyone no matter what, as it can give them full access to your notebook and allow them to steal API keys or important credentials.**

## Models
CoLM supports a varity of models from your favorite providers such as OpenRouter, OpenAI, Anthropic, Google, GLM, Groq, OpenCode Zen, and HuggingFace.

My personal reccomendation is Gemini 3.1 Flash-Lite as it is extremely fast, cheap, and intelligent enough to operate a full Jupyter notebook entirely on it's own without any issues.
Gemini 3.1 Flash-Lite is also available on the free-tier of the Gemini API. I personally use Flash-Lite on the free tier.
