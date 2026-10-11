import asyncio
from httpx import AsyncClient
from app.main import app

async def main():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post("/api/v1/auth/register", json={
            "email": "test@example.com",
            "password": "password123",
            "display_name": "Test User",
            "username": "testuser"
        })
        print(response.status_code)
        print(response.json())

if __name__ == "__main__":
    asyncio.run(main())
