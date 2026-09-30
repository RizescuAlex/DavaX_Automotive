import sys
from fastapi import FastAPI, Depends, status
from fastapi.testclient import TestClient
from fastapi import HTTPException

class ConflictError(HTTPException):
    def __init__(self, detail: str = "Resource already exists"):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            detail=detail,
        )

app = FastAPI()

@app.get("/test")
async def test_endpoint():
    raise ConflictError("An account with this email already exists")

client = TestClient(app)
response = client.get("/test")
print(f"Status: {response.status_code}")
print(f"Body: {response.json()}")
