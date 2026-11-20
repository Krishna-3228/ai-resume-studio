import logging
import os
from typing import Any
from dotenv import load_dotenv
from langchain_core.language_models.chat_models import BaseChatModel

# Load environment variables from .env if present
load_dotenv()

logger = logging.getLogger(__name__)


def detect_provider() -> tuple[str | None, str | None, str | None]:
    """
    Detect the active LLM provider, default model, and API key based on environment.
    Returns (provider, default_model, api_key).
    """
    provider = os.getenv("LLM_PROVIDER", "").lower().strip()
    model = os.getenv("LLM_MODEL", "").strip() or None

    # Explicit provider specified
    if provider:
        if provider in ("google", "gemini", "google_genai"):
            key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or os.getenv("LLM_API_KEY")
            target_model = model or "gemini-3.8-flash"
            if target_model in ("gemini-2.0-flash", "gemini-2.0-flash-exp"):
                target_model = "gemini-3.8-flash"
            return "google", target_model, key
        if provider == "openai":
            key = os.getenv("OPENAI_API_KEY") or os.getenv("LLM_API_KEY")
            return "openai", model or "gpt-4o", key
        if provider == "anthropic":
            key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("LLM_API_KEY")
            return "anthropic", model or "claude-3-5-sonnet-latest", key
        if provider == "groq":
            key = os.getenv("GROQ_API_KEY") or os.getenv("LLM_API_KEY")
            return "groq", model or "openai/gpt-oss-120b", key
        if provider in ("ollama", "local", "custom"):
            key = os.getenv("LLM_API_KEY") or "ollama"
            return "ollama", model or "llama3.2", key

    # Auto-detect based on available API keys
    gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if gemini_key:
        target_model = model or "gemini-3.8-flash"
        if target_model in ("gemini-2.0-flash", "gemini-2.0-flash-exp"):
            target_model = "gemini-3.8-flash"
        return "google", target_model, gemini_key

    openai_key = os.getenv("OPENAI_API_KEY")
    if openai_key:
        return "openai", model or "gpt-4o", openai_key

    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    if anthropic_key:
        return "anthropic", model or "claude-3-5-sonnet-latest", anthropic_key

    groq_key = os.getenv("GROQ_API_KEY")
    if groq_key:
        return "groq", model or "openai/gpt-oss-120b", groq_key

    base_url = os.getenv("LLM_BASE_URL") or os.getenv("OPENAI_BASE_URL") or os.getenv("OLLAMA_BASE_URL")
    if base_url:
        return "ollama", model or "llama3.2", os.getenv("LLM_API_KEY") or "local"

    return None, None, None


def get_llm_status() -> dict[str, Any]:
    """
    Check if an LLM provider is configured and return configuration metadata.
    """
    provider, model, key = detect_provider()
    if not provider or not key:
        return {
            "configured": False,
            "provider": None,
            "model": None,
            "message": (
                "No LLM provider key detected. Set GEMINI_API_KEY, OPENAI_API_KEY, "
                "ANTHROPIC_API_KEY, or GROQ_API_KEY in your .env file."
            ),
        }

    return {
        "configured": True,
        "provider": provider,
        "model": model,
        "message": f"Connected to {provider.title()} ({model})",
    }


def create_llm(
    provider_override: str | None = None,
    model_override: str | None = None,
    temperature: float | None = None,
) -> BaseChatModel:
    """
    Instantiate the appropriate BaseChatModel based on detected or overridden configuration.
    """
    provider, default_model, api_key = detect_provider()

    if provider_override:
        provider = provider_override
    if model_override:
        default_model = model_override

    if temperature is None:
        try:
            temperature = float(os.getenv("LLM_TEMPERATURE", "0.2"))
        except ValueError:
            temperature = 0.2

    if not provider or not api_key:
        raise ValueError(
            "No LLM provider configured. Please provide an API key in your .env file "
            "(e.g., GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or GROQ_API_KEY)."
        )

    base_url = (
        os.getenv("LLM_BASE_URL")
        or os.getenv("OPENAI_BASE_URL")
        or os.getenv("OLLAMA_BASE_URL")
    )

    if provider in ("google", "gemini", "google_genai"):
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=default_model or "gemini-2.0-flash",
            google_api_key=api_key,
            temperature=temperature,
        )

    if provider == "openai":
        from langchain_openai import ChatOpenAI

        kwargs: dict[str, Any] = {
            "model": default_model or "gpt-4o",
            "api_key": api_key,
            "temperature": temperature,
        }
        if base_url:
            kwargs["base_url"] = base_url
        return ChatOpenAI(**kwargs)

    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=default_model or "claude-3-5-sonnet-latest",
            api_key=api_key,
            temperature=temperature,
        )

    if provider == "groq":
        from langchain_groq import ChatGroq

        max_tokens_val = int(os.getenv("LLM_MAX_TOKENS", "4096"))
        return ChatGroq(
            model=default_model or "openai/gpt-oss-120b",
            api_key=api_key,
            temperature=temperature,
            max_tokens=max_tokens_val,
            max_retries=3,
        )

    if provider in ("ollama", "local", "custom"):
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=default_model or "llama3.2",
            api_key=api_key or "ollama",
            base_url=base_url or "http://localhost:11434/v1",
            temperature=temperature,
        )

    raise ValueError(f"Unsupported LLM provider: {provider}")
