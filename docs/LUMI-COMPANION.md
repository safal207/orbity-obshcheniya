# Lumi: plush companion in the isolated React preview

Historical implementation and artwork provenance. The companion is included
in the public React release described in [REACT-RELEASE.md](REACT-RELEASE.md);
the original release-gate list below records the preview-stage status.

## Scope

Stacked on PR #3, feature head `97902ff640a2d133ea09eecf75f4c58ea19953ae`.
The downloaded exact-tested source tree was independently recomputed as
`9782644481fac97b5079af24ced49f4d680f9742`, matching that feature commit.
No merge, production Pages change, new dependencies or data migration.

Lumi replaces the CSS planet on the route, accompanies topic selection and
Progress, supports incorrect answers and storage errors, and celebrates saved
lesson/guided/mission results. Existing feedback text and controls remain the
source of truth. `Lumi` and `LumiPortrait` do not read or write progress or award
XP. Celebration uses existing successful-write gates; an image is never proof
that saving succeeded. The portrait is decorative (`aria-hidden`, empty alt),
with no extra live region or keyboard stop. Failed images fall back to a simple
orbit star without removing guidance. The only animation lasts 550ms once;
reduced motion disables it.

The indigo/lilac identity adds a night-sky route hero but keeps reading surfaces
light. This is an implementation of the companion direction, not a pixel copy
of the promotional mockup. The real product remains a communication-skills
trainer: no fake microphone, lives, language course, cross-device sync or
invented XP. RU/EN, 8 modules, 32 lessons, 6 missions, notes, guided flows and v1
import/export continue using the existing content and shared store.

The related accessibility defect is fixed by deriving the visible active
navigation item and `aria-current="page"` from the same section. Learning,
practice, review, start and guided routes use Learn; mission detail uses
Real life. This does not change route persistence or the module picker.

## Approved artwork provenance

The portrait strip was extracted from the user-approved generated concept
attached in this conversation, not downloaded from a third-party mascot pack.
Source: `a_cute_polished_colorful_promotional_character_c.png`, 1536×1024.
Source SHA-256: `0201cc7043f3b73d64a3ef7b0eec4078c39171ffdded52ae6a88762a8d37e33c`.
Crops `(left, top, right, bottom)` in idle/success/support order:
`(94,598,318,822)`, `(605,598,829,822)`, `(1070,598,1294,822)`.
Each 224×224 crop is resized to 192×192 with Pillow Lanczos and packed
left-to-right into a 576×192 WebP, quality 45, method 6. The CSS circular viewport contains the portraits; no generated
speech is baked into the UI. Copy is selectable, localized HTML. The original
large concept board is not shipped. This is not a trademark clearance claim.

## Verification

Run unchanged model/navigation tests with `cd react-preview && npm test`,
then `npm run build && npm run test:browser` for real Chromium acceptance.
The new `tests/lumi.browser.spec.mjs` is explicitly added to the existing
Playwright config; no old tests, retries, thresholds or assertions are removed.
It covers RU/EN at 320/390/768/1280px, loaded artwork, keyboard navigation,
reduced motion, wrong answers, real-lock waits, a synthetic storage write
rejection plus successful retry, unchanged progress on rendering/localization,
missing-art fallback and current-navigation semantics. Additional Axe checks
cover the route and lesson feedback in both languages. Screenshots are saved
in the existing CI artifacts. Screenshot generation is not a manual review.

Local Node model/navigation suite: 29 passed, 0 failed. Local static/source
checks are not JSX build or browser evidence. See the PR for exact-head CI
results and any separately inspected screenshots after the code is pushed.

Release gates remain separate: physical Android, manual screen-reader use,
full visual/product acceptance, existing migration tails, dependency/security
review, approval of PR #2 and PR #3, and explicit permission to publish.
