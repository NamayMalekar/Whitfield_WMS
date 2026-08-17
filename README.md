# Whitfield Fulfillment - Warehouse Management System

Multi-warehouse WMS (Reno, NV + Columbus, OH) replacing spreadsheet operations.

## What it fixes

| Spreadsheet problem | How this system solves it |
|---|---|
| Duplicate stock entries after a frozen laptop | Every receipt carries an idempotency key; replays return the original transaction instead of double-counting |
| Two sellers confirming the same last unit | Order confirmation takes a row lock on the inventory row (`SELECT ... FOR UPDATE` on PostgreSQL, serialized writer on SQLite) and reserves atomically |
| Nobody knows who edited what | Hash-chained, append-only audit log with user, action, warehouse and timestamp; updates and deletes raise at the ORM layer |
| New hires have veteran access | Role hierarchy `NEWHIRE < VETERAN < ADMIN` enforced as FastAPI dependencies on every route |
| Two-day fulfillment cycle | Kanban pipeline (Received -> Pulling -> Packing -> Shipped) with pack-out weight and dimension capture in the same step |
| Hands full while scanning | Voice receiving: "log fifty units of SKU-1042, two damaged" parses to a structured, confirmable transaction |

## Voice receiving

Speak, read back, correct, confirm. Nothing is written until the card on screen
says what you meant.

- Packaging maths: "three cases of twelve" logs 36. So do "a dozen" and "half a dozen".
- Out-loud corrections: "log forty units of SKU-1042 — no, make that fifty" logs 50, and keeps the SKU.
- Catalogue matching: a mis-heard digit is matched back to a real SKU by digit tail, then fuzzily by code and product name. Genuinely ambiguous ones come back as tappable choices instead of a failed write.
- Stock questions answer on the spot: "how many units of SKU-1042 in Columbus" reads the live count and writes nothing.
- Every field is editable before confirming, and each edit is re-checked against the catalogue, so one wrong digit no longer means saying the whole sentence again.
- The mic ring is driven by the real signal off the headset, so a dead mic is visible before the count is spoken into it.

## Run it

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp ../.env .env                                        # or export the vars
uvicorn main:app --reload --port 8000
```
API docs: http://localhost:8000/docs

### Frontend
Chrome or Edge for voice; every other browser falls back to the manual form.
```bash
cd frontend
npm install
npm run dev
```
App: http://localhost:5173

### First login
`admin` / `Whitfield#2026` (from `.env`). Demo seed also creates `dana.veteran` and `kai.newhire`, same password.

## Layout
```
backend/core/apis/{schemas,routes}   request/response contracts + HTTP surface
backend/core/controllers             business logic
backend/core/crud                    database access, transactions, locking
backend/core/database                engine, session, ORM models, seed
backend/core/modules                 voice parser, routine checker, AI assistant
backend/commons/{auth,logger}        JWT + RBAC, structured logging
frontend/src/{context,hooks,components,pages,services}
```
