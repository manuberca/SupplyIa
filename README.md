# SupplyIA

App web (PWA) de compras y recepción de mercadería para gastronómicos.
Especificación: `SPEC.md`. Reglas de trabajo: `CLAUDE.md`. En qué etapa estamos: `PROGRESO.md`.

## Preparar una computadora nueva (una sola vez)

1. **Node.js 24 LTS** desde https://nodejs.org (instalador `.msi` en Windows, `.pkg` en Mac).
   Tiene que ser la misma versión mayor que dice `.nvmrc`.
2. **Git**
   - Windows: https://git-scm.com
   - Mac: en la Terminal, `xcode-select --install`
3. **GitHub CLI** desde https://cli.github.com, y después en la terminal:
   ```
   gh auth login
   gh auth setup-git
   ```
   Así `git push` y `git pull` no piden contraseña.
4. **Bajar el proyecto**
   ```
   gh repo clone manuberca/SupplyIa supplyia
   cd supplyia
   npm install
   ```
5. **Variables de entorno:** copiá `.env.example` como `.env.local` y completalo con los valores
   que tenés guardados en tu gestor de contraseñas. `.env.local` no está en git: hay que crearlo a
   mano en cada computadora.
6. `npm run dev` y abrí http://localhost:5173

## Cada vez que te sentás a trabajar

1. `git pull` para traer lo que hiciste en la otra computadora.
2. Si cambió `package.json`, `npm install`.
3. Trabajá.
4. Al terminar: commit y `git push`. Si no subís, la otra computadora no lo ve.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | App en local |
| `npm test` | Tests unitarios |
| `npm run typecheck` | Chequeo de tipos |
| `npm run lint` | Revisión de estilo del código |
| `npm run build` | Arma la versión para publicar |
