"""Load test — run against a local stack (AUTH_MODE=dev):

    uv run locust -f tests/locustfile.py --host http://localhost:8000 \
        --headless -u 20 -r 5 -t 60s --csv /tmp/locust

Set COLLECTION_ID to a collection that has ingested documents.
"""

import os
import random

from locust import HttpUser, between, task

COLLECTION_ID = os.environ.get("COLLECTION_ID", "")

QUERIES = [
    "what fusion method is used for retrieval",
    "who is the lead engineer",
    "when did the project launch",
    "what is the budget",
    "how does deployment work",
]


class ApiUser(HttpUser):
    wait_time = between(0.5, 2)

    @task(1)
    def health(self):
        self.client.get("/health")

    @task(3)
    def list_collections(self):
        self.client.get("/collections")

    @task(2)
    def list_documents(self):
        self.client.get(f"/collections/{COLLECTION_ID}/documents")

    @task(4)
    def hybrid_search(self):
        q = random.choice(QUERIES)
        self.client.get(
            f"/collections/{COLLECTION_ID}/search",
            params={"q": q, "limit": 10},
            name="/collections/[id]/search",
        )
