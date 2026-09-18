.PHONY: dev stop migrate seed test lint clean

dev:
	docker compose up --build

dev-detached:
	docker compose up --build -d

stop:
	docker compose down

migrate:
	docker compose exec backend alembic upgrade head

migrate-new:
	docker compose exec backend alembic revision --autogenerate -m "$(msg)"

seed:
	docker compose exec backend python -m app.seeds.run

test:
	docker compose exec backend pytest tests/ -v

test-cov:
	docker compose exec backend pytest tests/ -v --cov=app --cov-report=html

lint:
	docker compose exec backend ruff check app/

clean:
	docker compose down -v --remove-orphans
	docker system prune -f
