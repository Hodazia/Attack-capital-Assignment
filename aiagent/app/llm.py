# app/llm.py
import os
import openai
from dotenv import load_dotenv

load_dotenv()
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
openai.api_key = OPENAI_API_KEY

def generate_call_summary(conversation_text: str, max_tokens: int = 256) -> str:
    """
    Generate a short summary of the conversation using OpenAI chat completion.
    conversation_text should be a plain text transcript or concatenated messages.
    """
    prompt = [
        {"role": "system", "content": "You are a concise call summarizer. Produce a short bulleted summary, key action items and a one-line subject."},
        {"role": "user", "content": f"Here is the conversation transcript:\n\n{conversation_text}\n\nProduce a summary, key actions, and important details."}
    ]

    resp = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=prompt,
        max_tokens=max_tokens,
        temperature=0.2,
    )
    content = resp["choices"][0]["message"]["content"].strip()
    return content
