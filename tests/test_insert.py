from scripts.insert import insert_fragment


def test_insert_preserves_marker_and_replaces_previous_content() -> None:
    html = """<div>
  <!-- ||test.rst|| -->
    <p>old content</p>
    <p>more old content</p>
</div>
"""

    updated, count = insert_fragment(html, "test.rst", '<p class="new">new content</p>')

    assert count == 1
    assert "<!-- ||test.rst|| -->" in updated
    assert '<p class="new">new content</p>' in updated
    assert "old content" not in updated
    assert updated.endswith("\n")


def test_insert_only_changes_matching_marker() -> None:
    html = """<div>
  <!-- ||other.rst|| -->
    <p>keep me</p>
</div>
"""

    updated, count = insert_fragment(html, "test.rst", "<p>unused</p>")

    assert count == 0
    assert updated == html
