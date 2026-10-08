# Conversation Orbits / Орбиты общения

An interactive communication practice site for people in relationships: 8 themes, 32 short lessons with answer feedback, 6 optional real-life exercises, review, and local progress. It helps visitors rehearse clearer questions, listening, requests, boundaries, and repair after conflict. It does not claim to measure or guarantee a change in a relationship.

The React interface pairs a lesson path with Lumi, our original plush companion. Continue a saved lesson or choose a topic and try three short situations, one question at a time. Introductory answers do not count as completed lessons; the lesson progress advances after its teaching step and correct answer. Review revisits up to four completed lessons without awarding duplicate XP.

## Try it in English

- [One-minute practice](https://safal207.github.io/orbity-obshcheniya/en.html#practice/listening-3)
- [Full English course](https://safal207.github.io/orbity-obshcheniya/en.html)
- [Русская версия](https://safal207.github.io/orbity-obshcheniya/)

The language link keeps the current lesson or exercise open. Both languages use the same lesson IDs and browser progress, so switching languages does not reset your work. No account is needed. Notes and progress stay in this browser's `localStorage`; the optional JSON export can contain personal notes. Treat that file as private.

The “Mars and Venus” image is a conversation prompt inspired by John Gray's books, not a rule about how women or men behave. Ask each person what support they prefer. This is an independent educational project with original exercises; it is not therapy or an official course based on those books. If a conversation involves threats, pressure, or fear, safety and trusted support come before a paired exercise.

For the public React interface, use Node 22.12+ and run `cd react-preview`, `npm ci`, `npm run build`, then `npm run preview -- --port 4173`. Open `http://127.0.0.1:4173/` or `/en.html`. GitHub Pages publishes the accepted React build from `main` after legacy safety checks, React unit tests, Chromium acceptance and Firefox guided-resume acceptance. The exact browser-tested artifact is deployed without rebuilding. See [release verification](docs/REACT-RELEASE.md).

The previous interface remains in `dist` for regression checks and rollback; `node server.mjs` previews that source at `http://127.0.0.1:5187/`.

## Sources and inspiration

- [John Gray's books](https://www.marsvenus.com/books) — source of the metaphor; not evidence for universal sex-based communication rules.
- [The Gottman Method](https://www.gottman.com/about/the-gottman-method/) — attention to connection, conflict, and repair.
- [Nonviolent Communication](https://www.nonviolentcommunication.com/pdf_files/nvc2-chapter-one.html) — observation, feeling, need, and request.
- [Purdue University on supportive communication](https://www.purdue.edu/uns/html4ever/2004/040217.MacGeorge.sexroles.html) — a study of similarities in support preferences.

---

# Орбиты общения

Интерактивный тренажёр навыков общения для женщин и мужчин: 8 этапов, 32 коротких урока и проверки, 6 заданий для жизни, повторение и перенос прогресса.

Новый React-интерфейс показывает маршрут коротких уроков со спутником Луми. Можно продолжить с сохранённого места или выбрать тему: три вводные ситуации → короткие уроки с одним вопросом и разбором. Вводные ответы помогают выбрать маршрут и не засчитываются как пройденные уроки. Повторение возвращает до четырёх завершённых уроков и не начисляет повторный опыт.

## Открыть сайт

[Орбиты общения на GitHub Pages](https://safal207.github.io/orbity-obshcheniya/)

Pages публикует проверенную React-сборку после обновления ветки `main`. Старые русские и английские ссылки с адресом урока продолжают работать. Для локального просмотра нужны Node 22.12+, затем `cd react-preview`, `npm ci`, `npm run build`, `npm run preview -- --port 4173` и `http://127.0.0.1:4173/` или `/en.html`. Подробности проверок и ограничения — в [описании выпуска](docs/REACT-RELEASE.md).

Вход в аккаунт не нужен. Прогресс и заметки остаются в `localStorage` этого браузера. В разделе «Прогресс» их можно скачать в JSON и загрузить на другом устройстве. Файл может содержать личные заметки.

## Подход и источники

Метафора «Марса и Венеры» вдохновлена книгами Джона Грэя, но сайт — независимый образовательный проект, а упражнения оригинальные. Предпочтения в общении предлагается выяснять у конкретного человека, без вывода по полу. Сайт не представляет собой полный пересказ всех книг серии.

- [Книги Джона Грэя](https://www.marsvenus.com/books)
- [Метод Готтмана](https://www.gottman.com/about/the-gottman-method/)
- [Nonviolent Communication](https://www.nonviolentcommunication.com/pdf_files/nvc2-chapter-one.html)
- [Исследование Университета Пердью о поддерживающем общении](https://www.purdue.edu/uns/html4ever/2004/040217.MacGeorge.sexroles.html)
