up:
	docker compose up --build

down:
	docker compose down -v

frontend:
	cd frontend && npm install && npm run dev
