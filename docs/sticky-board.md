# 포스트잇 게시판

`sticky.html` is an independent full content-area board, linked from home and the first shortcut after the existing menu toggle. Existing shortcut order and menu behavior remain unchanged. HTML entrypoints only bump the shared shell cache version. Existing application storage and data are untouched.

Paper notes support direct multiline editing, a separate drag handle, keyboard movement/resizing, colors, resize limits (160–600 × 140–700 board units), slight rotation, stacking order, immutable creation date displayed in Asia/Seoul, archive/trash drop targets, restore and confirmed permanent deletion. CSS textures/tape/shadows and short drop animations need no image downloads. Reduced motion is respected. Logical coordinates, zoom-anchor math and device-local viewport state are separate from note content. Ctrl+wheel, blank-board pan and two-finger gestures are scoped to the board; text editing is excluded. Touch scrolling inside overflowing textareas is handled separately from board gestures; native text selection is not intercepted.

## Storage and access

The existing Supabase project stores notes through `sticky_board` RPC. A new board uses a cryptographically random 256-bit capability (43 URL-safe characters). The capability is stored only in the browser and a user-copied fragment connection link. The server stores its SHA-256 digest. A different device needs that link once; knowing the public homepage URL alone does not grant access to an existing board. Anyone holding the connection link can read/write that board. There is no new login/password, and no existing private mindmap or resume credential is reused. Link fragments are removed from the address after safe local storage; if browser storage is unavailable the fragment remains so reload can retain access. No capability, personal memo, admin key or password is embedded in source control.

Notes live in a non-exposed RLS-enabled schema with explicit deny policies and no direct anon/authenticated table privileges. Security-invoker public RPC calls a private function that scopes all operations to the verified high-entropy capability digest. Note revision checks prevent lost concurrent updates. Unrelated notes merge independently. Conflicting local content becomes a separate active copy and a local recovery backup. Permanent deletion is accepted only after trash is persisted, and a server tombstone prevents resurrection. Creation date is enforced server-side.

IndexedDB holds the cached records, pending operations and recovery copies. The asynchronous local transaction queue runs before network mutation; failed network writes retain pending work. A storage failure is shown distinctly, with a backup download and close warning if no durable copy exists. The connection dialog can import a downloaded JSON backup as new-ID copies. Device-local zoom/pan are in namespaced localStorage. Remote changes poll every five seconds when visible and not editing/dragging; pending work retries on reconnect. No background automation was added.

## Verification

`node --test --test-isolation=none tests/sticky.test.mjs tests/sticky-header.test.mjs tests/navigation.test.mjs tests/calendar.test.mjs tests/mindmap-sync.test.mjs tests/restaurant-data.test.mjs tests/resume-model.test.mjs`

Tests cover creation/overlap/date/state, coordinate preservation on zoom, two-device merges and same-note conflict recovery, offline reload recovery, deletion tombstones, local storage failure and header/menu compatibility, plus existing application regressions. `tests/sticky-db.sql` uses synthetic records inside a rolled-back transaction to test missing-key denial, board isolation, stale revision rejection, immutable date, archive/trash/purge restrictions and direct-table denial. Security advisors reported no findings.

Interactive desktop/mobile drag, native keyboard/textarea scrolling and real device pinch gestures have not been browser-tested in this execution environment: managed browser preview is unavailable. No frame-rate guarantee is made. A connection link must be kept private; this is capability sharing, not a user-account login system.

Concurrent upstream commit `4221bca` was integrated without changing its Neon Jump logic (only the shell cache version changed in that page). Expanded regression run: 36/37 passed; the `Double Trouble is playable` assertion also fails in a separate untouched worktree at upstream `4221bca`. This pre-existing upstream failure is not attributed to the sticky board and was not modified as part of this task. The requested board and calendar/mindmap/restaurant/resume/navigation regression set passed 32/32.

## Home layout correction

The board is embedded directly as the first section of `index.html`, above existing home content. Its shortcut points to that section. `sticky.html` only redirects legacy links to home while retaining the connection fragment; IndexedDB, server records and capability keys remain unchanged. The board title/chalk heading, color chooser and zoom buttons are removed. New notes are 160×150 logical units with automatic pastel colors; existing notes are resized once with a compact flag, without altering text or creation date. The new-note control is the first item in the lower-right bin group. Pinch and Ctrl+wheel remain supported. Existing homepage content is retained below the board.

## Smaller corner controls

Connection/backup UI has been removed at the owner's request; archive/new/trash controls are reduced to compact icons. Existing private storage and automatic local recovery remain intact. Automatic cross-device public-board conversion is NOT deployed: automatic approval review rejected creating an unauthenticated shared RPC because syncing the owner's devices does not clearly authorize granting every visitor read/write access. Explicit owner approval of that public access boundary is pending. No public-board table/function was applied.

## Drag continuity

Gesture moves/releases are tracked on the document with the initiating pointer ID, while pointer capture is retained. Releasing one finger after a pinch rebases the remaining finger as a pan instead of terminating it. Rendering is deferred while a gesture is active; storage upload/polling also waits for gesture completion. Final movement merges geometry into the latest note to preserve concurrent text/status changes. Read-only note text suppresses native selection/drag/context-menu takeover while editing text retains native editing behavior. A regression verifies busy-state persistence and deferred upload. Physical device touch reproduction remains unverified in the current environment.

## Editing-only formatting

Each memo may store `format: {bold, underline, size, color}`. A tiny B/U/size/color toolbar sits next to the creation date only while the textarea or its formatting tools have editing focus. Blank-board touch and leaving the editor hide it. Buttons keep text focus, and selector focus is included in editing state. Format applies to the entire memo, not individual text ranges. Sizes: 14/16/18/20/24/28/32px; text colors: red/blue/green/black. Existing notes default to 18px plain black. Text remains plain text, with bounded CSS values selected from fixed maps; no rich HTML is stored or rendered. Formatting persists through existing server/cache/archive paths without a schema or access change. Note drag handlers exclude the format toolbar.

Validation: 36 unit/regression tests pass, including bounded formats, old-note compatibility and server-fixture restore/archive round trips. Rollback-only real database test checks that the existing RPC preserves the format object. Actual mobile focus/selector behavior remains unverified in this environment.

### Explicit format pickers

Replaced native tiny selects with buttons opening an in-note option grid. The numeric button opens font sizes; 색 opens red/blue/green/black choices. All picker pointerdowns preserve editor focus, preventing a focus-driven toolbar disappearance before a choice is applied. Choosing a value updates text immediately and closes the grid. A synthetic DOM event test checks option opening, actual size/color assignment, bold/underline, pointerdown cancellation, focus within tools and closing after focus leaves. Related format/board tests pass 11/11; physical mobile picker interaction still needs device verification.
