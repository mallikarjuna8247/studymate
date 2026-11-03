from llm_client import complete

messages = [
    {"role": "system", "content": "You are a concise Python tutor."},
    {"role": "user", "content": "Explain tokens and context windows in 3 bullet points."}
]

result = complete(messages)

print(result["text"])
print("\n--- Usage ---")
print(f"Prompt tokens: {result['prompt_tokens']}")
print(f"Completion tokens: {result['completion_tokens']}")
print(f"Total tokens: {result['total_tokens']}")
print(f"Latency: {result['latency_seconds']}s")