"""
RTAIP Graph API
===============

REST endpoints for the entity-correlation graph. Mounted in main.py via:

    from graph_api import router as graph_router
    app.include_router(graph_router)

All data served here is derived from PUBLIC / authorized sources only
(see docs/ETHICS.md).
"""
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

import graph

router = APIRouter(prefix="/graph", tags=["graph"])


class EnrichIn(BaseModel):
    type: str = "domain"
    value: str


@router.get("/stats")
def graph_stats():
    return graph.stats()


@router.get("/full")
def graph_full(limit: int = Query(400, ge=1, le=2000)):
    """Initial render: most recently seen entities and the edges among them."""
    return graph.full_graph(limit=limit)


@router.get("/pivot/{entity_id}")
def graph_pivot(entity_id: int):
    """Click-to-expand: an entity plus its 1-hop neighborhood."""
    data = graph.neighbors(entity_id)
    if not data["nodes"]:
        raise HTTPException(status_code=404, detail="entity not found")
    return data


@router.post("/enrich")
async def graph_enrich(body: EnrichIn):
    """Run an OSINT transform on a seed value and return the merged sub-graph."""
    value = (body.value or "").strip()
    if not value:
        raise HTTPException(status_code=422, detail="value is required")
    etype = (body.type or "").strip().lower() or graph.guess_type(value)
    return await graph.run_transform(etype, value)
