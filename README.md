# Conversation Orbits / Орбиты общения

An interactive communication practice site for people in relationships: 8 themes, 32 short lessons with answer feedback, 6 optional real-life exercises, review, and local progress. It helps visitors rehearse clearer questions, listening, requests, boundaries, and repair after conflict. It does not claim to measure or guarantee a change in a relationship.

The main flow presents one decision at a time: choose a topic, try three short situations, then study bite-sized lessons. Introductory answers do not count as completed lessons; the lesson progress advances after its teaching step and correct answer. Other sections stay in a compact menu.

## Try it in English

- [One-minute practice](https://safal207.github.io/orbity-obshcheniya/en.html#practice/listening-3)
- [Full English course](https://safal207.github.io/orbity-obshcheniya/en.html)
- [Русская версия](https://safal207.github.io/orbity-obshcheniya/)

The language link keeps the current lesson or exercise open. Both languages use the same lesson IDs and browser progress, so switching languages does not reset your work. No account is needed. Notes and progress stay in this browser's `localStorage`; the optional JSON export can contain personal notes. Treat that file as private.

The “Mars and Venus” image is a conversation prompt inspired by John Gray's books, not a rule about how women or men behave. Ask each person what support they prefer. This is an independent educational project with original exercises; it is not therapy or an official course based on those books. If a conversation involves threats, pressure, or fear, safety and trusted support come before a paired exercise.

Run locally with `node server.mjs`, then open `http://127.0.0.1:5187/` or `/en.html`. Check the bilingual content and answer-key alignment with `node tests/locales.mjs`. GitHub Pages publishes `dist` from `main` after validation.

## Sources and inspiration

- [John Gray's books](https://www.marsvenus.com/books) — source of the metaphor; not evidence for universal sex-based communication rules.
- [The Gottman Method](https://www.gottman.com/about/the-gottman-method/) — attention to connection, conflict, and repair.
- [Nonviolent Communication](https://www.nonviolentcommunication.com/pdf_files/nvc2-chapter-one.html) — observation, feeling, need, and request.
- [Purdue University on supportive communication](https://www.purdue.edu/uns/html4ever/2004/040217.MacGeorge.sexroles.html) — a study of similarities in support preferences.

---

# Орбиты общения

Интерактивный тренажёр навыков общения для женщин и мужчин: 8 этапов, 32 коротких урока и проверки, 6 заданий для жизни, повторение и перенос прогресса.

Главный сценарий показывает один выбор за раз: тема → три вводные ситуации → короткие уроки с одним вопросом и разбором. Вводные ответы помогают выбрать маршрут и не засчитываются как пройденные уроки. Остальные разделы находятся в меню «Разделы».

## Открыть сайт

[Орбиты общения на GitHub Pages](https://safal207.github.io/orbity-obshcheniya/)

Страница публикуется из папки `dist` после обновления ветки `main`. Для локального просмотра: `node server.mjs`, затем `http://127.0.0.1:5187/`.

Вход в аккаунт не нужен. Прогресс и заметки остаются в `localStorage` этого браузера. В разделе «Прогресс» их можно скачать в JSON и загрузить на другом устройстве. Файл может содержать личные заметки.

## Подход и источники

Метафора «Марса и Венеры» вдохновлена книгами Джона Грэя, но сайт — независимый образовательный проект, а упражнения оригинальные. Предпочтения в общении предлагается выяснять у конкретного человека, без вывода по полу. Сайт не представляет собой полный пересказ всех книг серии.

- [Книги Джона Грэя](https://www.marsvenus.com/books)
- [Метод Готтмана](https://www.gottman.com/about/the-gottman-method/)
- [Nonviolent Communication](https://www.nonviolentcommunication.com/pdf_files/nvc2-chapter-one.html)
- [Исследование Университета Пердью о поддерживающем общении](https://www.purdue.edu/uns/html4ever/2004/040217.MacGeorge.sexroles.html)
