# vynl — common dev tasks. Run `just` to see all recipes.

REPO := "48Nauts/vynl"
FORGEJO_BASE := "http://cosmos.tail138398.ts.net:3000"

default:
    @just --list

push:
    git push forgejo

pull:
    git pull --rebase

open:
    open "{{FORGEJO_BASE}}/{{REPO}}"

ci:
    open "{{FORGEJO_BASE}}/{{REPO}}/actions"

issues:
    open "{{FORGEJO_BASE}}/{{REPO}}/issues"

prs:
    open "{{FORGEJO_BASE}}/{{REPO}}/pulls"

install:
    npm install

dev:
    npm run dev

build:
    npm run build

lint:
    npm run lint

up:
    docker compose up -d

logs:
    docker compose logs -f

down:
    docker compose down

docker-stop:
    colima stop

docker-start:
    colima start

feature name:
    git checkout -b feature/{{name}}

fix-branch name:
    git checkout -b fix/{{name}}
