# RouteWise

[![CI](https://github.com/mahianyuallan/routewise/actions/workflows/ci.yml/badge.svg)](https://github.com/mahianyuallan/routewise/actions/workflows/ci.yml)

Weather-aware truck routing. RouteWise compares three truck routes between two US places by the weather each one will meet at the hour the truck gets there, scores it with Spotter's risk and load rules, and recommends the safest route.

**Status, 11 Oct 2026:** the backend API works and is tested; the React app is next. Live links and the walkthrough will be added here.

## Documents

- [Product requirements](docs/PRD.md)
- [Tech stack and build decisions](docs/TECH-STACK.md)
- [Glossary](GLOSSARY.md)
- [Architecture decision records](docs/adr/)

## Run the API locally

Needs Python 3.13 and [uv](https://docs.astral.sh/uv/).

```bash
cd backend
cp .env.example .env    # add free TomTom and Geoapify API keys
uv sync
uv run python manage.py runserver
```

Interactive API docs: http://localhost:8000/api/docs/

## Tests

```bash
cd backend
uv run pytest
```

Every provider is mocked, so the tests run offline.
