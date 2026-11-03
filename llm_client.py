# llm_client.py
import os
import time
from openai import OpenAI

client = OpenAI()

def complete(messages, model="gpt-4o-mini", temperature=0.2):
    start = time.time()
    response = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
    )
    return {
        "text": response.choices[0].message.content,
        "prompt_tokens": response.usage.prompt_tokens,
        "completion_tokens": response.usage.completion_tokens,
        "total_tokens": response.usage.total_tokens,
        "latency_seconds": round(time.time() - start, 2),
    }