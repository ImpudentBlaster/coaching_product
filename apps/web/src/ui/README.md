# Shared UI system

`tokens.css` retains the existing palette and defines spacing, radius, control,
type, border, shadow, and transition values. `primitives.css` owns shared geometry
and states and loads after feature styles. Feature CSS owns content layouts.

Use `primary` for the main action, `secondary` for supporting actions, `danger`
for destructive actions, and `icon-button` for 42px square icon controls. Reserve
`status` and pill radii for metadata. Use `--space-*` for spacing and the named
radius tokens rather than adding local control sizes.

Reuse `Collection` for searchable paginated lists/tables, `ActionMenu` for row
actions, `EditorDialog` for dialogs/drawers, `Notice` for dismissible feedback,
and `LoadingPanel` for section loading. Dialog headers stay outside the scrolling
body. Keep content actions inside the body; do not clone submission handlers.

Tables scroll within their own containers on narrow screens. Forms collapse to
two columns then one. Preserve visible focus, native control semantics, labels,
and existing error/empty/loading messages when adding screens.

Use `notify.success`, `notify.error`, `notify.warning`, and `notify.info` from
`lib/notify` for transient operation feedback. The action owner emits once after
the API action completes; API helpers do not emit notifications. Optional
`description`, `duration` (including `Infinity`), and `id` support more context,
action-required errors, and replacing an existing notification. One root
`GlobalNotifications` renders the viewport-positioned stack, including while
native dialogs are open. Keep validation, failed data loads, and retry UI inline.
Legacy `Notice` success messages forward to this system; use its `transient`
flag only for operation errors, retaining the default inline error behavior for
persistent failures.
