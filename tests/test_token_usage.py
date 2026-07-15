"""Tests for token_usage module (MEDIUM-3: split from session_manager.py)."""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent / "sidecar-src"))

from token_usage import MODEL_PRICING, calculate_cost


class TestCalculateCost:
    """Tests for cost calculation using model pricing."""

    def test_basic_input_and_output(self):
        """Basic cost calculation with input and output tokens."""
        cost = calculate_cost("openai/gpt-4o", input_tokens=1000, output_tokens=2000)
        # input: 1000/1M * 2.50 = 0.0025
        # output: 2000/1M * 10.00 = 0.02
        expected = round((1000 / 1_000_000) * 2.50 + (2000 / 1_000_000) * 10.00, 6)
        assert cost == expected

    def test_with_thinking_tokens(self):
        """Thinking tokens are charged at output rate."""
        cost = calculate_cost(
            "openai/gpt-4o",
            input_tokens=1000,
            output_tokens=500,
            thinking_tokens=200,
        )
        # thinking uses output price
        expected = round(
            (1000 / 1_000_000) * 2.50
            + (500 / 1_000_000) * 10.00
            + (200 / 1_000_000) * 10.00,  # thinking at output rate
            6,
        )
        assert cost == expected

    def test_with_cache_read_and_write(self):
        """Cache tokens use their respective prices."""
        cost = calculate_cost(
            "openai/gpt-4o",
            input_tokens=0,
            output_tokens=0,
            cache_read_tokens=1000,
            cache_write_tokens=500,
        )
        expected = round(
            (1000 / 1_000_000) * 1.25  # cache_read
            + (500 / 1_000_000) * 5.00,  # cache_write
            6,
        )
        assert cost == expected

    def test_unknown_model_returns_zero(self):
        """Unknown model should return zero cost (no pricing available)."""
        cost = calculate_cost("unknown/model", input_tokens=1000, output_tokens=500)
        assert cost == 0.0

    def test_all_anthropic_models_have_pricing(self):
        """All anthropic models in MODEL_PRICING should have valid tuples."""
        for model_name in MODEL_PRICING:
            if model_name.startswith("anthropic/"):
                pricing = MODEL_PRICING[model_name]
                assert len(pricing) == 4, f"{model_name} pricing tuple should have 4 elements"
                # Verify all prices are positive
                for i, price in enumerate(pricing):
                    assert price > 0, f"{model_name} price[{i}] should be positive"

    def test_all_openai_models_have_pricing(self):
        """All openai models in MODEL_PRICING should have valid tuples."""
        for model_name in MODEL_PRICING:
            if model_name.startswith("openai/"):
                pricing = MODEL_PRICING[model_name]
                assert len(pricing) == 4

    def test_large_volume_calculation(self):
        """Large token volumes should produce reasonable costs."""
        cost = calculate_cost(
            "anthropic/claude-sonnet-4-20250514",
            input_tokens=100_000,
            output_tokens=50_000,
            cache_read_tokens=30_000,
            cache_write_tokens=10_000,
        )
        assert cost > 0
        # Approximate: 100k * 3/1M = 0.3, 50k * 15/1M = 0.75, 30k * 3.75/1M = 0.1125, 10k * 3.75/1M = 0.0375
        # Total ≈ 1.2
        assert 0.5 < cost < 2.0

    def test_rounding_precision(self):
        """Cost should be rounded to 6 decimal places."""
        cost = calculate_cost("openai/gpt-4o-mini", input_tokens=1, output_tokens=1)
        # Result should have at most 6 decimal places
        formatted = f"{cost:.6f}"
        assert float(formatted) == cost
