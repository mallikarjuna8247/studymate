
import json
import os
import time
import urllib.request
from pathlib import Path
from urllib.error import HTTPError, URLError

from dotenv import load_dotenv

# Load the project's .env file explicitly.
PROJECT_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=PROJECT_DIR / ".env")

LLM_PROVIDER = os.getenv(
    "STUDYMATE_LLM_PROVIDER", "ollama"
).strip().lower()

# Groq configuration
GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = os.getenv(
    "GROQ_MODEL", "openai/gpt-oss-20b"
)

# Gemini configuration
GEMINI_MODEL = os.getenv(
    "GEMINI_MODEL", "gemini-3.8-flash"
)

_gemini_client = None

# Ollama configuration
OLLAMA_URL = os.getenv(
    "OLLAMA_URL", "http://localhost:11434"
)
OLLAMA_MODEL = os.getenv(
    "OLLAMA_MODEL", "qwen3:8b"
)


def _complete_with_groq(messages, model, temperature):
    api_key = os.getenv("GROQ_API_KEY")

    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is missing. "
            "Configure it in the backend .env file."
        )

    payload = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "stream": False,
    }

    data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(
        GROQ_API_URL,
        data=data,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
            "User-Agent": "StudyMate/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.loads(
                response.read().decode("utf-8")
            )

    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Groq API returned HTTP {exc.code}: {error_body}"
        ) from exc

    except URLError as exc:
        raise RuntimeError(
            f"Could not connect to Groq API: {exc.reason}"
        ) from exc

    choices = result.get("choices", [])

    if not choices:
        raise RuntimeError(
            "Groq API returned no completion choices."
        )

    usage = result.get("usage") or {}

    message = choices[0].get("message") or {}

    return {
        "text": message.get("content") or "",
        "prompt_tokens": usage.get("prompt_tokens", 0) or 0,
        "completion_tokens": usage.get("completion_tokens", 0) or 0,
        "total_tokens": usage.get("total_tokens", 0) or 0,
    }


def _get_gemini_client():
    global _gemini_client

    if _gemini_client is None:
        api_key = os.getenv("GEMINI_API_KEY")

        if not api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is missing. "
                "Configure it in the backend .env file."
            )

        from google import genai

        _gemini_client = genai.Client(api_key=api_key)

    return _gemini_client


def _complete_with_gemini(messages, model, temperature):
    from google.genai import types

    client = _get_gemini_client()

    system_messages = []
    conversation = []

    for message in messages:
        role = message.get("role", "user")
        content = str(message.get("content", ""))

        if role == "system":
            system_messages.append(content)
        elif role == "assistant":
            conversation.append(f"Assistant:\n{content}")
        else:
            conversation.append(f"User:\n{content}")

    system_instruction = "\n\n".join(system_messages)

    response = client.models.generate_content(
        model=model,
        contents="\n\n".join(conversation),
        config=types.GenerateContentConfig(
            system_instruction=system_instruction or None,
            temperature=temperature,
        ),
    )

    usage = getattr(response, "usage_metadata", None)

    prompt_tokens = getattr(usage, "prompt_token_count", 0) or 0
    completion_tokens = getattr(usage, "candidates_token_count", 0) or 0
    total_tokens = getattr(usage, "total_token_count", 0) or (
        prompt_tokens + completion_tokens
    )

    return {
        "text": response.text or "",
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": total_tokens,
    }


def _complete_with_ollama(messages, model, temperature):
    payload = {
        "model": model,
        "messages": messages,
        "stream": False,
        "think": False,
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
        result = json.loads(
            response.read().decode("utf-8")
        )

    prompt_tokens = result.get("prompt_eval_count", 0)
    completion_tokens = result.get("eval_count", 0)

    return {
        "text": result["message"]["content"],
        "prompt_tokens": prompt_tokens,
        "completion_tokens": completion_tokens,
        "total_tokens": prompt_tokens + completion_tokens,
    }


def complete(messages, model=None, temperature=0.2):
    start = time.time()

    if LLM_PROVIDER == "groq":
        result = _complete_with_groq(
            messages,
            model or GROQ_MODEL,
            temperature,
        )

    elif LLM_PROVIDER == "gemini":
        result = _complete_with_gemini(
            messages,
            model or GEMINI_MODEL,
            temperature,
        )

    elif LLM_PROVIDER == "ollama":
        result = _complete_with_ollama(
            messages,
            model or OLLAMA_MODEL,
            temperature,
        )

    else:
        raise ValueError(
            f"Unsupported STUDYMATE_LLM_PROVIDER: {LLM_PROVIDER}. "
            "Supported providers: groq, gemini, ollama."
        )

    result["latency_seconds"] = round(
        time.time() - start, 2
    )

    return result
