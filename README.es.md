# Madriguera

[English](README.md) | **Español**


Madriguera es una app de escritorio para gente que disfruta más **encontrar** cosas que haberlas encontrado. Elegís un manga/manhwa que te guste (o entrás por una "veta" como *manhwa romántico joya oculta*), y la app recorre el grafo de recomendaciones y tags de AniList como una run de roguelike: cada paso te ofrece hasta tres pasajes, y cuanto más profundo bajás, más se inclina hacia **obras de alta calidad que casi nadie leyó**.

- **Descender** — cada nodo ofrece: **Ir más profundo** (la mejor joya oculta bajo un techo de popularidad que se achica), **Mantener el nivel** (la recomendación más fuerte de la comunidad), **Comodín** (un hallazgo aleatorio en la misma veta de tags). Las obras que ya visitaste no vuelven a aparecer.
- **Gema diaria** — una elección determinística por día (misma fecha → misma gema, en cualquier máquina).
- **Botín** — todo lo que guardás, exportable como Markdown o JSON, y cada ítem sirve como semilla de un nuevo descenso.
- **Atlas** — cuántos descensos hiciste, tu punto más profundo, las vetas de tags que minaste y los géneros en los que nunca entraste.

El "puntaje de gema" es calidad × oscuridad: una obra con 78% y 2 mil lectores le gana a una con 82% y 400 mil.

## Cómo ejecutarlo

```bash
npm install
npm start        # ventana de Electron
npm test         # 48 tests: unitarios + recorrido completo de UI con jsdom
```

No hace falta API key — el API GraphQL de AniList es abierto y tiene CORS habilitado. `src/index.html` también se abre directo en un navegador si alguna vez lo querés sin Electron.

## Controles

| Tecla | Acción |
| --- | --- |
| `1` `2` `3` | Elegir un pasaje |
| `S` | Guardar / quitar la obra actual |
| `Esc` | Salir a la superficie (terminar la run) |

El selector **Origin** en el encabezado restringe las vetas y las semillas de vibra a manhwa (KR), manga (JP) o manhua (CN).

## Arquitectura

Renderer plano y sin dependencias (scripts clásicos, sin framework, sin build) dentro de un shell de Electron endurecido (`contextIsolation`, `sandbox`, sin integración de node; los enlaces externos se abren en tu navegador del sistema).

```
main.js               arranque de Electron
src/js/scoring.js     matemática de oscuridad, puntaje de gema, techos    (puro)
src/js/descent.js     generación de ramas, elección de veta de tags       (puro)
src/js/daily.js       PRNG determinístico por fecha                       (puro)
src/js/store.js       persistencia en localStorage (botín/vistos/atlas)
src/js/api.js         cliente de AniList: con throttle, caché y retry 429
src/js/app.js         vistas + máquina de estados + cableado
test/                 unitarios con node:test + recorrido de integración jsdom
```

Todo queda en tu máquina salvo las consultas a AniList. Las entradas marcadas como adultas se excluyen tanto en la consulta como en la generación de ramas.

## Ideas para el próximo pozo

- Un **pozo de juegos**: la misma mecánica de descenso sobre RAWG o IGDB (requiere API key; el patrón de `api.js` se trasplanta directo).
- **Vetas favoritas**: fijar un tag del Atlas como entrada de vibra personalizada.
- **Expediciones de temporada**: vetas temáticas semanales ("one-shots coreanos de los 2010s").
