"""Test voice config masks API key properly."""

import sys
from pathlib import Path

# Add sidecar-src to path for imports (hyphenated directory can't be imported directly)
sys.path.insert(0, str(Path(__file__).parent.parent / "sidecar-src"))

from voice_config import _mask_api_key


def test_mask_api_key_long_key():
    """Long keys should show **** + last 4 chars."""
    assert _mask_api_key("sk-abcdefghijklmnop") == "****mnop"


def test_mask_api_key_short_key():
    """Keys shorter than 5 chars should show only ****."""
    assert _mask_api_key("abcd") == "****"


def test_mask_api_key_empty_key():
    """Empty string should return **** (nothing to reveal, masked by default)."""
    assert _mask_api_key("") == "****"


def test_mask_api_key_exactly_five_chars():
    """Five-char key should show **** + last 4."""
    assert _mask_api_key("abcde") == "****bcde"
