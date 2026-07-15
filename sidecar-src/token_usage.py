"""Token usage tracking: pricing, cost calculation, and DB mixin."""
from __future__ import annotations

from typing import Any, Dict, List, Optional


# Model pricing per million tokens: (input, output, cache_read, cache_write)
MODEL_PRICING: Dict[str, tuple] = {
    "anthropic/claude-sonnet-4-20250514": (3.00, 15.00, 3.75, 3.75),
    "anthropic/claude-opus-4-20250514": (15.00, 75.00, 18.75, 18.75),
    "anthropic/claude-haiku-3-5-20241022": (0.80, 4.00, 0.10, 1.25),
    "anthropic/claude-3-5-sonnet-20241022": (3.00, 15.00, 3.75, 3.75),
    "anthropic/claude-3-5-haiku-20241022": (0.80, 4.00, 0.10, 1.25),
    "openai/gpt-4o": (2.50, 10.00, 1.25, 5.00),
    "openai/gpt-4o-mini": (0.15, 0.60, 0.075, 0.30),
    "openai/o3-pro": (10.00, 40.00, 12.50, 20.00),
    "local-llama-coder-next": (3.00, 15.00, 3.75, 3.75),
}


def calculate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int,
    thinking_tokens: int = 0,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
) -> float:
    """Calculate cost based on model pricing with cache support."""
    pricing = MODEL_PRICING.get(model)
    if not pricing:
        return 0.0
    input_price, output_price, cache_read_price, cache_write_price = pricing
    cost = (
        (input_tokens / 1_000_000) * input_price
        + (output_tokens / 1_000_000) * output_price
        + (thinking_tokens / 1_000_000) * output_price
        + (cache_read_tokens / 1_000_000) * cache_read_price
        + (cache_write_tokens / 1_000_000) * cache_write_price
    )
    return round(cost, 6)


class TokenUsageMixin:
    """Mixin providing token usage tracking methods.

    Requires host class to have a `db` attribute (sqlite3.Connection).
    """

    # Re-expose MODEL_PRICING on the class for backward compat
    MODEL_PRICING = MODEL_PRICING

    @staticmethod
    def calculate_cost(
        model: str,
        input_tokens: int,
        output_tokens: int,
        thinking_tokens: int = 0,
        cache_read_tokens: int = 0,
        cache_write_tokens: int = 0,
    ) -> float:
        """Calculate cost based on model pricing with cache support."""
        return calculate_cost(
            model, input_tokens, output_tokens, thinking_tokens,
            cache_read_tokens, cache_write_tokens,
        )

    def record_token_usage(
        self,
        session_name: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        thinking_tokens: int = 0,
        cache_read_tokens: int = 0,
        cache_write_tokens: int = 0,
        agent_name: str | None = None,
    ) -> None:
        """Record per-message token usage and update session totals."""
        cost = self.calculate_cost(
            model, input_tokens, output_tokens, thinking_tokens,
            cache_read_tokens, cache_write_tokens,
        )

        # Insert into token_usage table
        self.db.execute(
            """INSERT INTO token_usage
               (session_name, model, input_tokens, output_tokens, thinking_tokens,
                cache_read_tokens, cache_write_tokens, cost_usd, agent_name)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (session_name, model, input_tokens, output_tokens, thinking_tokens,
             cache_read_tokens, cache_write_tokens, cost, agent_name),
        )

        # Update session totals
        self.db.execute(
            """UPDATE sessions
               SET input_tokens = input_tokens + ?,
                   output_tokens = output_tokens + ?,
                   cache_read_tokens = cache_read_tokens + ?,
                   cache_write_tokens = cache_write_tokens + ?,
                   total_tokens = total_tokens + ?,
                   model_used = ?,
                   updated_at = CURRENT_TIMESTAMP
               WHERE session_name = ?""",
            (input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
             input_tokens + output_tokens, model, session_name),
        )

        self.db.commit()

    def get_usage_summary(
        self,
        period: str = "all",
        model: str | None = None,
    ) -> dict:
        """Get aggregated usage stats for a given period."""
        where = "1=1"
        params: list[Any] = []

        if period == "today":
            where = "date(timestamp, 'localtime') = date('now', 'localtime')"
        elif period == "week":
            where = "datetime(timestamp, 'localtime') >= datetime('now', 'localtime', '-7 days')"
        elif period == "month":
            where = "datetime(timestamp, 'localtime') >= datetime('now', 'localtime', '-30 days')"

        if model:
            where += " AND model = ?"
            params.append(model)

        row = self.db.execute(
            f"""SELECT COALESCE(SUM(input_tokens), 0),
                       COALESCE(SUM(output_tokens), 0),
                       COALESCE(SUM(cache_read_tokens), 0),
                       COALESCE(SUM(cache_write_tokens), 0),
                       COALESCE(SUM(cost_usd), 0),
                       COUNT(DISTINCT session_name)
                FROM token_usage WHERE {where}""",
            params,
        ).fetchone()

        return {
            "total_input_tokens": row[0],
            "total_output_tokens": row[1],
            "total_cache_read_tokens": row[2],
            "total_cache_write_tokens": row[3],
            "total_cost_usd": round(row[4], 4),
            "sessions_count": row[5],
            "period": period,
        }

    def get_usage_by_session(
        self,
        limit: int = 50,
        offset: int = 0,
    ) -> dict:
        """Get per-session token usage breakdown."""
        rows = self.db.execute(
            """SELECT tu.session_name, s.custom_name, tu.model,
                     SUM(tu.input_tokens) as input_tokens,
                     SUM(tu.output_tokens) as output_tokens,
                     SUM(tu.cost_usd) as cost_usd,
                     COUNT(tu.id) as message_count,
                     MAX(tu.timestamp) as timestamp
               FROM token_usage tu
               LEFT JOIN sessions s ON tu.session_name = s.session_name
               GROUP BY tu.session_name
               ORDER BY MAX(tu.timestamp) DESC
               LIMIT ? OFFSET ?""",
            (limit, offset),
        ).fetchall()

        sessions = []
        total_cost = 0.0
        for row in rows:
            sessions.append({
                "session_name": row[0],
                "custom_name": row[1] or row[0],
                "model": row[2],
                "input_tokens": row[3],
                "output_tokens": row[4],
                "cost_usd": round(row[5], 4),
                "message_count": row[6],
                "timestamp": row[7],
            })
            total_cost += row[5]

        return {
            "sessions": sessions,
            "total_cost_usd": round(total_cost, 4),
        }

    def get_daily_usage(
        self,
        days: int = 30,
    ) -> dict:
        """Get daily token usage aggregates for chart rendering."""
        rows = self.db.execute(
            """SELECT date(timestamp, 'localtime') as date,
                     SUM(input_tokens) as input_tokens,
                     SUM(output_tokens) as output_tokens,
                     SUM(cache_read_tokens) as cache_read_tokens,
                     SUM(cache_write_tokens) as cache_write_tokens,
                     SUM(cost_usd) as cost_usd
               FROM token_usage
               WHERE datetime(timestamp, 'localtime') >= datetime('now', 'localtime', ?)
               GROUP BY date(timestamp, 'localtime')
               ORDER BY date DESC""",
            (f"-{days} days",),
        ).fetchall()

        daily = []
        for row in rows:
            daily.append({
                "date": row[0],
                "input_tokens": row[1],
                "output_tokens": row[2],
                "cache_read_tokens": row[3],
                "cache_write_tokens": row[4],
                "cost_usd": round(row[5], 4),
            })

        return {"days": daily}

    def get_usage_by_model(
        self,
        period: str = "all",
        limit: int = 3,
        offset: int = 0,
    ) -> dict:
        """Get per-model token usage aggregates with pagination."""
        where = "1=1"
        params: list[Any] = []

        if period == "today":
            where = "date(timestamp, 'localtime') = date('now', 'localtime')"
        elif period == "week":
            where = "datetime(timestamp, 'localtime') >= datetime('now', 'localtime', '-7 days')"
        elif period == "month":
            where = "datetime(timestamp, 'localtime') >= datetime('now', 'localtime', '-30 days')"

        # Count total distinct models for pagination
        total = self.db.execute(
            f"SELECT COUNT(DISTINCT model) FROM token_usage WHERE {where}",
            params,
        ).fetchone()[0]

        rows = self.db.execute(
            f"""SELECT model,
                     SUM(input_tokens) as input_tokens,
                     SUM(output_tokens) as output_tokens,
                     SUM(cost_usd) as cost_usd,
                     COUNT(id) as message_count,
                     COUNT(DISTINCT session_name) as session_count,
                     MAX(timestamp) as last_used
               FROM token_usage
               WHERE {where}
               GROUP BY model
               ORDER BY last_used DESC
               LIMIT ? OFFSET ?""",
            params + [limit, offset],
        ).fetchall()

        models = []
        total_cost = 0.0
        for row in rows:
            models.append({
                "model": row[0],
                "input_tokens": row[1],
                "output_tokens": row[2],
                "cost_usd": round(row[3], 4),
                "message_count": row[4],
                "session_count": row[5],
                "last_used": row[6],
            })
            total_cost += row[3]

        return {
            "models": models,
            "total_cost_usd": round(total_cost, 4),
            "total_models": total,
            "limit": limit,
            "offset": offset,
        }

    def clear_token_stats(self) -> None:
        """Clear all token usage data and reset session counters."""
        self.db.execute("DELETE FROM token_usage")
        self.db.execute(
            """UPDATE sessions
               SET input_tokens = 0, output_tokens = 0,
                   cache_read_tokens = 0, cache_write_tokens = 0,
                   total_tokens = 0, model_used = NULL"""
        )
        self.db.commit()
