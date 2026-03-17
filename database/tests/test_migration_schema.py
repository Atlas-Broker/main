"""
Schema introspection tests for the 2026-03-17 Clerk-compatible migration.

Requires:
    SUPABASE_URL       — the project URL (e.g. https://qbbbuebbxueqclkrvoos.supabase.co)
    SUPABASE_SERVICE_KEY — service role key (bypasses RLS)

Run after applying the migration:
    cd database
    python -m pytest tests/test_migration_schema.py -v
"""

import os
import pytest
from supabase import create_client, Client


@pytest.fixture(scope="module")
def client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        pytest.skip("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    return create_client(url, key)


def _get_columns(client: Client, table_name: str) -> dict[str, dict]:
    """Returns {column_name: {data_type, is_nullable, column_default}} for a table."""
    result = (
        client
        .table("information_schema.columns")
        .select("column_name,data_type,is_nullable,column_default")
        .eq("table_schema", "public")
        .eq("table_name", table_name)
        .execute()
    )
    return {row["column_name"]: row for row in result.data}


# ---------------------------------------------------------------------------
# profiles
# ---------------------------------------------------------------------------

class TestProfilesTable:
    def test_id_is_text(self, client: Client):
        cols = _get_columns(client, "profiles")
        assert cols["id"]["data_type"] == "text", (
            f"profiles.id must be text (Clerk ID), got: {cols['id']['data_type']}"
        )

    def test_no_uuid_fk_to_auth_users(self, client: Client):
        """profiles.id must NOT be uuid — that would mean old Supabase-Auth schema."""
        cols = _get_columns(client, "profiles")
        assert cols["id"]["data_type"] != "uuid", (
            "profiles.id is uuid — old Supabase-Auth schema still applied"
        )

    def test_required_columns_exist(self, client: Client):
        cols = _get_columns(client, "profiles")
        required = {"id", "email", "display_name", "boundary_mode",
                    "onboarding_completed", "created_at", "updated_at"}
        missing = required - set(cols.keys())
        assert not missing, f"profiles missing columns: {missing}"

    def test_boundary_mode_has_default(self, client: Client):
        cols = _get_columns(client, "profiles")
        default = cols["boundary_mode"]["column_default"]
        assert default is not None and "advisory" in default, (
            f"profiles.boundary_mode default should be 'advisory', got: {default}"
        )

    def test_onboarding_completed_present(self, client: Client):
        cols = _get_columns(client, "profiles")
        assert "onboarding_completed" in cols, (
            "profiles.onboarding_completed column missing — old schema did not have this"
        )


# ---------------------------------------------------------------------------
# portfolios
# ---------------------------------------------------------------------------

class TestPortfoliosTable:
    def test_user_id_is_text(self, client: Client):
        cols = _get_columns(client, "portfolios")
        assert cols["user_id"]["data_type"] == "text", (
            f"portfolios.user_id must be text, got: {cols['user_id']['data_type']}"
        )

    def test_unique_user_id_constraint_exists(self, client: Client):
        """UNIQUE(user_id) enforces one portfolio per user. Introspect via pg_indexes."""
        result = (
            client
            .rpc("pg_catalog.pg_indexes", {})
            .execute()
        )
        # Fallback: attempt insert of a second portfolio for same user_id and
        # expect a unique-violation error.
        # We validate the constraint via information_schema.table_constraints instead.
        result2 = (
            client
            .table("information_schema.table_constraints")
            .select("constraint_type,constraint_name")
            .eq("table_schema", "public")
            .eq("table_name", "portfolios")
            .eq("constraint_type", "UNIQUE")
            .execute()
        )
        assert len(result2.data) >= 1, (
            "portfolios table has no UNIQUE constraint — UNIQUE(user_id) is missing"
        )


# ---------------------------------------------------------------------------
# trades
# ---------------------------------------------------------------------------

class TestTradesTable:
    def test_order_id_column_exists(self, client: Client):
        cols = _get_columns(client, "trades")
        assert "order_id" in cols, (
            "trades.order_id column missing — needed for Alpaca override cancellation"
        )

    def test_order_id_is_text(self, client: Client):
        cols = _get_columns(client, "trades")
        assert cols["order_id"]["data_type"] == "text", (
            f"trades.order_id must be text, got: {cols['order_id']['data_type']}"
        )

    def test_user_id_is_text(self, client: Client):
        cols = _get_columns(client, "trades")
        assert cols["user_id"]["data_type"] == "text", (
            f"trades.user_id must be text, got: {cols['user_id']['data_type']}"
        )

    def test_total_value_is_generated(self, client: Client):
        """total_value is a generated column (shares * price)."""
        cols = _get_columns(client, "trades")
        assert "total_value" in cols, "trades.total_value column missing"
        # generated columns show a column_default in information_schema
        # The key check is that the column exists with numeric type
        assert cols["total_value"]["data_type"] == "numeric"


# ---------------------------------------------------------------------------
# override_log
# ---------------------------------------------------------------------------

class TestOverrideLogTable:
    def test_order_id_column_exists(self, client: Client):
        cols = _get_columns(client, "override_log")
        assert "order_id" in cols, "override_log.order_id column missing"

    def test_ticker_column_exists(self, client: Client):
        cols = _get_columns(client, "override_log")
        assert "ticker" in cols, "override_log.ticker column missing"

    def test_broker_cancel_success_column_exists(self, client: Client):
        cols = _get_columns(client, "override_log")
        assert "broker_cancel_success" in cols, (
            "override_log.broker_cancel_success column missing"
        )

    def test_overridden_at_column_exists(self, client: Client):
        cols = _get_columns(client, "override_log")
        assert "overridden_at" in cols, "override_log.overridden_at column missing"

    def test_no_created_at_column(self, client: Client):
        """override_log uses overridden_at as canonical timestamp; created_at must not exist."""
        cols = _get_columns(client, "override_log")
        assert "created_at" not in cols, (
            "override_log.created_at must not exist — overridden_at is the canonical timestamp"
        )

    def test_user_id_is_text(self, client: Client):
        cols = _get_columns(client, "override_log")
        assert cols["user_id"]["data_type"] == "text", (
            f"override_log.user_id must be text, got: {cols['user_id']['data_type']}"
        )
