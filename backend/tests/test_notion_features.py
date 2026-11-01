from fastapi.testclient import TestClient
import pytest
from app.api import create_app
from app.db import make_engine
from app.llm import FakeClient


@pytest.fixture()
def client(tmp_path):
    engine = make_engine(f"sqlite:///{tmp_path / 'test_notion.db'}")
    app = create_app(engine, FakeClient([]))
    with TestClient(app) as test_client:
        yield test_client


def test_note_pages_and_database_crud(client):
    sess_res = client.post("/api/v1/sessions", json={"title": "Raft", "demo_bundle_id": "cs_raft"})
    sid = sess_res.json()["session_id"]

    # 1. List pages (seeds default general notes and misconception tracker database)
    res = client.get(f"/api/v1/sessions/{sid}/pages")
    assert res.status_code == 200
    pages = res.json()["pages"]
    assert len(pages) >= 2
    assert any(p["page_type"] == "database" for p in pages)
    page1 = pages[0]

    # 2. Create subpage
    created = client.post(
        f"/api/v1/sessions/{sid}/pages",
        json={
            "title": "Exam 1 Formulas",
            "icon": "📐",
            "page_type": "page",
            "parent_page_id": page1["id"],
            "content_md": "# Formulas\n- F = ma",
        },
    )
    assert created.status_code == 200
    new_page = created.json()
    assert new_page["title"] == "Exam 1 Formulas"
    assert new_page["parent_page_id"] == page1["id"]

    # 3. Update page
    updated = client.put(
        f"/api/v1/sessions/{sid}/pages/{new_page['id']}",
        json={"title": "Mastery Formulas", "content_md": "# Updated"},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Mastery Formulas"

    # 4. Delete page
    deleted = client.delete(f"/api/v1/sessions/{sid}/pages/{new_page['id']}")
    assert deleted.status_code == 200


def test_session_share_and_duplicate(client):
    sess_res = client.post("/api/v1/sessions", json={"title": "Raft", "demo_bundle_id": "cs_raft"})
    sid = sess_res.json()["session_id"]

    # 1. Enable public sharing
    share_res = client.post(
        f"/api/v1/sessions/{sid}/share",
        json={"is_public": True, "allow_duplicate": True},
    )
    assert share_res.status_code == 200
    share_data = share_res.json()
    token = share_data["share_token"]
    assert token

    # 2. Get shared session bundle (public endpoint)
    public_res = client.get(f"/api/v1/share/{token}")
    assert public_res.status_code == 200
    public_data = public_res.json()
    assert public_data["session"]["share_token"] == token
    assert len(public_data["topics"]) > 0

    # 3. Duplicate session
    dup_res = client.post(
        f"/api/v1/share/{token}/duplicate",
        json={"new_title": "Shared Demo (Cloned)"},
    )
    assert dup_res.status_code == 200
    dup_data = dup_res.json()
    assert dup_data["session_id"] != sid
    assert dup_data["title"] == "Shared Demo (Cloned)"
