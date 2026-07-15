# Testing Guide

## Test Suite Overview

The Python sidecar test suite lives in `tests/` and uses `pytest`. Eight test files cover security-critical paths and recent refactoring:

| File | Tests | Coverage Area |
|------|-------|---------------|
| `test_path_validation.py` | 8 | Workspace path confinement — prevents directory traversal |
| `test_session_manager.py` | 5 | Restricted pickle unpickler — blocks unsafe deserialization |
| `test_auth_middleware.py` | 6 | HTTP auth middleware — token validation, exempt paths |
| `test_websocket_auth.py` | 6 | WebSocket auth — verifies `require_ws_auth` fix for CRITICAL-2 |
| `test_voice_config.py` | 4 | API key masking — ensures keys are never exposed in responses |
| `test_extract_tool_args.py` | 7 | Tool argument extraction — deduplication of `args_as_dict`/`args_as_json_str` |
| `test_token_usage.py` | 8 | Cost calculation — pricing, cache tokens, rounding precision |
| `test_session_manager.py` | 2 | Additional session manager assertions |

**Total: ~46 tests across 8 files.**

## Running Tests

### Python Sidecar Tests

```bash
# Run all tests
python3 -m pytest tests/ -v

# Run a specific test file
python3 -m pytest tests/test_auth_middleware.py -v

# Run with coverage
python3 -m pytest tests/ --cov=sidecar-src --cov-report=term-missing

# Run only security-related tests
python3 -m pytest tests/test_path_validation.py tests/test_session_manager.py tests/test_auth_middleware.py tests/test_websocket_auth.py -v
```

### Rust Tests

```bash
# Run all Rust unit tests
cargo test

# Run specific test module
cargo test -- sidecar
```

Note: `test_find_free_port_returns_unique_ports` has a known issue — it asserts `port1 == port1` (a tautology) instead of `port1 != port2`. See [MEDIUM/INFO findings in AuditReport.md](../AuditReport.md).

### Frontend Tests

No frontend unit or component tests currently exist. This is a documented coverage gap.

## Test Fixtures and Setup

### conftest.py

The shared `tests/conftest.py` mocks heavy external dependencies (`fastapi`, `starlette`, `code_puppy`, `pydantic_ai`) so tests run without installing the full `code-puppy` package:

```python
_MISSING_MODULES = [
    "fastapi", "starlette", "loguru",
    "code_puppy", "code_puppy.config", ...
]
for _mod in _MISSING_MODULES:
    sys.modules[_mod] = mock.MagicMock()
```

Tests that require real dependencies (e.g., actual FastAPI routing or code-puppy integration) should be excluded from the mocked suite or run in a separate CI environment with full dependencies installed.

### Environment Variables

Some tests manipulate environment variables:

```python
monkeypatch.setenv("SIDECAR_AUTH_TOKEN", "test-token")
monkeypatch.delenv("SIDECAR_AUTH_TOKEN", raising=False)
```

No persistent environment setup is required — tests are self-contained.

### Temporary Directories

`test_path_validation.py` uses `pytest.tmp_path` fixture for isolated filesystem tests, including symlink escape detection.

## Test Architecture

### Auth Tests

- **`test_auth_middleware.py`** — Verifies `_secure_compare` uses HMAC constant-time comparison, validates that `/api/health` is in the exempt paths list, confirms `_get_expected_token` reads from environment.

- **`test_websocket_auth.py`** — AST-level verification that `websocket.py` imports and uses `require_ws_auth` (not inline `_get_expected_token`/`_secure_compare`). Tests both rejection of bad tokens and acceptance of valid ones. Verifies the CRITICAL-2 fix: empty `SIDECAR_AUTH_TOKEN` must reject all connections.

### Path Validation Tests

- Validates accepted paths (absolute, relative, nested)
- Rejects parent traversal (`../`), absolute system paths (`/etc/passwd`), deep traversal chains, and symlinks pointing outside the workspace

### Pickle Security Tests

- Confirms `RestrictedUnpickler` blocks `os.system`, `subprocess.Popen`, and any module not in the whitelist
- Verifies the whitelist contains required modules (`builtins`, `code_puppy`, `pydantic_ai`) and excludes dangerous ones (`os`, `subprocess`)
- Tests legacy `CPSESSION\x01` header stripping

### Token Usage Tests

- Cost calculation with basic input/output tokens
- Thinking tokens charged at output rate
- Cache read/write tokens at their respective prices
- Unknown models return zero cost
- Large volume calculations stay within reasonable ranges
- Rounding precision to 6 decimal places

## Coverage Gaps

| Area | Status | Notes |
|------|--------|-------|
| WebSocket message handling | ❌ Not tested | End-to-end WebSocket streaming and reconnection |
| Shell endpoint | ❌ Not tested | Input sanitization, timeout behavior, injection prevention |
| Model CRUD | ❌ Not tested | Add, update, delete, source tracking |
| Session SQLite interactions | ❌ Not tested | Concurrent access, migration edge cases |
| File watcher events | ❌ Not tested | Event emission, debounce behavior |
| Frontend components | ❌ Not tested | Rendering, store actions, event dispatch |
| E2E sidecar startup | ❌ Not tested | Full process lifecycle |
| Windows process tree killing | ❌ Not tested | Job Object behavior |
| Integration tests with real deps | ⚠️ Partial | Mocked suite runs without real libraries |

## CI Expectations

Current CI expectations (derived from repository patterns):

1. **`cargo check`** — Rust compilation without building binaries
2. **`cargo test`** — Rust unit tests
3. **`npm run build`** — Frontend production build succeeds
4. **`python3 -m pytest tests/`** — Python test suite passes

No CI workflow files were found in the repository — the CI pipeline is likely configured externally (GitHub Actions, GitLab CI, or similar) and not committed.

## Writing New Tests

### Sidecar Tests

Follow the existing pattern:

```python
"""Tests for [feature]."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "sidecar-src"))

from some_module import some_function

class TestSomeFeature:
    def test_case_name(self):
        """Description of what is being verified."""
        assert some_function(input) == expected_output
```

- Use `tmp_path` fixture for filesystem tests
- Use `monkeypatch` for environment variables
- Use `mock.MagicMock` for external dependencies
- Test both success and failure paths
- Include docstrings describing the verification intent

### Rust Tests

Follow the existing pattern in `src/sidecar.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_function_name() {
        let result = function_under_test(input);
        assert!(result.is_ok());
    }
}
```
