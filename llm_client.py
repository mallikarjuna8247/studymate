
import json
import time
import urllib.request

OLLAMA_URL = "http://localhost:11434"

def complete(messages, model="qwen3:8b", temperature=0.2):
    start = time.time()

    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "options": {
            "temperature": temperature
        }
    }

    data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=300) as response:
        result = json.loads(response.read().decode("utf-8"))

    return {
        "text": result["message"]["content"],
        "prompt_tokens": result.get("prompt_eval_count", 0),
        "completion_tokens": result.get("eval_count", 0),
        "total_tokens": (
            result.get("prompt_eval_count", 0)
            + result.get("eval_count", 0)
        ),
        "latency_seconds": round(time.time() - start, 2),
    }
