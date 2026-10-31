"""One-call key check. Costs a fraction of a cent and burns no exam credits."""

import os
import sys

from dotenv import load_dotenv

load_dotenv("F:/Recalloop/.env")

from app.llm import client_from_env  # noqa: E402  (after load_dotenv)

provider = os.getenv("LLM_PROVIDER", "deepseek")
client = client_from_env(provider)
reply = client.complete(
    [{"role": "user", "content": 'Reply with JSON only: {"ok": true}'}],
    effort="minimal",
)
print(f"provider: {provider}")
print(f"reply:    {reply.text.strip()[:200]}")
print(f"tokens:   {reply.output_tokens}")
if "ok" not in reply.text.lower():
    sys.exit("Unexpected reply - check the model id and account credits.")
print("key works")
