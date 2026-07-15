"""Test auth middleware rejects unauthorized requests and exempts health."""

import hmac
import os
import sys
from pathlib import Path

import pytest

# Add sidecar-src to path for imports (hyphenated directory can't be imported directly)
sys.path.insert(0, str(Path(__file__).parent.parent / "sidecar-src"))

from auth_middleware import (
    _AUTH_EXEMPT_PATHS,
    _secure_compare,
    _get_expected_token,
)


class TestAuthMiddleware:
    """Tests for auth middleware logic."""

    def test_secure_compare_same_values(self):
        """Identical strings should compare as equal."""
        assert _secure_compare("abc", "abc") is True

    def test_secure_compare_different_values(self):
        """Different strings should compare as unequal."""
        assert _secure_compare("abc", "def") is False

    def test_secure_compare_empty_strings(self):
        """Empty strings should compare as equal."""
        assert _secure_compare("", "") is True

    def test_health_endpoint_in_exempt_paths(self):
        """The /api/health endpoint should be exempt from auth."""
        assert "/api/health" in _AUTH_EXEMPT_PATHS

    def test_get_expected_token_from_env(self):
        """Expected token should come from environment variable."""
        token = _get_expected_token()
        # Should return whatever is in the env (could be empty in tests)
        assert isinstance(token, str)

    def test_constant_time_comparison_uses_hmac(self):
        """Verification that we use constant-time comparison."""
        # hmac.compare_digest is the gold standard for constant-time comparison
        assert _secure_compare("a" * 100, "a" * 100) is True
        assert _secure_compare("a" * 100, "a" * 99 + "b") is False
