from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/v1", tags=["portfolio"])


class Position(BaseModel):
    ticker: str
    shares: float
    avg_cost: float
    current_price: float
    pnl: float


class PortfolioSummary(BaseModel):
    total_value: float
    cash: float
    pnl_today: float
    pnl_total: float
    positions: list[Position]


@router.get("/portfolio", response_model=PortfolioSummary)
def get_portfolio():
    return PortfolioSummary(
        total_value=107340.50,
        cash=42180.00,
        pnl_today=1240.30,
        pnl_total=7340.50,
        positions=[
            Position(ticker="AAPL", shares=50, avg_cost=172.40, current_price=181.20, pnl=440.00),
            Position(ticker="NVDA", shares=20, avg_cost=820.00, current_price=882.50, pnl=1250.00),
        ],
    )
